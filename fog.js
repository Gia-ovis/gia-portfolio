/* ============================================================
   雾气擦字交互：六块雾气玻璃（Work / Sandbox / About / ":)" +
   两侧窗帘旁的窄玻璃 side-left/side-right）共用同一套"生长水珠"逻辑，
   移植自独立原型 fog_wipe_growing_drops.html（水珠生长逻辑参考自
   github.com/sebnozzi/minimicro-foggywindow）。

   跟原型的关键差别：
     - 原型的雾气盖在自己画的一张山景渐变上；这里 canvas 本身透明，
       destination-out 擦开的地方露出的是页面本身的 .bg-layer 插画，
       不用另外画背景。
     - 原型只有一块画布、一个控制面板；这里没有面板，六块画布共用
       一份基础参数（PARAMS），但雾气浓度/颗粒密度/环境水珠频率这三
       项支持在 CONTENT 里按格子单独覆盖（见下面 side-left/side-right
       的 fogAlpha/dotDivisor/ambientMult）——两侧这两条不用保护文字
       可读性，做得比中间四格更通透。
     - 六块画布共用一个 requestAnimationFrame 循环和一个 setInterval
       回雾定时器，而不是各开一份，省得抢帧。
   ============================================================ */
(function () {
    // 所有跟"擦玻璃"手感相关、值得实时调的参数集中放这一个对象里，挂在
    // window 上（而不是模块内部的 const）——是为了让完全独立的
    // debug-panel.js（单独一个文件，不 import 这个 IIFE 里的任何东西）
    // 能直接改这些值。下面所有用到这些参数的地方都要写成 FOG_CONFIG.xxx
    // 现读，不能在函数顶部解构出来缓存一份快照，不然拖动滑块不会有效果。
    // debug-panel.js 不存在/没加载的时候，这个对象就是一份单纯的默认值，
    // 面板从未创建，行为跟以前写死 const 完全一样。
    //
    // 分组说明（对应 debug-panel.js 面板里的分组）：
    //   擦除本体：holeAlpha/edgeBlur/wipeR/refogInterval/refogAlpha
    //   水珠生长物理：dropSpeedMin~Max、dropLenMin~Max、dropWobble
    //   水珠数量控制：ambientRate/maxDrops/fadeTime（上一版调参面板就有
    //                的那三个，直接并进来，没有丢）
    //   环境高光 glint：glintRate/glintBrightness/glintSize——没有
    //                  "持续时间/淡入淡出"这一项，因为现在的高光点
    //                  就是 source-over 画一次不会主动淡出的永久小
    //                  亮点（跟水珠的白色高光点是同一类问题），不存在
    //                  一个"淡出时长"可以调，编了一个假参数没有意义，
    //                  所以没加这个滑块
    // 下面这份基准值是通过 debug-panel.js（按 D 打开）现场调出来的最终
    // 效果，不是随手写的猜测值——面板里"重置为默认值"按钮也是拿这一份
    // 做基准，改这里的同时那个按钮的行为也跟着更新，不用两处分开维护
    window.FOG_CONFIG = {
        holeAlpha: 0.9,
        edgeBlur: 2.5,
        wipeR: 75,
        refogInterval: 90,
        refogAlpha: 0.03,

        dropSpeedMin: 9,
        dropSpeedMax: 52,
        dropLenMin: 24,
        dropLenMax: 114,
        dropWobble: 1.3,

        ambientRate: 1,
        maxDrops: 40,
        fadeTime: 3,

        glintRate: 1,
        glintBrightness: 1.1,
        glintSize: 1,
    };
    const FOG_CONFIG = window.FOG_CONFIG;

    const PARAMS = {
        dropSpeed: 1,
        ambientRate: 0.6,   // 六块画布同时跑，单块的环境水珠频率比原型调低一些——这个是基础手感值，不开放给面板调，面板的 FOG_CONFIG.ambientRate 是乘在这个上面的倍率
    };

    // drawFogBase() 的默认值，中间四格（Work/Sandbox/About/song）用这一套；
    // CONTENT 里每个格子可以用 fogAlpha/dotDivisor/ambientMult 单独覆盖
    const DEFAULT_FOG_ALPHA   = 0.88;   // 雾气底色不透明度，越大越白越糊（原来 0.62 太白挡住背景，调过一轮到这个值）
    const DEFAULT_DOT_DIVISOR = 260;    // 颗粒密度：颗粒数 = (宽×高)/这个值，数值越大颗粒越稀
    const DEFAULT_AMBIENT_MULT = 1;     // 环境水珠/高光的生成频率倍率，乘在 PARAMS.ambientRate 上

    // 手写字用系统自带的中文手写字体 HanziPen TC——不是 Google Fonts，
    // 页面里 .signature（"Gia Wang" 签名）已经在用这一套字体栈了，本身
    // 就含拉丁字母字形，画 Work/Sandbox/About 这几个英文单词不用额外
    // 引入字体文件，也不用等 document.fonts.ready（系统字体，本地直接
    // 可用，见下面 init() 里去掉了原来等 Caveat 下载的逻辑）。
    //
    // 排查结论：这几个字之前排查"所有用到 HanziPen TC 的位置"、给
    // font-family 统一加 Caveat-Adjusted 后备字体那次任务，漏掉了这里——
    // 这里不是 CSS 的 font-family 声明，是 canvas 2D 的 ctx.font 字符串
    // （画在雾气擦除画布上，不是普通 DOM 文字），当时全局搜 CSS 属性
    // 搜不到这一处，是这次任务专门排查出来补上的。
    // Caveat-Adjusted 换算成 canvas 字体串就是加进这个字符串的字体列表
    // 里，跟 CSS font-family 是同一套字体匹配规则，没有额外的写法。
    // 不需要额外等 Caveat-Adjusted 下载完再开始画：drawWordHole() 这个
    // 画字函数不是只在页面加载时跑一次，注释里写了"每次回雾都重画一遍"，
    // 靠 refogTick 定时器每隔 FOG_CONFIG.refogInterval（默认 90ms）就
    // 会重新执行一次——就算本地没有 HanziPen TC(fallback 到网络字体
    // Caveat-Adjusted)的设备上，第一帧画出来时字体文件可能还没下载完、
    // 暂时用了最后的 cursive 兜底，下一次 90ms 后的回雾循环也会用当时
    // 已经下载好的 Caveat-Adjusted 重新画一遍、自动纠正过来，不需要
    // 额外写一段等 document.fonts.ready 的逻辑去处理这个边界情况
    const WORD_FONT = '700 %Fpx "HanziPen TC", "HanziPen SC", "Yuanti TC", "Caveat-Adjusted", cursive';

    // hover 效果切换开关：'underline' 是划一条线（drawHoverLine），
    // 'thin-fog' 是文字周围局部起雾变薄（stepHoverThinFog）。先切到
    // thin-fog，underline 那套代码保留不删，以后想换回去改这一个值就行
    const HOVER_EFFECT_MODE = 'thin-fog';

    const CONTENT = {
        work:      { type: 'word', text: 'Work' },
        play:      { type: 'word', text: 'Sandbox' },
        about:     { type: 'word', text: 'About' },
        // 第四格原来是播放三角 + "I just released a song ;)" 文案，试过
        // 手绘笑脸（drawSmileyHole）又去掉了，现在就是一个简单的 ":)"
        // 文字表情，直接复用 drawWordHole 那套单词逻辑——key 还是叫
        // song 只是因为 index.html 里 data-fog="song" 这个属性值没必要
        // 跟着改
        song:      { type: 'word', text: ':)' },
        // 两侧窄玻璃：没有文字/图标要保护可读性，雾气做得更淡、颗粒更稀、
        // 水珠也更少——通透感优先，要能隐约看到山/树剪影，不是均匀灰白色块。
        // refogAlpha:0 是关键——中间四格靠常驻文字/三角形每次回雾都重新擦
        // 一遍，所以能一直亮着；这两块是纯雾气、没有常驻图案可擦，回雾定
        // 时器会不受控制地一直往上叠（实测 15 秒内能从 0.06 涨到 0.6+），
        // 关掉回雾之后这两块就稳定停在初始浓度，只靠零星水珠/高光加点质感
        'side-left':  { type: 'blank', fogAlpha: 0.06, dotDivisor: 700, ambientMult: 0.25, refogAlpha: 0 },
        'side-right': { type: 'blank', fogAlpha: 0.06, dotDivisor: 700, ambientMult: 0.25, refogAlpha: 0 },
    };

    function createPane(frameEl, glassEl, canvas, glowCanvas, config, interactive) {
        const ctx = canvas.getContext('2d');
        const glowCtx = glowCanvas.getContext('2d');
        const pane = {
            frameEl, glassEl, canvas, ctx, glowCanvas, glowCtx, config,
            drops: [],
            shapeInfo: null,
            w: 0, h: 0,
            // interactive：只有 Work/Sandbox/About 这三个能点击跳转的格子
            // 是 true，drawWordHole 里的 hover 下划线只在这几个格子上画，
            // 装饰性的 ":)" 格子不需要这个"可点击"的视觉提示
            interactive,
            hovering: false,
        };
        return pane;
    }

    function spawnDrop(pane, x, y, opts = {}) {
        pane.drops.push({
            x: x + (Math.random() - 0.5) * (opts.xJitter ?? 2),
            y0: y,
            width: opts.width ?? (1 + Math.random() * 2.2),
            targetLen: opts.len ?? (FOG_CONFIG.dropLenMin + Math.random() * Math.max(0, FOG_CONFIG.dropLenMax - FOG_CONFIG.dropLenMin)),
            speed: (opts.speed ?? (FOG_CONFIG.dropSpeedMin + Math.random() * Math.max(0, FOG_CONFIG.dropSpeedMax - FOG_CONFIG.dropSpeedMin))) * PARAMS.dropSpeed,
            grown: 0,
            strength: opts.strength ?? (0.35 + Math.random() * 0.35),
            wobble: (Math.random() - 0.5) * FOG_CONFIG.dropWobble,
            done: false,
        });
    }

    function spawnCluster(pane, x, y, count, opts = {}) {
        const lo = Math.min(count[0], count[1]);   // min/max 顺序颠倒时兜底交换一下
        const hi = Math.max(count[0], count[1]);
        const n = lo + Math.floor(Math.random() * (hi - lo + 1));
        for (let i = 0; i < n; i++) spawnDrop(pane, x, y, opts);
    }

    function stepDrops(pane, dt) {
        const { ctx, drops } = pane;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.filter = `blur(${FOG_CONFIG.edgeBlur * 0.4}px)`;
        for (const d of drops) {
            if (d.done) continue;
            const before = d.grown;
            d.grown = Math.min(d.targetLen, d.grown + d.speed * dt);
            const segStart = d.y0 + before;
            const segEnd = d.y0 + d.grown;
            if (segEnd > segStart) {
                const grad = ctx.createLinearGradient(d.x, d.y0, d.x, d.y0 + d.targetLen);
                grad.addColorStop(0, `rgba(0,0,0,${d.strength})`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = grad;
                const wob = d.x + Math.sin(d.grown * 0.05) * d.wobble * 3;
                ctx.fillRect(wob, segStart, d.width, segEnd - segStart);
            }
            if (d.grown >= d.targetLen) {
                d.done = true;
                ctx.beginPath();
                ctx.arc(d.x, d.y0 + d.targetLen, d.width * 1.15, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0,0,0,${d.strength * 0.5})`;
                ctx.fill();
            }
        }
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
        for (const d of drops) {
            if (d.done && !d.beaded) {
                d.beaded = true;
                const bx = d.x - d.width * 0.3;
                const by = d.y0 + d.targetLen - d.width * 0.6;
                ctx.beginPath();
                ctx.arc(bx, by, d.width * 0.38, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.45)';   // 调淡一些——这个高光点是永久画上去的，回雾盖不住白点，画得越浓积累起来越显眼
                ctx.fill();
            }
            if (d.done) d.fadeTimer = (d.fadeTimer ?? 0) + dt;
        }

        // 之前这里只是把 fadeTimer 计数、超时之后从数组里移除——但从数组
        // 移除不会擦掉已经画到 canvas 上的像素，水珠长完那一刻画的
        // destination-out 痕迹和白色高光点会一直留在那，这才是"只堆积不
        // 消散"真正的原因，不是清理逻辑本身的问题。这里补上真正的视觉
        // 淡出：fadeTimer 没走完之前，每帧在这颗水珠自己的痕迹范围（一条
        // 窄矩形盖住 trail、一个小圆盖住 bead，都是贴着这颗水珠自己的
        // 尺寸，不是大范围通用色块）补一层很淡的雾气底色，用增量式的
        // 固定小 alpha（dt/fadeTime）而不是每帧按目标强度重画一遍——原因
        // 跟 stepHoverThinFog 那段注释是同一个道理：source-over 反复画
        // 同一个目标 alpha 会不断叠加变浓，只补"这一帧应该新增的一点点"
        // 才能让整体淡出速度均匀地摊在 fadeTime 这段时间里，快结束时
        // 差不多正好盖满，不会中途就已经完全盖住或者到最后还没盖住
        for (const d of drops) {
            if (!d.done || d.fadeTimer >= FOG_CONFIG.fadeTime) continue;
            const coverAlpha = Math.min(1, dt / FOG_CONFIG.fadeTime);
            ctx.fillStyle = `rgba(238,242,247,${coverAlpha})`;
            const sway = Math.abs(d.wobble) * 3 + 2;   // 生长时轨迹左右摆动的幅度，补色范围要盖住摆动过的最大宽度
            ctx.fillRect(d.x - d.width / 2 - sway, d.y0 - 2, d.width + sway * 2, d.targetLen + 4);
            const bx = d.x - d.width * 0.3;
            const by = d.y0 + d.targetLen - d.width * 0.6;
            ctx.beginPath();
            ctx.arc(bx, by, d.width * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // 长完的水珠在数组里多留 FOG_CONFIG.fadeTime 秒就清掉，不再靠
        // "2% 概率" 这种运气清理；数组本身也设了硬上限 FOG_CONFIG.maxDrops，
        // 超了优先砍最老的已完成水珠，正在生长的水珠不受影响。两个值都
        // 现读 FOG_CONFIG，调参面板拖动滑块能立刻生效
        pane.drops = drops.filter(d => !d.done || d.fadeTimer < FOG_CONFIG.fadeTime);
        if (pane.drops.length > FOG_CONFIG.maxDrops) {
            const growing = pane.drops.filter(d => !d.done);
            const finished = pane.drops.filter(d => d.done);
            const keepFinished = Math.max(0, FOG_CONFIG.maxDrops - growing.length);
            pane.drops = growing.concat(finished.slice(-keepFinished));
        }
    }

    function drawGlint(ctx, x, y, r) {
        r *= FOG_CONFIG.glintSize;
        const b = FOG_CONFIG.glintBrightness;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y + r * 0.3, r * 1.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(20,30,48,${0.10 * b})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.85 * b})`;
        ctx.fill();
        ctx.restore();
    }

    function scatterAmbientGlints(pane, count) {
        const { ctx, w, h } = pane;
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < count; i++) {
            drawGlint(ctx, Math.random() * w, Math.random() * h, 2 + Math.random() * 2.5);
        }
    }

    function scatterShapeGlints(pane, count) {
        const { ctx, w, h, shapeInfo } = pane;
        if (!shapeInfo) return;
        ctx.globalCompositeOperation = 'source-over';
        if (shapeInfo.type === 'word') {
            const { cx, cy, textWidth, fontSize } = shapeInfo;
            for (let i = 0; i < count; i++) {
                drawGlint(ctx, cx - textWidth / 2 + Math.random() * textWidth, cy + (Math.random() - 0.3) * fontSize * 0.5, 1.4 + Math.random() * 1.6);
            }
        }
    }

    // ---- 常驻擦开的内容：单词，每次回雾都重画一遍 ----
    function drawWordHole(pane) {
        const { ctx, w, h, config } = pane;
        // 字号先按格子高度算一个理想值（Work/About 这种短词够用），但像
        // "Sandbox" 这种更长的词在同样字号下会比格子本身还宽、贴边裁切——
        // 所以量一下实际宽度，超出可用宽度就按比例缩小字号，短词不受影响
        const maxFontSize = Math.min(w, h) * 0.30;   // 手写体视觉重量比无衬线小，字号相应调大
        const maxTextWidth = w * 0.86;   // 留左右各 7% 的边距，不贴边
        ctx.font = WORD_FONT.replace('%F', maxFontSize);
        let fontSize = maxFontSize;
        let textWidth = ctx.measureText(config.text).width;
        if (textWidth > maxTextWidth) {
            fontSize = maxFontSize * (maxTextWidth / textWidth);
            ctx.font = WORD_FONT.replace('%F', fontSize);
            textWidth = ctx.measureText(config.text).width;
        }

        ctx.globalCompositeOperation = 'destination-out';
        ctx.filter = `blur(${FOG_CONFIG.edgeBlur}px)`;
        ctx.fillStyle = `rgba(0,0,0,${FOG_CONFIG.holeAlpha})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = w / 2, cy = h / 2;
        ctx.fillText(config.text, cx, cy);
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
        return { type: 'word', cx, cy, textWidth, fontSize };
    }

    // hover 时在文字底下"划"一条线——用跟鼠标划雾气（wipeAt）完全一样的
    // 临时擦除逻辑，不是像文字本身那样"永久"内容（每次回雾都重新擦一遍）。
    // 只在 pointerenter 那一刻画一次（见 init() 里的事件绑定），画完就不
    // 再管它——松开 hover 不做任何特殊处理，不清除也不恢复，就让它跟手
    // 划开的雾气一样，交给下面 setInterval 那个统一的回雾定时器慢慢重新
    // 蒙上雾气。
    // 之前试过两种"主动让它消失"的方案：原地补一块同色雾气（补丁跟周围
    // 经年累月长出来的颗粒纹理对不上，露馅）、getImageData 快照原样贴
    // 回去（瞬间复原是干净，但复原回的是"进入 hover 那一刻"的旧快照，
    // 跳过了这段时间里其它地方本该有的水珠/回雾变化，反而在这块区域跟
    // 周围之间踩出一条"时间不同步"的断层）。根源是这条线被当成了要
    // "管理生命周期"的永久内容，其实它就该跟其它手划的临时擦除一样，
    // 用同一套自然回雾逻辑，不需要额外状态
    function drawHoverLine(pane) {
        const { ctx, shapeInfo } = pane;
        if (!shapeInfo || shapeInfo.type !== 'word') return;
        const { cx, cy, textWidth, fontSize } = shapeInfo;
        const y = cy + fontSize * 0.62;   // 离文字底边留点距离，不贴着字挨
        const halfW = textWidth * 0.5 * (0.92 + Math.random() * 0.06);

        // 手写下划线的两个关键特征，缺了就会读成一根尺子画的直线：
        // 1. 整体带一点斜度（slant，起笔/收笔不同高）；2. 中间有明显的
        // 弧度（bow），不是完全笔直——这两个值都要足够大、肉眼可见
        const slantSign = Math.random() < 0.5 ? 1 : -1;
        const bowSign = Math.random() < 0.5 ? 1 : -1;
        const slant = fontSize * (0.05 + Math.random() * 0.035) * slantSign;
        const bow = fontSize * (0.06 + Math.random() * 0.035) * bowSign;
        const startY = y - slant / 2;
        const endY = y + slant / 2;

        ctx.globalCompositeOperation = 'destination-out';
        ctx.filter = `blur(${FOG_CONFIG.edgeBlur}px)`;
        ctx.strokeStyle = `rgba(0,0,0,${FOG_CONFIG.holeAlpha})`;
        ctx.lineWidth = 7 + Math.random() * 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - halfW, startY);
        ctx.quadraticCurveTo(cx, y + bow, cx + halfW, endY);
        ctx.stroke();
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';

        if (Math.random() < 0.35) spawnCluster(pane, cx, y, [1, 2], { xJitter: halfW });
    }

    // hover 效果二：局部起雾变薄（HOVER_EFFECT_MODE = 'thin-fog'）。
    // 在文字所在的位置用更大的模糊半径再叠一层很淡的 destination-out
    // （模糊把擦除范围往文字轮廓外面柔和地扩散开，形成一圈"变薄"的
    // 光晕，不是精确沿着字形的硬边界），强度远低于文字本身常驻的
    // FOG_CONFIG.holeAlpha（0.92），只是让雾气变薄，不是擦掉。
    // 跟 drawHoverLine 一样，鼠标离开不做任何"复原"——这片区域照样会被
    // setInterval 里那个无差别的全画布回雾循环慢慢盖回去，节奏跟周围
    // 完全一致，不需要额外状态。
    //
    // 关键的实现细节：intensity（hoverThinT）虽然每帧都在缓动，但每帧
    // 实际叠加擦除的量只按"这一帧比上一帧新增了多少"（delta）来算，
    // 不是每帧都按当前目标强度重新擦一遍——destination-out 是会累积的
    // （连续对同一块区域擦多次，透明度会越叠越高），如果每帧都用同一个
    // alpha 值反复擦，几帧之内就会跟长时间划雾气一样被擦穿到接近全
    // 透明，"变薄"会变成事实上的"擦除"，稳不住在一个中间的薄雾状态。
    // 只擦"增量"就能让它平滑收敛到目标强度之后就不再变化，稳定下来。
    const THIN_FOG_MAX_ALPHA = 0.32;   // 变薄强度上限，明显低于永久擦除的 holeAlpha
    const THIN_FOG_EASE_RATE = 8;      // 缓动速度，量级参考旧发光效果的 GLOW_STIFFNESS

    function stepHoverThinFog(pane, dt) {
        if (HOVER_EFFECT_MODE !== 'thin-fog' || !pane.interactive) return;
        const shapeInfo = pane.shapeInfo;
        if (!shapeInfo || shapeInfo.type !== 'word') return;

        if (pane.thinT === undefined) { pane.thinT = 0; pane.thinApplied = 0; }
        const target = pane.hovering ? 1 : 0;
        pane.thinT += (target - pane.thinT) * Math.min(1, dt * THIN_FOG_EASE_RATE);
        if (pane.thinT < 0.001) pane.thinT = 0;

        const delta = pane.thinT - pane.thinApplied;
        if (delta <= 0.002) {
            // 强度在往下掉（松开 hover）：这里不用主动做什么，交给回雾
            // 循环去补雾气就行。完全冷却回 0 之后把 applied 也归零，
            // 这样下一次 hover 进来又是一次干净的从 0 开始的淡入
            if (target === 0 && pane.thinT === 0) pane.thinApplied = 0;
            return;
        }
        pane.thinApplied = pane.thinT;

        const { ctx, config } = pane;
        const { cx, cy, fontSize } = shapeInfo;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.filter = `blur(${8 + pane.thinT * 6}px)`;
        ctx.fillStyle = `rgba(0,0,0,${THIN_FOG_MAX_ALPHA * delta})`;
        ctx.font = WORD_FONT.replace('%F', fontSize);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(config.text, cx, cy);
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
    }

    function drawPermanentHole(pane) {
        switch (pane.config.type) {
            case 'word': return drawWordHole(pane);
            default: return null;   // 'blank'：两侧窄玻璃，不带固定图案，纯雾气+水珠
        }
    }

    function drawFogBase(pane) {
        const { ctx, w, h, config } = pane;
        const fogAlpha   = config.fogAlpha   ?? DEFAULT_FOG_ALPHA;
        const dotDivisor = config.dotDivisor ?? DEFAULT_DOT_DIVISOR;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(238,242,247,${fogAlpha})`;
        ctx.fillRect(0, 0, w, h);
        const dotCount = Math.round((w * h) / dotDivisor);
        for (let i = 0; i < dotCount; i++) {
            const x = Math.random() * w, y = Math.random() * h;
            const r = Math.random() * 1.4 + 0.3;
            ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.10})`;
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
    }

    function hardReset(pane) {
        pane.drops = [];
        const { ctx, w, h } = pane;
        ctx.clearRect(0, 0, w, h);
        drawFogBase(pane);
        pane.shapeInfo = drawPermanentHole(pane);
        scatterShapeGlints(pane, 5);
        scatterAmbientGlints(pane, 3);
    }

    function resize(pane) {
        const rect = pane.glassEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        pane.canvas.width = rect.width * dpr;
        pane.canvas.height = rect.height * dpr;
        pane.canvas.style.width = rect.width + 'px';
        pane.canvas.style.height = rect.height + 'px';
        pane.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        pane.w = rect.width;
        pane.h = rect.height;

        pane.glowCanvas.width = rect.width * dpr;
        pane.glowCanvas.height = rect.height * dpr;
        pane.glowCanvas.style.width = rect.width + 'px';
        pane.glowCanvas.style.height = rect.height + 'px';
        pane.glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        hardReset(pane);
    }

    function wipeAt(pane, x, y) {
        const { ctx } = pane;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.filter = `blur(${FOG_CONFIG.edgeBlur}px)`;
        const R = FOG_CONFIG.wipeR;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, R);
        grad.addColorStop(0, `rgba(0,0,0,${FOG_CONFIG.holeAlpha})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
        if (Math.random() < 0.35) spawnCluster(pane, x, y, [1, 2], { xJitter: 14 });
    }

    function panePos(pane, e) {
        const rect = pane.canvas.getBoundingClientRect();
        const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        return [cx, cy];
    }

    // 点这几块雾气窗户会打开对应内容的浮层（overlay.js 的 openContentOverlay，
    // 不是页面跳转，index.html 留在背后不卸载）。这里的 key 是 fog-frame
    // 自己的 data-fog 值，跟 content.html 里的 section id 不完全对应
    // （fog-frame 的 data-fog="play" 对应的板块叫 Sandbox），真正的
    // 映射在 overlay.js 里做。song 那块（笑脸）没有对应内容，保持纯
    // 装饰，不响应点击。
    const OVERLAY_KEYS = ['work', 'play', 'about'];
    // 跟着鼠标走的提示文案，跟首页像素头像"you can always go back..."、
    // Sandbox 卡片"View Project"是同一套 .hover-capsule 模式
    const OVERLAY_LABELS = { work: 'View Work', play: 'View Sandbox', about: 'View About' };

    function init() {
        const frames = document.querySelectorAll('.fog-frame[data-fog]');
        if (!frames.length) return;

        const panes = [];
        frames.forEach(frameEl => {
            const key = frameEl.dataset.fog;
            const config = CONTENT[key];
            const glassEl = frameEl.querySelector('.fog-glass');
            const canvas = frameEl.querySelector('.fog-canvas');
            const glowCanvas = frameEl.querySelector('.glow-canvas');
            if (!config || !glassEl || !canvas || !glowCanvas) return;
            const pane = createPane(frameEl, glassEl, canvas, glowCanvas, config, OVERLAY_KEYS.includes(key));
            panes.push(pane);

            // 划雾气是 pointerdown+pointermove 连续触发 wipeAt 的，如果直接绑
            // 'click' 跳转，随手划一下也会被当成点击导航走——所以自己记录
            // down/up 之间的位移，只有位移很小（真的是"点"而不是"划"）才跳转
            let downX = 0, downY = 0;
            canvas.addEventListener('pointerdown', e => {
                downX = e.clientX; downY = e.clientY;
                const [x, y] = panePos(pane, e); wipeAt(pane, x, y);
            });
            canvas.addEventListener('pointermove', e => { const [x, y] = panePos(pane, e); wipeAt(pane, x, y); });
            canvas.addEventListener('pointerenter', () => {
                pane.hovering = true;
                if (HOVER_EFFECT_MODE === 'underline' && pane.interactive) drawHoverLine(pane);
            });
            canvas.addEventListener('pointerleave', () => { pane.hovering = false; });

            if (OVERLAY_KEYS.includes(key)) {
                canvas.addEventListener('pointerup', e => {
                    if (Math.hypot(e.clientX - downX, e.clientY - downY) < 8 && window.openContentOverlay) {
                        window.openContentOverlay(key);
                    }
                });

                // 跟着鼠标走的文字提示——复用 content.css 里的 .hover-capsule
                // 样式（index.html 同时加载了 content.css），不用另外写 CSS
                const capsule = document.createElement('div');
                capsule.className = 'hover-capsule hover-capsule--pane';
                capsule.textContent = OVERLAY_LABELS[key] || 'View';
                document.body.appendChild(capsule);
                canvas.addEventListener('pointerenter', () => { capsule.style.opacity = '1'; });
                canvas.addEventListener('pointerleave', () => { capsule.style.opacity = '0'; });
                canvas.addEventListener('pointermove', e => {
                    capsule.style.left = (e.clientX + 16) + 'px';
                    capsule.style.top = (e.clientY + 16) + 'px';
                });
            }
        });

        window.addEventListener('resize', () => panes.forEach(resize));

        let lastFrame = performance.now();
        function loop(now) {
            const dt = Math.min(0.05, (now - lastFrame) / 1000);
            lastFrame = now;
            for (const pane of panes) {
                const ambientMult = pane.config.ambientMult ?? DEFAULT_AMBIENT_MULT;
                // 水珠统一在整块玻璃的随机位置生成，不特意往文字周围堆——
                // 这是水珠数量持续增长的唯一来源。FOG_CONFIG.ambientRate
                // 是调参面板上那个"水珠 - 出现频率"滑块，乘在原有的
                // PARAMS.ambientRate 基础手感值上，默认 1 等于不变
                if (Math.random() < 0.01 * PARAMS.ambientRate * FOG_CONFIG.ambientRate * ambientMult) {
                    // 不再自己传 len——之前这里是按 pane 高度算的一个独立公式
                    // （跟 spawnDrop 默认值不是同一套），现在统一走 spawnDrop
                    // 自己的默认逻辑（FOG_CONFIG.dropLenMin/Max），这样调参
                    // 面板上的水珠长度滑块才能对这批（数量占绝大多数的）
                    // 环境水珠真正生效，不会调了没反应
                    spawnDrop(pane, Math.random() * pane.w, Math.random() * pane.h * 0.85, {
                        strength: 0.12 + Math.random() * 0.12,
                    });
                }
                if (Math.random() < 0.01 * PARAMS.ambientRate * FOG_CONFIG.ambientRate * FOG_CONFIG.glintRate * ambientMult) scatterAmbientGlints(pane, 1);
                stepDrops(pane, dt);
                stepHoverThinFog(pane, dt);
            }
            requestAnimationFrame(loop);
        }

        // 回雾定时器：原来是 setInterval(fn, 90) 定死的间隔，改成自己重新
        // 排程的 setTimeout——每次跑完再用当前的 FOG_CONFIG.refogInterval
        // 排下一次，这样调参面板拖动"回雾间隔"这个滑块，最迟下一次 tick
        // 就能用上新值，不需要额外写"重启定时器"的逻辑去清掉旧的
        // setInterval 再开一个新的
        function refogTick() {
            for (const pane of panes) {
                const refogAlpha = pane.config.refogAlpha ?? FOG_CONFIG.refogAlpha;
                if (refogAlpha > 0) {
                    const { ctx, w, h } = pane;
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.fillStyle = `rgba(236,240,246,${refogAlpha})`;
                    ctx.fillRect(0, 0, w, h);
                }
                pane.shapeInfo = drawPermanentHole(pane);
                if (Math.random() < 0.15 * FOG_CONFIG.glintRate) scatterShapeGlints(pane, 1);
            }
            setTimeout(refogTick, FOG_CONFIG.refogInterval);
        }
        setTimeout(refogTick, FOG_CONFIG.refogInterval);

        // HanziPen TC 是本地系统字体，不用像之前的 Caveat（Google Fonts
        // 异步下载）那样等 document.fonts.ready 才能开始画，直接起步
        panes.forEach(resize);
        requestAnimationFrame(loop);

        // 给完全独立的 debug-panel.js 用的钩子——面板上"重新起雾"按钮
        // 需要能一次性重置所有六块画布，但 panes 数组是这个 IIFE 内部的
        // 闭包变量，外部文件够不着，所以专门挂一个函数到 window 上。
        // overlay.js 关闭浮层、回到首页时也会调用这个同一个钩子（见那
        // 边 closeOverlay() 里的调用）
        window.__fogHardResetAll = () => panes.forEach(hardReset);

        // 切到别的浏览器 tab 又切回来：这段时间水珠一直在按 ambientRate
        // 后台生成、没人看见也没被清理（tab 在后台时 requestAnimationFrame
        // 会被浏览器自己限流甚至暂停，但 setTimeout 驱动的 refogTick 不一定
        // 会被同等限流，具体行为因浏览器而异），切回来这一刻直接重置最
        // 保险，不用去猜后台这段时间到底攒了多少
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) panes.forEach(hardReset);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
