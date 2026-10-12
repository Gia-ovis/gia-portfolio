/* ============================================================
   filter-tuner.js
   临时调试工具：实时调整 window-frame / bg-layer / glass-layer
   的 CSS filter 参数

   用法：在 index.html 的 </body> 之前加一行
       <script src="filter-tuner.js"></script>
   调好之后把生成的 CSS 抄进 style.css，然后删掉这一行
   ============================================================ */

(function () {
  'use strict';

  // 每个目标层可调的参数
  const TARGETS = [
    {
      key: 'frame',
      label: 'Window Frame',
      selector: '.window-frame',
      params: [
        { name: 'contrast',   min: 0,   max: 200, val: 100, unit: '%' },
        { name: 'brightness', min: 0,   max: 200, val: 100, unit: '%' },
        { name: 'saturate',   min: 0,   max: 200, val: 100, unit: '%' },
        { name: 'opacity',    min: 0,   max: 100, val: 100, unit: '%' },
        { name: 'blur',       min: 0,   max: 40,  val: 0,   unit: 'px', div: 10 },
      ],
    },
    {
      key: 'bg',
      label: 'Background',
      selector: '.bg-layer',
      params: [
        { name: 'contrast',   min: 0,   max: 200, val: 100, unit: '%' },
        { name: 'brightness', min: 0,   max: 200, val: 100, unit: '%' },
        { name: 'saturate',   min: 0,   max: 200, val: 100, unit: '%' },
        { name: 'opacity',    min: 0,   max: 100, val: 100, unit: '%' },
        { name: 'blur',       min: 0,   max: 60,  val: 0,   unit: 'px', div: 10 },
      ],
    },
    {
      key: 'glass',
      label: 'Glass Layer',
      selector: '.glass-layer',
      params: [
        { name: 'contrast',   min: 0,   max: 200, val: 100, unit: '%' },
        { name: 'brightness', min: 0,   max: 200, val: 100, unit: '%' },
        { name: 'saturate',   min: 0,   max: 200, val: 100, unit: '%' },
        { name: 'opacity',    min: 0,   max: 100, val: 100, unit: '%' },
        { name: 'blur',       min: 0,   max: 60,  val: 0,   unit: 'px', div: 10 },
      ],
    },
  ];

  const DEFAULTS = JSON.parse(JSON.stringify(TARGETS));

  /* ---------- 样式 ---------- */
  const css = `
  #ftuner {
    position: fixed; top: 14px; right: 14px; z-index: 99999;
    width: 262px; max-height: calc(100vh - 28px);
    overflow-y: auto;
    background: rgba(14,22,30,.94);
    border: 1px solid #2c4257;
    color: #cfe4f2;
    font: 11px/1.5 ui-monospace, "SF Mono", Menlo, monospace;
    backdrop-filter: blur(10px);
    box-shadow: 0 6px 28px rgba(0,0,0,.34);
    user-select: none;
  }
  #ftuner.min { max-height: 34px; overflow: hidden; }
  #ftuner header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 11px;
    background: rgba(255,255,255,.05);
    border-bottom: 1px solid #2c4257;
    cursor: pointer;
  }
  #ftuner header b { font-weight: 500; color: #fff; letter-spacing: .06em; font-size: 10px; }
  #ftuner header span { color: #6d8ba3; font-size: 14px; line-height: 1; }
  #ftuner .grp { border-bottom: 1px solid #22384b; }
  #ftuner .grp > h4 {
    margin: 0; padding: 8px 11px 5px;
    font-size: 9px; font-weight: 500;
    letter-spacing: .16em; text-transform: uppercase;
    color: #5d86a5;
    display: flex; align-items: center; justify-content: space-between;
  }
  #ftuner .miss { color: #d98a5c; font-size: 9px; letter-spacing: 0; text-transform: none; }
  #ftuner .row {
    display: grid; grid-template-columns: 60px 1fr 46px;
    align-items: center; gap: 6px;
    padding: 3px 11px;
  }
  #ftuner .row label { color: #8aa8bf; font-size: 10px; }
  #ftuner .row input[type=range] {
    width: 100%; height: 3px; accent-color: #55a8d8;
    background: #26404f; cursor: pointer;
  }
  #ftuner .row output {
    text-align: right; color: #fff; font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  #ftuner .row.changed label { color: #7fd8a8; }
  #ftuner .acts { display: flex; gap: 6px; padding: 9px 11px; }
  #ftuner button {
    flex: 1; font: inherit; font-size: 10px;
    background: transparent; color: #7fc4e8;
    border: 1px solid #33566e; padding: 5px 0; cursor: pointer;
  }
  #ftuner button:hover { background: #1b3244; color: #fff; }
  #ftuner pre {
    margin: 0; padding: 9px 11px;
    background: #08111a; color: #83c9a5;
    font-size: 9.5px; line-height: 1.6;
    white-space: pre-wrap; word-break: break-all;
    border-top: 1px solid #22384b;
    max-height: 190px; overflow-y: auto;
  }
  #ftuner pre .sel { color: #d0a86a; }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- 面板 ---------- */
  const box = document.createElement('div');
  box.id = 'ftuner';

  let html = `<header><b>FILTER TUNER</b><span>–</span></header>`;

  TARGETS.forEach(t => {
    const found = document.querySelector(t.selector);
    html += `<div class="grp" data-k="${t.key}">
      <h4>${t.label}${found ? '' : '<i class="miss">未找到</i>'}</h4>`;
    t.params.forEach(p => {
      html += `<div class="row" data-k="${t.key}" data-p="${p.name}">
        <label>${p.name}</label>
        <input type="range" min="${p.min}" max="${p.max}" value="${p.val}" step="1">
        <output>${fmt(p)}</output>
      </div>`;
    });
    html += `</div>`;
  });

  html += `<div class="acts">
      <button data-a="reset">重置</button>
      <button data-a="copy">复制 CSS</button>
    </div>
    <pre id="ftout"></pre>`;

  box.innerHTML = html;
  document.body.appendChild(box);

  /* ---------- 逻辑 ---------- */
  function fmt(p) {
    const v = p.div ? (p.val / p.div) : p.val;
    return p.unit === 'px' ? v.toFixed(1) + 'px' : v + '%';
  }

  function filterStr(t) {
    const parts = [];
    t.params.forEach(p => {
      const def = p.unit === 'px' ? 0 : 100;
      if (p.val === def) return;                    // 默认值不输出
      const v = p.div ? (p.val / p.div) : p.val;
      parts.push(p.unit === 'px'
        ? `${p.name}(${v.toFixed(1)}px)`
        : `${p.name}(${(v / 100).toFixed(2)})`);
    });
    return parts.join(' ');
  }

  function apply() {
    let out = '';
    TARGETS.forEach(t => {
      const el = document.querySelector(t.selector);
      const f = filterStr(t);
      if (el) el.style.filter = f || 'none';
      if (f) out += `${t.selector} {\n    filter: ${f};\n}\n\n`;
    });
    document.getElementById('ftout').textContent =
      out.trim() || '/* 全部为默认值，无需写入 CSS */';
  }

  box.addEventListener('input', e => {
    if (e.target.type !== 'range') return;
    const row = e.target.closest('.row');
    const t = TARGETS.find(x => x.key === row.dataset.k);
    const p = t.params.find(x => x.name === row.dataset.p);
    p.val = +e.target.value;
    row.querySelector('output').textContent = fmt(p);

    const def = DEFAULTS.find(x => x.key === t.key)
                        .params.find(x => x.name === p.name).val;
    row.classList.toggle('changed', p.val !== def);
    apply();
  });

  box.querySelector('header').addEventListener('click', () => {
    box.classList.toggle('min');
    box.querySelector('header span').textContent =
      box.classList.contains('min') ? '+' : '–';
  });

  box.addEventListener('click', e => {
    const a = e.target.dataset.a;
    if (a === 'reset') {
      TARGETS.forEach((t, i) => {
        t.params.forEach((p, j) => {
          p.val = DEFAULTS[i].params[j].val;
          const row = box.querySelector(`.row[data-k="${t.key}"][data-p="${p.name}"]`);
          row.querySelector('input').value = p.val;
          row.querySelector('output').textContent = fmt(p);
          row.classList.remove('changed');
        });
      });
      apply();
    }
    if (a === 'copy') {
      const txt = document.getElementById('ftout').textContent;
      navigator.clipboard.writeText(txt).then(() => {
        e.target.textContent = '已复制';
        setTimeout(() => e.target.textContent = '复制 CSS', 1100);
      });
    }
  });

  apply();
  console.log('[filter-tuner] 已加载。调好后复制 CSS 写进 style.css，再删掉这个 script 标签。');
})();
