---
name: wechat-url-rewriter
description: |
  公众号仿写技能 - 从博客链接到可发布的公众号图文。
  自动抓取博客内容和图片，补充官网权威资料，融合两者按指定风格重写原创文章。
  支持9种文风：生动科普、技术干货、深度分析、纪实叙事、治愈温柔、观点鲜明、轻松有趣、口语唠嗑、玩梗沙雕。
  排版支持 3 种主题（经典/优雅/简洁）+ 11 种主题色，未指定时交互式选择（默认经典 + 经典蓝）。
  可选自动发布到公众号草稿箱，支持交互式确认。
  当用户提到"仿写"、"参考这篇博客"、"改写成公众号"、"copywrite + URL"、"抓取链接写文章"时使用。
metadata:
  author: sisyphus
  version: "1.2.0"
  dependencies:
    - baoyu-url-to-markdown
    - easy-markdown-to-html
    - easy-post-to-wechat
    - humanizer-zh
    - baoyu-compress-image
    - baoyu-cover-image
    - baoyu-image-gen
---

# 公众号仿写技能 (wechat-url-rewriter)

从博客链接到可发布的公众号图文，一键完成抓取、补充、重写、排版。

## 工作流全景

```
用户输入: "仿写 https://xxx.blog"
  │
  ├─ Step 0: 参数解析 → 提取 URL、交互式选择风格、询问是否抓图、确定输出目录
  ├─ Step 1: 抓取博客 → baoyu-url-to-markdown
  │           ├─ 抓原图模式: 内容 + 图片下载 + 完整HTML保存 + 内嵌 SVG 转 PNG（降级: webfetch + curl）
  │           └─ AI配图模式: 仅抓文本内容（不下载图片）
  ├─ Step 2: 识别关键概念 → 提取核心术语、产品名、技术点
  ├─ Step 3: 补充资料 → 搜索官网、交叉校验、补充权威信息
  ├─ Step 4: 重写文章 → 融合两源内容，按指定风格创作
  ├─ Step 5: 图片排版 → 封面图生成 + （抓原图模式: 引用原图 / AI配图模式: AI 生成配图）
  ├─ Step 6: 输出成品 → Markdown + 公众号兼容 HTML
  └─ Step 7: 发布草稿 → easy-post-to-wechat（API）→ 确认发布
```

## 参数说明

| 调用方式 | 示例 |
|---------|------|
| 基础调用 | `/wechat-url-rewriter https://xxx.blog` |
| 指定风格 | `/wechat-url-rewriter https://xxx.blog --style 生动科普` |
| 指定主题 | `/wechat-url-rewriter https://xxx.blog --theme 优雅` |
| 指定主题色 | `/wechat-url-rewriter https://xxx.blog --color 翡翠绿` |
| 指定目录 | `/wechat-url-rewriter https://xxx.blog --output ./my-draft/` |
| 直接发布 | `/wechat-url-rewriter https://xxx.blog --publish` |
| 仅生成 | `/wechat-url-rewriter https://xxx.blog --dry-run` |
| 全参数 | `/wechat-url-rewriter https://xxx.blog --style 技术干货 --output ./draft/ --no-images --publish` |

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<url>` | 博客链接（必填） | - |
| `--style <风格>` | 指定文风 | `生动科普` |
| `--theme <主题>` | 指定排版主题（经典/优雅/简洁） | `经典` |
| `--color <颜色>` | 指定主题色（11 种预设色名或任意 hex，如 `#E60000`） | `经典蓝` |
| `--output <目录>` | 输出目录 | `00-草稿/{YYYYMMDD_标题简称}/` |
| `--no-images` | 不抓取博客图片（后续由 AI 生成配图） | `false` |
| `--no-humanize` | 跳过去 AI 味 | `false` |
| `--publish` | 跳过确认直接发布到草稿箱 | `false` |
| `--dry-run` | 仅生成不发布 | `false` |

## Step 0: 参数解析与风格选择

### 0.1 解析用户输入

从用户消息中提取以下信息：

| 输入来源 | 提取方式 |
|---------|---------|
| `--style <风格>` | 取 `--style` 后面的风格名称 |
| `--theme <主题>` | 取 `--theme` 后面的主题名（经典/优雅/简洁） |
| `--color <颜色>` | 取 `--color` 后面的主题色（11 种预设色名或任意 hex，中文名映射到对应 hex） |
| `--output <目录>` | 取 `--output` 后面的目录路径 |
| `--publish` | 标记为直接发布模式 |
| `--dry-run` | 标记为仅生成模式 |
| 位置参数 | 提取 URL（第一个 http/https 开头的字符串） |

### 0.2 交互式风格选择

**当用户未指定 `--style` 参数时**，使用 `AskUserQuestion` 询问用户选择风格：

| 序号 | 风格 | 说明 |
|------|------|------|
| 1 | 生动科普（推荐） | 活泼形象，故事化开头，适合技术概念解释 |
| 2 | 技术干货 | 专业精炼，问题→方案→步骤，适合教程 |
| 3 | 深度分析 | 理性客观，现象→原因→趋势，适合行业分析 |
| 4 | 纪实叙事 | 温暖真实，时间线推进，适合人物故事 |
| 5 | 治愈温柔 | 柔和共情，场景→感受→治愈，适合情感类 |
| 6 | 观点鲜明 | 锐利直接，观点→论据→呼吁，适合评论 |
| 7 | 轻松有趣 | 幽默轻松，段子→知识点，适合娱乐科普 |
| 8 | 口语唠嗑 | 随意亲切，闲聊→吐槽→分享，适合日常分享 |
| 9 | 玩梗沙雕 | 搞笑玩梗，梗→知识→梗，适合年轻受众 |

### 0.3 交互式排版主题

**当用户未通过 `--theme` 参数指定主题时**，使用 `AskUserQuestion` 询问（参考 md.doocs.org 官网效果）：

| 主题 | 参数值 | 说明 | 视觉特点 |
|------|-------|------|---------|
| 经典（默认） | `default` | 公众号经典排版 | H1 居中带底线、H2 主题色色块、H3 左侧竖线，稳重正式 |
| 优雅 | `grace` | 精致细腻 | 圆角色块 + 柔和阴影、引用/表格/图片圆角、字号更大 |
| 简洁 | `simple` | 清爽极简 | 细边框、大留白、H2 不对称圆角、轻量现代 |

**`{theme}` 变量贯穿后续步骤**：Step 6.1 转 HTML 与 Step 7.2 发布均使用此主题。传给 `easy-markdown-to-html` 的 `--theme` 用「参数值」列（经典=`default` / 优雅=`grace` / 简洁=`simple`）。

### 0.4 交互式主题色

**当用户未通过 `--color` 参数指定主题色时**，使用 `AskUserQuestion` 询问，主题色参考 md.doocs.org 官网的 11 种预设色：

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

**AskUserQuestion 单题最多 4 个选项**：主选项放 `经典蓝（推荐）`、`翡翠绿`、`活力橘`、`薰衣紫`，并在问题描述里列出完整 11 色表；用户想要其它色直接选 Other 输入色名（如"天空蓝"）或 hex（如 `#55C9EA`）。

**`{color}` 变量贯穿后续步骤**：Step 6.1 转 HTML 使用此主题色，未选则默认 `#0F4C81` 经典蓝。传给 `easy-markdown-to-html` 的 `--color` 用「参数值」列的 hex。

### 0.5 交互式图片模式

**当用户未指定 `--no-images` 参数时**，使用 `AskUserQuestion` 询问：

| 选项 | 后续影响 |
|------|---------|
| 需要抓取图片（推荐） | Step 1 下载博客图片 + SVG 转 PNG；Step 5 优先引用原图 |
| 不需要，AI 配图 | Step 1 仅抓取文本；Step 5 全部由 AI 生成配图 |

### 0.6 生成输出目录名称

**命名规则**：`{YYYYMMDD_标题简称}`
- `YYYYMMDD`：当天日期，如 `20260802`
- `标题简称`：从博客标题提取 2-6 个字的中文关键词（纯中文，不含英文品牌名）

**示例**：
| 博客标题 | 生成的目录名 |
|---------|-------------|
| RAG: Retrieval-Augmented Generation | `20260803_RAG知识检索` |
| Codex Deepseek 配置 — 通过 CC Switch 中转 | `20260802_DeepSeek安装配置` |
| React 18 新特性详解 | `20260802_React18新特性` |

### 0.7 创建输出目录

**Step 1 开始时必须立即执行**：

```bash
DATE=$(date +%Y%m%d)
mkdir -p "00-草稿/${DATE}_{标题简称}/images"
mkdir -p "00-草稿/${DATE}_{标题简称}/original"
```

### 0.8 参数解析完成

解析完成后，输出确认信息：

```
📋 参数解析完成

URL: https://xxx.blog
风格: 生动科普
排版主题: 经典
主题色: 经典蓝
图片模式: 抓原图
输出目录: 00-草稿/20260802_DeepSeek安装配置/
发布模式: 询问确认

开始执行...
```

## Step 1: 抓取博客

> **前置条件**：Step 0.7 的 `mkdir -p` 已执行，目录已创建。

### 1.1 主方案：baoyu-url-to-markdown

使用 `baoyu-url-to-markdown` 抓取博客内容：

```bash
DIR="00-草稿/${DATE}_{标题简称}"
BAOYU_FETCH=".agents/skills/baoyu-url-to-markdown/scripts/baoyu-fetch"

# 抓原图模式：抓取内容 + 下载图片
$BAOYU_FETCH <url> --output "${DIR}/original/article.md" --download-media

# AI配图模式：仅抓取文本内容，不下载图片
# $BAOYU_FETCH <url> --output "${DIR}/original/article.md"
```

### 1.2 降级方案：webfetch + 图片下载 + SVG 提取

**仅 `抓原图` 模式执行**。当 `baoyu-url-to-markdown` 失败（reCAPTCHA、JS 渲染等）时，使用降级方案。

**⚠️ 重要**：降级方案必须完成以下 5 个步骤：

**步骤 A：用 webfetch 获取 HTML 内容**

必须使用 `format: html` 而非 `format: markdown`，因为 markdown 格式会丢失图片 URL。

**步骤 B：保存完整 HTML 到文件（关键步骤）**

`extract-svg.ts` 脚本需要从**文件**读取 HTML，不能直接使用 webfetch 返回的字符串。必须将完整 HTML 保存到 `${DIR}/original/full.html`。

```bash
# Windows (PowerShell) - 使用 Invoke-WebRequest 下载完整页面
Invoke-WebRequest -Uri "<url>" -OutFile "${DIR}/original/full.html"

# macOS/Linux - 使用 curl 下载
curl -s -o "${DIR}/original/full.html" "<url>"
```

**⚠️ 注意**：不要使用简化版 HTML！必须是包含所有 `<svg>` 标签的完整页面 HTML。

**步骤 C：从 HTML 提取图片 URL 并下载**

- C1：提取 `<img>` 标签中的图片 URL（排除 base64 内联图片、1x1 追踪像素）
- C2：下载图片到 images/ 目录
- C3：webp 格式转换为 png（公众号不支持 webp）

```bash
# webp 转 png
.venv/Scripts/python -c "
from PIL import Image
img = Image.open('${DIR}/images/<文件名>.webp')
img.save('${DIR}/images/<文件名>.png', 'PNG')
"
```

**步骤 D：提取内嵌 SVG 并转 PNG**

使用步骤 B 保存的完整 HTML 文件：

```bash
bun run .agents/skills/wechat-url-rewriter/scripts/extract-svg.ts \
  "${DIR}/original/full.html" \
  "${DIR}/images" \
  --prefix arch
```

处理流程：提取 `<svg>` 元素 → 替换 CSS 变量 → 添加白色背景 + 中文字体 → 用 sharp 转 PNG

输出 JSON 格式（stdout）：`{ totalSVGs, converted, skipped, files: [{name, width, height}], errors: [] }`

**步骤 E：更新 article.md 图片引用**

在 `article.md` 的相应位置添加图片引用，确保图文对应：

**1. 分析图片类型和位置**
- **外部图片**（jpg/png/webp）：通常是文章配图、截图、示意图
- **内嵌 SVG 转换图**（arch-N.png）：通常是架构图、流程图、图表

**2. 确定图片插入位置**
- **架构图/流程图**：放在介绍相应概念的段落之后
- **示例图**：放在代码示例或说明之后
- **截图**：放在相关功能介绍之后
- **数据图表**：放在数据分析或结论之前

**3. 编写图片描述**
- 优先使用原始 HTML 中的 `alt` 文本
- 如果没有 `alt` 文本，编写简洁准确的中文描述
- 描述应概括图片内容，帮助读者理解

**4. 添加图片引用**
在 `article.md` 的相应位置添加：
```markdown
![图片描述](images/文件名.png)
```

**示例**：
```markdown
LangChain 的核心组件包括模型接口、提示词模板、链、记忆、检索和代理。

![LangChain 架构图](images/536b7d75-c1a2-4b0e-a28f-92e029fa7578.png)

这些组件通过 LCEL 语法连接...

![LCEL 流程图](images/arch-2.png)
```

### 1.3 质量检查

抓取后检查内容完整性：

- [ ] 文章标题是否完整
- [ ] 正文内容是否丢失
- `抓原图` 模式额外检查：
  - [ ] 图片是否全部下载（检查 `${DIR}/images/` 目录）
  - [ ] 完整 HTML 是否已保存（`${DIR}/original/full.html` 应存在且非空）
  - [ ] 内嵌 SVG 是否已转换为 PNG（运行 `extract-svg.ts` 后检查输出 JSON 的 `converted` 字段）
  - [ ] 图片引用路径是否正确（article.md 中的图片路径指向实际存在的文件）

## Step 2: 识别关键概念

从抓取的博客内容中提取：

1. **核心概念**：文章讨论的主要技术/产品/理论
2. **产品名称**：涉及的具体产品、工具、服务
3. **技术术语**：专业术语、缩写、新概念
4. **数据引用**：文章中引用的数据、统计、研究

**输出格式**（写入 `${DIR}/concepts.md`）：

```markdown
# 关键概念提取

## 核心概念
- [概念1]：简要说明

## 涉及产品
- [产品名]：官网 URL（如果能识别）

## 技术术语
- [术语1]：解释

## 需要补充的信息
- [ ] 关于 XX 的官方定义
```

## Step 3: 补充资料

针对 Step 2 识别的关键概念，自动搜索补充资料：

1. **搜索官网**：找到相关产品的官方网站
2. **交叉校验**：对比博客内容与官方描述，标记差异
3. **补充权威信息**：从官网提取官方定义、特性说明、数据

**搜索策略**：产品名 + "official site" / 概念名 + "definition" / 技术术语 + "documentation"

**输出**：写入 `${DIR}/sources.md`

## Step 4: 重写文章

融合博客内容和官网资料，按指定风格重写原创文章。

### 4.1 读取风格规范

根据 `--style` 参数，读取对应的风格规范文件：

| 风格 | 规范文件 |
|------|---------|
| 生动科普 | `references/styles/sheng-dong-ke-pu.md` |
| 技术干货 | `references/styles/ji-shu-gan-huo.md` |
| 深度分析 | `references/styles/shen-du-fen-xi.md` |
| 纪实叙事 | `references/styles/ji-shi-xu-shi.md` |
| 治愈温柔 | `references/styles/zhi-yu-wen-rou.md` |
| 观点鲜明 | `references/styles/guan-dian-xian-ming.md` |
| 轻松有趣 | `references/styles/qing-song-you-qu.md` |
| 口语唠嗑 | `references/styles/kou-yu-lao-ka.md` |
| 玩梗沙雕 | `references/styles/wan-geng-sha-diao.md` |

### 4.2 融合重写

**融合原则**：
- **主线逻辑**：保持博客的核心论点和逻辑框架
- **信息增强**：用官网权威信息补充/修正博客内容
- **原创表达**：用完全不同的表达方式重写，避免照搬原文句式
- **风格一致**：全文保持指定风格的语气和结构
- **图片保留**：保留原文章的关键图片，在重写的文章中相应位置添加图片引用

**图片处理要点**：

1. **分析原文章图片**：查看 `original/full.html` 或原始 markdown，识别所有图片及其位置
2. **筛选关键图片**：选择对文章理解有帮助的图片（架构图、流程图、示例图等）
3. **确定插入位置**：根据图片内容，在重写的文章中找到合适的插入点
4. **编写图片描述**：使用原始 `alt` 文本或编写新的简洁描述
5. **添加图片引用**：在相应位置添加 `![描述](images/文件名.png)`

**注意**：Step 4 生成的 `article.md` 应包含图片引用，Step 5 会进一步处理图片排版。

### 4.3 去 AI 味（可选）

如果未指定 `--no-humanize`，调用 `humanizer-zh` 处理。

**注意**：纪实叙事、口语唠嗑、玩梗沙雕风格可能不需要去 AI 味。

## Step 5: 图片排版

### 5.1 封面图生成（必须）

每篇文章都需要封面图。调用 `baoyu-cover-image` 技能：

```bash
# 生成封面图（默认参数）
# --type hero --aspect 16:9 --text title-only --lang zh --quality normal --quick
# 保存到 ${DIR}/images/cover.png
```

### 5.2 封面图压缩（必须）

```bash
bun run .agents/skills/baoyu-compress-image/scripts/main.ts \
  ${DIR}/images/cover.png
```

### 5.3 引用原图（仅 `抓原图` 模式）

**`AI配图` 模式跳过本步，直接进入 5.4。**

将 Step 1 下载的博客原图和 SVG 转换图在 `article.md` 中引用：

**1. 图片位置规则**

| 图片类型 | 推荐位置 | 说明 |
|---------|---------|------|
| 架构图/流程图 | 介绍相应概念的段落之后 | 帮助读者理解抽象概念 |
| 示例图 | 代码示例或说明之后 | 直观展示代码效果 |
| 截图 | 相关功能介绍之后 | 展示实际界面或操作 |
| 数据图表 | 数据分析或结论之前 | 支撑论点 |
| 封面图 | 文章开头（自动添加） | 由 `baoyu-cover-image` 生成 |

**2. 图片描述规则**

- 优先使用原始 HTML 中的 `alt` 文本
- 如果没有 `alt` 文本，编写简洁准确的中文描述
- 描述应概括图片内容，帮助读者理解
- 避免过长的描述，保持简洁

**3. 图片引用格式**

```markdown
![图片描述](images/文件名.png)
```

**4. 示例：多张图片的排列**

```markdown
## LangChain 的核心组件

LangChain 把构建 AI 应用需要的组件分成了六大类：

![LangChain 组件架构图](images/arch-1.png)

### 1. 模型接口（Models）

这是最基础的部分...

### 2. 提示词模板（Prompts）

光有大脑还不够...

![LCEL 流程图](images/arch-2.png)

LCEL 使用管道符连接各组件...
```

### 5.4 文内配图（按图片模式）

#### `抓原图` 模式：AI 补充配图（可选）

当原博客图片数量不足（少于 2 张）或缺少关键段落配图时：

1. 调用 `baoyu-article-illustrator` 分析文章结构
2. 确定每张图的 Type × Style × Palette 三维度
3. 调用 `baoyu-image-gen` 批量生成补充配图（Provider 优先级：openai → dashscope → google）
4. 图片保存到 `images/` 目录，更新 `article.md`

#### `AI配图` 模式：AI 生成全部配图（必须）

**文章没有可用原图，全部文内配图由 AI 生成**：

1. 调用 `baoyu-article-illustrator` 分析文章结构，识别需要配图的位置
2. 配图提示词写入 `${DIR}/image-prompts.md`
3. 调用 `baoyu-image-gen` 批量生成（至少 2 张文内图）
4. 图片保存到 `${DIR}/images/` 目录，替换 `article.md` 中的占位符

### 5.5 图片压缩（可选）

如需压缩文内图片（单张 > 500KB），调用 `baoyu-compress-image`。

## Step 6: 输出成品

### 6.1 转换 HTML

```bash
bun run .agents/skills/easy-markdown-to-html/scripts/main.ts \
  ${DIR}/article.md \
  --theme {theme} \
  --color {color}
```

> `{theme}` 传 Step 0.3 选定的参数值（经典=`default` / 优雅=`grace` / 简洁=`simple`）；`{color}` 传 Step 0.4 选定的主题色 hex（11 种预设色或任意 hex，默认 `#0F4C81` 经典蓝）。**注意**：doocs/md 渲染默认保留正文首个 `# 标题`，正文里的 H1 会原样出现在渲染结果中——**发布环节（Step 7 的 `easy-post-to-wechat`）在标题由 `--title` 提供时会自动剥离正文开头的重复 H1，无需手动删除**；若最终交付的是 HTML 而非发布，且不想正文带大标题，再手动删掉开头 H1。

### 6.2 最终输出

```
00-草稿/20260802_Claude使用技巧/
├── article.md              # Markdown 源文件
├── article.html            # 公众号兼容 HTML
├── image-prompts.md        # 配图提示词（AI 配图模式必须有）
├── images/                 # 图片目录
│   ├── cover.png           # 封面图
│   ├── image1.jpg          # 博客原图（抓原图模式）
│   ├── arch-1.png          # 内嵌 SVG 转换（抓原图模式，如有）
│   └── image2.png          # AI 生成配图
├── original/               # 原始抓取内容
│   ├── article.md
│   └── images/             # 抓原图模式才有下载的图片
├── sources.md              # 参考资料来源
└── concepts.md             # 关键概念提取
```

## Step 7: 发布到公众号草稿箱

### 7.1 发布前确认

在发布前，使用 `AskUserQuestion` 询问用户是否确认发布：

- **确认发布**：继续执行发布流程
- **修改文章**：返回 Step 4 修改文章内容
- **取消发布**：结束流程，保留本地文件

### 7.2 执行发布

**API 方式（唯一）**：检测 `.baoyu-skills/.env` 中是否存在 `WECHAT_APP_ID` + `WECHAT_APP_SECRET`：

```bash
# API 方式
bun run .agents/skills/easy-post-to-wechat/scripts/main.ts \
  ${DIR}/article.html \
  --thumb ${DIR}/images/cover.png \
  --title "{文章标题}"
```

> HTML 已在 Step 6 渲染好主题，直接发布即可。正文本地图片会自动上传替换为微信永久 URL；封面显式传 `--thumb`（封面图不在正文中时必传）。可用 `--dry-run` 先预览（渲染 + 图片扫描 + 标题提取，不发网络请求）。

**发布前先 `--dry-run` 预览**：确认标题、摘要、图片、封面无误后再正式发布。

**自动发布模式**（`--publish`）：直接调用 API 发布，不打断确认。API 不可用时报错停止。

> **v1 说明**：`easy-post-to-wechat` 目前仅支持 API 方式，暂不支持浏览器发布（v2 规划）。若 API 不可用，先排查 `.baoyu-skills/.env` 凭证与本机 IP 是否已加入公众号后台 IP 白名单（报 `40164` = 白名单未放行）。

### 7.3 发布结果反馈

**成功**：
```
✅ 已成功发布到公众号草稿箱！

文章标题：{标题}
media_id: {media_id}

请登录微信公众号后台查看并发布。
```

**失败**：
```
❌ 发布失败：{错误原因}

可能的解决方案：
1. 检查 WECHAT_APP_ID 和 WECHAT_APP_SECRET 是否配置正确
2. 确认本机 IP 已加入公众号后台 IP 白名单（报 `40164` 即此问题）
3. 确认公众号是否有发布权限

是否重试？
```

## 风格速查

| 风格 | 语气 | 结构 | 适用场景 |
|------|------|------|---------|
| 生动科普 | 活泼、形象 | 故事化开头→原理讲解→实际应用→总结 | 技术概念解释、新事物介绍 |
| 技术干货 | 专业、精炼 | 问题→方案→步骤→代码→总结 | 教程、技术方案、工具介绍 |
| 深度分析 | 理性、客观 | 现象→原因→影响→趋势→建议 | 行业分析、趋势解读 |
| 纪实叙事 | 温暖、真实 | 时间线→人物→事件→感悟 | 人物故事、公司历史、事件回顾 |
| 治愈温柔 | 柔和、共情 | 场景→感受→思考→治愈→希望 | 情感类、心理类、生活感悟 |
| 观点鲜明 | 锐利、直接 | 观点→论据→反驳→强化→呼吁 | 评论、观点表达、争议话题 |
| 轻松有趣 | 幽默、轻松 | 段子→知识点→段子→总结 | 娱乐科普、轻松话题 |
| 口语唠嗑 | 随意、亲切 | 闲聊→吐槽→分享→总结 | 日常分享、个人体验 |
| 玩梗沙雕 | 搞笑、玩梗 | 梗→知识→梗→总结 | 年轻受众、网络热点 |

## 依赖技能调用顺序

```
0. [参数解析] 提取URL、交互式选择风格、询问排版主题与主题色、询问是否抓图 → 确定输入参数 + 图片模式
1. baoyu-url-to-markdown     → 抓取内容（抓原图模式含下载图片）
   └─ [降级] webfetch        → 获取 HTML → 保存完整HTML到文件 → 下载图片 → extract-svg.ts 提取内嵌 SVG
2. [手动] 提取关键概念       → 分析内容
3. [WebSearch] 补充资料      → 搜索官网
4. [手动] 融合重写           → 创作文章
5. humanizer-zh              → 去 AI 味（可选）
6. baoyu-cover-image         → 生成封面图
7. baoyu-compress-image      → 压缩封面图
8. baoyu-article-illustrator → 文内配图分析（AI 配图模式必选）
9. baoyu-image-gen           → 生成配图（抓原图模式补充 / AI 配图模式全部生成）
10. baoyu-compress-image     → 压缩文内图（可选）
11. easy-markdown-to-html    → 转 HTML（--theme + --color）
12. easy-post-to-wechat      → 发布到草稿箱
```

## 注意事项

- 本技能是**编排器**，调度已有子技能完成工作流
- 每个步骤的输出是下一个步骤的输入
- 用户可在步骤之间介入（如修改重写内容、调整风格）
- **图片模式**：`抓原图` 模式下 Step 1 下载图片 + 内嵌 SVG 转 PNG，Step 5 优先复用原图；`AI配图` 模式下 Step 1 仅抓文本，Step 5 全部由 AI 生成
- **内嵌 SVG**：网页中内嵌的架构图/流程图会自动提取并转为 PNG（仅抓原图模式）。注意：一篇博客可能同时包含内嵌 SVG 和外部图片（如 webp/png/jpg），两种格式都会被处理
- **webp 格式问题**：公众号不支持 webp 格式图片，下载的 webp 必须转换为 png
- 风格规范在 `references/styles/` 目录下，可按需扩展
- **排版主题与主题色**：主题三选一（经典默认）、主题色 11 选 1（经典蓝默认）；未通过 `--theme` / `--color` 指定则交互式询问，二者在 Step 6 转 HTML 时统一应用（`--theme` 传参数值、`--color` 传 hex）
- **发布前必须确认**：Step 7 会交互式询问用户是否确认发布，除非指定 `--publish` 参数
- **发布方式**：仅 API（easy-post-to-wechat v1，无浏览器方式）；API 不可用先排查凭证与 IP 白名单
- **草稿箱**：发布到公众号草稿箱，用户需登录后台手动发布
