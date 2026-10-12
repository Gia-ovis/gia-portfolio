/* ============================================================
   常驻 contact dock —— 让快速扫作品集的人在任意一屏、不离开当前位置、
   不做任何选择就把邮箱拿走。

   决策记录（为什么是 Recede、被否掉了哪些方案、每个数值的来历）见
   DECISIONS.md「2026-09-25 · 常驻 contact dock」。

   自成一体，和 case-overlay.js 一样：自己建 DOM、自己 <link> 自己的
   CSS、挂在 document.body 下，不改 overlay.js / case-overlay.js /
   content.js 的任何逻辑。要拿掉这个功能，删这两个文件加两个 <script>
   标签即可。

   出现时机不是四种行为，是一个开关——第 3、4 层在，其余不在。
   这个开关完全由 CSS 读 body class 完成（overlay.js 已有的
   .overlay-open / case-overlay.js 已有的 .case-overlay-open），
   这里不订阅任何浮层事件，也不需要给 fog.js 加雾散开的信号。
   ============================================================ */
(function () {

    const EMAIL    = 'yajiawang@outlook.com';
    const RESUME   = 'https://drive.google.com/file/d/1mZ0AwV6WGktWj8Gu-W5623a-AgKLKUeA/view?usp=share_link';
    const LINKEDIN = 'https://www.linkedin.com/in/yajia-wang-88b97326a';

    const RESTORE_DELAY = 450;    /* 停止滚动多久后回到常驻态 */
    const COPIED_HOLD   = 2500;   /* ✓ Copied 停留多久 */

    /* 站点自己的图标字形（assets/images/icons/），去掉外面那圈 circle
       ——那圈是给首页那排独立图标设计的，塞进胶囊里就是壳里套壳。
       描边/填充改成 currentColor，颜色跟着 CSS 走。 */
    const ICON_LINKEDIN = '<svg viewBox="13 11 24 26" fill="none" aria-hidden="true">'
        + '<path fill-rule="evenodd" clip-rule="evenodd" d="M17.9957 16.0484C18.44 15.5904 18.6863 14.976 18.6813 14.338C18.6582 13.719 18.3995 13.1323 17.9581 12.6977C17.5168 12.2631 16.9261 12.0135 16.3068 12C15.6858 12.0133 15.093 12.2622 14.6487 12.6964C14.2043 13.1305 13.9417 13.7174 13.9141 14.338C13.923 14.9749 14.1763 15.5841 14.6216 16.0396C15.0669 16.4951 15.6702 16.7622 16.3068 16.7855C16.9447 16.7711 17.5514 16.5064 17.9957 16.0484ZM15.8622 19.9389C14.8567 19.9161 14.1698 19.9005 14.1698 21.1327V34.8317C14.1698 36.0384 14.8248 36.0134 15.7688 35.9775C15.9394 35.971 16.1195 35.9642 16.3068 35.9642C16.4945 35.9642 16.6744 35.971 16.8446 35.9775C17.7841 36.0134 18.4256 36.0379 18.4256 34.8317V21.1327C18.4256 19.9008 17.753 19.9161 16.7514 19.9388C16.6095 19.9421 16.461 19.9454 16.3068 19.9454C16.1529 19.9454 16.0044 19.9421 15.8622 19.9389ZM22.8641 19.9637C22.4074 20.0551 22.1152 20.3473 22.1152 21.1327V34.8317C22.1152 36.0372 22.7429 36.0135 23.6886 35.9775C23.8605 35.971 24.0429 35.9642 24.234 35.9642C24.4247 35.9642 24.6072 35.971 24.7796 35.9775C25.7298 36.0135 26.371 36.0377 26.371 34.8317V27.5256C26.3347 27.1522 26.3781 26.7754 26.4983 26.4201C26.6185 26.0648 26.8129 25.7391 27.0684 25.4645C27.324 25.19 27.635 24.9728 27.9808 24.8275C28.3266 24.6821 28.6993 24.6119 29.0743 24.6214C29.451 24.5991 29.8282 24.6581 30.1801 24.7944C30.5321 24.9307 30.8504 25.1412 31.1139 25.4115C31.3772 25.6818 31.5793 26.0056 31.7065 26.3609C31.8335 26.7162 31.8827 27.0948 31.8507 27.4708V34.7769C31.8507 35.9825 32.4785 35.9587 33.4241 35.9229C33.596 35.9163 33.7784 35.9093 33.9694 35.9093C34.1605 35.9093 34.3429 35.9163 34.5149 35.9229C35.4605 35.9587 36.0882 35.9825 36.0882 34.7769V25.4251C36.123 24.6572 35.9958 23.8907 35.7149 23.1752C35.4341 22.4597 35.0058 21.8113 34.4581 21.2722C33.9102 20.733 33.2552 20.3151 32.5354 20.0456C31.8155 19.7761 31.047 19.6611 30.2799 19.708C29.4985 19.637 28.7121 19.7676 27.9958 20.0874C27.2794 20.4072 26.6571 20.9055 26.1884 21.5345C26.2066 20.8587 25.9874 19.9637 25.4395 19.9637C25.2824 19.9637 25.0411 19.9562 24.7662 19.9477C24.0823 19.9264 23.1898 19.8986 22.8641 19.9637Z" fill="currentColor"/>'
        + '</svg>';

    const ICON_RESUME = '<svg viewBox="11 10 28 31" fill="none" aria-hidden="true">'
        + '<path d="M37 36.9231C37 37.4739 36.77 38.0022 36.3609 38.3917C35.9519 38.7811 35.3968 39 34.8182 39H15.1818C14.6032 39 14.0482 38.7811 13.639 38.3917C13.2299 38.0022 13 37.4739 13 36.9231V14.0769C13 13.5261 13.2299 12.9978 13.639 12.6083C14.0482 12.2188 14.6032 12 15.1818 12H29.3636L37 19.2692V36.9231Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
        + '<path d="M23 24.25C23 23.6533 22.7366 23.081 22.2678 22.659C21.7989 22.2371 21.163 22 20.5 22C19.837 22 19.2011 22.2371 18.7322 22.659C18.2634 23.081 18 23.6533 18 24.25V28.75C18 29.3467 18.2634 29.919 18.7322 30.341C19.2011 30.7629 19.837 31 20.5 31C21.163 31 21.7989 30.7629 22.2678 30.341C22.7366 29.919 23 29.3467 23 28.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '<path d="M26 22L28.5 31L31 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
        + '</svg>';

    /* ---------- 自己的 CSS ---------- */
    if (!document.querySelector('link[href="contact-dock.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'contact-dock.css';
        document.head.appendChild(link);
    }

    /* ---------- 建 DOM ----------
       宿主判定和 case-overlay.js 用的是同一个依据：#overlayBody 存在
       说明当前在 index.html（内容是被 clone 进第一层浮层的），不存在
       说明是直接打开的 content.html，那这个页面本身就是第 3 层，常驻。 */
    const anchor = document.createElement('div');
    anchor.className = 'contact-dock-anchor';
    if (!document.getElementById('overlayBody')) anchor.dataset.host = 'standalone';

    anchor.innerHTML = ''
        + '<div class="contact-dock">'
        +   '<button class="contact-dock-email" type="button" aria-label="Copy email address ' + EMAIL + '">'
        +     '<span class="contact-dock-stack">'
        +       '<span class="contact-dock-text">' + EMAIL + '</span>'
        +       '<span class="contact-dock-done" aria-hidden="true">✓ Copied</span>'
        +     '</span>'
        +   '</button>'
        +   '<span class="contact-dock-sep" aria-hidden="true"></span>'
        +   '<a class="contact-dock-icon" data-icon="linkedin" href="' + LINKEDIN + '" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">' + ICON_LINKEDIN + '</a>'
        +   '<a class="contact-dock-icon" data-icon="resume" href="' + RESUME + '" target="_blank" rel="noopener noreferrer" aria-label="Resume">' + ICON_RESUME + '</a>'
        + '</div>';

    /* 复制结果播报给屏幕阅读器——✓ Copied 是纯视觉的（aria-hidden），
       不播报的话这个动作对读屏用户完全没有反馈 */
    const live = document.createElement('span');
    live.setAttribute('aria-live', 'polite');
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;'
        + 'clip:rect(0 0 0 0);white-space:nowrap;';

    document.body.appendChild(anchor);
    document.body.appendChild(live);

    const emailBtn = anchor.querySelector('.contact-dock-email');

    /* ---------- 点击复制 ---------- */
    let copiedTimer = null;

    emailBtn.addEventListener('click', async () => {
        /* 走 prompt 降级时返回 false——那种情况下是用户自己手动复制的，
           再显示一次"✓ Copied"是撒谎 */
        if (!(await window.copyEmail(EMAIL))) return;

        emailBtn.setAttribute('data-copied', '');
        live.textContent = 'Email copied';
        if (window.trackEvent) window.trackEvent('copy_email', { source: 'dock' });

        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => {
            emailBtn.removeAttribute('data-copied');
            live.textContent = '';
        }, COPIED_HOLD);
    });

    /* ---------- 滚动后退 ----------
       滚动容器在三种情况下不是同一个元素：index.html 第一层浮层是
       #overlayBody，第二层是 .case-overlay-body，直接打开 content.html
       是 window。scroll 事件不冒泡，但可以在 document 上用捕获阶段
       收到任意后代元素的滚动——一个监听器覆盖全部三种，不用判断当前
       是哪一层，也不用在浮层开关时重新绑定。 */
    let scrollTimer = null;
    let ticking = false;

    document.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            anchor.setAttribute('data-scrolling', '');
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => anchor.removeAttribute('data-scrolling'), RESTORE_DELAY);
        });
    }, { passive: true, capture: true });

})();
