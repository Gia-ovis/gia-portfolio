/* ============================================================
   content.html 的 banner 大字 crossfade：滚动时 section 中点穿过视口
   中线，banner 里的标题跟着切换成对应区块的名字。

   包成 window.initContentScrollSpy(root, opts) 而不是直接在 IIFE 里跑一遍，
   是因为这套逻辑现在有两个使用场景：
     1. content.html 自己独立访问——页面加载时对 document 跑一次（本文件
        底部的 start()）。
     2. index.html 的浮层——overlay.js 现在会 fetch 整个 content.html、
        把 banner/全部 section 一起克隆塞进 #overlayBody，克隆 DOM
        节点不会带上任何脚本或事件监听，所以浮层必须在注入完成后手动
        再调一次 initContentScrollSpy()，不能指望克隆过来的 HTML 自己
        跑起来。

   两个场景不完全一样，用 opts 处理差异：
     - opts.initialSection：浮层刚打开时已经知道要停在哪个区块（点的是
       哪个入口），用来给 currentSection 打个底，避免 observer 第一次
       触发时又把刚设置好的标题重新 crossfade 一遍（看起来像闪一下）。
     - 返回一个 destroy() 函数，用来断开这次初始化建立的 observer——
       浮层每次重新打开都会先清空再注入新内容，旧的 observer 不主动断开
       的话会一直挂着（虽然目标元素已经从 DOM 里移除，理论上不会再触发，
       但显式断开更干净，也避免观察者对象本身累积）。
   ============================================================ */
(function () {
    function initContentScrollSpy(root, opts) {
        root = root || document;
        opts = opts || {};

        // 区块高度不一致（#work 有好几个项目卡片堆叠，能到 3000px+），
        // 不能用 threshold 判断"这个区块可见面积占自身总高度多少"——
        // 长区块的可见比例永远到不了阈值。改用 rootMargin，判断"区块
        // 中点是否穿过视口中线"，这个跟区块自身高度无关
        const sections   = Array.from(root.querySelectorAll('.content-section'));
        const sectionTitles = { work: 'Selected Work', sandbox: 'Sandbox', about: 'About' };
        const bannerTitleEl = root.querySelector('.banner-section-title');
        let bannerTitleObserver = null;

        if (bannerTitleEl) {
            let currentSection = opts.initialSection || null;

            function crossfadeTitle(newText) {
                bannerTitleEl.style.transition = 'opacity 0.25s ease';
                bannerTitleEl.style.opacity = '0';
                setTimeout(() => {
                    bannerTitleEl.textContent = newText;
                    bannerTitleEl.style.opacity = '1';
                }, 250);
            }

            bannerTitleObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach(entry => {
                        if (!entry.isIntersecting) return;
                        const sectionId = entry.target.id;
                        if (sectionId !== currentSection && sectionTitles[sectionId]) {
                            currentSection = sectionId;
                            crossfadeTitle(sectionTitles[sectionId]);
                        }
                    });
                },
                { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
            );
            sections.forEach(section => bannerTitleObserver.observe(section));
        }

        // ---- 带 hash 进页面（比如从首页雾气窗户点过来）：定位到对应区块。
        // 只在真正的顶层页面场景生效——浮层是靠 opts.initialSection 直接
        // 定位的，不走 URL hash 这条路。不能拿 root===document 判断是不是
        // 顶层页面：overlay.js 调这个函数时传的 root 也是 document（浮层
        // 内容注入后本来就是 document 的一部分），得靠显式的 opts 开关区分，
        // 不然浮层打开时会误把 index.html 地址栏上的 hash 当成跳转目标 ----
        if (opts.enableHashScroll !== false && location.hash) {
            // #about 定位到 .about-scroll-wrapper 而不是 #about 本身——
            // 原因跟 overlay.js 里同一处的处理一样：#about 自己还有一段
            // 没清零的 padding-top，对准 section 本身会落在 sticky 真正
            // 钉住之前的过渡位置，看起来"标题偏低、上面多一截空白"
            const target = location.hash === '#about'
                ? document.querySelector('#about .about-scroll-wrapper')
                : document.querySelector(location.hash);
            if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'auto', block: 'start' }));
        }

        return function destroy() {
            if (bannerTitleObserver) bannerTitleObserver.disconnect();
        };
    }

    window.initContentScrollSpy = initContentScrollSpy;

    /* ------------------------------------------------------------
       Sandbox 项目2 · 四个小项目卡片 hover 时跟着鼠标的提示胶囊：每张
       卡片对应一个动态创建、appendChild 到 body 的 .hover-capsule 元素
       （fixed 定位，跟着 mousemove 的 clientX/Y 走）。文案不是统一的
       "View Project"，每张卡片有自己的动作动词（Visit Site / Watch
       Reel / View Case Study / View Research Notes），写在
       content.html 对应 <a> 标签的 data-hover-label 属性上，跟卡片
       实际链接指向的内容类型（网站/视频/Figma/文档）对应。

       同样要支持浮层场景——克隆进浮层的卡片不带任何事件监听，注入完成后
       要手动重新调用一次；每次重新打开浮层也要把上一轮创建的胶囊元素和
       监听器清干净，不然反复开关浮层会在 body 上越攒越多没人用的
       .hover-capsule 节点。
       ------------------------------------------------------------ */
    function initMiniGridHoverCapsules(root) {
        root = root || document;
        const cards = Array.from(root.querySelectorAll('.mini-project-card'));
        if (!cards.length) return function destroy() {};

        const cleanups = cards.map(card => {
            const capsule = document.createElement('div');
            capsule.className = 'hover-capsule';
            capsule.textContent = card.dataset.hoverLabel || 'View Project';   // 每张卡自己的文案，写在 content.html 的 data-hover-label 上
            document.body.appendChild(capsule);

            const onEnter = () => { capsule.style.opacity = '1'; };
            const onLeave = () => { capsule.style.opacity = '0'; };
            const onMove = (e) => {
                capsule.style.left = (e.clientX + 16) + 'px';
                capsule.style.top = (e.clientY + 16) + 'px';
            };

            card.addEventListener('mouseenter', onEnter);
            card.addEventListener('mouseleave', onLeave);
            card.addEventListener('mousemove', onMove);

            return () => {
                card.removeEventListener('mouseenter', onEnter);
                card.removeEventListener('mouseleave', onLeave);
                card.removeEventListener('mousemove', onMove);
                capsule.remove();
            };
        });

        return function destroy() {
            cleanups.forEach(fn => fn());
        };
    }

    window.initMiniGridHoverCapsules = initMiniGridHoverCapsules;

    /* ------------------------------------------------------------
       Coming Soon 弹窗：点还没做完 case study 的"View Case Study"按钮
       （content.html 里标了 data-case-study-ready="false" 的那几个
       .btn-primary）不跳转，弹一个提示框。按钮外观完全不变，还是正常
       的 .btn-primary，区别只在点击行为。

       弹窗本身（scrim+modal）是单例，只在第一次调用时创建、appendChild
       到 document.body，之后重复调用直接复用同一个，不会累积出多份——
       跟触发按钮不一样，触发按钮每次浮层重新打开都是新克隆的 DOM，
       必须重新绑监听器，但弹窗自己没有"跟着内容一起被替换"这回事。

       跟 overlay.js 那层"关掉整个 Work/Sandbox/About 浮层"的 Escape
       监听器会冲突——两边都监听 document 的 keydown，如果不处理，
       弹窗开着的时候按 Escape 会两层一起关掉，用户大概率只想关小弹窗、
       继续留在浮层里逛。这里不试图用 stopPropagation 抢注册顺序（两个
       监听器都在 document 上，谁先绑的谁先跑，抢顺序不可靠），而是让
       overlay.js 自己去检查这个弹窗是不是开着（见 overlay.js 的
       closeOverlay 调用点），这边只管好自己就行。
       ------------------------------------------------------------ */
    function initComingSoonModal(root) {
        root = root || document;
        const triggers = Array.from(root.querySelectorAll('[data-case-study-ready="false"]'));
        if (!triggers.length) return function destroy() {};

        let scrim = document.querySelector('.coming-soon-scrim');
        if (!scrim) {
            scrim = document.createElement('div');
            scrim.className = 'coming-soon-scrim';
            scrim.innerHTML = `
                <div class="coming-soon-modal">
                    <button class="coming-soon-close" type="button" aria-label="Close">&times;</button>
                    <h3 class="coming-soon-title">Case study coming soon 🏗️</h3>
                    <p class="coming-soon-body">I'm still putting it together. Feel free to explore the rest of my work in the meantime～</p>
                    <button class="coming-soon-cta" type="button">Keep Exploring</button>
                </div>
            `;
            document.body.appendChild(scrim);

            const close = () => scrim.classList.remove('is-visible');
            scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
            scrim.querySelector('.coming-soon-close').addEventListener('click', close);
            scrim.querySelector('.coming-soon-cta').addEventListener('click', close);
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && scrim.classList.contains('is-visible')) close();
            });
        }

        const open = () => scrim.classList.add('is-visible');
        const cleanups = triggers.map(trigger => {
            const onClick = (e) => { e.preventDefault(); open(); };
            trigger.addEventListener('click', onClick);
            return () => trigger.removeEventListener('click', onClick);
        });

        return function destroy() {
            cleanups.forEach(fn => fn());
        };
    }

    window.initComingSoonModal = initComingSoonModal;
    // overlay.js 的 Escape 处理要跳过"Coming Soon 弹窗开着"这个状态，
    // 靠查这个 class 判断，不用额外维护一份跨文件的状态变量
    window.isComingSoonModalOpen = function () {
        const scrim = document.querySelector('.coming-soon-scrim');
        return !!(scrim && scrim.classList.contains('is-visible'));
    };

    // 这个文件现在同时被 content.html 和 index.html 引入（后者是为了让
    // overlay.js 能调用 window.initContentScrollSpy）。index.html 页面
    // 刚加载时压根没有 .banner-section-title 这个元素——要等浮层打开、
    // 内容注入之后才会有——所以自动初始化要先确认真的在 content.html
    // 这种已经有 banner 的页面上，不然在 index.html 上跑一次全是空的，
    // 没意义还占一份 observer ----
    function start() {
        if (document.querySelector('.banner-section-title')) {
            initContentScrollSpy(document);
        }
        if (document.querySelector('.mini-project-card')) {
            initMiniGridHoverCapsules(document);
        }
        if (document.querySelector('[data-case-study-ready="false"]')) {
            initComingSoonModal(document);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
