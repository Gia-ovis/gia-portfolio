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

    // 等一个容器里所有 <img> 都加载完（已经 complete 的直接跳过，不用
    // 白等一次 load 事件）。error 也当完成处理——图裂了不该让居中逻辑
    // 卡死在那儿一直不执行
    function waitForImages(container) {
        const imgs = Array.from(container.querySelectorAll('img'));
        return Promise.all(imgs.map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
            });
        }));
    }

    // 让 001 项目卡片在 #overlayBody 的可视区域里垂直居中——用
    // getBoundingClientRect 而不是 offsetTop：offsetTop 是相对最近的
    // "已定位祖先"算的，#work 到 #overlayBody 之间一串祖先（<main>／
    // .content-section 等）都没有设 position，offsetParent 链条可能
    // 一路找到真正的 document.body 而不是这个浮层自己的 #overlayBody，
    // 量出来的数会不对；getBoundingClientRect 量的是视口坐标，用两个
    // 矩形的差再加上 body 当前的 scrollTop，换算出"卡片顶部相对
    // #overlayBody 内容顶部"的距离，跟祖先链条是否 positioned 无关，
    // 更可靠
    async function centerFirstWorkCard(mainClone, body) {
        const firstCard = mainClone.querySelector('#work .project-card');
        if (!firstCard) {
            body.scrollTop = 0;
            return;
        }
        await waitForImages(firstCard);
        const cardRect = firstCard.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        const cardTop = (cardRect.top - bodyRect.top) + body.scrollTop;
        const cardHeight = firstCard.offsetHeight;
        const viewportHeight = body.clientHeight;
        // 卡片比可视区域还高的极端情况：居中公式会算出负值，交给下面
        // Math.max(0, ...) 兜底，退化成贴顶显示卡片顶部（不会把卡片
        // 顶部滚过头看不见），这种情况不额外处理——"自然居中，除非
        // 效果不理想不加下限"已经覆盖了这个分支
        const targetScrollTop = cardTop - (viewportHeight - cardHeight) / 2;
        const maxScrollTop = body.scrollHeight - body.clientHeight;
        body.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
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

        // About 定位到 .about-scroll-wrapper 而不是 #about 本身——
        // #about 自己还有一段 padding-top（目前还没有分隔格子接管这段
        // 间距，所以没清零），如果 scrollIntoView 对准的是 #about，
        // 停下来的位置会落在 wrapper 前面一截，.about-sticky 这时候
        // 还没真正"钉住"（position:sticky 需要再往下滚一段才会贴顶），
        // 用户会先看到一帧没有钉住、内容还在正常文档流里的过渡画面——
        // 视觉上就是"标题偏低、上面多一截空白"。直接对准 wrapper 的
        // 顶部，滚动落点正好是 sticky 开始生效的那一刻，一步到位显示
        // 钉住之后的最终布局，不会有过渡帧
        const target = sectionId === 'about'
            ? mainClone.querySelector('#about .about-scroll-wrapper')
            : mainClone.querySelector('#' + sectionId);
        if (sectionId === 'work') {
            // 撤销过居中滚动这个方向——001 卡片上方的留白（.work-banner
            // 的 margin-bottom）现在已经是响应式的了（跟窗口高度联动，
            // 720-987px 区间自动收缩，见 content.css），配合直接贴顶
            // 打开，视觉上不会再出现"顶部留白过多"，不需要额外居中滚动
            // 来补偿。centerFirstWorkCard() 函数本身还留着（见下面
            // 定义），没删，只是这里不调用了——以后想恢复直接把下面这行
            // 换回 `await centerFirstWorkCard(mainClone, body);` 即可。
            // 之前给这个函数加的"等图片 load 完再测量"逻辑只服务于居中
            // 计算，现在不需要居中了，这段 await 会让浮层打开到滚动定位/
            // scroll-spy 初始化之间多等图片加载（实测约 40ms），贴顶
            // 不需要量任何东西，去掉这段等待，恢复成同步直接跳转，更快
            body.scrollTop = 0;
        } else if (target) {
            target.scrollIntoView({ behavior: 'auto', block: 'start' });
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
