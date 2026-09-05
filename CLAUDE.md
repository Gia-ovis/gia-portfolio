# Portfolio — project notes for Claude Code

This file is for AI assistants working in this repo, not for site visitors. Read it before making changes so you don't re-derive context or contradict decisions already made. Keep it accurate — verify claims against the actual code before trusting or extending them; don't take anything here as true if the code has since diverged.

## 1. What this is

A personal portfolio site for a UX/HCI designer, aimed at design roles — music tech companies and B2B SaaS in particular (that context shapes some copy/tone choices, see §4). Static HTML/CSS/JS, no build step, no framework, no dependencies beyond two Google Fonts (Monda, Montserrat) and system fonts for the rest. Everything runs directly off the filesystem or a plain static server.

**Not a git repo currently** (`git status` was checked at the time of writing — no `.git`). If that's still true when you start, treat any git-related instructions from the user as "set this up first," not "assume history exists."

## 2. File structure (verified against the actual repo, not assumed)

| File | Role |
|---|---|
| `index.html` | The homepage — the "window" metaphor (fog-wiped glass panes: Work / Sandbox / About / a `:)` easter egg, plus social icons). This is the front door. |
| `content.html` | The full "Selected Work" long-scroll page (Work → Sandbox → About sections). Can be opened standalone, **or** its `<main>` is fetched and cloned into a floating panel on top of `index.html` (see overlay architecture below) — same markup, two presentation contexts. |
| `style.css` | Styles for `index.html` (the window/glass/intro-panel/homepage chrome). |
| `content.css` | Styles for the Work/Sandbox/About content — design tokens (`:root`) live here, not in `style.css`. Both stylesheets are loaded on `index.html`, so `style.css` rules can reference `content.css`'s custom properties. |
| `fog.js` | Owns all six fog-wiped glass canvases on the homepage: wipe-on-drag, growing water drops, ambient glints, the word/`:)` reveal, hover states. Exposes `window.FOG_CONFIG` (live-tunable params) and `window.__fogHardResetAll()`. |
| `debug-panel.js` | **Dev-only, independent** real-time tuning panel for `fog.js` and the `.bg-layer`/`.glass-layer` CSS filters. See §5 — do not let real features depend on this file. |
| `script.js` | Homepage intro-panel expand/collapse (the "wall" animation), the pixel-avatar hover capsule, email click-to-copy. |
| `content.js` | Scroll-spy for the banner title crossfade, Sandbox mini-grid hover capsules, the "Coming Soon" modal for unfinished case studies. Exposes `window.initContentScrollSpy`, `window.initMiniGridHoverCapsules`, `window.initComingSoonModal` — all follow an `init(root) → destroy()` pattern because content gets cloned into the overlay and needs re-initializing (see §2.1). |
| `overlay.js` | The floating-panel architecture itself — fetches `content.html`, clones `<main>` into `#overlayBody`, re-runs the `init()` hooks above, handles open/close (scrim click, Escape, Home button). |
| `about.js` | The About section's horizontal scroll-jacking gallery (wheel-driven, not native scroll-linked — see the file's own comments before touching timing). Disabled below 768px. |
| `grid.js` | Draws the blueprint-grid SVG lines in `.project-divider` elements. Shared by both `content.html` and the overlay clone (`window.renderDividerGrids`). |
| `filter-tuner.js` | **Superseded, not loaded** (`<script>` tag is commented out in `index.html`). Was an earlier standalone version of the background/glass filter tuning that `debug-panel.js`'s "窗户滤镜" group now does properly. Safe to delete once confirmed unneeded; don't build on it. |
| `fog_wipe_growing_drops.html` | Standalone prototype `fog.js` was ported from. Not linked from either live page. Reference only. |

No `data.js` exists — project content (titles, tags, thumbnails, copy) is written directly in `content.html`, not pulled from a separate data module. If a future task references "data.js," that's a stale assumption; don't create one without confirming that's actually wanted.

### 2.1 The overlay/clone pattern (important, easy to get wrong)

`index.html` never navigates to `content.html`. Instead `overlay.js` fetches it, clones `<main>`, and injects it into a panel over the homepage. **Cloned DOM carries no event listeners or observers.** Every interactive piece of `content.html` content (scroll-spy, hover capsules, About's scroll-jack, the Coming Soon modal) is written as `initX(root) → destroy()`, called once at page load for the standalone page and again by `overlay.js` after every clone-injection, with the previous `destroy()` called first. If you add a new interactive feature to `content.html`, it needs to follow this same pattern or it will silently not work inside the overlay.

## 3. Design tokens (from `content.css` `:root`, confirmed current)

```css
--brand:          #0072CB;
--stroke:         #9EA5AC;
--text-primary:   #273138;
--text-secondary: #697784;
--text-warning:   #E2644D;
--bg-white:       #FBFCFD;
--bg-blue:        #DEEDF9;
--bg-reading:     #FFFFF6;
--bg-grey:        #EBECED;
--tag-green:      #D8FBFD;
--tag-yellow:     #FDFDD8;

--font-avenir:  "Avenir", "Avenir Next", -apple-system, "Helvetica Neue", Arial, sans-serif;
--font-display: "Montserrat", "Avenir Next", sans-serif;
```

Other fonts in use, not tokenized as variables:
- **HanziPen TC** (`"HanziPen TC", "HanziPen SC", "Yuanti TC", cursive`) — the handwritten look. Used for the fog-canvas words (`fog.js`), the "Gia Wang" signature, and the About-page info-card values. It's a local system font (macOS), not a webfont — no loading delay, but won't render as-designed on a system that lacks it.
- **Hiragino Sans GB W3** (`"Hiragino Sans GB", "Hiragino Sans GB W3", "PingFang SC", "Helvetica Neue", sans-serif`) — `content.html`'s `<body>` base font stack.

New colors: reuse or extend the existing token set before inventing a new hex value. If you do add one, add it as a `--token-name` in `:root`, not a bare hex scattered through rules.

## 4. Content/copy principles

- No hype/marketing tone, no clichés ("cutting-edge," "revolutionary," "passionate about," etc.).
- "Coming soon"–type states must read as written by a person, not a placeholder. Established example: `Case study coming soon 🏗️` / `I'm still putting it together. Feel free to explore the rest of my work in the meantime～` / `Keep Exploring`.
- **Decided pattern for unfinished case studies**: a modal (`content.js`'s `initComingSoonModal`), triggered by `data-case-study-ready="false"` on the `<a class="btn-primary">`. The button's appearance does **not** change — it looks exactly like a normal, clickable "View Case Study" button; clicking it opens the modal instead of navigating. An earlier alternative (turning the button itself into a disabled/greyed-out status pill) was built, tested, and explicitly reverted in favor of this. **Do not revert back to a disabled-button visual state without being asked** — that direction was tried and rejected.
- To mark a project as finished: remove `data-case-study-ready="false"` from its button and point `href` at the real destination. No other code changes needed — the modal wiring keys off that one attribute.

## 5. Debug tooling

`debug-panel.js` is a **separate, deletable** file — it must never become something the real site depends on. It reads/writes objects that `fog.js` exposes on `window`, and directly sets inline styles on `.bg-layer`/`.glass-layer` for the CSS-filter group; it does not modify `fog.js` or `content.css` itself.

- **Toggle**: press **D** anywhere on `index.html` (ignored while focus is in an `<input>`/`<textarea>`, or with a modifier key held, to avoid stray triggers and `Cmd+D` conflicts). Hidden by default; the panel element exists in the DOM but is `display:none` until toggled.
- **Buttons**: "重置为默认值" (restores the baked-in defaults below and re-applies them), "重新起雾" (calls `window.__fogHardResetAll()`), "在 console 打印当前参数" (dumps the live config as JSON).
- **`window.FOG_CONFIG`** (current baked-in defaults — these are tuned values, not arbitrary):
  ```js
  {
    holeAlpha: 0.9, edgeBlur: 2.5, wipeR: 75, refogInterval: 90, refogAlpha: 0.03,
    dropSpeedMin: 9, dropSpeedMax: 52, dropLenMin: 24, dropLenMax: 114, dropWobble: 1.3,
    ambientRate: 1, maxDrops: 40, fadeTime: 3,
    glintRate: 1, glintBrightness: 1.1, glintSize: 1,
  }
  ```
  `fog.js` reads these live every frame/tick — never cache a snapshot of this object, always dereference `window.FOG_CONFIG.xxx` at point of use, or panel changes won't take effect.
- There's a second, separate config for the "窗户滤镜" (window filter) panel group — `.bg-layer`'s `contrast/brightness/saturate/blur` and `.glass-layer`'s `filter`/`backdrop-filter` — defined inside `debug-panel.js` itself (`WINDOW_FILTER_CFG`), since nothing else has a render loop to read it live; the panel applies it directly to the DOM on every change.

## 6. Progress / next steps

Confirmed from the code:
- **Work section**: DrayEasy (001, tagged "LIVE SINCE 2023") and MobileConductor (002, tagged "HANDED OFF · 2026") both have finished thumbnails/title/tags on their cards, but both are marked `data-case-study-ready="false"` — the visual project cards are done, the written case-study content behind them is not.
- **Sandbox**: "Beyond Fingers" (touchless music interaction project) is in the same state — card finished, case study pending. The 003 project ("SmartDevil") is fully commented out in `content.html`, not deleted — intentionally hidden, not abandoned.
- Third-party links are live and correct: the Sandbox mini-grid's four small project cards (Vito web audio player, winter record-player reel, CUBE Figma case study, VST research notes) all point to real external URLs.

Not confirmed in code — stated by the user, unverified against any config/CI file:
- **Mobile/responsive**: partial coverage exists (`@media` breakpoints in both stylesheets handle the Work banner, the About gallery falling back to a stacked vertical layout below 768px, and the homepage window layout below 800px) — but this hasn't been audited section-by-section for completeness. Treat "responsive polish" as in-progress, not done.
- **Deployment**: no GitHub Pages config, no `.git`, no CI file exists yet. GitHub Pages is the stated intended target but nothing in the repo confirms setup has started.

If you complete or discover something in these areas, update this section rather than leaving it stale.
