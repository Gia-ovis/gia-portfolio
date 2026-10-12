/* ============================================================
   GA4 接入 + 统一上报函数。四个页面（index.html/content.html/
   mobile.html/drayeasy.html）各自只需要一行 <script src="analytics.js">，
   gtag.js 的加载/初始化、window.trackEvent() 包装函数、简历链接点击
   埋点全部在这一个文件里，不把 GA 相关代码散落在各个 HTML 的 <head> 里。

   本地环境（localhost / 127.0.0.1）整个跳过 gtag.js 的加载和
   gtag('config', ...) 调用——不是只挡自定义事件：GA4 的 config 调用
   本身会自动发一次 page_view，只挡 trackEvent() 挡不住这一下，必须连
   基础 bootstrap 都跳过，才能真正做到本地测试不污染线上数据。

   容错：其他脚本（overlay.js/case-overlay.js 等）只应该调用
   window.trackEvent()，不直接碰 gtag。GA 被浏览器拦截、gtag.js 加载
   失败、甚至这个文件本身没加载成功，调用方都不应该因此报错或中断页面
   逻辑——各调用点自己也要判断 window.trackEvent 是否存在（见
   overlay.js/case-overlay.js 里的用法），这里只保证"存在就调用一定
   安全"。
   ============================================================ */
(function () {
    const GA_ID = 'G-E0R93HND7S';
    const isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

    if (isLocal) {
        window.trackEvent = function () {};   // 本地环境：调用方完全不用关心，安静地什么都不做
    } else {
        try {
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

            const script = document.createElement('script');
            script.async = true;
            script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
            document.head.appendChild(script);

            window.gtag('js', new Date());
            window.gtag('config', GA_ID);
        } catch (err) {
            // bootstrap 出问题也不影响下面 trackEvent 的定义——它自己
            // 调用时会再判断一次 gtag 是否可用
        }

        window.trackEvent = function (eventName, params) {
            try {
                if (typeof window.gtag !== 'function') return;
                window.gtag('event', eventName, params || {});
            } catch (err) {
                /* 上报失败不能影响页面逻辑，安静地丢弃 */
            }
        };
    }

    // 简历点击——两个宿主页面（index.html/mobile.html）各有一个 Resume
    // 链接，都带 aria-label="Resume"，全站唯一用这个 aria-label 的地方，
    // 用事件委托匹配，不需要改 index.html/mobile.html 的任何标签
    document.addEventListener('click', function (e) {
        const resumeLink = e.target.closest('a[aria-label="Resume"]');
        if (!resumeLink) return;
        if (window.trackEvent) window.trackEvent('click_resume', {});
    });
})();
