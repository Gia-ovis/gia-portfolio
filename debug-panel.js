/* ============================================================
   雾气擦除效果 + 窗户滤镜 · 实时调参面板——完全独立的一个文件。

   面板控制两套完全不相关的东西，读写方式不一样：
     1. 水珠/擦除相关（FOG_CONFIG）：fog.js 暴露在 window 上的一个对象，
        canvas 每一帧自己现读这个对象里的值，本文件只管改值，不用管
        怎么应用——那是 fog.js 自己的事。
        window.FOG_CONFIG          所有可调参数
        window.__fogHardResetAll   "重新起雾"按钮要用，一次性重置六块画布
     2. 窗户滤镜（WINDOW_FILTER_CFG）：.bg-layer / .glass-layer 这两层
        纯 CSS filter/backdrop-filter，跟 fog.js 完全没关系（那是背景
        插画 + 玻璃反光贴图的静态滤镜，不是 canvas 画的），也没有别的
        地方在维护一份"现读"的循环——本文件自己存一份配置，每次滑块
        改动直接手动拼 filter 字符串写回这两个元素的 style，没有中间层。

   删除这个功能：把 index.html 里 <script src="debug-panel.js"></script>
   那一行删掉（或者直接删这个文件）就行。fog.js 不依赖这个文件存在；
   .bg-layer/.glass-layer 的滤镜没被这个文件碰过之前，用的就是
   style.css 里写死的那份，删掉这个文件之后也是一样，不会变成没有滤镜。

   触发方式：按 D 键显示/隐藏（面板一直存在于 DOM 里，默认 display:none，
   不是每次按键现造现拆）。
   ============================================================ */
(function () {
    function init() {
        if (!window.FOG_CONFIG) return;   // fog.js 没跑起来（比如这个页面根本没有雾气窗户），面板没有意义

        const CFG = window.FOG_CONFIG;
        const FOG_DEFAULTS = Object.assign({}, CFG);

        // 这几个数值抄的是 style.css 里 .bg-layer/.glass-layer 当前写死的
        // filter/backdrop-filter 基准值——两边要保持一致，改了 CSS 里的
        // 基准记得回来同步这里，不然"重置为默认值"复原的就不是真的默认值了
        const bgLayer = document.querySelector('.bg-layer');
        const glassLayer = document.querySelector('.glass-layer');
        const WINDOW_FILTER_CFG = {
            bgContrast: 1.2,
            bgBrightness: 0.9,
            bgSaturate: 1.2,
            bgBlur: 1.0,
            glassSaturate: 1.1,
            glassBrightness: 1.05,
            glassBackdropBlur: 1,
            glassBackdropSaturate: 1.1,
        };
        const WINDOW_FILTER_DEFAULTS = Object.assign({}, WINDOW_FILTER_CFG);

        function applyWindowFilters() {
            const c = WINDOW_FILTER_CFG;
            if (bgLayer) {
                bgLayer.style.filter = `contrast(${c.bgContrast}) brightness(${c.bgBrightness}) saturate(${c.bgSaturate}) blur(${c.bgBlur}px)`;
            }
            if (glassLayer) {
                glassLayer.style.filter = `saturate(${c.glassSaturate}) brightness(${c.glassBrightness})`;
                const backdrop = `blur(${c.glassBackdropBlur}px) saturate(${c.glassBackdropSaturate})`;
                glassLayer.style.backdropFilter = backdrop;
                glassLayer.style.webkitBackdropFilter = backdrop;
            }
        }

        const GROUPS = [
            {
                title: '擦除本体', target: CFG,
                fields: [
                    { id: 'holeAlpha',     label: 'hole alpha（擦除透明度）', min: 0,   max: 1,   step: 0.01 },
                    { id: 'edgeBlur',      label: 'edge blur（擦除边缘模糊 px）', min: 0, max: 8,  step: 0.5 },
                    { id: 'wipeR',         label: '擦除半径 / 笔刷大小', min: 5,   max: 120, step: 1 },
                    { id: 'refogInterval', label: 'refog interval（回雾间隔 ms）', min: 20, max: 500, step: 10 },
                    { id: 'refogAlpha',    label: 'refog alpha（每次回雾叠加的浓度）', min: 0, max: 0.05, step: 0.001 },
                ],
            },
            {
                title: '水珠生长物理', target: CFG,
                fields: [
                    { id: 'dropSpeedMin', label: '下落速度 - 下限', min: 1,  max: 100, step: 1 },
                    { id: 'dropSpeedMax', label: '下落速度 - 上限', min: 1,  max: 150, step: 1 },
                    { id: 'dropLenMin',   label: '目标长度 - 下限', min: 4,  max: 100, step: 1 },
                    { id: 'dropLenMax',   label: '目标长度 - 上限', min: 10, max: 200, step: 1 },
                    { id: 'dropWobble',   label: '摆动幅度 wobble', min: 0,  max: 2,   step: 0.05 },
                ],
            },
            {
                title: '水珠数量控制', target: CFG,
                fields: [
                    { id: 'ambientRate', label: '生成频率倍率', min: 0,   max: 3,   step: 0.1 },
                    { id: 'maxDrops',    label: '总量上限',     min: 5,   max: 100, step: 5 },
                    { id: 'fadeTime',    label: '完成后存活时间(秒)', min: 0.2, max: 8, step: 0.2 },
                ],
            },
            {
                title: '窗户滤镜', target: WINDOW_FILTER_CFG, onChange: applyWindowFilters,
                fields: [
                    { id: 'bgContrast',            label: '背景 - contrast',   min: 0.5, max: 2,   step: 0.05 },
                    { id: 'bgBrightness',          label: '背景 - brightness', min: 0.3, max: 1.5, step: 0.05 },
                    { id: 'bgSaturate',            label: '背景 - saturate',   min: 0,   max: 2,   step: 0.05 },
                    { id: 'bgBlur',                label: '背景 - blur (px)',  min: 0,   max: 5,   step: 0.1 },
                    { id: 'glassSaturate',         label: '玻璃 filter - saturate',   min: 0, max: 2,   step: 0.05 },
                    { id: 'glassBrightness',       label: '玻璃 filter - brightness', min: 0.3, max: 1.8, step: 0.05 },
                    { id: 'glassBackdropBlur',     label: '玻璃 backdrop - blur (px)', min: 0, max: 6,  step: 0.1 },
                    { id: 'glassBackdropSaturate', label: '玻璃 backdrop - saturate', min: 0, max: 2,  step: 0.05 },
                ],
            },
        ];

        const panel = document.createElement('div');
        panel.id = 'fog-debug-panel';
        panel.style.cssText = [
            'position:fixed', 'top:20px', 'right:20px', 'bottom:20px',
            'overflow-y:auto', 'background:#fff', 'color:#000',
            'border:1px solid #9EA5AC', 'border-radius:10px', 'padding:16px',
            'font-family:-apple-system,Avenir,sans-serif', 'font-size:12px',
            'line-height:1.4', 'z-index:99999', 'width:260px',
            'box-shadow:0 4px 16px rgba(0,0,0,0.2)', 'display:none',
        ].join(';');

        let html = '<h3 style="margin:0 0 4px;font-size:14px;">擦玻璃调参面板</h3>'
                 + '<p style="margin:0 0 12px;color:#666;">按 D 隐藏</p>';
        GROUPS.forEach((group, gi) => {
            html += `<h4 style="margin:14px 0 6px;font-size:12px;border-top:1px solid #eee;padding-top:10px;">${group.title}</h4>`;
            group.fields.forEach(f => {
                const id = 'fog-' + gi + '-' + f.id;
                html += `
                    <label style="display:block;margin-top:8px;">${f.label} <span id="v-${id}">${group.target[f.id]}</span></label>
                    <input type="range" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}" value="${group.target[f.id]}" style="width:100%;">
                `;
            });
        });
        html += `
            <button id="fog-reset-defaults-btn" style="width:100%;margin-top:14px;padding:6px;cursor:pointer;">重置为默认值</button>
            <button id="fog-reset-btn" style="width:100%;margin-top:8px;padding:6px;cursor:pointer;">重新起雾</button>
            <button id="fog-log-btn" style="width:100%;margin-top:8px;padding:6px;cursor:pointer;">在 console 打印当前参数</button>
        `;
        panel.innerHTML = html;
        document.body.appendChild(panel);

        GROUPS.forEach((group, gi) => {
            group.fields.forEach(f => {
                const id = 'fog-' + gi + '-' + f.id;
                const input = panel.querySelector('#' + id);
                const label = panel.querySelector('#v-' + id);
                input.addEventListener('input', () => {
                    const v = parseFloat(input.value);
                    group.target[f.id] = v;
                    label.textContent = v;
                    if (group.onChange) group.onChange();
                });
            });
        });

        function syncFieldsFromConfig() {
            GROUPS.forEach((group, gi) => {
                group.fields.forEach(f => {
                    const id = 'fog-' + gi + '-' + f.id;
                    panel.querySelector('#' + id).value = group.target[f.id];
                    panel.querySelector('#v-' + id).textContent = group.target[f.id];
                });
            });
        }

        panel.querySelector('#fog-reset-defaults-btn').addEventListener('click', () => {
            Object.assign(CFG, FOG_DEFAULTS);
            Object.assign(WINDOW_FILTER_CFG, WINDOW_FILTER_DEFAULTS);
            syncFieldsFromConfig();
            applyWindowFilters();
            if (window.__fogHardResetAll) window.__fogHardResetAll();
        });
        panel.querySelector('#fog-reset-btn').addEventListener('click', () => {
            if (window.__fogHardResetAll) window.__fogHardResetAll();
        });
        panel.querySelector('#fog-log-btn').addEventListener('click', () => {
            console.log(JSON.stringify({ fog: CFG, windowFilter: WINDOW_FILTER_CFG }));
        });

        // D 键切换显示/隐藏——排除正在输入框/textarea 里打字、以及带修饰键
        // （避免跟 Cmd+D 加书签这类浏览器自带快捷键冲突）的情况
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'd' && e.key !== 'D') return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
