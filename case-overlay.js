/* ============================================================
   Case study 双层浮层：在 Work/Sandbox/About 那层浮层（overlay.js，
   .content-overlay-panel）之上再盖一层，展示单个项目的完整 case study
   （目前只有 DrayEasy 一个）。跟 overlay.js 是同一套 fetch+clone 思路，
   但完全是独立的一份实现——不改 overlay.js，两层各管各的开关状态，
   互不依赖对方的内部变量。

   加新 case study 只改下面这张 CASE_STUDIES 表，别的都不用碰。
   ============================================================ */
(function () {
    const CASE_STUDIES = {
        drayeasy: { html: 'drayeasy.html', css: 'drayeasy.css' },
    };

    const SHELL_CSS_HREF = 'case-overlay.css';
    const CLOSE_DURATION_MS = 240;   // 必须跟 case-overlay.css 里 .case-overlay-panel 的关闭 transition-duration 一致

    // matchMedia 只读一次，不监听变化——用户中途在系统设置里切换这个
    // 偏好、且这次会话又恰好还开着浮层，属于极端边缘情况，不值得为此
    // 加一个 change 监听器
    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 这个脚本要同时在两种宿主页面里跑：独立访问/直接跳转到的
    // content.html，以及被 overlay.js clone 进 #overlayBody 的
    // index.html。两边都没有静态 <link> 引这里用到的 CSS（index.html
    // 只批准加这一行 <script>，没有额外加 <link>），所以自己动态注入，
    // 而不是指望宿主页面已经链好——跟宿主是哪个页面无关，两边效果一致
    function ensureStylesheet(href) {
        if (document.querySelector('link[rel="stylesheet"][href="' + href + '"]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }
    ensureStylesheet(SHELL_CSS_HREF);

    // ---- 壳子 DOM：scrim + panel(含右上角 X + 滚动容器) ----
    // 只建一次，挂在 document.body 上，跟 Coming Soon 弹窗单例的做法
    // 一样——不用每次打开都重新创建，关闭时只是隐藏、清空内容
    const scrim = document.createElement('div');
    scrim.className = 'case-overlay-scrim';

    const panel = document.createElement('div');
    panel.className = 'case-overlay-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Case study');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'case-overlay-close';
    closeBtn.setAttribute('aria-label', 'Close case study');
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

    const panelBody = document.createElement('div');
    panelBody.className = 'case-overlay-body';

    panel.appendChild(closeBtn);
    panel.appendChild(panelBody);
    document.body.appendChild(scrim);
    document.body.appendChild(panel);

    let isOpen = false;
    let currentKey = null;
    let firstLayerScrollTop = null;
    const mainPromiseCache = {};   // 按 caseKey 分别缓存，跟 overlay.js 的 mainPromise 同一个思路

    function loadCaseMain(key) {
        const entry = CASE_STUDIES[key];
        if (!entry) return Promise.resolve(null);
        if (!mainPromiseCache[key]) {
            ensureStylesheet(entry.css);
            mainPromiseCache[key] = fetch(entry.html)
                .then(res => res.text())
                .then(html => new DOMParser().parseFromString(html, 'text/html').querySelector('main'));
        }
        return mainPromiseCache[key];
    }

    // 第一层的滚动容器在两种宿主页面里不是同一个东西：
    // - 被 clone 进 index.html 的浮层时，真正在滚的是 #overlayBody
    //   （overflow-y:auto 的那个 div，见 style.css .overlay-body）。
    // - 独立访问 content.html（含 content.html?case=xxx 直接落地）时，
    //   压根没有 #overlayBody 这个元素，页面滚动是原生的 window/html。
    // 用 #overlayBody 存在与否判断当前是哪种场景，两边都能正确记录/
    // 还原滚动位置，不用关心调用方到底在哪个页面
    function getFirstLayerScrollEl() {
        return document.getElementById('overlayBody');   // null in the standalone content.html case
    }
    function getFirstLayerScrollTop() {
        const el = getFirstLayerScrollEl();
        return el ? el.scrollTop : (window.scrollY || document.documentElement.scrollTop);
    }
    function setFirstLayerScrollTop(value) {
        const el = getFirstLayerScrollEl();
        if (el) el.scrollTop = value;
        else window.scrollTo(0, value);
    }

    // 只挡住鼠标滚轮不够——scrim/panel 挡的是指针事件的命中测试，键盘
    // 滚动（空格/方向键/Page Down）不看鼠标在哪，看的是当前谁有焦点，
    // 点开 case study 这一下焦点还留在被点的那个触发按钮上（第一层内容
    // 里），这时候按空格会把第一层滚走，用户却看不见（被第二层盖住），
    // 关闭后第一层"原来的位置"其实已经不是原来那个位置了。直接给第一层
    // 的滚动容器加 overflow:hidden 内联样式最省事——不管键盘还是鼠标滚，
    // 这个容器物理上就滚不动，跟"焦点在哪"无关。standalone content.html
    // 场景下没有 #overlayBody，锁 <html> 本身（比锁 <body> 更可靠，两者
    // 谁是真正的滚动 box 会因浏览器/是否 quirks 模式而不同，<html> 更统一）
    function lockFirstLayerScroll() {
        const el = getFirstLayerScrollEl();
        if (el) el.style.overflow = 'hidden';
        else document.documentElement.style.overflow = 'hidden';
    }
    function unlockFirstLayerScroll() {
        const el = getFirstLayerScrollEl();
        if (el) el.style.overflow = '';
        else document.documentElement.style.overflow = '';
    }

    // 地址栏要准确反映"实际在看哪个页面"，不能不分场景写死同一个文件名：
    // 独立访问 content.html 时写 content.html?case=xxx，被 index.html
    // clone 进第一层浮层时写 index.html?case=xxx——用跟滚动位置记录同一个
    // #overlayBody 存在性判断，两边各自准确
    function isOnIndexHtml() {
        return !!getFirstLayerScrollEl();
    }
    function buildCaseUrl(key) {
        const target = isOnIndexHtml() ? 'index.html' : 'content.html';
        return new URL(target + '?case=' + encodeURIComponent(key), location.href).toString();
    }
    function buildClosedUrl() {
        const target = isOnIndexHtml() ? 'index.html' : 'content.html';
        return new URL(target, location.href).toString();
    }

    function openCaseOverlay(key, opts) {
        opts = opts || {};
        const entry = CASE_STUDIES[key];
        if (!entry) return;   // 不在映射表里的 key 直接忽略，不报错不弹窗

        // 只在真正"从关闭态打开"时记录/锁定一次；已经开着、切到另一个
        // case 的情况不应该覆盖掉最早记录的那个位置，不然关闭时会还原错
        // 地方，也不需要重复锁一次已经锁上的滚动容器
        if (!isOpen) {
            firstLayerScrollTop = getFirstLayerScrollTop();
            lockFirstLayerScroll();
        }

        loadCaseMain(key).then(main => {
            if (!main) return;

            panelBody.innerHTML = '';
            const clone = main.cloneNode(true);
            panelBody.appendChild(clone);

            // 目前 drayeasy.html 只有 hero 区，用不到 .project-divider 的
            // 蓝图网格，但以后加章节内容大概率会用到，跟 overlay.js 一样
            // 顺手补一次，没有匹配元素时是安全的空操作
            if (window.renderDividerGrids) window.renderDividerGrids(clone);

            // display 必须先变成可见值，浏览器才有"关闭态"（opacity:0 +
            // translateY(40px)，见 case-overlay.css）那一帧可以过渡出发——
            // 如果 display 和 .is-open 在同一时刻一起加，浏览器会把它们
            // 合并成一帧直接画成打开态，动画不会播放。中间用读
            // offsetHeight 强制触发一次 reflow，逼浏览器先把关闭态真正
            // 画出来，再在下一步加 .is-open 触发过渡
            scrim.style.display = 'block';
            panel.style.display = 'block';
            void panel.offsetHeight;
            panel.classList.add('is-open');

            document.body.classList.add('case-overlay-open');
            panelBody.scrollTop = 0;
            isOpen = true;
            currentKey = key;

            // 把焦点挪进新打开的面板——role="dialog" aria-modal="true"
            // 的语义要求焦点跟着过来，键盘/屏幕阅读器用户不应该还停留在
            // 已经被盖住的第一层内容上
            closeBtn.focus();

            if (opts.updateUrl !== false) {
                history.pushState({ caseOverlay: key }, '', buildCaseUrl(key));
            }
        }).catch(err => {
            console.error('[case-overlay] failed to load "' + key + '":', err);
        });
    }

    function closeCaseOverlay(opts) {
        opts = opts || {};
        if (!isOpen) return;

        // 逻辑上的"关闭"立刻生效（isOpen/URL/地址栏），跟"面板真的从
        // 屏幕上消失"分成两件事——后者要等 320ms/240ms 的过渡跑完。
        // 这样如果动画跑到一半又被重新打开（见 finishClose 里的判断），
        // isOpen 已经是最新状态，不会被过期的收尾逻辑覆盖
        isOpen = false;
        currentKey = null;
        document.body.classList.remove('case-overlay-open');
        panel.classList.remove('is-open');

        if (opts.updateUrl !== false) {
            history.pushState({}, '', buildClosedUrl());
        }

        const savedScrollTop = firstLayerScrollTop;
        firstLayerScrollTop = null;

        function finishClose() {
            // 等待过渡结束这段时间里如果又被重新打开了（isOpen 变回
            // true），这次关闭已经过期，不能再隐藏/清空——会把刚刚重新
            // 打开的内容瞬间抹掉
            if (isOpen) return;
            scrim.style.display = 'none';
            panel.style.display = 'none';
            panelBody.innerHTML = '';
            unlockFirstLayerScroll();
            if (savedScrollTop !== null) setFirstLayerScrollTop(savedScrollTop);
        }

        if (REDUCED_MOTION) {
            finishClose();
            return;
        }

        // transitionend 正常情况下会触发，setTimeout 只是兜底——万一
        // 过渡被打断到从未触发 transitionend 的地步（理论上有，实践中
        // 极少见），不能让 DOM 清理/滚动还原永远卡住不执行
        let settled = false;
        function settle() {
            if (settled) return;
            settled = true;
            panel.removeEventListener('transitionend', onTransitionEnd);
            finishClose();
        }
        function onTransitionEnd(e) {
            if (e.target === panel) settle();
        }
        panel.addEventListener('transitionend', onTransitionEnd);
        setTimeout(settle, CLOSE_DURATION_MS + 50);
    }

    // 三种关闭方式，跟第一层（overlay.js）保持一致：点 scrim 空白处、
    // 点右上角 X、按 Escape
    scrim.addEventListener('click', () => closeCaseOverlay());
    closeBtn.addEventListener('click', () => closeCaseOverlay());

    // Escape 监听器必须比 overlay.js 里那个先注册，才能在第二层开着的
    // 时候用 stopImmediatePropagation() 拦掉 overlay.js 自己的 Escape
    // 处理（两边都直接挂在 document 上，后注册的监听器管不了先注册的，
    // 顺序是唯一能控制"谁先跑"的办法）——不然按一次 Escape 会把两层一起
    // 关掉，用户大概率只想关掉正在看的 case study，回到项目列表页。
    // 这就是为什么 index.html 里这一行 <script> 必须放在
    // <script src="overlay.js"> 前面，顺序不能换
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape' || !isOpen) return;
        e.stopImmediatePropagation();
        closeCaseOverlay();
    });

    // 浏览器前进/后退：地址栏 ?case= 变了，让浮层状态跟着 URL 走，而不是
    // 反过来。不管这次 popstate 是用户点了返回键，还是别的代码调了
    // history.back()，统一从当前 location.search 重新判断该开哪个/该不
    // 该关，不在这里自己维护一份"上一个状态是什么"的位移逻辑，state 永远
    // 以 URL 为准，比较不容易因为快速前进/后退几下就跟 URL 对不上
    function syncFromLocation() {
        const key = new URLSearchParams(location.search).get('case');
        if (key && CASE_STUDIES[key]) {
            // index.html 场景下，第二层是"盖在第一层浮层之上"的——分享
            // 链接落地或者前进/后退回到这个 URL 时，第一层不一定已经开着
            // （比如刚加载页面，或者用户之前手动关掉过），先把它叫出来。
            // openContentOverlay 本身不认识"是不是已经开着"这件事，重复调
            // 用是安全的（重新 clone 一遍、重置滚动到 Work 顶部——Work
            // 顶部正好是 001 卡片，不是坏效果）。这一步不传 updateUrl，
            // 也没有别的地址栏副作用，跟 overlay.js 自己一贯"不碰地址栏"
            // 的设计保持一致，只有下面 openCaseOverlay 才会写 URL
            if (typeof window.openContentOverlay === 'function') {
                window.openContentOverlay('work');
            }
            if (!isOpen || currentKey !== key) openCaseOverlay(key, { updateUrl: false });
        } else if (isOpen) {
            closeCaseOverlay({ updateUrl: false });
        }
    }
    window.addEventListener('popstate', syncFromLocation);

    // 点击拦截：用事件委托挂在 document 上，而不是直接给按钮加监听——
    // 触发按钮在被 overlay.js clone 进第一层浮层时不会带着任何事件监听
    // 一起过去（DOM clone 的固有限制），但委托在 document 上的监听器
    // 不受这个影响，不管按钮是原始那份还是克隆出来的第 N 份都能命中。
    // href 保留原来指向 drayeasy.html 的真实链接不动——case-overlay.js
    // 加载失败时（比如脚本被拦截/网络问题），这里的监听器根本不会注册，
    // 点击自然走原生 <a href> 跳转，按钮不会变成死的，不需要额外写一段
    // "JS 没加载就手动改 href" 的兜底代码
    document.addEventListener('click', e => {
        const trigger = e.target.closest('[data-case-study]');
        if (!trigger) return;
        const key = trigger.getAttribute('data-case-study');
        if (!CASE_STUDIES[key]) return;
        e.preventDefault();
        openCaseOverlay(key);
    });

    window.openCaseOverlay = openCaseOverlay;
    window.closeCaseOverlay = closeCaseOverlay;
    window.isCaseOverlayOpen = function () { return isOpen; };

    // 页面刚加载时也要按地址栏当前的 ?case= 走一遍——这是"分享出去的
    // 链接能直接打开"的关键：content.html?case=drayeasy 落地时，浮层
    // 要在页面一渲染出来就自动弹出，不用等用户再点一次。

    // 必须等 DOMContentLoaded，不能像下面 popstate 触发的那次一样直接
    // 同步调用——这里是唯一会在"整个文档还没解析完"这个时间点就执行的
    // 调用点。index.html 里 case-overlay.js 的 <script> 标签故意排在
    // overlay.js 前面（给 Escape 的 stopImmediatePropagation 抢优先级
    // 用，见上面），意味着这一行同步执行的时候 overlay.js 还没跑，
    // syncFromLocation() 内部调 window.openContentOverlay('work') 会
    // 因为这个函数还不存在而静默跳过——不报错，第二层照样能打开（它不
    // 依赖这个），但第一层从来没被真正打开过，问题要等用户关掉第二层
    // 才会暴露出来（发现背后根本没有开着的第一层）。等 DOMContentLoaded
    // 能保证这时候整份文档（包括 overlay.js）已经执行完，不用改
    // <script> 标签顺序、不用动 overlay.js。写法跟 content.js 文件末尾
    // 的 start() 是同一个模式，不是新发明的 ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncFromLocation);
    } else {
        syncFromLocation();
    }
})();
