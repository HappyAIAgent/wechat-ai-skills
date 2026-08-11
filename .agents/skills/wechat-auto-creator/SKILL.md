---
name: wechat-auto-creator
description: "微信公众号自动图文编排器 — 从一句话选题到发布草稿箱的全自动流水线"
---

# 微信公众号自动图文编排器

## 描述
本技能是微信公众号文章的全自动编排器。它不直接生成图片或排版，而是**编排整个流水线**：从用户的一句话选题/描述出发，调用本项目已有的子技能，按 CLAUDE.md 中定义的写作工作流逐步产出图文并茂的文章并发布到公众号草稿箱。

## 工作流全景

```
用户输入 "写一篇关于XXX的文章"
  │
  ├─ Step 1: 解析输入 → 确定标题简称 + 文章类型
  ├─ Step 2: 写稿 → 按风格文件生成初稿
  ├─ Step 3: 格式化 → baoyu-format-markdown
  ├─ Step 4: 去AI味 → humanizer-zh（观点原创型）
  ├─ Step 5: 配图 → 封面 + 文内配图提示词 + 生图
  ├─ Step 6: 转HTML → easy-markdown-to-html
  ├─ Step 7: 发布 → easy-post-to-wechat（到草稿箱）
  └─ Step 8: 归档 → 移入 01-文章/ 更新选题库/素材库
```

## 输出目录
所有产物统一放在 `00-草稿/{YYYYMMDD_标题简称}/` 目录下：
```
00-草稿/{YYYYMMDD_标题简称}/
├── article.md              ← 配图版终稿
├── article.html            ← 公众号兼容 HTML
├── image-prompts.md        ← 合并所有图片提示词（封面 + 文内图）
└── images/                 ← 封面图 + 所有文内配图
```

## 参数说明
| 调用方式 | 示例 |
|---------|------|
| 位置参数 | `/wechat-auto-creator 写一篇关于现代人手机幻觉震动的文章` |
| `--prompt` | `/wechat-auto-creator --prompt "写一篇关于现代人手机幻觉震动的文章"` |
| `--publish` | `/wechat-auto-creator "选题" --publish` 跳过确认直接发布到草稿箱 |
| `--dry-run` | `/wechat-auto-creator "选题" --dry-run` 只生成不发布 |
| `--theme` | `/wechat-auto-creator "选题" --theme 优雅` 指定排版主题（经典/优雅/简洁），跳过询问 |
| `--color` | `/wechat-auto-creator "选题" --color 翡翠绿` 指定主题色（11 种预设色或 hex），跳过询问 |

## 依赖的子技能（按调用顺序）
- 写稿：风格文件（`02-资源/写作风格.md` / `02-资源/播客现场重播员-写作风格.md` / `02-资源/勇鹏的写作风格.md`）
- `baoyu-format-markdown` — Markdown 格式化
- `humanizer-zh` — 去除 AI 写作痕迹（观点原创型）
- `baoyu-cover-image` — 封面图生成
- `baoyu-article-illustrator` — 文内配图位置分析
- `baoyu-image-gen` — 批量生图（fallback: openai → dashscope → google）
- `easy-markdown-to-html` — Markdown → 公众号兼容 HTML（doocs/md 引擎）
- `easy-post-to-wechat` — 发布到草稿箱（API 方式）
- `baoyu-compress-image` — 图片压缩（需要时）

## 工作流程

### Step 1: 解析输入

从用户消息中提取以下内容：

| 来源 | 提取方式 |
|------|---------|
| `--prompt "..."` | 取 `--prompt` 后面的全部内容 |
| 位置参数 | 取第一个非选项字符串参数 |
| `{YYYYMMDD}` | 当天日期，如 `20260804` |
| `{标题简称}` | 从选题/主题提取 2-6 个字的中文关键词（中文为主，可含英文品牌名，如 `手机幻觉`、`DeepSeek安装配置`） |
| `--publish` | 标记为自动发布（跳过发布确认，直接调用 API） |
| `--dry-run` | 标记为仅生成不发布 |
| `--theme <主题>` | 排版主题（经典/优雅/简洁）；未指定则在 Step 1 交互式询问 |
| `--color <颜色>` | 主题色（11 种预设色或任意 hex，中文名映射到对应 hex）；未指定则在 Step 1 交互式询问 |
| 链接/URL/字幕文件 | 自动判定为访谈重播型 |
| 纯文字描述 | 自动判定为观点原创型 |

#### 生成输出目录（Step 1 开始时必须立即执行）

**⛔ 目录命名硬性规则**：输出目录**必须**是 `00-草稿/{YYYYMMDD_标题简称}/` 格式。
- `YYYYMMDD`：当天日期，如 `20260804`
- `标题简称`：从选题/主题提取 2-6 个字的核心中文关键词（中文为主，可含英文品牌名）
- **禁止**使用英文 kebab-case slug 或纯英文名作目录名（如 `claude-code-agent-view`、`phone-hallucination`）
- 目录内配图目录**必须**是 `images/`，**禁止**用 `imgs/` 等其他名称

**示例**（✅ 正确 / ❌ 错误）：

| 用户选题 | ✅ 正确目录名 | ❌ 错误目录名 |
|---------|-------------|-------------|
| 为什么口袋里的手机，总让你觉得它震了？ | `20260804_手机幻觉震动` | `phone-hallucination` |
| Claude Code 推出 Agent View，一个人指挥十个 AI 写代码 | `20260804_AgentView指挥` | `claude-code-agent-view` |

```bash
# 获取当天日期
DATE=$(date +%Y%m%d)
# 创建目录（标题简称从选题提取中文关键词）
mkdir -p "00-草稿/${DATE}_{标题简称}/images"
```

> 必须使用 `mkdir -p` 显式创建目录，不得跳过。后续所有步骤的文件输出路径均基于此目录。

**执行后立即自检**：运行 `ls 00-草稿/` 确认刚创建的目录是 `YYYYMMDD_中文标题简称` 格式；若不符，立即重命名修正后再继续。

同时读取：
- `02-资源/选题库.md` — 检查是否已有此选题
- `02-资源/素材库.md` — 写稿时搜索真实素材
- `02-资源/信息源.md` — 信息源参考

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

> AskUserQuestion 单题最多 4 个选项：主选项放 `经典蓝（推荐）`、`翡翠绿`、`活力橘`、`薰衣紫`，问题描述里列出完整 11 色表；其它色直接选 Other 输入色名（如"天空蓝"）或 hex。
> `{theme}` 与 `{color}` 贯穿 Step 6 转 HTML 与 Step 7 发布，保证预览与发布一致。传给 `easy-markdown-to-html` / `easy-post-to-wechat` 时 `--theme` 用「参数值」列（经典=`default` / 优雅=`grace` / 简洁=`simple`），`--color` 用 hex。

### Step 2: 写稿

根据输入素材判断文章类型，调用对应风格文件生成初稿：

| 输入信号 | 文章类型 | 风格文件 |
|---------|---------|---------|
| 字幕文件/播客链接/访谈视频URL | 访谈重播 | `02-资源/播客现场重播员-写作风格.md` |
| 包含"我亲自""我的实验""复盘"等 | 观点原创（勇鹏风格） | `02-资源/勇鹏的写作风格.md` |
| 其他（纯文字描述/链接/素材） | 观点原创（通用） | `02-资源/写作风格.md` |

**写稿流程**：
1. 确认 `00-草稿/{YYYYMMDD_标题简称}/` 目录已创建（Step 1 已执行 `mkdir -p`）
2. 搜索素材库 (`02-资源/素材库.md`) 和信息源 (`02-资源/信息源.md`) 获取真实细节
3. 读取对应风格文件，按风格要求产出初稿（先列大纲，得到确认后再展开）
   - 大纲保存为 `00-草稿/{YYYYMMDD_标题简称}/outline.md`
   - 大纲头部字段**必须**包含：选题、文章类型、风格文件、**输出目录：`00-草稿/{YYYYMMDD_标题简称}/`**
   - ⛔ 大纲中**不要**写英文 `Slug` 字段；如需标识，直接写中文目录名或标题简称
4. 初稿保存为 `00-草稿/{YYYYMMDD_标题简称}/article-raw.md`

**用户干预点**：初稿产出后告知用户，用户可自行删改。删改满意后告知继续。

### Step 3: 格式化

调用 `baoyu-format-markdown` 技能对初稿进行格式化：

1. 读取 `article-raw.md`
2. 按格式化学步骤：分析内容结构 → 补标题层级/分段/加粗/列表
3. 输出 `article-formatted.md`（与原文件同目录）
4. 执行排版脚本：
   ```bash
   bun run .agents/skills/baoyu-format-markdown/scripts/main.ts article-formatted.md
   ```

> 注意：格式化仅调整结构和样式，不修改任何原文内容。

### Step 4: 去 AI 味（观点原创型）

**仅观点原创型文章执行此步骤，访谈重播型跳过。**

调用 `humanizer-zh` 技能处理格式化后的文件：

1. 逐段扫描 AI 模式（夸大的象征意义、三段式法则、AI 词汇、破折号过度使用等）
2. 重写问题片段，保留核心信息和语气
3. 将结果写入 `article.md`

### Step 5: 配图

#### 5.1 封面图生成
调用 `baoyu-cover-image` 技能，根据文章标题和核心观点生成封面图：

1. 分析文章主题和关键信息
2. 生成封面图 prompt
3. 调用 `baoyu-image-gen` 生图（Provider 选择见 Step 5.3）
4. 封面图保存为 `images/cover.png`

#### 5.2 文内配图分析
调用 `baoyu-article-illustrator` 技能：

1. 分析文章结构，识别需要配图的位置
2. 确定每张图的 Type × Style × Palette 三维度
3. 写入配图提示词到 `image-prompts.md`
4. 提示词文件保存到 `00-草稿/{YYYYMMDD_标题简称}/image-prompts.md`

#### 5.3 批量生图规范
调用 `baoyu-image-gen` 批量生图：

**Provider 优先级**（依次尝试，失败自动回退）：
1. `openai`（`gpt-image-2`）— 首选
2. `dashscope`（通义万象）— openai 不可用时的第一备用
3. `google`（Gemini）— 最后的备用

**质量参数**：
- 封面图：`--quality normal`
- 文内图：`--quality normal`
- 比例：封面图 `--ar 16:9`，文内图根据内容选择 `16:9` 或 `1:1`

**要求**：
- 至少生成 3 张图片（1 封面 + 至少 2 文内图）
- 文内图用封面图作为 `--ref` 锚定风格一致性
- 图片保存到 `images/` 目录
- 生图完成后将 article.md 中的图片占位符替换为实际图片路径

### Step 6: 转 HTML

调用 `easy-markdown-to-html` 技能：

```bash
bun run .agents/skills/easy-markdown-to-html/scripts/main.ts \
  00-草稿/{YYYYMMDD_标题简称}/article.md \
  --theme {theme} \
  --color {color}
```

- `{theme}` 已在 Step 1 选择（经典=`default` / 优雅=`grace` / 简洁=`simple`）
- `{color}` 已在 Step 1 选择（11 种主题色 hex，默认 `#0F4C81` 经典蓝）
- **标题处理**：easy 系列默认保留正文首个 `# 标题`（不再用 `--keep-title`）；若不想正文重复大标题，可手动删掉开头 H1（公众号标题由发布环节 `--title` 控制）
- 输出为 `article.html`（与原文件同目录）

### Step 7: 发布到公众号草稿箱

调用 `easy-post-to-wechat` 技能：

- **默认行为**：发布到草稿箱，发布前用 `AskUserQuestion` 询问确认
- **自动发布模式**（`--publish`）：直接调用 API 发布，不打断确认
- **唯一方式**：API（`draft/add`），不依赖 Chrome；需配置 `WECHAT_APP_ID` + `WECHAT_APP_SECRET`（凭证缺失或本机 IP 未加入公众号后台 IP 白名单会报错，报 `40164` 即白名单问题）

```bash
# API 方式（HTML 已由 Step 6 渲染好主题，直接发布）
bun run .agents/skills/easy-post-to-wechat/scripts/main.ts \
  00-草稿/{YYYYMMDD_标题简称}/article.html \
  --thumb 00-草稿/{YYYYMMDD_标题简称}/images/cover.png \
  --title "{文章标题}"
```

> 发布前先 `--dry-run` 预览（渲染 + 图片扫描 + 标题提取，不发网络请求），确认标题、摘要、封面、图片无误后再正式发布。封面显式传 `--thumb`（封面图不在正文中时必传）。

### Step 8: 归档（可选 — 发布成功后提示）

发布成功后提示用户归档，归档内容：

1. 将 `00-草稿/{YYYYMMDD_标题简称}/` 移入 `01-文章/YYYYMMDD_标题简称/`
   - 草稿目录已按 `{YYYYMMDD_标题简称}` 命名，归档时目录名不变，直接移动即可
   - 若标题简称与最终文章标题关键词有出入，按最终标题调整目录名
   - 归档结构：
     ```
     01-文章/YYYYMMDD_标题简称/
     ├── article.md          ← 图片路径改为 images/
     ├── article.html        ← 公众号 HTML
     ├── image-prompts.md    ← 合并所有提示词
     └── images/             ← 封面图 + 文内配图
     ```
2. 路径修正：article.md 中的图片路径统一替换为 `images/`
3. 清理草稿：归档确认后删除 `00-草稿/` 中对应目录
4. 更新 `02-资源/选题库.md`：选题移至"已发布"分区，更新总览表
5. 更新 `02-资源/素材库.md`：从刚归档的文章中提炼一条可复用素材追加

## 图片生成 Provider 回退逻辑

当 `baoyu-image-gen` 生图失败时，按以下顺序自动回退：

```
openai (gpt-image-2)
  → 失败 → dashscope (qwen-image-3.0-pro 或 wan2.7-image-pro)
    → 失败 → google (gemini-3-pro-image)
      → 失败 → 报告用户，在 article.md 中以占位符 `![描述](images/{filename})` 标记位置，供用户手工补图
```

实现方式：调用 `baoyu-image-gen` 时先尝试首选 provider，如果返回错误，切换 `--provider` 参数重试。

## 风格匹配规则

| 输入信号 | 风格 | 说明 |
|---------|------|------|
| 字幕文件(.srt/.vtt/.txt)、播客链接、访谈视频URL | 访谈重播 | 有原始口语素材，跳过 humanizer-zh |
| 包含"我亲自""我的实验""复盘"等第一人称实验复盘 | 勇鹏风格 | 强调个人经历和可复现步骤 |
| 普通观点/知识/现象描述 | 通用风格 | 对话感强，观点+论据结构 |

## 快速开始示例

```bash
# 一句描述自动完成全部流程
/wechat-auto-creator "为什么口袋里的手机，总让你觉得它震了？"

# 自定义 prompt
/wechat-auto-creator --prompt "写一篇关于现代人手机依赖症的文章，从幻觉震动说起"

# 自动发布（跳过确认）
/wechat-auto-creator "选题描述" --publish

# 仅生成不发布
/wechat-auto-creator "选题描述" --dry-run
```

## 注意事项
- 本技能是**编排器**，不直接处理图片生成或排版，而是调度已有子技能
- 每个步骤的输出是下一个步骤的输入，步骤间有依赖关系
- 用户可在步骤之间介入（如修改初稿、调整配图位置等）
- `--dry-run` 模式在 Step 7（发布）前停止
- 发布默认停在确认前（除非指定 `--publish`）
- 图片生成本身耗时较长，生图期间如有并行需求，优先结束当前步骤再响应
- 所有生图尝试均失败时，在 article.md 中以 markdown 图片占位符标记位置，供用户手工补图
