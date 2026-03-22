```markdown
# 设计系统文档：液态以太 (Liquid Ethereal)

作为 UI/UX 总监，我为本系统设立的核心目标是超越传统的“扁平化”框架，通过**液态玻璃 (Liquid Glass)** 与 **极致排版 (Editorial Typography)** 的融合，创造出一种通透、灵动且具有呼吸感的数字体验。

本系统不仅是组件的集合，更是一种光影哲学的体现。

---

## 1. 创意北极星 (Creative North Star)
**“流动的秩序” (Fluid Order)**
我们拒绝死板的栅格和生硬的分隔线。本系统模仿光线穿过高质感毛玻璃后的折射效果，利用**非对称布局**和**大比例留白**来引导视线。界面应当像一件精美的艺术品，元素之间不是简单的堆砌，而是在空间中自由“漂浮”并相互呼应。

---

## 2. 色彩与材质 (Colors & Materials)

色彩是情感的载体，而材质是质感的来源。

### 核心调色盘
*   **背景 (Background):** 使用 `#f9f9fe`。这是一种带有极微量冷调的白色，能比纯白色更有效地承载阴影。
*   **品牌点缀:** 
    *   `primary` (#005bc1): 用于核心交互，如同清澈的深海。
    *   `tertiary` (#8e2fbd): 柔和的紫色，用于提升界面的精致度与艺术感。
*   **功能提示:** `success` 使用柔和绿，`error` 使用 `#9f403d`。

### “无边框”原则 (The No-Line Rule)
**严禁使用 1px 的实线边框进行区域分割。**
所有的边界必须通过背景色的阶梯式位移来实现。例如：在 `surface` 背景上放置一个 `surface-container-low` 的区块。

### 表面层级与嵌套 (Surface Hierarchy)
利用 `surface-container` 从 Lowest 到 Highest 的梯度来构建“物理深度”：
1.  **Level 0 (Base):** `surface` - 全局大背景。
2.  **Level 1 (Section):** `surface-container-low` - 用于区分大功能模块。
3.  **Level 2 (Card):** `surface-container-lowest` (#ffffff) - 用于最核心的内容承载，营造视觉上的“抬升感”。

### “液态玻璃”法则 (Glass & Gradient)
*   **毛玻璃材质:** 浮动元素（如顶部导航、悬浮菜单）必须使用 `surface-container-lowest` 配合 `backdrop-blur` (高斯模糊)。
*   **灵魂渐变:** 主按钮或英雄区背景应使用 `primary` 到 `primary-container` 的微弱渐变，赋予界面“灵魂”而非生硬的色块。

---

## 3. 字体系统 (Typography)

我们追求的是一种“社论级”的排版质感。通过极端的字号对比（High Contrast Scale）来建立权威感。

*   **Display 层级 (Manrope):** 用于大标题和数字。其几何美感能瞬间提升界面的现代感。
    *   `display-lg`: 3.5rem (56px) - 极简主义的核心宣言。
*   **Headline & Title (Manrope/苹方):** 
    *   标题应具有足够的粗细，体现力量感。
*   **Body 层级 (Inter/苹方):** 
    *   `body-lg` (1rem): 默认正文，行高应保持在 1.6-1.8 倍，确保阅读的通透性。
*   **Label 层级:** 用于辅助信息，需通过 `on-surface-variant` 颜色来降低视觉权重。

---

## 4. 深度与高度 (Elevation & Depth)

层级感不应依赖结构线，而应依赖**色调分层 (Tonal Layering)**。

*   **层级堆叠:** 在 `surface-container-low` 的容器内嵌套 `surface-container-lowest` 的卡片，通过这种自然的明度差产生物理质感。
*   **弥散阴影 (Ambient Shadows):**
    *   禁止使用黑色投影。投影色必须是 `on-surface` 的浅色调（4%-8% 透明度）。
    *   **参数设定:** 模糊值 (Blur) 应设为 30px-60px，营造出物体轻盈悬浮在空气中的感觉。
*   **“幽灵边框” (The Ghost Border):** 
    *   如果必须使用边界（如输入框），请使用 `outline-variant` 令牌，并将透明度设为 10%-20%。严禁使用 100% 不透明的深色边框。

---

## 5. 组件规范 (Components)

### 按钮 (Buttons)
*   **Primary:** 采用 `primary` 色值，圆角固定为 `full` (9999px) 或 `xl` (3rem)，展现极致的圆润。
*   **Secondary:** 采用 `surface-container-highest` 背景，文字颜色为 `on-surface`。

### 输入字段 (Input Fields)
*   背景使用 `surface-container-low`，不设背景线。
*   Focus 状态下，背景变为 `surface-container-lowest`，并伴随一个极细的 `primary` 幽灵边框。

### 卡片与列表 (Cards & Lists)
*   **圆角:** 统一使用 `lg` (2rem) 或 `xl` (3rem)。
*   **间距:** 禁止使用分割线。使用 `spacing-6` (2rem) 或 `spacing-8` (2.75rem) 的垂直留白来区分内容块。

### 交互组件 (Chips & Tooltips)
*   **Chips:** 使用 `surface-container-high`。
*   **Tooltips:** 必须开启毛玻璃效果，背景为半透明的 `surface-container-lowest`。

---

## 6. Do's and Don'ts (设计准则)

### ✅ 鼓励做的 (Do)
*   **拥抱非对称:** 在英雄区或大型卡片排版中，尝试非平衡布局。
*   **大圆角:** 确保所有容器圆角在 24px 以上。
*   **呼吸感:** 给内容留出比平时多 20% 的间距 (Padding)。

### ❌ 严禁做的 (Don't)
*   **禁止直线条:** 除非是极细的幽灵边框，否则界面中不应出现纯黑的 1px 分割线。
*   **禁止拥挤:** 如果一个界面看起来“满”，请删减内容而非缩小间距。
*   **禁止纯黑:** 永远不要在 `#f9f9fe` 背景上使用纯黑色 (`#000000`) 文字，请使用 `on-surface` (#2c333d)。

---

## 7. 结语

本设计系统不仅是为了美观，更是为了创造一种“秩序下的灵动”。作为设计师，请记住：你不是在画框，你是在塑造光影。让界面通透起来，让信息自然地流淌在液态以太之中。```