/* ============================================================
   About 区块：横向 scroll-jacking 画廊。.about-scroll-wrapper 撑出一段
   纵向滚动缓冲区（当前 300px，见 content.css 里 .about-scroll-wrapper
   旁边的注释——不是 250vh，那是这段注释曾经的说法，已经过时），
   .about-sticky 用 position:sticky 钉在视口内；纵向滚过这段缓冲区、且
   sticky 确实钉住了的时候，拦截 wheel 事件，把纵向滚动量/触控板横向
   划动转成 .about-track 的横向位移（4 张卡片）。scrollProgress 到 0 或
   1 时不拦截，让页面正常纵向滚动离开/进入。

   包成 window.initAboutScrollJack(root) 返回 destroy()，是同一套原因：
   content.html 独立访问时页面加载自动跑一次；index.html 的浮层里
   overlay.js 会 fetch 整个 content.html 克隆塞进去，克隆节点不带
   事件监听，得手动重新初始化一次；每次重新打开浮层要先把上一次的
   监听器/state 清干净。

   移动端（≤768px）整个不挂这套逻辑——content.css 里同一个断点已经把
   .about-track 改成纵向堆叠、.about-progress-bar 隐藏了，JS 这边就不用
   再算 wheel/拖拽这些手势，省得空跑或者跟触屏原生滚动打架。
   ============================================================ */
(function () {
    const MOBILE_QUERY = '(max-width: 768px)';

    // 找最近的、实际滚动的祖先容器——独立页面上是 window/document 自己
    // 在滚（返回 null），浮层里是 #overlayBody（overflow-y:auto）。
    // sticky 元素"钉住"判断依赖这个，不能简单假设 0 就是顶——浮层面板
    // 本身离视口顶部还有一小段偏移（.content-overlay-panel 的 top），
    // #overlayBody 的滚动起点不等于浏览器视口的 y=0
    function getScrollParent(el) {
        let node = el.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            const overflowY = getComputedStyle(node).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') return node;
            node = node.parentElement;
        }
        return null;
    }

    function initAboutScrollJack(root, options) {
        root = root || document;
        options = options || {};

        if (window.matchMedia(MOBILE_QUERY).matches) {
            return function destroy() {};
        }

        const wrapper = root.querySelector('.about-scroll-wrapper');
        const sticky = root.querySelector('.about-sticky');
        const track = root.querySelector('.about-track');
        const progressTrack = root.querySelector('.progress-bar-track');
        const progressFill = root.querySelector('.progress-fill');
        const pixelChar = root.querySelector('.pixel-character');

        if (!wrapper || !sticky || !track) return function destroy() {};

        const scrollParent = getScrollParent(sticky);

        // 默认每次进入 About（点击进来打开浮层，或者独立页面刚加载）进度条
        // 都从真正的 0 开始，不带任何初始偏移。
        // 排查结论（About 横向滚动完全失灵排查，场景B：直接点导航进入）：
        // 之前 overlay.js 对 'about' 入口的处理是把 body.scrollTop 硬跳到
        // 整个可滚动区域的最末端——这个位置在 .about-scroll-wrapper 的
        // sticky 缓冲区之外（sticky 早就松开了），isPinned() 从一开始就是
        // false，wheel 事件从来没被接管过，横向画廊等于没启动。现在
        // overlay.js 改成把 scrollTop 精确定位到缓冲区正中间（真正钉住的
        // 位置），同时通过这个 options.initialProgress 参数告诉这里"直接
        // 从最后一张卡片开始"，视觉效果跟以前"停在最末尾"一致，但这次是
        // 真的钉住、能响应 wheel 的末尾，不是滚过头之后的死状态
        const INITIAL_PROGRESS = 0;

        let scrollProgress = typeof options.initialProgress === 'number'
            ? Math.min(1, Math.max(0, options.initialProgress))
            : INITIAL_PROGRESS;
        let maxTranslate = 0;

        // track.scrollWidth 不包含最后一张卡片的 trailing margin-right——
        // overflow:visible 的容器算 scrollWidth 时只看内容本身的
        // border-box+padding 范围，不算"没有内容、纯粹用来空出收尾留白"
        // 的那段 margin。之前一直拿 scrollWidth 算 maxTranslate，实测
        // 滚到 100% 时最后一张卡片右边基本贴死视口边缘，卡片4特意留的
        // margin-right（收尾留白）整个消失，不是 CSS 写错了，是这个换算
        // 方式漏掉了它——改成直接量最后一张卡片自己的右边缘（含 margin）
        function recalcMaxTranslate() {
            const lastCard = track.lastElementChild;
            if (!lastCard) {
                maxTranslate = Math.max(0, track.scrollWidth - sticky.offsetWidth);
                return;
            }
            const lastCardMarginRight = parseFloat(getComputedStyle(lastCard).marginRight) || 0;
            const trackPaddingRight = parseFloat(getComputedStyle(track).paddingRight) || 0;
            const contentEnd = lastCard.offsetLeft + lastCard.offsetWidth + lastCardMarginRight + trackPaddingRight;
            maxTranslate = Math.max(0, contentEnd - sticky.offsetWidth);
        }
        recalcMaxTranslate();

        // 像素小人的 left 用"中心点坐标"来定（配合 CSS 里的
        // transform:translate(-50%,-50%)），但中心点不能跟着 scrollProgress
        // 线性跑满 0%~100% 的整个宽度——0%/100% 时中心点会卡在进度条的
        // 最左/最右端，小人自身还有半个身位宽度会探出进度条，被
        // .about-sticky 的 overflow:hidden 裁掉一半。给中心点的可移动
        // 范围掐头去尾，各留半个小人宽度，小人在两端正好完整露出、贴边
        // 但不被裁 */
        const PIXEL_CHAR_WIDTH = 33;

        function updateVisuals() {
            track.style.transform = 'translateX(' + (-scrollProgress * maxTranslate) + 'px)';
            if (progressFill) progressFill.style.width = (scrollProgress * 100) + '%';
            if (pixelChar && progressTrack) {
                const barWidth = progressTrack.offsetWidth;
                const half = PIXEL_CHAR_WIDTH / 2;
                const minLeft = half;
                const maxLeft = barWidth - half;
                const actualLeft = minLeft + scrollProgress * (maxLeft - minLeft);
                pixelChar.style.left = actualLeft + 'px';
            }
        }
        updateVisuals();

        // sticky 元素被钉住时，它自己的 getBoundingClientRect().top 应该
        // 正好落在"滚动容器自己的 top"这条线上（容差 1px，兼容亚像素舍入）
        function isPinned() {
            const rect = sticky.getBoundingClientRect();
            const containerTop = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
            return Math.abs(rect.top - containerTop) < 1;
        }

        const WHEEL_TO_PROGRESS = 0.0012;   // 手感系数，具体数值靠调，先给个起点
        const MAX_STEP = 0.12;              // 单次 wheel 事件最多推进的进度量——触控板
                                             // 惯性滚动(momentum)会连续密集触发一串很大
                                             // 的 deltaY，不 clamp 的话会感觉"猛地跳一下"

        function onWheel(e) {
            if (!isPinned()) return;

            const rawDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
            if (rawDelta === 0) return;

            const goingForward = rawDelta > 0;
            const goingBackward = rawDelta < 0;
            const needsCapture =
                (scrollProgress > 0 && scrollProgress < 1) ||
                (goingForward && scrollProgress < 1) ||
                (goingBackward && scrollProgress > 0);

            if (!needsCapture) return;   // 已经在边界、还往边界外滚——放行，让页面正常纵向滚动

            e.preventDefault();

            const clampedDelta = Math.max(-MAX_STEP, Math.min(MAX_STEP, rawDelta * WHEEL_TO_PROGRESS));
            scrollProgress = Math.min(1, Math.max(0, scrollProgress + clampedDelta));
            updateVisuals();
        }
        wrapper.addEventListener('wheel', onWheel, { passive: false });

        // ---- 进度条点击跳转 ----
        function jumpToProgress(clientX) {
            if (!progressTrack) return;
            const rect = progressTrack.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            scrollProgress = ratio;
            updateVisuals();
        }
        function onProgressClick(e) { jumpToProgress(e.clientX); }
        if (progressTrack) progressTrack.addEventListener('click', onProgressClick);

        // ---- 像素小人拖拽 ----
        let isDragging = false;
        function onPointerDown(e) {
            isDragging = true;
            if (pixelChar.setPointerCapture) {
                try { pixelChar.setPointerCapture(e.pointerId); } catch (err) { /* Safari 老版本可能不支持，忽略 */ }
            }
        }
        function onPointerMove(e) {
            if (!isDragging) return;
            jumpToProgress(e.clientX);
        }
        function onPointerUp() { isDragging = false; }

        if (pixelChar) {
            pixelChar.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            // pointercancel：浏览器/系统中途判定"这个指针不会再产生事件了"
            // 时触发的（比如拖拽过程中 Cmd+Tab 切走窗口、触控板手势被系统
            // 重新解释），不一定会伴随 pointerup。onPointerUp 只处理了
            // pointerup 这一种收尾方式，isDragging 会永久卡在 true，之后
            // 整个页面任何一次 mousemove 都会被当成"正在拖进度条"处理，
            // 表现出来就是滚轮/触控板/拖拽全部失灵——复用同一个 onPointerUp
            // （逻辑就是 isDragging=false，两种收尾方式要做的事完全一样）
            window.addEventListener('pointercancel', onPointerUp);
        }

        // 容器尺寸变化（窗口 resize、浮层开关）要重新算 maxTranslate，不然
        // progress=1 时的横向位移量还是按旧宽度算的，会跟实际内容错位
        function onResize() {
            recalcMaxTranslate();
            updateVisuals();
        }
        window.addEventListener('resize', onResize);

        return function destroy() {
            wrapper.removeEventListener('wheel', onWheel);
            if (progressTrack) progressTrack.removeEventListener('click', onProgressClick);
            if (pixelChar) pixelChar.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            window.removeEventListener('resize', onResize);
        };
    }

    window.initAboutScrollJack = initAboutScrollJack;

    function start() {
        if (document.querySelector('.about-scroll-wrapper')) {
            initAboutScrollJack(document);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
