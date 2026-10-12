/* ============================================================
   移动端首页(<1024px)交互逻辑：底部导航栏——像素小人进场/退场动效、
   点击跳转到对应 section、滚动时高亮当前 section、点击像素小人回到
   首屏。

   跟桌面端 script.js 是两套独立逻辑，不共用：桌面那套 intro-panel
   展开/收起、3D 翻头像的状态机是针对 #stage 窗户结构写的，移动端
   单栏布局用不上，也不应该依赖同一份 DOM 结构。
   ============================================================ */

(() => {
    const nav = document.querySelector('.mobile-nav');
    const pixel = document.querySelector('.mobile-nav-pixel');
    const workBanner = document.getElementById('work-banner');
    const navLinks = document.querySelectorAll('.mobile-nav-item[data-nav-target]');

    if (!nav || !pixel || !workBanner) return;

    /* ------------------------------------------------------------
       小人跟 WORK 之间的间距不再写死 12px——目标是让它动态匹配
       WORK/SANDBOX/ABOUT 彼此之间由 space-between 算出来的间距，写进
       --nav-gap 这个自定义属性，mobile.css 里
       .mobile-nav.is-pixel-visible 的 column-gap 直接引用这个变量。

       排查结论：一开始按最直接的思路写——直接读 WORK/SANDBOX 两个
       <a> 的 getBoundingClientRect()，用 SANDBOX.left − WORK.right
       当间距——实测发现这个值是错的，而且错得系统性：这么测的时候，
       小人还没出现(display 状态/column-gap 都是初始值 0)，量出来的是
       "没有小人挤占空间"时 .mobile-nav-links 独占整个导航栏宽度算出的
       间距(402px 基准下实测 53.4px)；但等小人真的展开、column-gap 也
       跟着撑开之后，.mobile-nav-links 的可用宽度被小人的宽度+gap 吃掉
       一截，它自己内部的 space-between 会用变小的可用宽度重新计算，
       实际间距缩到只有约 16.7px——两次测的根本不是同一个状态，直接拿
       第一次量到的值当最终目标，结果南辕北辙(53.4 vs 16.7)，是这次
       实现里的一个循环依赖：小人的间距取决于 WORK/SANDBOX 的间距，而
       WORK/SANDBOX 的间距又反过来取决于小人占了多宽——不可能靠"测量
       一次"绕开这个循环。
       解法是不直接测"两个间距之间的距离"这个会变的结果，而是测量
       三个不随小人是否可见而变化的量，反推真正的均衡间距 G：
       - C：导航栏内容区宽度(nav.clientWidth 减左右 padding)
       - P：小人完全展开后的宽度——不能读按钮自己的 width(那个还在从
         0 过渡，是动画中间值)，读它内部 <img> 的宽度，这个是写死的
         最终值，不随按钮动画变化(细节见 mobile.css 里 img 旁边的注释)
       - T：WORK+SANDBOX+ABOUT 三项各自"占用"的宽度之和——不能直接拿
         getBoundingClientRect().width(hitbox 宽度，含 16px×2 的
         padding)相加。.mobile-nav-item 为了扩大点击热区用了
         padding:16px + margin:-16px 抵消(见那条规则旁边的注释)，这个
         负 margin 在 flex 的宽度记账里会把 padding 撑出来的 32px 整
         抵消掉——flex 给每个 item 分配空间时用的是"border-box 宽度 +
         左右 margin"，(text+32) + (-16) + (-16) = text，等于负 margin
         正好把 padding 吃掉的那部分退还回去，item 对 space-between
         "还剩多少空间可分配"这个计算的真实贡献只是纯文字宽度，不含
         那 32px。一开始漏了这一步，直接拿 hitbox 宽度求和，算出来的
         G 系统性偏小了 32px×3÷3=32px(实测 402px 基准下应该是 50.27，
         漏掉 margin 抵消这步算出来的却是 18.27，正好差 32)，这里把
         每项自己的 marginLeft/marginRight 也读出来一起加总，抵消掉
         hitbox 里 padding 撑出来的部分。
       四段间距全部相等这个目标，列出来是一个方程：
       G = (C − P − T − 2G) / 2，整理得 G = (C − P − T) / 3
       ——相当于把小人也当成占了 P 宽的"第四项"，C 减去三项文字总宽 T
       和小人宽度 P，剩下的空间三等分。用这三个不受循环影响的量算出来
       的 G，无论测量时小人是隐藏还是已经展开，结果都一样、都是正确的
       最终目标值，不需要在小人出现前后分别测两次 */
    function updateNavGap() {
        if (navLinks.length < 3) return;
        const pixelImg = pixel.querySelector('img');
        if (!pixelImg) return;
        const navStyle = getComputedStyle(nav);
        const contentWidth = nav.clientWidth - parseFloat(navStyle.paddingLeft) - parseFloat(navStyle.paddingRight);
        const pixelWidth = pixelImg.getBoundingClientRect().width;
        let itemsWidth = 0;
        navLinks.forEach((link) => {
            const linkStyle = getComputedStyle(link);
            itemsWidth += link.getBoundingClientRect().width
                + parseFloat(linkStyle.marginLeft)
                + parseFloat(linkStyle.marginRight);
        });
        const gap = (contentWidth - pixelWidth - itemsWidth) / 3;
        nav.style.setProperty('--nav-gap', gap + 'px');
    }
    updateNavGap();
    let navGapResizeFrame = null;
    window.addEventListener('resize', () => {
        if (navGapResizeFrame) return;
        navGapResizeFrame = window.requestAnimationFrame(() => {
            navGapResizeFrame = null;
            updateNavGap();
        });
    });

    /* ------------------------------------------------------------
       像素小人进场/退场：离开首屏、Selected Work banner 开始进入视口时
       滑入；滚回首屏、banner 离开视口时滑出。

       只看 entry.isIntersecting 不够：一旦用户滚到 Sandbox/About，
       Work banner 本身也已经完全滚出视口上方，isIntersecting 同样是
       false，跟"还在首屏、banner 还没出现"是同一个布尔值，会把小人
       重新变没——用 boundingClientRect.top 区分这两种情况：top<=0
       说明 banner 的顶边已经滚过视口顶部（用户已经离开首屏、滚到
       banner 或更下面），继续显示；只有 top>0 且不相交（banner 完全
       还在视口下方、压根没露头）才是真正应该隐藏的时刻。这个值直接
       从 IntersectionObserver 的 entry 里读，不用另外挂 scroll 监听、
       每帧手动算滚动距离。
       第一版这里错写成了"top < innerHeight"，页面刚加载、还在首屏顶部
       时 banner 的 top 本来就小于视口高度(banner 就在第一屏下面不远)，
       会被误判成"已经离开首屏"，小人从一开始就常驻显示——实测发现后
       改成 top<=0。

       rootMargin 的 -1px 是第二个实测发现的坑：首屏 .hero 是精确的
       100vh，页面刚加载、一像素都没滚动时，banner 的顶边恰好卡在视口
       最下沿，理论上"0 重叠"不该算相交，但实测这个恰好贴边的临界状态
       在 threshold:0 下会被判成 isIntersecting:true(应该是浮点误差让
       实际值比视口高度略小了一丝)，导致小人在完全没滚动之前就先出来
       了。给 root 的下边缘收进 1px，逼着 banner 至少要真正露出（不是
       正好贴边）才算相交，可视觉上感知不到这 1px 的延迟 */
    /* 排查"退场卡顿回弹"结论：之前这里靠 JS 编排 display:none/block 的
       开关时机(配合 force reflow + setTimeout)来避免小人以 0 宽度卡在
       flex 布局里占位——这套机制本身没错，但它制造了一个新问题：
       display 切换没有过渡动画，是瞬间生效的硬切换，而"小人 width:0
       但仍是 flex 子项"和"小人整个不存在(display:none)"这两个状态在
       当时的布局(小人跟 WORK/SANDBOX/ABOUT 共用一个
       justify-content:space-between)下，WORK 的位置并不相同——退场
       动画播完、width 到 0 的那一刻，紧接着 display 切到 none，WORK
       就会跳一下。
       现在 mobile.css 里的结构已经改成小人跟 WORK/SANDBOX/ABOUT 分层
       (见 .mobile-nav / .mobile-nav-links 旁边的注释)，小人 width:0 时
       跟"整个不存在"在数学上完全等价，不再需要 display:none 这个
       开关，也不需要 force reflow / setTimeout 这些编排时机的代码——
       进场和退场现在共用同一套 CSS transition，只是单纯切一个 class，
       没有任何中间步骤。

       reached 变成 false 时(真正回到首屏)顺带清空所有导航项的高亮——
       sectionObserver(下面)只负责"点亮"当前 section，从来不负责"熄灭"
       (设计成这样是为了避免两个 section 之间的过渡地带闪烁全灰，见那
       段注释)，所以高亮状态本来就没有一个"回到首屏就自动清空"的机制。
       这里补上：小人隐藏 = 确定回到首屏 = 导航理应是干净的默认灰色，
       这个判断本来就是 pixelObserver 自己在负责的事，顺手把高亮也一并
       清掉，不用再单独找地方处理。这样不管用户是点像素小人回来的、
       点了 WORK/SANDBOX/ABOUT 又手动划回来的、还是直接用手指划回来的，
       只要真正回到首屏，导航栏都会自我修正成默认状态，不只是点像素
       小人这一条路径特殊处理 */
    const pixelObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const reached = entry.isIntersecting || entry.boundingClientRect.top <= 0;
            pixel.classList.toggle('is-visible', reached);
            nav.classList.toggle('is-pixel-visible', reached);
            if (!reached) {
                navLinks.forEach((link) => link.classList.remove('is-active'));
            }
        });
    }, { threshold: 0, rootMargin: '0px 0px -1px 0px' });
    pixelObserver.observe(workBanner);

    /* ------------------------------------------------------------
       当前 section 高亮：观察三个 banner，谁进入视口顶部附近的判定区
       (rootMargin 把底部 60% 裁掉，只留顶部 40% 算"在视口里")就点亮
       对应的导航文字。不在任何一个进入时不主动清空——避免在两个 banner
       之间的过渡地带出现"全部变灰"的闪烁，最后一次点亮的那个会一直
       保持到下一个 section 接棒 */
    const sectionTargets = [
        { id: 'work-banner', el: workBanner },
        { id: 'sandbox-banner', el: document.getElementById('sandbox-banner') },
        { id: 'about-banner', el: document.getElementById('about-banner') },
    ].filter((s) => s.el);

    function setActiveNav(targetId) {
        navLinks.forEach((link) => {
            link.classList.toggle('is-active', link.dataset.navTarget === targetId);
        });
    }

    const sectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                setActiveNav(entry.target.id);
            }
        });
    }, { rootMargin: '0px 0px -60% 0px', threshold: 0 });
    sectionTargets.forEach((s) => sectionObserver.observe(s.el));

    /* ------------------------------------------------------------
       点击 WORK/SANDBOX/ABOUT：平滑滚动到对应 banner，让它贴齐视口
       顶部。nav 是 fixed 贴底，不会挡住顶部，不需要额外的 scroll-margin
       偏移补偿 */
    navLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            const target = document.getElementById(link.dataset.navTarget);
            if (!target) return;
            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    /* ------------------------------------------------------------
       点击像素小人：回到首屏最顶部。

       排查结论：之前这里只调了 scrollTo，导航栏的显隐/高亮状态完全
       交给 pixelObserver/sectionObserver 在滚动过程中被动检测——这两个
       IntersectionObserver 靠浏览器自己决定"多久检查一次相交状态"，
       不保证每一帧都触发回调，从很远的 section(比如 About)一路平滑
       滚回首屏，滚动距离越长、单次动画时间内浏览器实际派发的相交检查
       次数相对越少，观察到的现象就是"偶尔"没重置成功、复现概率还跟
       出发点远近相关——这些都是 IntersectionObserver 本身"尽力而为、
       不保证每次几何变化都产生一次回调"的正常行为，不是配置错了
       rootMargin/threshold 之类可以调参数修好的 bug。
       点击小人这个动作本身就已经确定性地表达了"回到首屏"的意图，不需
       要依赖滚动途中 observer 是否凑巧完整触发——直接在这里同步强制
       把导航栏重置成首屏默认状态(小人隐藏、所有导航项摘掉高亮)，跟
       observer 的被动检测各自独立：即使这次点击后 observer 因为滚动
       过快没能正常触发，视觉上也已经在点击的同一帧就是正确的了；等
       真的滚动到顶、pixelObserver 再次触发时，重新计算出的状态跟这里
       强制设的状态一致，不会有冲突或者跳变 */
    pixel.addEventListener('click', () => {
        pixel.classList.remove('is-visible');
        nav.classList.remove('is-pixel-visible');
        navLinks.forEach((link) => link.classList.remove('is-active'));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
})();

/* ============================================================
   Coming Soon 弹窗——完全复用桌面端 content.js 的 initComingSoonModal
   同一套文案/结构/触发逻辑(data-case-study-ready="false")，不重新
   设计。桌面端那份要支持"clone 进 overlay 面板后重新初始化"，写成了
   可重入、返回 destroy() 的 initComingSoonModal(root) 函数；
   mobile.html 是单一静态页面，不存在克隆场景，不需要那套收尾机制，
   简化成一次性初始化，逻辑本身(scrim 单例、点关闭/CTA/点遮罩/Esc 都
   能关、click 时 preventDefault)照抄不变 */
(() => {
    const triggers = document.querySelectorAll('[data-case-study-ready="false"]');
    if (!triggers.length) return;

    const scrim = document.createElement('div');
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
    const open = () => scrim.classList.add('is-visible');

    scrim.addEventListener('click', (event) => {
        if (event.target === scrim) close();
    });
    scrim.querySelector('.coming-soon-close').addEventListener('click', close);
    scrim.querySelector('.coming-soon-cta').addEventListener('click', close);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && scrim.classList.contains('is-visible')) close();
    });

    triggers.forEach((trigger) => {
        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            open();
        });
    });
})();


/* Email 图标的点击复制逻辑已提取到 copy-email.js——之前这里是
   script.js 那份的逐字节副本（原注释里也写了"直接照抄桌面端实现"）。
   共用文件自己会找 #emailLink 接线，这里不需要再做任何事。 */
