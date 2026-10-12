/* ============================================================
   Work/Play/About 内容浮层：真浮层，不是页面跳转——index.html（窗户
   门厅）留在背后不卸载，弹出遮罩+面板展示 content.html 的完整长页面
   （banner + Work/Sandbox/About 全部区块，不是只挑点进来的那一个
   section），打开时滚动定位到对应锚点，但上下其他区块都还在，
   可以继续滚动——跟 content.html 独立访问时是同一份体验，只是装在
   浮层面板里。

   内容不重复维护两份：面板打开时用 fetch 把 content.html 整页取回来，
   解析、克隆，只取一次、缓存住，后面开别的入口直接用缓存，不重复请求。

   克隆 DOM 节点不会带上脚本或事件监听，所以注入完成后要手动调一次
   content.js 暴露出来的 window.initContentScrollSpy()，重新建立
   IntersectionObserver / crossfade 这套逻辑——不能指望克隆过来的
   HTML 自己跑起来。每次重新打开浮层，先把上一次初始化留下的
   observer 断开（见 currentTeardown），再初始化新的一套。
   ============================================================ */
(function () {
    const scrim = document.getElementById('overlayScrim');
    const panel = document.getElementById('overlayPanel');
    const body  = document.getElementById('overlayBody');
    if (!scrim || !panel || !body) return;

    // fog.js 里的格子叫 work/play/about，content.html 里对应的 section id
    // 是 work/sandbox/about（Play 对应的板块叫 Sandbox）——统一在这一个
    // 地方做映射，其他地方都不用关心这个名字不一样的事
    const SECTION_IDS = { work: 'work', play: 'sandbox', about: 'about' };
    // banner 大字的初始状态：浮层刚打开、还没等 observer 反应过来之前，
    // 先按点的是哪个入口直接把文字定死，避免开场先闪一下别的标题
    const SECTION_TITLES = { work: 'Selected Work', play: 'Sandbox', about: 'About' };

    // 缓存 content.html 里装着 banner+全部 section 的 <main>，只取一次，
    // 后面开别的入口直接用缓存，不重复请求
    let mainPromise = null;
    function loadMain() {
        if (!mainPromise) {
            mainPromise = fetch('content.html')
                .then(res => res.text())
                .then(html => new DOMParser().parseFromString(html, 'text/html').querySelector('main'));
        }
        return mainPromise;
    }

    // 排查结论：之前"让 001 卡片在 #overlayBody 里垂直居中"那套逻辑
    // (centerFirstWorkCard() + 它的辅助函数 waitForImages())已经在更早
    // 的任务里撤销过、不再调用了，但函数定义本身一直没删，只是注释掉了
    // 调用点——这次任务要求把这类残留彻底清理干净，两个函数整个删除，
    // 不再保留"以后想恢复就换回这行"这种半吊子状态。
    // Sandbox/About 这次改成各自明确的定位规则(见下面 openOverlay 里
    // 的分支)，不需要"动态量卡片高度"这套机制，替换成更简单的
    // scrollToWithOffset：把目标元素的顶部滚动到距离 #overlayBody 可视
    // 区域顶部指定的 offset 处。测量方式还是用 getBoundingClientRect
    // 而不是 offsetTop——原因跟被删掉的 centerFirstWorkCard() 一样：
    // offsetTop 是相对最近的"已定位祖先"算的，content.html 里从目标
    // 元素到 #overlayBody 之间一串祖先(<main>／.content-section 等)都
    // 没有设 position，offsetParent 链条可能一路找到真正的
    // document.body 而不是这个浮层自己的 #overlayBody，量出来的数会
    // 不对；getBoundingClientRect 量的是视口坐标，用两个矩形的差再加上
    // body 当前的 scrollTop，换算出"目标顶部相对 #overlayBody 内容顶部"
    // 的距离，跟祖先链条是否 positioned 无关，更可靠
    function scrollToWithOffset(target, body, offset) {
        const targetRect = target.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        const targetTop = (targetRect.top - bodyRect.top) + body.scrollTop;
        body.scrollTop = Math.max(0, targetTop - offset);
    }

    let isOpen = false;
    let currentTeardown = null;   // 上一次 initContentScrollSpy() 返回的 destroy()

    async function openOverlay(key) {
        const sectionId = SECTION_IDS[key];
        if (!sectionId) return;

        const main = await loadMain();
        if (!main) return;

        if (currentTeardown) { currentTeardown(); currentTeardown = null; }
        body.innerHTML = '';

        const mainClone = main.cloneNode(true);

        // banner 是 mainClone 里的子元素（跟 content.html 原始结构一致，
        // 不再单独克隆一份平级的），直接从克隆结果里找
        const bannerClone = mainClone.querySelector('.work-banner');

        // banner 里那行大字先直接按点的入口写死——真正接管持续 crossfade
        // 的是下面 initContentScrollSpy() 建立的 observer，这里只负责
        // "浮层刚打开那一瞬间不要显示错的标题"
        if (bannerClone) {
            const titleEl = bannerClone.querySelector('.banner-section-title');
            if (titleEl) titleEl.textContent = SECTION_TITLES[key] || '';
        }

        // .banner-home 在 content.html 独立访问时是真的跳转回 index.html；
        // 搬进浮层以后要改成"关掉浮层"，不然点了会把整个页面导航走，
        // 浮层架构就白做了。它是 <a href>，手动改写点击行为
        if (bannerClone) {
            bannerClone.querySelectorAll('.banner-home').forEach(homeLink => {
                homeLink.addEventListener('click', e => {
                    e.preventDefault();
                    closeOverlay();
                });
            });
        }

        body.appendChild(mainClone);

        // .project-divider 里的蓝图网格是 grid.js 用 SVG 现算现画的，只在
        // 页面首次加载时自动跑一遍——这段内容是浮层打开后才插进 DOM 的，
        // 不在那次扫描范围内，得手动喊一次才会画出来
        if (window.renderDividerGrids) window.renderDividerGrids(mainClone);

        // 先把面板显示出来、瞬间滚到目标区块，再初始化 scroll-spy——
        // 这样 observer 第一次判断"当前在哪个区块"时，滚动位置已经是对的，
        // 不会出现"标题先被设对、observer 一启动又误判成 Work 再纠正回来"
        // 那种闪烁
        document.body.classList.add('overlay-open');
        scrim.classList.add('is-visible');
        panel.classList.add('is-visible');
        isOpen = true;

        // 埋点：只加这一行上报调用，不改动上面任何定位/展示逻辑
        if (window.trackEvent) window.trackEvent('open_section', { section: key, method: 'click' });

        // 三个入口各自明确的定位规则，不再共用同一套 scrollIntoView 贴顶
        // 逻辑(之前 Sandbox/About 走的是同一个 target.scrollIntoView({
        // block:'start'})，视觉效果不理想，这次分开处理)：
        if (sectionId === 'work') {
            // Work：贴顶，不做任何居中/偏移计算。001 卡片上方的留白
            // (.work-banner 的 margin-bottom)已经是响应式的了(跟窗口
            // 高度联动，720-987px 区间自动收缩，见 content.css)，配合
            // 直接贴顶打开，视觉上不会出现"顶部留白过多"，不需要额外
            // 计算来补偿——这条逻辑这次没有改动，跟之前撤销居中滚动那次
            // 任务定下来的效果一致
            body.scrollTop = 0;
        } else if (sectionId === 'sandbox') {
            // Sandbox：排查结论——之前"banner 底部→卡片顶部间距 = banner
            // margin-bottom 的 0.6 倍"这套公式，实测两组不同视口高度的
            // 数据后发现关系是反的：矮视口下卡片反而被 banner 压住一截，
            // 高视口下卡片又跟 banner 之间空出一大截，不是同一个方向的
            // 偏差，说明公式本身的参照对象就选错了——0.6 倍这个系数是
            // 拍出来的，没有对应任何实际布局关系。
            // 真正要的效果：卡片在"banner 底部→视口底部"这段可用空间里
            // 居中——可用空间够大就是间距对称的居中；可用空间比卡片本身
            // 还矮（卡片装不下）就允许卡片顶部/底部各自超出一样的量，是
            // 居中公式在空间不够时的自然延伸，不是另外一套逻辑分支。
            // 公式：卡片顶部相对 body 顶部的目标偏移
            //   = bannerHeight + (availableSpace - cardHeight) / 2
            //   availableSpace = bodyRect.height - bannerHeight
            // availableSpace ≥ cardHeight 时上面这个偏移量 > bannerHeight，
            // 卡片顶部让在 banner 下方，两端间距相等；availableSpace <
            // cardHeight 时偏移量 < bannerHeight，卡片顶部主动往上探进
            // banner 底下一截，同样的量会在卡片底部探出视口底部——两处
            // 探出量数学上必然相等（用同一个居中公式代入即可推出），不用
            // 分两条 if/else 单独处理超出的情况。
            // bannerHeight 用的是 banner 自己的渲染高度（68px，纯 CSS
            // 决定，不受视口高度影响），不是 margin-bottom（响应式
            // clamp，之前那条公式的参照对象）——这次任务明确要"卡片贴着
            // banner 实际画出来的下边缘对称"，用 margin-bottom 从起点上
            // 就不对。全部现读现算，没有任何写死的绝对数字或系数
            const sandbox001 = mainClone.querySelector('.project-card--beyond-fingers');
            const sandboxBanner = mainClone.querySelector('.work-banner');
            if (sandbox001 && sandboxBanner) {
                const positionSandbox = () => {
                    const bannerHeight = sandboxBanner.getBoundingClientRect().height;
                    const bodyRect = body.getBoundingClientRect();
                    const availableSpace = bodyRect.height - bannerHeight;
                    const cardHeight = sandbox001.getBoundingClientRect().height;
                    const targetCardTop = bannerHeight + (availableSpace - cardHeight) / 2;
                    scrollToWithOffset(sandbox001, body, targetCardTop);
                };
                positionSandbox();
                // 跟 About 那次同样的排查结论——Work/Sandbox 里大量标题/
                // 标签用自定义字体，打开浮层这一刻字体可能还没换好，字体
                // 换好触发的重排会让上面这次测量的 bannerHeight/cardHeight
                // 跟着漂移，落点跟着算错。等 document.fonts.ready 之后
                // 用同一个公式重新定位一次，纠正可能的漂移
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(() => {
                        requestAnimationFrame(() => requestAnimationFrame(positionSandbox));
                    });
                }
            } else {
                body.scrollTop = 0;
            }
        } else if (sectionId === 'about') {
            // About：这次任务改成入场显示第一张卡片（initialProgress:0，
            // 见下面），但纵向滚动位置这部分逻辑不能动——排查"About 横向
            // 滚动完全失灵"时发现的根因是：之前直接跳 body.scrollTop 到
            // 整个可滚动区域的最末端，落点在 .about-scroll-wrapper 的
            // sticky 缓冲区之外（sticky 早就松开了），about.js 的
            // isPinned() 从一开始就是 false，wheel 事件从来没被接管过，
            // 等于横向画廊没启动过。这跟"画廊从第几张卡片开始"是两件
            // 独立的事——不管 initialProgress 是 0 还是 1，只要 scrollTop
            // 落在 sticky 缓冲区之外，isPinned() 照样是 false，照样完全
            // 无法响应，所以精确定位到缓冲区正中间这部分必须保留
            const aboutWrapper = mainClone.querySelector('.about-scroll-wrapper');
            if (aboutWrapper) {
                // 必须跟 content.css 里 .about-scroll-wrapper 的
                // calc(100vh + 300px) 这个 300 对上——那是缓冲区总高度，
                // 这里取正中间，两头都留出足够余量，不会因为测量误差
                // 又落到窗口边缘外面
                const BUFFER_PX = 300;
                const positionAbout = () => scrollToWithOffset(aboutWrapper, body, -(BUFFER_PX / 2));
                positionAbout();

                // 排查结论（"直接导航进 About 画面不完整"排查）：用户在
                // 真实 Safari 里实测到，点击进入的那一刻用
                // getBoundingClientRect() 量出来的 wrapperTopAbs 跟几百
                // 毫秒后（布局彻底稳定、Console 里重新量一遍）的真实值
                // 能差出 300px 左右——不是这条定位公式本身算错了，是
                // Work/Sandbox 里用到自定义字体（Montserrat/Caveat-
                // Adjusted）的大量标题/标签文字，在这个时间点可能还没换
                // 字完成，用的是尺寸不同的后备字体，字体换好之后引发的
                // 重排会把 .about-scroll-wrapper 的位置顶下去一截——这次
                // 排查中 Chrome 端复现不出这个漂移（字体大概率已经缓存
                // 命中，换字几乎瞬间完成），只在 Safari 真机上量到过，
                // 具体是不是100%字体这一个原因、还是也有其它因素叠加，
                // 没有100%实锤，但 document.fonts.ready 是这类问题的标准
                // 应对方式，等它 resolve、且再等两帧真正 paint 稳定后，
                // 用同一个 wrapperTopAbs 公式重新定位一次，把可能的
                // 漂移误差纠正回来。字体已经就绪的正常情况下 resolve
                // 几乎是瞬间的，用户不会感知到"先落错位置再纠正"这个过程
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(() => {
                        requestAnimationFrame(() => requestAnimationFrame(positionAbout));
                    });
                }
            } else {
                body.scrollTop = body.scrollHeight - body.clientHeight;
            }
        } else {
            body.scrollTop = 0;
        }

        const scrollSpyTeardown = window.initContentScrollSpy(document, {
            initialSection: sectionId,
            enableHashScroll: false,   // index.html 地址栏的 hash 跟浮层内容无关，别拿它去定位
        });
        // Sandbox 项目2 那几张小项目卡片的 hover 胶囊同样是克隆进来的、
        // 不带事件监听，也要在注入完成后手动重新初始化一次
        const hoverCapsuleTeardown = window.initMiniGridHoverCapsules
            ? window.initMiniGridHoverCapsules(document)
            : null;
        // About 的横向 scroll-jacking 同理——wheel/拖拽监听器也是克隆
        // 不来的，得在注入完成后重新挂一遍。sectionId==='about' 这个
        // 入口上面已经把 scrollTop 精确定位到缓冲区中间（真正钉住的
        // 位置，这是让画廊能响应输入的关键，跟 initialProgress 无关，
        // 不能省掉）——initialProgress 本身这次改成 0，入场显示第一张
        // 卡片；Work/Sandbox 入口同样走 0，跟 about.js 默认值一致
        const aboutTeardown = window.initAboutScrollJack
            ? window.initAboutScrollJack(document, {
                initialProgress: 0,
            })
            : null;
        // Coming Soon 弹窗的触发按钮也是克隆进来的，同样要重新绑一遍——
        // 弹窗本身（scrim/modal）是单例不会重复创建，见 content.js
        const comingSoonTeardown = window.initComingSoonModal
            ? window.initComingSoonModal(document)
            : null;
        // 埋点：view_section 的 IntersectionObserver，同一个 initX→destroy
        // 模式，每次重新打开浮层都拿到全新的已上报集合——这就是"浮层关闭
        // 再打开时重置"的实现方式，不是靠监听 close 事件清空
        const sectionAnalyticsTeardown = window.initSectionAnalytics
            ? window.initSectionAnalytics(document)
            : null;
        // 埋点：About 4 张卡片的 view_about_item，跟上面 sectionAnalyticsTeardown
        // 同一套模式、同一个原因——重新打开浮层拿到全新的已上报集合
        const aboutItemAnalyticsTeardown = window.initAboutItemAnalytics
            ? window.initAboutItemAnalytics(document)
            : null;
        currentTeardown = () => {
            scrollSpyTeardown();
            if (hoverCapsuleTeardown) hoverCapsuleTeardown();
            if (aboutTeardown) aboutTeardown();
            if (comingSoonTeardown) comingSoonTeardown();
            if (sectionAnalyticsTeardown) sectionAnalyticsTeardown();
            if (aboutItemAnalyticsTeardown) aboutItemAnalyticsTeardown();
        };
    }

    function closeOverlay() {
        if (!isOpen) return;
        document.body.classList.remove('overlay-open');
        scrim.classList.remove('is-visible');
        panel.classList.remove('is-visible');
        isOpen = false;

        // 回到首页时把雾气窗户的水珠重置干净——用户在浮层里待的这段时间，
        // 首页背后的六块雾气画布一直在按 ambientRate 生成水珠，没人看见
        // 也没人清理，关闭浮层这一刻直接重新起雾最省事，不用去猜攒了多久
        if (window.__fogHardResetAll) window.__fogHardResetAll();
    }

    scrim.addEventListener('click', closeOverlay);
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        // Coming Soon 弹窗开着的时候，Escape 应该先关那个小弹窗——两个
        // Escape 监听器都挂在 document 上，不靠谁先注册谁先跑这种顺序，
        // 直接查一下弹窗状态，开着就不要连带把整个浮层也关掉
        if (window.isComingSoonModalOpen && window.isComingSoonModalOpen()) return;
        closeOverlay();
    });

    window.openContentOverlay = openOverlay;
})();
