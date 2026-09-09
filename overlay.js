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
            // Sandbox：定位到 001 项目(Beyond Fingers)这张卡片容器的
            // 顶部，缓冲量是"banner 底部→001 卡片顶部"这段间距的 3/5
            // (0.6 倍，之前是一半/0.5，这次任务改的)，不是写死的 30px。
            // 排查结论：之前以为这段间距归 .project-divider(分隔线)管，
            // 后来确认过是搞错了对象——content.html 从头到尾只有一条
            // banner：.work-banner，里面的大字("Selected Work"/
            // "Sandbox"/"About")靠 content.js 的 scroll-spy 用
            // crossfade 切换文字内容，不是三条各自独立的 banner 元素，
            // 所以 Sandbox 用的就是同一个 .work-banner class、同一套
            // 响应式 margin-bottom(clamp(35px,...,130px)，视口高度
            // 720-987px 区间联动，见 content.css:158)。
            // 这个 margin-bottom 是响应式的，写死"多少 px"只在某个特定
            // 视口高度下凑巧对，视口一变就会跟设计意图脱节，所以在这里
            // (每次打开浮层时)用 getComputedStyle 现读现算，不缓存成
            // 常量——保证任意视口高度下这个缓冲量都精确等于当前 banner
            // margin-bottom 的 0.6 倍
            const sandbox001 = mainClone.querySelector('.project-card--beyond-fingers');
            if (sandbox001) {
                const banner = mainClone.querySelector('.work-banner');
                const bannerMarginBottom = banner ? parseFloat(getComputedStyle(banner).marginBottom) : 0;
                scrollToWithOffset(sandbox001, body, bannerMarginBottom * 0.6);
            } else {
                body.scrollTop = 0;
            }
        } else if (sectionId === 'about') {
            // About：不是定位到 About 内容开始的位置，是直接跳到整个
            // 可滚动区域的最末端——这跟之前"对准 .about-scroll-wrapper
            // 顶部、让 .about-sticky 一步到位显示钉住后布局"是两个不同
            // 的目标，这次任务明确要求改成停在最底部，以这次的要求为准，
            // 旧的那套 wrapper 定位逻辑不再需要
            body.scrollTop = body.scrollHeight - body.clientHeight;
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
        // 不来的，得在注入完成后重新挂一遍
        const aboutTeardown = window.initAboutScrollJack
            ? window.initAboutScrollJack(document)
            : null;
        // Coming Soon 弹窗的触发按钮也是克隆进来的，同样要重新绑一遍——
        // 弹窗本身（scrim/modal）是单例不会重复创建，见 content.js
        const comingSoonTeardown = window.initComingSoonModal
            ? window.initComingSoonModal(document)
            : null;
        currentTeardown = () => {
            scrollSpyTeardown();
            if (hoverCapsuleTeardown) hoverCapsuleTeardown();
            if (aboutTeardown) aboutTeardown();
            if (comingSoonTeardown) comingSoonTeardown();
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
