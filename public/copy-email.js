/* ============================================================
   邮箱复制 —— 全站共用的一份实现。

   在这之前同样的逻辑有三份：script.js（桌面首页）、mobile.js（移动端
   首屏，注释里明写了"直接照抄桌面端实现"），加上要新增的 contact-dock.js。
   三份逐字节相同的代码意味着以后改降级路径要记得改三个地方——所以在
   接入 dock 之前先提取，而不是再加第四份。

   为什么不是真的打开邮件客户端：很多人电脑没配 Mail app，mailto: 点了
   没反应；复制地址体验更可靠。href 上的 mailto: 保留当兜底（右键"复制
   链接地址"、JS 出错时的降级、屏幕阅读器识别这是个邮箱链接）。

   navigator.clipboard 需要"安全上下文"（HTTPS 或 localhost/127.0.0.1
   这类回环地址）。用 file:// 直接打开时它不存在，这时候退化成
   window.prompt 让用户自己手动复制——不静默失败是硬要求。
   ============================================================ */
(function () {

    /* 复制邮箱。resolve 成 true 表示真的进了剪贴板，false 表示走了
       prompt 降级——调用方据此决定要不要显示"已复制"反馈，因为降级
       路径下用户是自己手动复制的，再弹一个"Copied!"是撒谎。 */
    window.copyEmail = async function (email) {
        try {
            await navigator.clipboard.writeText(email);
            return true;
        } catch (err) {
            window.prompt('Copy this email:', email);
            return false;
        }
    };

    /* 角落 toast —— 首页/移动端那两个邮箱图标用的反馈方式。
       contact-dock.js 不用这个：dock 的反馈落在按钮本体上（见
       DECISIONS.md 里否掉 toast 的那一条）。 */
    window.showCopyToast = function (message) {
        const toast = document.createElement('div');
        toast.className = 'copy-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        toast.addEventListener('animationend', () => toast.remove());
    };

    /* #emailLink 自动接线：index.html 和 mobile.html 各有一个，
       content.html 没有，这里取不到就什么都不做。 */
    const emailLink = document.getElementById('emailLink');
    if (!emailLink) return;

    emailLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = emailLink.href.replace(/^mailto:/, '');
        if (await window.copyEmail(email)) window.showCopyToast('Email copied!');
    });

})();
