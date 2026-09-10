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
| `drayeasy.html` / `drayeasy.css` | The DrayEasy case study **content** — a bare `<main>` (hero image + tag/title/subtitle/divider/meta row; see §6 for what's built so far) with no shell of its own (no background, no close/back button, no panel chrome). It is **not** a standalone page you're meant to open directly — `case-overlay.js` fetches it and clones its `<main>` into the second-layer panel, the same way `overlay.js` treats `content.html`. `drayeasy.html`'s own `<head>` still `<link>`s `content.css`/`drayeasy.css` purely as a degraded fallback (see §2.2) in case `case-overlay.js` fails to load — that path is not meant to look polished, just not be a dead link. `drayeasy.css` only styles the content itself; it does not know about the panel/scrim it ends up inside. |
| `case-overlay.js` / `case-overlay.css` | The **second-layer** case-study overlay — sits on top of the first-layer `.content-overlay-panel` (or on top of standalone `content.html`) to show one project's full case study. Own fetch/clone implementation, deliberately separate from `overlay.js` (does not modify it). See §2.2 for the full architecture and the steps to add a new case study. |
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

### 2.2 The case study second-layer overlay (`case-overlay.js`)

A **second** floating panel that stacks on top of the first (`.content-overlay-panel` / `#overlayBody`), used to show one project's full case study without leaving Work/Sandbox/About. Deliberately a separate, self-contained implementation from `overlay.js` — same fetch-and-clone idea, but its own DOM/state, so it can be changed or ripped out without touching the first layer.

**Architecture:**
- `case-overlay.js` keeps a `CASE_STUDIES` map (`{ drayeasy: { html: 'drayeasy.html', css: 'drayeasy.css' } }`) — the only thing you edit to add a new case study (see below).
- It builds its own shell once at load time — `.case-overlay-scrim` / `.case-overlay-panel` / `.case-overlay-close` (an X button) / `.case-overlay-body` (the scroll container) — and appends it straight to `document.body`, mirroring how the Coming Soon modal (`content.js`) is a body-level singleton rather than living inside `<main>`.
- It dynamically injects its own `<link>` tags (`case-overlay.css`, and per-case CSS like `drayeasy.css`) into `<head>` at runtime instead of relying on the host page to have them statically linked — this is what lets it work identically whether the host page is `content.html` or `index.html`, without needing static `<link>`s added to either.
- Click interception is event delegation on `document` (`[data-case-study="key"]` triggers), not a listener bound to the specific button — this is what makes it keep working after `overlay.js` clones the button into the first layer (clones carry no listeners; delegation on `document` doesn't care where the clicked element lives).
- The trigger link's real `href` (e.g. `href="drayeasy.html"`) is left in place as the progressive-enhancement fallback — if `case-overlay.js` fails to load, no listener intercepts the click and the browser just navigates there normally (degraded, but not a dead button).
- URL sync: opening pushes `history.pushState` to `<page>?case=<key>`, where `<page>` depends on which page is actually being viewed at the time — `index.html` when opened from inside its first-layer overlay (`#overlayBody` exists in the DOM), `content.html` when opened on that page standalone (no `#overlayBody`). This is deliberate: the address bar always matches what's actually on screen, in both directions — it used to always write `content.html?case=<key>` regardless of origin, which meant opening a case study from `index.html` left the address bar pointing at a different page than what was rendered; that's fixed now (see the `index.html` auto-open section below for the other half of the fix). A `popstate` listener re-derives open/closed state from `location.search` on every back/forward, rather than imperatively toggling — this is what makes the browser Back button close the second layer instead of leaving the site.
- Scroll position: before opening, it records the first layer's current scroll position and restores it on close. The first layer's scroll container isn't the same element in both hosting contexts — `#overlayBody` when cloned inside `index.html`'s overlay, native `window`/`document.documentElement` scroll when `content.html` is open standalone (there is no `#overlayBody` in that case) — `case-overlay.js` checks for `#overlayBody`'s existence to tell which one applies.
- Escape handling: `case-overlay.js`'s `<script>` tag in `index.html` **must stay ordered before** `overlay.js`'s tag — both listen for Escape on `document`, and the second layer's handler needs to fire first and call `stopImmediatePropagation()` to stop `overlay.js`'s own Escape handler from also closing the first layer in the same keypress. If you ever reorder the `<script>` tags in `index.html`, this breaks silently (both layers will close together on Escape instead of just the top one).
- z-index: second layer starts at 300 (scrim) / 301 (panel), well above everything else on the site including the Coming Soon modal (200, the previous highest) — see `case-overlay.css` for the exact values.

**Landing directly on `index.html?case=<key>` (a shared link) — two things have to happen, in two different files, at two different times:**

1. **`index.html` skips the opening wall animation**, right where `.intro-panel`'s markup closes. This does *not* touch `script.js`'s `collapse()`/`expand()` sequencing at all — it works because the "wall collapsed" terminal look turns out to be almost entirely the *default* CSS state already: every `body.intro X { ... }` rule in `style.css` is an override for the expanded/wall-visible look, and the un-overridden default is already what the collapsed look should be. So skipping the animation is just three lines run before first paint (synchronous inline `<script>`, same trick as the mobile-redirect check above it in the file): remove `intro` from `body`'s class list, set `.intro-panel`'s `style.visibility = 'hidden'` directly (the *one* piece of this state that isn't CSS-driven — normally only set by `script.js`'s `onWallWidthDone()` after the real collapse transition finishes), and set `#pixelAvatar`'s `aria-expanded` to `'false'` to match. Guarded by `location.search` having a `case` param — does nothing on a normal visit. If you ever change what "wall collapsed" visually consists of in `style.css`/`script.js`, check whether this still produces the correct end state.
2. **`case-overlay.js`'s `syncFromLocation()` opens the first layer before the second**, when running on `index.html`. It calls `window.openContentOverlay('work')` (the same function `fog.js` calls on a real pane click — no dependency on click events, mouse state, or the wall/intro state, confirmed by reading `overlay.js`'s `openOverlay()` body) before its own `openCaseOverlay()`. That first call never touches the URL (matches `overlay.js`'s own "never touch the address bar" design) — only the second-layer open does.

   **Timing gotcha that already bit this once**: `index.html`'s `<script src="case-overlay.js">` tag is deliberately ordered *before* `<script src="overlay.js">` (see the Escape bullet above). That means the very first, load-time call to `syncFromLocation()` cannot run synchronously at the bottom of `case-overlay.js`'s own script the way `popstate`-triggered calls do — at that point in parsing, `overlay.js` hasn't run yet, so `window.openContentOverlay` doesn't exist, the `if (typeof window.openContentOverlay === 'function')` check silently fails, and the first layer never actually opens (no error — the second layer opens fine regardless, since it doesn't depend on the first, so the bug was invisible until closing the second layer revealed the homepage sitting behind it instead of the first-layer panel). Fixed by deferring only that initial call to `DOMContentLoaded` (same `readyState` check `content.js`'s own `start()` uses at the bottom of that file) — by then `overlay.js` is guaranteed to have already run, regardless of `<script>` tag order. Don't revert this to a bare synchronous call.

   **Known, accepted gap**: the two `fetch()` calls this triggers (`overlay.js`'s for `content.html`, `case-overlay.js`'s own for the case study page) aren't awaited relative to each other — `openContentOverlay('work')` fires and returns immediately; `openCaseOverlay()` starts its own fetch right after, without waiting for the first to finish cloning. Harmless today because the second layer visually covers the first completely and neither reads the other's DOM. If a future case study's opening logic ever needs to read something from the first layer's cloned content (not just cover it), this will need a real `await`/`.then()` chain added here — it isn't one now.

**`index.html`'s mobile redirect** (top of `<head>`) now forwards the query string — `location.replace('mobile.html' + location.search)` instead of a bare `'mobile.html'` — so a `?case=` link isn't silently dropped on a narrow viewport. `mobile.html` doesn't read it yet (it has no `case-overlay.js`, and its own DrayEasy button is still gated behind `data-case-study-ready="false"` — mobile has never been wired into this case-overlay system at all, every round of this feature has been ≥1024px only) — this is just forward-compatible plumbing so the link itself doesn't need to change later.

**To add a new case study once its content page exists** (mirroring what was done for DrayEasy):
1. Write the content page (e.g. `newproject.html` + `newproject.css`) as a bare `<main>` with no shell — no background layer, no back/close button, no panel chrome — those are provided by `case-overlay.js`'s shell. Keep the `<head>` `<link>`s to `content.css` and the project's own CSS purely as the degraded-fallback path.
2. Add one entry to `CASE_STUDIES` in `case-overlay.js`: `newproject: { html: 'newproject.html', css: 'newproject.css' }`.
3. On that project's card in `content.html`, remove `data-case-study-ready="false"` (see §4), point `href` at `newproject.html` (keep it — it's the fallback), and add `data-case-study="newproject"` (this is what `case-overlay.js`'s click delegation matches on).

Nothing else needs to change — not `overlay.js`, not `index.html` (its `case-overlay.js` `<script>` tag and the intro-skip logic above are generic, not per-project), not the shell CSS.

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
- To mark a project as finished: remove `data-case-study-ready="false"` from its button and point `href` at the real destination. No other code changes needed — the modal wiring keys off that one attribute. If the "real destination" is a case study meant to open in the second-layer overlay (not a plain page navigation), see §2.2 for the extra step (`data-case-study="key"` + a `CASE_STUDIES` entry).

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
- **Work section**: DrayEasy (001, tagged "LIVE SINCE 2023") has its case study built and wired into the second-layer overlay (§2.2) — `drayeasy.html` + `drayeasy.css` hold hero-section content only so far (hero image + Shipped tag/title/subtitle/divider/meta row; no sections past the hero yet, desktop-only ≥1024px, no scaling formulas — all fixed px pending visual confirmation). Its card's `data-case-study-ready="false"` has been removed, `href="drayeasy.html"` stays as the progressive-enhancement fallback, and it now carries `data-case-study="drayeasy"` so clicking it opens the second-layer overlay (URL syncs to `content.html?case=drayeasy`) instead of navigating. MobileConductor (002, tagged "HANDED OFF · 2026") still has a finished thumbnail/title/tags on its card but is still marked `data-case-study-ready="false"` — card done, case-study content not started.
- **Sandbox**: "Beyond Fingers" (touchless music interaction project) is in the same state as MobileConductor — card finished, case study pending, still gated by `data-case-study-ready="false"`. The 003 project ("SmartDevil") is fully commented out in `content.html`, not deleted — intentionally hidden, not abandoned.
- Third-party links are live and correct: the Sandbox mini-grid's four small project cards (Vito web audio player, winter record-player reel, CUBE Figma case study, VST research notes) all point to real external URLs.

Not confirmed in code — stated by the user, unverified against any config/CI file:
- **Mobile/responsive**: partial coverage exists (`@media` breakpoints in both stylesheets handle the Work banner, the About gallery falling back to a stacked vertical layout below 768px, and the homepage window layout below 800px) — but this hasn't been audited section-by-section for completeness. Treat "responsive polish" as in-progress, not done.
- **Deployment**: no GitHub Pages config, no `.git`, no CI file exists yet. GitHub Pages is the stated intended target but nothing in the repo confirms setup has started.

If you complete or discover something in these areas, update this section rather than leaving it stale.
