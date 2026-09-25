# 设计决策记录

记已经定下来、但从代码里看不出来的决定——尤其是**被否掉的选项和否掉的理由**。
没有这一半，同一场讨论三个星期后会重来一遍。

---

## 2026-09-25 · 常驻 contact dock

**状态：已实现**（2026-09-25）。决策来自 `prototype-contact.html`（三变体对比 + 参数面板）。
实现在 `contact-dock.js` / `contact-dock.css`，复制逻辑在共用的 `copy-email.js`。
prototype 文件暂时保留，确认线上表现后可删。

### 决定

一个常驻的联系组件，形态是 **Recede**：实色胶囊，滚动时淡出后退，停止滚动后回来。

- **位置**：右下
- **内容**：邮箱原文（点击复制）· LinkedIn · Resume，平铺，**无展开态**
- **图标顺序**：LinkedIn 在前，Resume 在后
- **参数为在真实内容上调定的一组**，不是 prototype 的出厂默认值（见下）

### 参数

面板上的值：

```
variant: recede
position: 右下 (br)
scale: 1×
edge: 24px           ← 从「阅读面」的边算，不是视口，见下
idleOpacity: 1
scrollOpacity: 0.55
restoreDelay: 450ms
copiedHold: 2500ms
speed: 1×
blur: 14px          ← 只作用于 Ghost，Recede 用不到，此处仅为存档
```

不在面板上、但同属这个决定的固定值（见 `prototype-contact.html` 的 `<style>`）：

```
控件盒:        40 × 40px（桌面端最小命中区），dock padding 4px，圆角 999px
字体:          var(--font-avenir) 13px / letter-spacing .01em
后退变换:      translateY(6px) scale(0.97)      ← 只动 transform/opacity
状态过渡:      220ms ease-out
hover 过渡:    150ms ease-out
✓ Copied 交叉淡入: 140ms ease-out
阴影:          0 0 0 1px rgba(20,35,50,.06),
              0 2px 6px rgba(20,35,50,.06),
              0 12px 28px -8px rgba(20,35,50,.14)
z-index:       402                              ← 站点当前最高是 401（.case-lightbox-close）
```

**关于 edge 24px 的一处实现修正**：prototype 里内容是满幅的，24px 从视口边算即可。
真实页面上第 3、4 层都是左右各内缩 40px 的浮层面板（`style.css` 的
`.content-overlay-panel` / `case-overlay.css` 的 `.case-overlay-panel`），照搬 24px
会让 dock 探出面板右边缘、有一截压在后面的首页背景上（1280px 宽下实测约 16px）。
所以浮层打开时实际用 `right: 64px`（40 + 24），独立打开 `content.html` 时仍是 24px。
决定的是「离阅读面 24px」，不是「离视口 24px」。附带好处：这样 dock 的右边缘和第 4 层
关闭 X 的右边缘正好对齐。两个面板的 `bottom` 都是 0，底部不用补。

### 为什么是 Recede，不是 Solid

Solid（实色常驻、全程不变）是最保险的一个：任何背景、任何滚动状态下都保证可读。
选 Recede 是拿一部分可发现性，去换长滚动阅读时的安静——第 3、4 层都是长滚动页面，
一块全程不变的白色胶囊压在案例页的深色 hero 和满屏截图上，存在感确实太强。

Recede 的后退只动 `transform` 和 `opacity`，不动宽高。真正"收缩成一个图标"需要动 `width`，
那是布局属性，滚动中每帧重排会掉帧——所以这里实现的是淡出+轻微后退，不是收缩。

### 已知代价（明确接受，不是疏漏）

**扫读时 dock 是淡的，而那正是决策发生的时刻。**

这个组件存在的唯一依据是一条人证：一位资深 design lead 说，他们 review 时手上有几十个网站，
**扫到一半**觉得"还可以"，会想立刻记下怎么联系这个人；这时候要翻页、要滚到底，注意力就断了。

也就是说，最关键的那一刻，人是**正在滚动**的——而 Recede 恰恰在滚动时把自己调暗。
这是这个选择正面承担的风险，不是没看见。

**已经做了一次主动缓解**：`scrollOpacity` 从默认的 0.28 提到 **0.55**——在真实内容上
调的，扫读过程中 dock 仍然清晰可见，只是退到背景里，而不是接近隐形。这把上面那条风险
压低了一大截，但没有消除：0.55 仍然比静止态淡。`restoreDelay` 450ms，人停下来看一眼就回来。

如果上线后发现 0.55 还是太淡，继续往上调（0.7 左右）属于调参，不改变方向；真要是调到
接近 1 才够用，那说明这个方向本身不成立，应该退回 Solid。

### 待验证

- **右下是在真实内容上看过后定的**（曾短暂定为左下，在 prototype 里对比后改掉）。
  ~~遗留风险：第 4 层浮层的关闭 X 在右上角，两个浮动元素落在同一侧。~~
  **已解除**：同日把 `.case-overlay-close` 从右上移到了左上（理由见下面单独一条），
  现在两个浮动控件分处左上 / 右下对角，不再同侧。
- **dock 会盖住内容**：案例页底部的 meta 行（ROLE / TEAM / TIMELINE…）在视口底部时
  会被 dock 压住一部分。这是任何固定浮动元素的固有代价，需要真人翻一遍长页面判断
  可接受程度。
- `scrollOpacity: 0.55` 和 `restoreDelay: 450ms` 只在桌面宽屏上看过。
- ✓ Copied 的 2500ms 停留没有在真实使用中验证过——判断依据是"快速扫的状态下人会怀疑
  复制到底成没成功"，所以刻意比常见的 1.5s 长。

### 被否掉的选项

| 否掉的 | 理由 |
|---|---|
| **Solid**（实色常驻、全程不变） | 可发现性最高，但压在案例页的深色 hero 和满屏截图上存在感过强。是 Recede 的退路——如果 Recede 上线后发现没人用，直接退到这个，不要再发散 |
| **Ghost**（低对比度常驻、hover 才显形） | 视觉重量最轻，但快速扫的人可能根本没注册到它的存在，直接打在"三秒拿到邮箱"这个承诺上；且在深色 hero 上会真的掉对比度 |
| **展开态 / menu**（点 Contact 再展开看到邮箱） | 多一步。承诺是"不做任何选择就把邮箱拿走"，一个需要先点开的入口在定义上就做不到 |
| **按钮上写 "Contact" 而不是邮箱原文** | 邮箱原文同时是身份和联系方式；"记下这个人"需要两样同时可得。标签词只完成一半 |
| **Instagram 进常驻条** | 在一个给招聘方用三秒的条里它是第四个要被扫过的东西，只增加成本。第 2 层的完整社交图标列表里保留 |
| **case study 末尾加大 CTA 区块** | 证据说的是"扫到一半"，不是"读完"。"读完最有转化意图"是未经验证的直觉，且已被那条人证推翻 |
| **角落 toast 作为复制反馈** | 复制是唯一没有可见结果的动作。反馈必须落在按钮本体上，让人用眼睛确认自己拿到了什么；飘在角落、1.5s 就消失的 toast 在"我手上还有二十个网站"的状态下不够 |
| **位置/尺寸做成硬编码变体** | 它们是数值不是方向。做成变体只能给固定几个答案，放在滑块上十秒试完全部组合 |

### 实现时的注意事项

1. **不要新建组件——扩展已有的。** `index.html:98-113` 已经有 `.social-links`（Email /
   LinkedIn / Instagram / Resume），`script.js:215-237` 和 `mobile.js` 里 `writeText`
   那一段（约 290-310）已经各有一份复制逻辑。再加一份就是三份分叉，应该先提取成一份共用的。
2. **出现时机是一个开关，不是四种行为。** 第 1 层（雾窗）和第 2 层（window）不出现——
   第 2 层本来就有 `.social-links`，再浮一个是同屏两份相同的东西。第 3、4 层出现。
   这个开关用 `overlay.js` 已有的 open/close 生命周期即可，不需要给 `fog.js` 加 reveal 事件。
3. **Coming Soon modal（`content.css:833`，z-index 200）打开时要把 dock 藏起来**——
   402 会浮在 modal 之上，让 modal 看起来没盖全。不要试图用 z-index 解决"该不该在场"。
   *实现时改了做法*：没有让 `content.js` 加 body class（那要在 open/close 两处各改一行，
   多一个会和真实状态走散的副本），而是用 `:has()` 直接读弹窗自己的
   `.coming-soon-scrim.is-visible`。`content.js` 一行未改。
4. **`prefers-reduced-motion` 下不执行后退**，停在实色常驻态。
5. **`navigator.clipboard` 需要安全上下文**，`file://` 下不存在。必须有降级路径
   （现有 `script.js` 用 `window.prompt`，沿用即可），不能静默失败。

### 还没决定

- **`mobile.html` 完全没纳入。** 它是单页平铺，没有浮层生命周期，"第 3、4 层才出现"
  这个开关在那边不存在。只有两个选项：常驻，或者不做（依赖 hero 里已有的那排图标）。
- **首页/移动端那两个 `#emailLink` 要不要也埋 `copy_email`。** dock 已经埋了
  （`copy_email` + `source: 'dock'`），那两处还没有——如果要埋，`source` 用
  `'home'` / `'mobile_hero'` 之类区分，否则数据混在一起没法看。

  但更要紧的是：零访客期间点击量是个位数，没有统计意义。真正的测量手段是以后收到
  主动来信时问一句"你从哪拿到我邮箱的"。别指望 GA4 回答这个问题。

---

## 2026-09-25 · case study 关闭按钮移到左上

**状态：已实现。** 改动只在 `case-overlay.css`（桌面 `.case-overlay-close` 和
≤1023px 媒体查询里的那份），图标仍是 X，没换成箭头。

### 决定

`.case-overlay-close` 从右上角移到左上角。

- **桌面：`left: 40px`**（不是和原来 `right:24px` 数值对称的 24px）。40 是为了和 HOME
  对齐，推导见下。
- **手机（≤1023px）：`left: max(16px, env(safe-area-inset-left))`**，数值就是原来
  `right:16px` 的对称值，没有跟着桌面调。`env()` 兜底是新加的——横屏刘海机左侧会被
  系统占掉一条，原来写死 `right:16px` 时不需要，挪到左边就需要了。

理由两条：content 层的 HOME/BACK 按钮在左上角，"往回走"这个动作在两层之间保持同一个
位置；顺带避开右下角的 contact dock，两个浮动控件不再挤在同一侧。

手机端那份原来是写死的 `right:16px`，改到左侧时跟着上面 `top` 的写法补了
`env(safe-area-inset-left)` 兜底——横屏刘海机的左侧会被系统占掉一条。

### 对齐的推导，和实测结果

HOME 的 40px 是从**内容面板**的边算的（它是 banner 里的 flex 项，banner 在 `<main>` 里，
`<main>` 在 `.content-overlay-panel` 里），关闭 X 的值是从**案例面板**的边算的。两个面板都是
viewport `left: 40px`，所以主路径（`index.html` 浮层）下 HOME = 40 + 面板内的 margin，
关闭 X 也要写同一个 margin 才落在同一点。

`.banner-home` 的 margin 本身有断点（`content.css:300`，`@media (max-width:1199px)` 从 40
收到 20），所以 `case-overlay.css` 里镜像了同一个断点。**两个值是绑在一起的：以后改动其中
任何一个，另一个要一起改。**

实测（浏览器量出的 `getBoundingClientRect().left`）：

| 场景 | HOME | 关闭 X | |
|---|---|---|---|
| `index.html` 浮层 @1512 / @1280 | 80px | 80px | 对齐 |
| `index.html` 浮层 @1199 / @1100 / @1024 | 60px | 60px | 对齐 |
| `content.html` 独立 @1280 | 40px | 80px | 差 40px |
| `content.html` 独立 @1100 | 20px | 60px | 差 40px |
| ≤1023px 手机端 | — | 16px | 不参与对齐 |

**独立打开 `content.html` 差 40px，已明确接受。** 那时 banner 没有被面板内缩（HOME 直接
落在 margin 值上），而案例浮层永远是内缩的，两个场景在数学上不可能同时对齐。独立访问是
降级路径。附带结果：加了断点之后这个偏差在两档里都是整齐的 40px（之前是 24 / 44 两个值），
因为两边的收缩量现在一致，差的只剩面板那 40px 内缩，和视口宽度无关了。

**层叠顺序是有约束的**：`@media (max-width:1199px)` 那条必须写在 `@media (max-width:1023px)`
之前。两条特异性相同，≤1023px 时都会命中，靠源码顺序决定谁生效——放到后面会把手机端的
`left: max(16px, env(safe-area-inset-left))` 覆盖成 20px。已在 CSS 里注明。

顺带一提：这两个按钮**永远不会同屏出现**（案例浮层完全盖住内容层）。"对齐"在这里指的是
关掉案例浮层后，HOME 出现在刚才关闭 X 所在的同一个位置——是跨层切换的位置连续性，
不是同屏的视觉对齐。这反而是这次改动更强的理由。

### 新出现的一个视觉问题（未处理）

挪到 `left: 40px` 后，关闭 X 的右边缘（viewport 124px）离 DrayEasy hero 图里那个
"DrayEasy" logo 只剩约 10px——在 `right:24px` 的旧位置上，它和周围元素有 27px 的余量。
两者现在看起来像挤在一起的一对。这是 hero 图内容和按钮位置的偶然碰撞，不是布局 bug，
需要真人判断能不能接受。可选做法：把按钮再往左收一点（会破坏上面的对齐）、或者调整
hero 图左上角的留白。**未处理。**

### 手机端的已知风险（明确不改）

按钮 44px 宽、从 16px 起算，占据 x = 16–60px。Android 手势导航的左边缘返回条默认约 24px、
用户可调到 ~48px，按钮左侧那一截落在里面；iOS Safari 左边缘右滑也是后退，识别区约 20px。
纯点击一般没事，但带横向位移的按压可能被判成返回手势。

原来在右边是对称的问题（iOS 右边缘右滑 = 前进），但左边缘返回的实际触发频率高得多，
所以这是个真实的回归。**曾建议提到 24–28px，已明确决定不改**，风险留在这里备查。

### 顺带修掉的一处过时文档

CLAUDE.md 原先写"`mobile.html` 没有 `case-overlay.js`、DrayEasy 按钮仍被
`data-case-study-ready="false"` 挡着、移动端从未接入 case-overlay 系统"。四处都不符：
`mobile.html` 加载了 `case-overlay.js`；`mobile.html:96` 已是 `data-case-study="drayeasy"`；
`buildCaseUrl()` 用 `location.pathname`，所以手机端也会同步 `mobile.html?case=<key>` 并
支持深链接自动展开；`case-overlay.css` 有真实的 ≤1023px 处理（面板全屏、从底部滑入），
点击放大大图那个功能还是手机端独有的。**已改**（2026-09-25）。
