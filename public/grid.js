/* ============================================================
   .project-divider 里那条蓝图网格：不再用 CSS repeating-linear-gradient
   （亚像素取整不稳定，之前踩过"底部线画不全/粗细不一致"的坑），改成
   原生 SVG <line> 精确画——坐标照 Figma 导出的源码来（横线 y 值带
   0.25px 偏移，避免落在整数像素上产生模糊；竖线间距 18.58px，是从
   Figma 那份 1672px 参考版反推出来的规律）。

   横线固定 4 行（72÷4=18px 一格）不随宽度变化；竖线按容器实际宽度
   现算现画，页面加载和 resize 时都会重新生成，做到"横排数量随屏幕
   宽度自适应"。

   这个文件同时被 content.html（自己长页面）和 index.html（Work 浮层
   fetch 进来的内容）引入——.project-divider 在两边都可能出现，所以
   单独抽成公共文件，不塞进 content.js 或 fog.js 里，避免两份重复逻辑。
   overlay.js 把 content.html 的 section 克隆塞进浮层之后，会主动调
   window.renderDividerGrids(clone) 补渲染一次，因为那部分 DOM 是浮层
   打开之后才插入的，不在页面首次加载的扫描范围内。
   ============================================================ */
(function () {
    const V_SPACING     = 18.58;   // 竖线间距，照 Figma 源码坐标反推的规律
    const ROW_HEIGHT    = 18;      // 72 ÷ 4
    const ROWS          = 4;
    const CONTENT_HEIGHT = ROWS * ROW_HEIGHT;   // 72，四行格子本身的高度
    const SVG_HEIGHT     = CONTENT_HEIGHT + 1;  // 73，跟 Figma 导出的 viewBox 一致——
                                                  // 最底下那条横线在 y=72.25，比 72 大，
                                                  // viewBox 高度给 72 会把它卡在视口外面
                                                  // 裁掉，这就是"底部少一条线"的真正原因

    function buildGridSVG(width) {
        let lines = '';

        // 横线：固定 4 行等分，y 坐标精确复刻 Figma 的 0.25/18.25/36.25/54.25/72.25
        for (let i = 0; i <= ROWS; i++) {
            const y = i * ROW_HEIGHT + 0.25;
            lines += `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#9EA5AC" stroke-width="0.5"/>`;
        }

        // 竖线：从 0.25 开始，按 18.58px 的间距铺到容器宽度为止。
        // y2 是 72.5（= CONTENT_HEIGHT + 0.5），照抄 Figma 原始坐标——
        // 上一版这里写成了 HEIGHT-0.5=71.5，也是抄错的，顺手一并改对
        for (let x = 0.25; x <= width; x += V_SPACING) {
            lines += `<line x1="${x}" y1="0.5" x2="${x}" y2="${CONTENT_HEIGHT + 0.5}" stroke="#9EA5AC" stroke-width="0.5"/>`;
        }

        return `<svg width="${width}" height="${SVG_HEIGHT}" viewBox="0 0 ${width} ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">${lines}</svg>`;
    }

    function renderInto(el) {
        const width = el.getBoundingClientRect().width;
        if (width <= 0) return;   // 还没在 DOM 里排上版，量不到宽度就先跳过
        el.innerHTML = buildGridSVG(width);
    }

    function renderAll(root) {
        (root || document).querySelectorAll('.project-divider').forEach(renderInto);
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => renderAll(), 100);
    });

    // 给 overlay.js 用：内容是浮层打开后才动态插入的，需要手动喊一次
    window.renderDividerGrids = renderAll;

    function start() { renderAll(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
