---
name: wechat-xhs-post
description: "微信公众号文章编排器，复用已有小红书图文素材生成公众号长文。"
---

# wechat-xhs-post: 小红书素材转公众号文章

## 描述
本技能将 `image-cards/` 目录下已生成好的小红书素材（summary.md + 压缩图片）自动编排成图文并茂的公众号文章并发布到草稿箱。

> **注意**：`image-cards/` 是本地项目目录，由其他流程（如 xhs-title-writer）生成。使用本技能前请确保该目录下存在有效主题。

它不从头写稿或生图，而是**复用已有资产**：从小红书风格的 summary.md 中提取内容，扩展为公众号长文，搭配已压缩的图片（自动转 PNG 以兼容微信 API），走标准流水线（去 AI 味 → HTML → 发布）。

## 与 xhs-title-writer 的区别

| 维度 | xhs-title-writer | wechat-xhs-post (本技能) |
|------|-------------------|----------------------|
| 内容来源 | 用户一句话选题，从零写稿 | `image-cards/<topic>/summary.md` 已有素材 |
| 配图 | 从提示词生图 | 复用 `compress/*.webp` 已压缩图片 |
| 写稿 | 按风格文件生成初稿 | 小红书内容**扩展**为公众号长文 |
| 适用场景 | 全新选题 | 已有小红书图文素材，想做公众号版本 |

## 调用方式

```
/wechat-xhs-post <topic-slug>
/wechat-xhs-post <topic-slug> --publish
/wechat-xhs-post <topic-slug> --dry-run
/wechat-xhs-post --list
```

| 参数 | 说明 |
|------|------|
| `<topic-slug>` | `image-cards/` 下的素材目录名（必填，素材来源标识） |
| `--publish` | 跳过 Step 8 的交互式确认，直接发布到草稿箱 |
| `--dry-run` | 只生成文章不发布 |
| `--style <style>` | 公众号文章风格，可选值见下方"风格预设"；不传则交互式询问 |
| `--theme <theme>` | 排版主题（经典/优雅/简洁）；不传则交互式询问 |
| `--color <color>` | 主题色（11 种预设色或任意 hex，中文名映射到对应 hex）；不传则交互式询问 |
| `--title <title>` | 手动指定标题（默认从 `summary.md` 提取，也用于确定输出目录的标题简称） |

> 输出目录 `00-草稿/{YYYYMMDD_标题简称}/` 中的标题简称来自 `summary.md` 主选标题（或 `--title`），与 `<topic-slug>` 无关。

## 前置依赖

本技能不包含图片生成或写稿，依赖以下项目中已有资源：

### 必需资源（image-cards/ 下已有）
```
image-cards/<topic>/
├── summary.md              ← 小红书正文（必选，没有则从其他素材自动写稿）
├── compress/*.webp         ← 已压缩图片（必选）
├── source.md               ← 参考素材（可选，辅助扩展深度）
├── analysis.md             ← 内容分析（可选）
└── outline.md              ← 卡片大纲（可选）
```

### 调用的子技能
- `baoyu-format-markdown` — Markdown 格式化
- `easy-markdown-to-html` — Markdown → 公众号兼容 HTML（doocs/md 引擎）
- `easy-post-to-wechat` — 发布到草稿箱（API 方式）
- `baoyu-compress-image` — 图片压缩（compress/ 之外的原始图）
- `humanizer-zh` — 去除 AI 写作痕迹

## 风格预设

扩写文章前，根据选定的风格决定写作指令。用户可通过 `--style` 指定；不传则在 Step 1 中交互式询问用户选择。排版主题（HTML 视觉风格）与写作风格**相互独立**，在参数解析阶段由用户自由选择（见 Step 1「排版主题选择」）。

### 5 种风格一览

| 风格 | 适用场景 | 写作要点 |
|------|---------|---------|
| `general` | 冷知识、科学解释、通用科普（**默认**） | 客观中立，数据支撑，结构清晰 |
| `deep` | 需要深入探讨的议题、多维度分析 | 多层递进，引用研究，较长篇幅 |
| `warm` | 宠物、情感、生活类、有温度的话题 | 生活化场景，情感共鸣，柔和结尾 |
| `sharp` | 社会现象、观点输出、态度鲜明 | 开门见山，态度明确，节奏快 |
| `fun` | 趣味科普、日常话题、轻松向 | 口语化，类比多，段落短，幽默感 |

### 风格详细定义

#### `general` — 通用科普（默认）

**语气**：客观、有层次，像一个靠谱的朋友在给你讲知识
**结构**：现象引入 → 2-3 个要点展开 → 总结升华
**篇幅**：1500-2500 字
**开头**：用现象或问题引入，制造轻微悬念
**结尾**：总结核心观点 + "点亮在看"/"分享给朋友"
**语言**：通畅自然的中文，去掉 emoji 和网络梗，保留适度口语感
**适合**：知识卡片类内容、冷知识、科学原理

#### `deep` — 深度分析

**语气**：严谨但不掉书袋，像一篇深度报道
**结构**：问题提出 → 背景梳理 → 多层递进分析 → 启发式总结
**篇幅**：2000-3000 字
**开头**：抛出一个值得深思的问题或矛盾
**结尾**：留下思考空间，引导读者讨论
**语言**：可以引用研究数据、历史背景，段落更长，论述更充分
**适合**：社会议题、科技趋势、需要深入拆解的话题

#### `warm` — 温暖叙事

**语气**：温和、有温度，像和一个老朋友聊天
**结构**：生活场景切入 → 故事/知识展开 → 情感升华收尾
**篇幅**：1500-2000 字
**开头**：用一个具体的、有画面感的生活场景引入
**结尾**：温暖的情感收束，引导"点个在看"或"转给朋友"
**语言**：允许适度感性表达，可以用"你"直接和读者对话，节奏舒缓
**适合**：宠物、亲情、成长、生活方式类内容

#### `sharp` — 观点鲜明

**语气**：直接、有态度，不绕弯子
**结构**：反常识钩子 → 核心论点 → 论据强化 → 金句收尾
**篇幅**：1200-1800 字
**开头**：用一个反常识的观点或犀利的判断直接切入
**结尾**：一句有力的金句，引导转发
**语言**：短句为主，节奏快，不拖泥带水，可以有态度输出
**适合**：社会热点、观点输出、认知颠覆类内容

#### `fun` — 轻松有趣

**语气**：轻松、有趣，像在讲一个好玩的事
**结构**：趣味场景 → 知识点拆解 → 趣味互动结尾
**篇幅**：1000-1500 字
**开头**：用一个好玩的场景或类比引入
**结尾**：幽默互动，引导"评论区聊聊"
**语言**：口语化程度最高，允许适度调侃，段落短，节奏轻快
**适合**：日常冷知识、趣味科普、轻松话题

## 工作流全景

```
image-cards/<topic-slug>/
├── summary.md        ──→  Step 2: 读取素材 + 提取标题简称
├── compress/*.webp   ──→  Step 2: 复制图片至输出目录
│
├─ Step 1: 解析输入 → 确定 topic-slug（素材来源标识），验证目录完整性
├─ Step 2: 读取素材 → 解析 summary.md，提取标题简称，创建 00-草稿/{YYYYMMDD_标题简称}/
├─ Step 3: 扩写文章 → 小红书短文案 → 公众号长文
│   ├─ 输出到 00-草稿/{YYYYMMDD_标题简称}/article-raw.md
│   └─ 复制图片至 00-草稿/{YYYYMMDD_标题简称}/images/
├─ Step 4: 格式化 → baoyu-format-markdown
├─ Step 5: 去AI味 → humanizer-zh
├─ Step 6: 图片格式转换 → WebP 全部转 PNG
├─ Step 7: 转HTML → easy-markdown-to-html
├─ Step 8: 发布   → easy-post-to-wechat（到草稿箱）
└─ 完成报告
```

## 输出目录
所有产物统一放在 `00-草稿/{YYYYMMDD_标题简称}/` 目录下：
```
00-草稿/{YYYYMMDD_标题简称}/
├── article.md              ← 配图版终稿（WeChat 公众号长文，图片引用 .png）
├── article.html            ← 公众号兼容 HTML
└── images/                 ← 图片已全部转为 PNG（兼容微信 API）
```

**目录命名规则**：`{YYYYMMDD_标题简称}`
- `YYYYMMDD`：当天日期，如 `20260804`
- `标题简称`：从 `summary.md` 的**主选标题**提取 2-6 个字的核心中文关键词（中文为主，可含英文品牌名）
- 输出目录在 Step 2 读取素材后立即创建（见 Step 2 的"创建输出目录"）
- `<topic-slug>` 仅作为 `image-cards/` 素材来源标识，与输出目录名解耦

## 详细工作流程

### Step 1: 解析输入

从用户消息提取 topic-slug 和 --style 参数：

| 来源 | 示例 |
|------|------|
| 位置参数 | `/wechat-xhs-post <topic-slug>` |
| `--publish` 标志 | `/wechat-xhs-post <topic-slug> --publish` |
| `--dry-run` 标志 | `/wechat-xhs-post <topic-slug> --dry-run` |
| `--style` | `/wechat-xhs-post <topic-slug> --style deep` |
| `--theme` | `/wechat-xhs-post <topic-slug> --theme 优雅` |
| `--color` | `/wechat-xhs-post <topic-slug> --color 翡翠绿` |

**风格解析**：
1. 从 `--style` 参数提取风格名称
2. 如果未传 `--style`，**交互式询问用户**选择风格（使用 `question` 工具），展示 5 种风格及简要说明，让用户选择
3. 合法值：`general` / `deep` / `warm` / `sharp` / `fun`
4. 传入非法值 → **停止**，提示合法值列表
5. 将选定的风格传递给 Step 3（扩写），影响写作指令；排版主题与风格独立，在参数解析阶段另行选择（见下方「排版主题选择」）

**交互式风格选择提示**（未传 `--style` 时弹出）：

```
请选择文章风格：

1. general（通用科普）— 客观中立，数据支撑，结构清晰，默认风格
2. deep（深度分析）— 多层递进，引用研究，深入探讨
3. warm（温暖叙事）— 生活化场景，情感共鸣，适合宠物/情感类
4. sharp（观点鲜明）— 开门见山，态度明确，节奏快
5. fun（轻松有趣）— 口语化，类比多，段落短

输入编号或名称选择：
```

**排版主题选择**（参数解析阶段执行）：若用户未通过 `--theme` 指定，使用 `AskUserQuestion` 交互式询问（参考 md.doocs.org 官网效果），记作 `{theme}`：

| 主题 | 参数值 | 说明 |
|------|-------|------|
| 经典（默认） | `default` | 公众号经典排版，H1 居中带底线、H2 主题色色块、H3 左侧竖线，稳重正式 |
| 优雅 | `grace` | 精致细腻，圆角色块 + 柔和阴影、引用/表格/图片圆角、字号更大 |
| 简洁 | `simple` | 清爽极简，细边框、大留白、H2 不对称圆角、轻量现代 |

**排版主题色选择**（紧接着询问）：若用户未通过 `--color` 指定，使用 `AskUserQuestion` 交互式询问（参考 md.doocs.org 官网 11 种主题色），记作 `{color}`：

| 主题色 | 参数值 | 风格提示 |
|--------|-------|---------|
| 经典蓝（默认） | `#0F4C81` | 通用稳重、知识干货 |
| 翡翠绿 | `#009874` | 成长、自然、环保 |
| 活力橘 | `#FA5151` | 活力、促销、科技感 |
| 柠檬黄 | `#FECE00` | 明快、年轻、吸引注意 |
| 薰衣紫 | `#92617E` | 高级、柔和、女性向 |
| 天空蓝 | `#55C9EA` | 清新、AI、互联网 |
| 玫瑰金 | `#B76E79` | 精致、美妆、女性向 |
| 橄榄绿 | `#556B2F` | 沉稳、文艺、复古 |
| 石墨黑 | `#333333` | 高端、商务、极简 |
| 雾烟灰 | `#A9A9A9` | 低调、素雅 |
| 樱花粉 | `#FFB7C5` | 可爱、少女、温馨 |

> 主题与写作风格（general/deep/warm/sharp/fun）**相互独立**；`{theme}` 与 `{color}` 贯穿 Step 7 转 HTML 与 Step 8 发布，保证预览与发布一致。传给 `easy-markdown-to-html` / `easy-post-to-wechat` 时 `--theme` 用「参数值」列（经典=`default` / 优雅=`grace` / 简洁=`simple`），`--color` 用 hex。

**预检：image-cards/ 目录检查**
1. 检查 `image-cards/` 目录是否存在
2. 如果不存在 → **停止**，提示："`image-cards/` 目录不存在，请先通过其他流程（如 xhs-title-writer）生成小红书素材"
3. 如果存在但为空（无子目录） → **停止**，提示："`image-cards/` 目录下没有可用主题，请先生成素材"
4. 列出 `image-cards/` 下所有子目录供用户参考

**有效性检查**：
1. 检查 `image-cards/<topic>/` 是否存在
2. 如果不存在 → **停止**，提示："主题 `<topic>` 在 `image-cards/` 中不存在。使用 `--list` 查看可用主题列表"
3. 检查 `summary.md` 是否存在（非必需但有最好）
4. 检查 `compress/` 目录是否有 webp 文件
5. 列出所有可用图片及其序号
6. 如果目录不完整：列出缺失产物，询问用户是否仍要继续

**自动补全/选择**：
- 若用户未提供 slug 或使用 `--list`，动态读取 `image-cards/` 下列出所有可选主题供用户选择
- 列出内容基于 `image-cards/` 实际目录，**不包含任何硬编码示例**

**输出目录命名**：
- 输出目录为 `00-草稿/{YYYYMMDD_标题简称}/`（与 `wechat-url-rewriter` 一致）
- `标题简称` 从 `summary.md` 主选标题提取，具体规则见 Step 2 的"创建输出目录"

### Step 2: 读取素材

**读取内容来源**（优先级）：
1. `summary.md` — 主要素材，包含：标题备选、开头钩子、正文（3段式）、互动提问、话题标签、配图说明
2. `source.md` / `source-{topic}.md` — 补充素材，帮助扩展深度
3. `draft.md` — 草稿文件（如有）
4. `analysis.md` — 内容分析，帮助确定文章定位
5. `outline.md` — 卡片大纲，帮助理解文章结构

**读取图片清单**：
```
image-cards/<topic>/compress/
├── 01-cover-xxx.webp     ← 封面图
├── 02-content-xxx.webp   ← 文内图
├── 03-content-xxx.webp
└── ...
```

**分类图片**：
- 序号 `01` 或包含 `cover` → 封面图
- 其他 → 文内插图

记录每张图片的文件名、序号、路径，供后续扩写时内嵌引用。

**创建输出目录**（读取素材后立即执行，在任何文件写入之前）：

1. **提取主选标题**：从 `summary.md` 的标题区找到含"主选"的行，取其冒号后的标题文本。常见格式：
   - `- 主选：为什么吃完饭会困成狗？你的大脑被"血糖"背叛了！`
   - `**主选**：为什么你越想压抑一个念头，大脑就越疯狂地想它？`
2. **提取标题简称**：从主选标题中提取 2-6 个字的核心中文关键词（中文为主，可含英文品牌名），如：
   - `为什么吃完饭会困成狗？...` → `饭后困倦` 或 `血糖困倦`
   - `为什么你越想压抑一个念头...` → `白熊效应`
3. **回退规则**（`summary.md` 缺失或无主选标题时）：
   - 优先用 `--title` 参数提取标题简称
   - 其次用 `<topic-slug>` 中 `_` 后的中文部分（若 topic-slug 本身是 `YYYYMMDD_标题` 格式）
   - 以上都不可用 → 询问用户确认文章标题
4. **创建目录**（必须用 `mkdir -p` 显式创建，不得跳过）：
   ```bash
   # 获取当天日期
   DATE=$(date +%Y%m%d)
   # 创建输出目录（标题简称从主选标题提取中文关键词）
   mkdir -p "00-草稿/${DATE}_{标题简称}/images"
   ```

   **⛔ 目录命名硬性规则**：
   - 输出目录**必须**是 `00-草稿/{YYYYMMDD_标题简称}/` 格式（中文标题简称）
   - **禁止**直接把 `<topic-slug>`（image-cards 英文素材目录名）当作输出目录名，如 `blood-sugar-drowsiness`、`20260802_白熊效应` 都不能直接用作草稿目录名——必须以 `YYYYMMDD_标题简称` 重新命名
   - 配图目录**必须**是 `images/`，**禁止**用 `imgs/`
   - 示例：`blood-sugar-drowsiness` 的 summary.md 主选标题"为什么吃完饭会困成狗？" → 输出目录 `20260804_饭后困倦/`

5. 后续所有步骤的文件输出路径均基于此目录。
6. **执行后立即自检**：运行 `ls 00-草稿/` 确认刚创建的目录是 `YYYYMMDD_中文标题简称` 格式；若不符，立即重命名修正后再继续。

### Step 3: 扩写文章

将小红书风格的短文案扩展为公众号长文。**根据 Step 1 确定的风格**，加载对应的写作指令。

#### 图片分配规则

| 图片序号 | 文中位置 | 作用 |
|---------|---------|------|
| `01-cover-*` | **封面图**（不嵌入正文，作为文章封面） | 视觉吸引 |
| `02-*` | 第一段后 | 配合观点展示 |
| `03-*` | 第二段后 | 配合证据/机制解释 |
| `04-*` | 第三段后 | 配合延伸/对比 |
| `05-*` | 倒数第二段后 | 总结/建议 |
| `06-*` | 结尾前 | 引导互动 |
| `07-*` | 备用 | 按需插入 |

**图片数量不足时**：有几张插几张，不必强求封面 + 多张文内图。至少需有一张封面图。

**图片数量过多时**：选择与内容最相关的 4-6 张，封面图 + 3-5 张文内插图。

#### 输出

- 文件：`00-草稿/{YYYYMMDD_标题简称}/article-raw.md`
- 封面图在 frontmatter 中指定：`cover: images/01-cover-xxx.webp`

#### 风格化扩写指令

根据选定的风格，使用对应的指令模板。**将模板中的 `[原始内容]` 和 `[图片清单]` 替换为实际素材**。

---

**通用模板头**（所有风格共用）：

```
请将以下小红书风格的内容，转换为一篇微信公众号风格的长文。

图片：在合适位置用 `![描述](images/02-xxx.webp)` 标记图片插入点（封面图不嵌入正文）。
封面：在 frontmatter 中指定 `cover: images/01-cover-xxx.webp`。
标题：保留原文主标题或选择一个转化后的版本。

原始内容：
[插入 summary.md 内容]

可用图片清单：
[插入图片映射表需要的信息]
```

---

**`general` 通用科普**（追加指令）：

```
风格要求：
- 篇幅：1500-2500 字
- 结构：现象引入 → 2-3 个要点展开（用 ## 小标题分段）→ 总结升华
- 语气：客观中立，数据支撑，像一个靠谱的朋友在讲知识
- 开头：用现象或问题引入，制造轻微悬念
- 结尾：总结核心观点 + "点亮在看"/"分享给朋友"
- 语言：通畅自然的中文，去掉 emoji 和网络梗，保留适度口语感
```

---

**`deep` 深度分析**（追加指令）：

```
风格要求：
- 篇幅：2000-3000 字
- 结构：问题提出 → 背景梳理 → 多层递进分析（3-4 个 ## 小标题）→ 启发式总结
- 语气：严谨但不掉书袋，像一篇深度报道
- 开头：抛出一个值得深思的问题或矛盾
- 结尾：留下思考空间，引导读者讨论
- 语言：可以引用研究数据、历史背景，段落更长，论述更充分
```

---

**`warm` 温暖叙事**（追加指令）：

```
风格要求：
- 篇幅：1500-2000 字
- 结构：生活场景切入 → 故事/知识展开（2-3 个 ## 小标题）→ 情感升华收尾
- 语气：温和、有温度，像和一个老朋友聊天
- 开头：用一个具体的、有画面感的生活场景引入
- 结尾：温暖的情感收束，引导"点个在看"或"转给朋友"
- 语言：允许适度感性表达，可以用"你"直接和读者对话，节奏舒缓
```

---

**`sharp` 观点鲜明**（追加指令）：

```
风格要求：
- 篇幅：1200-1800 字
- 结构：反常识钩子 → 核心论点 → 论据强化（2 个 ## 小标题）→ 金句收尾
- 语气：直接、有态度，不绕弯子
- 开头：用一个反常识的观点或犀利的判断直接切入
- 结尾：一句有力的金句，引导转发
- 语言：短句为主，节奏快，不拖泥带水，可以有态度输出
```

---

**`fun` 轻松有趣**（追加指令）：

```
风格要求：
- 篇幅：1000-1500 字
- 结构：趣味场景 → 知识点拆解（2 个 ## 小标题）→ 趣味互动结尾
- 语气：轻松、有趣，像在讲一个好玩的事
- 开头：用一个好玩的场景或类比引入
- 结尾：幽默互动，引导"评论区聊聊"
- 语言：口语化程度最高，允许适度调侃，段落短，节奏轻快
```

### Step 4: 格式化

调用 `baoyu-format-markdown` 技能：

```bash
bun run .agents/skills/baoyu-format-markdown/scripts/main.ts \
  00-草稿/{YYYYMMDD_标题简称}/article-raw.md
```

输出：`article-raw-formatted.md`

执行者将格式化后的文件重命名为 `article.md`（覆盖同目录下的 `article.md`），后续步骤以 `article.md` 为输入。

```bash
mv 00-草稿/{YYYYMMDD_标题简称}/article-raw-formatted.md \
   00-草稿/{YYYYMMDD_标题简称}/article.md
```

### Step 5: 去 AI 味（必选）

加载 `/humanizer-zh` 技能处理 `article.md`：

1. 读取 `article.md` 全文
2. 逐段扫描 AI 模式：三段式法则、AI 词汇、破折号过度使用、夸大的象征意义、否定式排比等
3. 重写问题片段，保留核心信息和语气
4. 将处理结果写回 `article.md`

> 去 AI 味是**必选步骤**，所有公众号文章必须经过此处理。

### Step 6: 图片格式转换（WebP → PNG）

微信 API 不支持 WebP 格式的图片上传（封面图会报 `40113: unsupported file type`），此步骤将所有 WebP 图片转为 PNG：

**操作流程**：

```bash
# 批量转换 images/ 目录下所有 webp 为 png
for img in 00-草稿/{YYYYMMDD_标题简称}/images/*.webp; do
  bun run .agents/skills/baoyu-compress-image/scripts/main.ts \
    "$img" -f png --keep
done
```

**执行后**：
- `images/` 下同时存在 `.webp` 和 `.png` 文件（`--keep` 保留原文件）
- 扫描 `images/` 目录，建立新旧文件名映射

**更新文章中的图片引用**：

将 `article.md` 中的所有图片路径从 `.webp` 改为 `.png`：

```bash
# 替换 article.md 中所有图片引用从 .webp 改为 .png
# 覆盖三种情况：正文图片、frontmatter cover、frontmatter 引号包裹的值
sed -i '' 's/\.webp)/.png)/g' 00-草稿/{YYYYMMDD_标题简称}/article.md
sed -i '' 's/\.webp"/.png"/g' 00-草稿/{YYYYMMDD_标题简称}/article.md
sed -i '' 's/\.webp$/.png/' 00-草稿/{YYYYMMDD_标题简称}/article.md
```

> 使用 `sed` 或逐行编辑工具完成替换，确保 cover frontmatter 和正文中的图片引用都被更新。

### Step 7: 转 HTML

调用 `easy-markdown-to-html` 技能：

```bash
bun run .agents/skills/easy-markdown-to-html/scripts/main.ts \
  00-草稿/{YYYYMMDD_标题简称}/article.md \
  --theme {theme} \
  --color {color}
```

- `{theme}` 已在 Step 1 选择（经典=`default` / 优雅=`grace` / 简洁=`simple`），与写作风格独立
- `{color}` 已在 Step 1 选择（11 种主题色 hex，默认 `#0F4C81` 经典蓝）
- **标题处理**：easy 系列默认保留正文首个 `# 标题`（不再用 `--keep-title`）；若不想正文重复大标题，可手动删掉开头 H1（公众号标题由发布环节 `--title` 控制）
- 输出：`00-草稿/{YYYYMMDD_标题简称}/article.html`

### Step 8: 发布到公众号草稿箱

**交互式确认**（必须执行，`--publish` 时跳过此步）：

在执行发布前，使用 `question` 工具询问用户：

```
文章已就绪，请选择下一步操作：

1. 发布到草稿箱 — 调用 API 提交到微信公众号草稿箱
2. 预览 HTML — 只生成不发布，打开 article.html 检查效果
3. 跳过发布 — 跳过此步骤，产物保留在 00-草稿/ 目录

请选择（1/2/3）：
```

| 选项 | 行为 |
|------|------|
| **1. 发布到草稿箱** | 执行下方 API 命令，提交到草稿箱 |
| **2. 预览 HTML** | 不调用 API，提示用户打开 `00-草稿/{YYYYMMDD_标题简称}/article.html` 查看效果 |
| **3. 跳过发布** | 跳过此步骤，直接进入 Step 9 完成报告 |

**`--publish` 参数**：跳过交互式确认，直接执行发布。

**发布命令**：

调用 `easy-post-to-wechat` 技能：

```bash
# API 方式（唯一，需配置 WECHAT_APP_ID + WECHAT_APP_SECRET；凭证缺失或本机 IP 未加白名单会报错，报 40164 即白名单问题）
bun run .agents/skills/easy-post-to-wechat/scripts/main.ts \
  00-草稿/{YYYYMMDD_标题简称}/article.html \
  --thumb 00-草稿/{YYYYMMDD_标题简称}/images/01-cover-xxx.png \
  --title "{文章标题}"
```

> 发布前先 `--dry-run` 预览（渲染 + 图片扫描 + 标题提取，不发网络请求），确认标题、摘要、封面、图片无误后再正式发布。

**元数据配置**：
- 封面图：使用 `images/01-cover-xxx.png`（已从 WebP 转换）
- 标题：从 article.md frontmatter 或 summary.md 中提取
- 摘要：自动从文章前 120 字截取

### Step 9: 完成报告

```
✅ Image Cards → 公众号 完成！

文章标题: <主选标题>
素材来源: image-cards/<topic-slug>/
  ├─ summary.md ✓（3 段式内容）
  └─ compress/  ✓（N 张压缩图）

输出目录: 00-草稿/{YYYYMMDD_标题简称}/
  ├─ article.md        ← 公众号长文（含图片引用）
  ├─ article.html      ← 公众号兼容 HTML
  └─ images/           ← 共 N 张图片

风格: <style>（<风格描述>）
发布状态: [已保存到草稿箱 / 已发布 / --dry-run 未发布]
```

## 话题自动补全

如果 `image-cards/<topic>/` 缺少 `summary.md`，但有其他素材（如 `source.md`、`draft.md`、`outline.md`、`analysis.md` 等），按以下策略处理：

1. 读取所有可用素材
2. 将素材内容 + 图片清单发给 AI 模型
3. 让 AI 根据素材自动写一篇公众号风格的文章
4. 在报告中标记为"AI 根据素材自动生成"

## 图片处理策略

### 总体流程

所有图片最终统一为 PNG 格式（微信 API 不支持 WebP）：

```
image-cards/<topic>/compress/*.webp
    ↓ Step 2/3: 复制到 00-草稿/{YYYYMMDD_标题简称}/images/
00-草稿/{YYYYMMDD_标题简称}/images/*.webp
    ↓ Step 6: 批量转 PNG + 更新文章引用
00-草稿/{YYYYMMDD_标题简称}/images/*.png  ← 最终发布用的图片
```

### 已有 compress/*.webp 的情况（最常见）
1. 复制到 `00-草稿/{YYYYMMDD_标题简称}/images/`
2. Step 6 中统一转换为 PNG，并更新 `article.md` 中的图片引用路径

### 仅原始 PNG/JPG 的情况（无需转换）
- 直接复制到 `00-草稿/{YYYYMMDD_标题简称}/images/`
- 已在 PNG 格式，跳过 Step 6 的格式转换

### 图片文件名映射表

在 Step 2 读取图片后，建立文件名映射：

| 序号 | 源文件 | 目标文件 | 在文中用途 |
|-----|--------|---------|----------|
| 1 | compress/01-cover-xxx.webp | images/01-cover-xxx.webp | 封面图 |
| 2 | compress/02-content-xxx.webp | images/02-content-xxx.webp | 文内图 |
| ... | ... | ... | ... |

映射表写入 `00-草稿/{YYYYMMDD_标题简称}/images/README.md`，方便追踪。

## 快速开始示例

```bash
# 列出所有可用主题
/wechat-xhs-post --list

# 选择一个 topic 处理（默认 general 风格）
/wechat-xhs-post <topic-slug>

# 指定风格
/wechat-xhs-post <topic-slug> --style warm
/wechat-xhs-post <topic-slug> --style deep --publish
/wechat-xhs-post <topic-slug> --style sharp --dry-run

# 仅生成不发布
/wechat-xhs-post <topic-slug> --dry-run
```

## 主题快速选择（--list 模式的输出）

当用户不带参数或使用 `--list` 时，**动态扫描** `image-cards/` 目录，列出所有实际存在的主题子目录：

```
可用主题（共 N 个）：

1. <topic-slug-1>     — 读取 summary.md 第一行或目录名
2. <topic-slug-2>     — 读取 summary.md 第一行或目录名
3. ...
N. <topic-slug-N>     — 读取 summary.md 第一行或目录名

输入编号或 topic-slug 选择，或直接输入：/wechat-xhs-post <topic-slug>
```

> 列表内容完全基于 `image-cards/` 实际目录结构，**不使用任何预设或硬编码示例**。如果列表为空，说明 `image-cards/` 下没有可用主题，提示用户先通过其他流程生成素材。

## 注意事项
- `summary.md` 是**首选内容源**，如果不存在会尝试用其他素材自动写稿
- 图片仅从 `compress/` 复制，不会重新生成
- 所有图片最终转为 PNG 格式（微信 API 不支持 WebP），`article.md` 中的图片引用会自动更新
- 如果 `compress/` 为空但存在原始 PNG/JPG，直接复制使用，无需额外转换
- 去 AI 味（humanizer-zh）是**必选步骤**，所有文章必须经过此处理
- 扩写后的文章建议快速通读一遍，调整图片位置
- `--dry-run` 模式在 Step 8（发布）前停止
- 发布默认停在确认前（除非指定 `--publish`）
- 本技能不修改 `image-cards/` 下的原始文件，所有产物在 `00-草稿/` 中
