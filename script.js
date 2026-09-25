/* ============================================================
   intro-panel 交互：body.intro 是唯一的状态开关。

   墙体（.intro-panel）的"消失/出现"不是靠 opacity 过渡，而是直接切
   visibility：
     收起时——等宽度 transition 真正结束（transitionend, propertyName
       === 'width'）才把 visibility 设成 hidden，不用硬编的 CSS delay，
       这样就算以后调时长也不会跟视觉对不上。
     展开时——用一个 setTimeout，在墙体开始长宽之前（EXPAND_WALL_DELAY_MS，
       要跟 style.css 里 --revWall-delay 对齐）把 visibility 设回 visible。

   头像的翻转（3D rotateY）、文字、像素头像、图标、作品图的出场/退场
   顺序全部是 CSS transition-delay 做的，这里不参与编排，只负责：
     1. 切 body.intro
     2. 管墙体的 visibility
     3. 动画期间锁住触发器，防止连点把状态搞乱
   ============================================================ */
(function () {
    const body           = document.body;
    const introPanel     = document.querySelector('.intro-panel');
    const avatar         = document.getElementById('pixelAvatar');   // mid_panel 里那个真实存在的像素头像
    const cta            = document.querySelector('.enter-wall-btn');   /* 原来叫 .cta，按钮改版后类名换成了 .enter-wall-btn */
    const floatingAvatar = document.querySelector('.avatar');   // 展开态露出正面 selfie 的那个浮层头像

    if (!introPanel || !avatar) return;

    const ANIMATION_MS          = 1800;   // 覆盖最长的一条链路（两个方向现在都是 1.65s，留点余量）
    const EXPAND_WALL_DELAY_MS  = 300;    // 跟 style.css 的 --revWall-delay 对齐

    let animating = false;
    let unlockTimer = null;
    let showWallTimer = null;

    function isExpanded() { return body.classList.contains('intro'); }

    function lock() {
        animating = true;
        body.classList.add('animating');
        clearTimeout(unlockTimer);
        unlockTimer = setTimeout(() => {
            animating = false;
            body.classList.remove('animating');
        }, ANIMATION_MS);
    }

    // 这个监听器在收起和展开时都会因为 width 动完而触发一次，
    // 只有"这一次完成的是收起"（body 已经没有 .intro 了）才需要隐藏墙体——
    // 展开方向的 width 动完，墙体应该继续留在 visible
    function onWallWidthDone(e) {
        if (e.target !== introPanel || e.propertyName !== 'width') return;
        if (isExpanded()) return;
        introPanel.style.visibility = 'hidden';
    }
    introPanel.addEventListener('transitionend', onWallWidthDone);

    function expand() {
        if (animating || isExpanded()) return;
        lock();

        clearTimeout(showWallTimer);
        showWallTimer = setTimeout(() => {
            introPanel.style.visibility = 'visible';
        }, EXPAND_WALL_DELAY_MS);

        body.classList.add('intro');
        avatar.setAttribute('aria-expanded', 'true');
    }

    function collapse() {
        if (animating || !isExpanded()) return;
        lock();
        clearTimeout(showWallTimer);   // 万一收起前刚好排了一个"恢复可见"的计时器，取消掉
        body.classList.remove('intro');
        avatar.setAttribute('aria-expanded', 'false');
    }

    // 点像素头像：只有收起态才响应（展开态它被 .intro-panel 盖住，点不到）
    avatar.addEventListener('click', () => {
        if (!isExpanded()) expand();
    });
    avatar.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isExpanded()) {
            e.preventDefault();
            expand();
        }
    });

    // 点 CTA：收起
    if (cta) cta.addEventListener('click', collapse);

    // 点浮层头像（展开态露出的 selfie）：收起，跟点 CTA 等效。
    // 收起态时这个元素 pointer-events:none（见 style.css），点击事件
    // 根本到不了这里，不需要额外判断 isExpanded()，collapse() 自己
    // 内部也有 !isExpanded() 的兜底
    if (floatingAvatar) {
        floatingAvatar.addEventListener('click', collapse);
        floatingAvatar.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                collapse();
            }
        });
    }

    // ESC：收起
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isExpanded()) collapse();
    });

    // 点面板外部：收起
    document.addEventListener('click', (e) => {
        if (!isExpanded()) return;
        if (!introPanel.contains(e.target)) collapse();
    });
})();


/* ============================================================
   调试读数（#hud 目前被注释掉了，元素不存在时直接跳过）
   ============================================================ */
(function () {
    const hud = document.getElementById('hud');
    if (!hud) return;

    function update() {
        const frame = document.querySelector('.project-frame');
        const img   = document.querySelector('.project-image');
        if (!frame || !img) return;

        const f = frame.getBoundingClientRect();
        const i = img.getBoundingClientRect();

        const frameRatio = (f.width / f.height).toFixed(3);
        const imgRatio   = i.height ? (i.width / i.height).toFixed(3) : '—';

        hud.innerHTML =
            `视口 <b>${innerWidth}×${innerHeight}</b>　比例 <b>${(innerWidth/innerHeight).toFixed(3)}</b>` +
            `<span class="g">（基准 1.777）</span><br>` +
            `<span class="g">格子</span> ${Math.round(f.width)}×${Math.round(f.height)}　` +
            `比例 <b>${frameRatio}</b> <span class="g">跟着视口变</span><br>` +
            `<span class="g">图片</span> ${Math.round(i.width)}×${Math.round(i.height)}　` +
            `比例 <b class="ok">${imgRatio}</b> <span class="g">应恒定不变</span>`;
    }

    addEventListener('resize', update);
    addEventListener('load', update);
    update();
})();


/* ============================================================
   社交图标 hover 胶囊：量每个链接里 .text-content 的实际渲染宽度
   （含左右 padding），写成行内 --hover-width，供 style.css 里
   .social-link:hover { width: var(--hover-width) } 使用。
   .text-content 本身是 opacity:0 但仍在正常布局里（position absolute
   + left:50%/transform 居中，没有 inset:0 撑满），所以 offsetWidth
   量出来的就是文字实际需要的宽度，不用等 hover 触发才算。
   .text-content 的字号/padding 现在跟 --icon-size 一起用 vw 缩放
   （见 style.css），viewport 宽度一变这两个值就变，量出来的宽度也
   跟着过期——文字宽度本身是字体度量决定的，没法用 calc() 纯几何算，
   只能重新量，所以这里加了 resize 监听，不能再只在页面加载时量一次 */
(function () {
    const links = document.querySelectorAll('.social-link');
    function measure() {
        links.forEach((link) => {
            const text = link.querySelector('.text-content');
            if (!text) return;
            link.style.setProperty('--hover-width', text.offsetWidth + 'px');
        });
    }
    measure();
    addEventListener('resize', measure);
})();


/* ============================================================
   像素头像 hover 胶囊：鼠标移到头像上，跟着鼠标出现一个提示胶囊，
   跟 Sandbox 那套"View Project"胶囊是同一个视觉模式——直接复用
   content.css 里的 .hover-capsule 样式（index.html 本来就同时加载
   了 content.css）。不复用 content.js 的 initMiniGridHoverCapsules()，
   那个函数是为"卡片会被克隆进浮层、每次开关浮层都要重新创建/销毁"
   这个场景写的；头像是页面里唯一固定存在的元素，没有这层生命周期，
   直接绑一份更简单。
   展开态（body.intro）头像被 .intro-panel 盖住，鼠标根本碰不到它，
   不用额外判断状态去关闭胶囊。
   ============================================================ */
(function () {
    const avatar = document.getElementById('pixelAvatar');
    if (!avatar) return;

    const capsule = document.createElement('div');
    capsule.className = 'hover-capsule hover-capsule--avatar';
    capsule.textContent = 'you can always go back...';
    document.body.appendChild(capsule);

    avatar.addEventListener('mouseenter', () => { capsule.style.opacity = '1'; });
    avatar.addEventListener('mouseleave', () => { capsule.style.opacity = '0'; });
    avatar.addEventListener('mousemove', (e) => {
        capsule.style.left = (e.clientX + 16) + 'px';
        capsule.style.top = (e.clientY + 16) + 'px';
    });
})();

/* Email 图标的点击复制逻辑已提取到 copy-email.js（全站共用一份，
   移动端 mobile.js 之前是逐字节照抄的第二份）。那个文件自己会找
   #emailLink 接线，这里不需要再做任何事。 */
