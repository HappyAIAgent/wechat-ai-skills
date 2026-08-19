# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

默认使用中文回复我。

## 项目概览

微信公众号 AI 写作工作流 + 小红书图文笔记创作。核心思路：**用户是导演，AI 是编剧**——用户负责"讲什么"，AI 负责"怎么写"。

```
ai-wechat/
├── 00-草稿/            ← 正在写的文章（一个选题一个目录），发布后清空
├── 01-文章/            ← 发布后归档，命名 YYYYMMDD_标题简称/
│   └── 20260318_一人企业/  ← 唯一已归档文章（示例）
├── 02-资源/            ← 写作风格（4份）、素材库、选题库、信息源
├── 03-工具/网页工具/    ← 自建纯 HTML 网页小工具
│   └── 文本统计/        ← 示例工具
├── .agents/skills/     ← 已安装的技能（每个技能含 SKILL.md + scripts/）
├── .baoyu-skills/      ← 技能配置和 API 密钥（已 gitignore）
├── .claude/skills/     ← 技能符号链接，指向 .agents/skills/
├── .sisyphus/          ← 编排器相关
├── .mimocode/          ← 独立的 Node.js 项目（mimocode 服务）
├── .playwright-mcp/    ← Playwright MCP 生成的缓存（已 gitignore）
├── .baoyu-skills/.env  ← API 密钥存放位置（已 gitignore）
├── image-cards/        ← 小红书图文卡片生图输出（已 gitignore）
├── cover-image/        ← 封面图生图输出（已 gitignore）
├── docs/guide.md       ← 安装指南
├── CLAUDE.md           ← 本文件
├── AGENTS.md           ← OpenCode 兼容说明
├── skills-lock.json    ← 技能版本锁定（git hash）
└── 去gemini 水印油猴脚本.js  ← 辅助工具脚本
```

## 运行环境

项目依赖以下运行时和凭据：

| 依赖 | 用途 | 备注 |
|------|------|------|
| **Bun** | 执行所有 TypeScript 技能脚本（`.ts`） | 每个技能目录有独立的 `package.json`，但脚本通过 `bun` 直接执行，无需编译 |
| **Chrome** | 仅遗留 `baoyu-post-to-wechat` 浏览器方式 | 公众号发布已切到 `easy-post-to-wechat`（纯 API），主流程不再依赖 Chrome；只有直接调用旧技能浏览器模式时才需要 |
| **API 密钥** | `baoyu-image-gen` 调用生图 API | 统一放入 `.baoyu-skills/.env`（已 gitignore） |
| **微信凭证** | `easy-post-to-wechat` 发布草稿（API） | `WECHAT_APP_ID` + `WECHAT_APP_SECRET` |

`skills-lock.json` 锁定技能版本来源（jimliu/baoyu-skills 和 op7418/humanizer-zh 的 git hash），安装或更新技能后自动更新此文件。

技能安装命令：`npx @anthropic-ai/claude-code skills install <仓库名>`（如 `npx @anthropic-ai/claude-code skills install jimliu/baoyu-skills`），指定技能名安装到 `.agents/skills/` 目录。

### 图片生成 API 密钥

往 `.baoyu-skills/.env` 写入所需的密钥（选配，用的到才配）：

| 提供商 | 环境变量 | 获取地址 |
|--------|---------|---------|
| Google Gemini | `GOOGLE_API_KEY` | [aistudio.google.com/api-keys](https://aistudio.google.com/api-keys) |
| OpenAI | `OPENAI_API_KEY` | platform.openai.com |
| DashScope（通义万象） | `DASHSCOPE_API_KEY` | dashscope.aliyun.com |
| Jimeng（即梦） | `JIMENG_API_KEY` | jimeng.jianying.com |
| Seedream（豆包/火山引擎） | `ARK_API_KEY` | console.volcengine.com |
| Replicate | `REPLICATE_API_TOKEN` | replicate.com |
| OpenRouter | `OPENROUTER_API_KEY` | openrouter.ai |

## 技能架构说明

所有技能安装在 `.agents/skills/<技能名>/` 目录下，每个技能目录包含：

| 文件 | 用途 |
|------|------|
| `SKILL.md` | **AI 读的操作指引** — 如何调用该技能、有哪些参数、工作流步骤 |
| `scripts/` | TypeScript 脚本，通过 `bun run <脚本路径>` 执行 |
| `package.json` | 脚本的依赖声明（bun 自动安装） |

偏好配置可选：`.baoyu-skills/<技能名>/EXTEND.md`（项目级）或 `~/.config/baoyu-skills/<技能名>/EXTEND.md`（用户级），技能会按优先级加载。

技能通过两种方式调用：
1. **Claude Code 原生**：`/<skill-name>`（如 `/baoyu-format-markdown`）
2. **直接跑脚本**：`bun run .agents/skills/<技能名>/scripts/main.ts --args`

`.claude/skills/` 目录下的技能条目均为指向 `.agents/skills/` 的符号链接，实际代码和 SKILL.md 存储在 `.agents/skills/` 中。修改技能时直接编辑 `.agents/skills/<技能名>/` 下文件即可。

## 写作资源（长期维护）

| 文章类型 | 风格文件 | 触发信号 |
|---------|---------|---------|
| 观点原创 | `02-资源/写作风格.md` | 给了链接/素材/选题，让我写观点文章 |
| 访谈重播 | `02-资源/播客现场重播员-写作风格.md` | 给了字幕文件/播客链接/访谈视频 |
| 汽车营销 | `02-资源/汽车营销-写作风格.md` | 给了车型名称，让我写汽车营销/车评/新车上市文章 |

- 个人素材库：`02-资源/素材库.md`（写文章时搜真实素材；**每写完一篇提炼一条**追加进去）
- 选题库：`02-资源/选题库.md`（写作全过程保持状态同步）
- 信息源：`02-资源/信息源.md`
- 汽车官网车型页地址库：`wechat-car-writer` 技能自带（`.agents/skills/wechat-car-writer/references/汽车官网车型页地址库.md`，59 个品牌最新车型官网 URL 清单 + 已剔除项 + 维护提示，图片采集脚本映射表据此维护；随技能独立发布）

其他写作参考（非强制）：`02-资源/勇鹏的写作风格.md`、`02-资源/Dan Koe 写作风格参考.md`

## 技能管理

技能来源于 [baoyu-skills](https://github.com/JimLiu/baoyu-skills/)（jimliu/baoyu-skills）和 [humanizer-zh](https://github.com/op7418/humanizer-zh) 仓库，版本通过 `skills-lock.json` 锁定。

安装新技能：
```bash
npx @anthropic-ai/claude-code skills install jimliu/baoyu-skills
```
安装完后自动更新 `skills-lock.json` 中的 hash。技能安装过程会生成 `.agents/skills/<技能名>/` 目录和 `.claude/skills/` 下的符号链接。

### Windows 符号链接陷阱（重要）

Claude Code 通过扫描 `.claude/skills/<技能名>/SKILL.md` 来发现技能。**在 Windows 上，符号链接可能静默失效**：git-bash 的 `ln -s` 在未开启「开发者模式」时无法创建真正的符号链接，会退化成**空目录**，结果技能一个都识别不到（`/skills` 列表为空）。

- **诊断**：`.claude/skills/` 下应为 `lrwxrwxrwx ... -> .agents/skills/xxx`（`l` 开头）；若显示为 `drwxr-xr-x` 的**空目录**，即软链接已失效
- **前提**：开启 Windows「开发者模式」（设置 → 隐私和安全性 → 开发者选项），或使用管理员终端
- **修复**（在项目根目录执行，批量重建全部链接）：
  ```powershell
  $src = ".\agents\skills"; $dst = ".\claude\skills"
  Get-ChildItem $dst -Directory | Remove-Item -Recurse -Force   # 清掉失效空目录
  Get-ChildItem $src -Directory | ForEach-Object {
    New-Item -ItemType SymbolicLink -Path (Join-Path $dst $_.Name) -Target $_.FullName
  }
  ```
  单个技能：`cmd //c mklink /D .claude\skills\<技能名> .agents\skills\<技能名>`
- `.claude/skills/` **不被 git 跟踪**，换机器克隆后需重新生成
- 若怀疑 git 检出符号链接失效，检查 `git config core.symlinks` 应为 `true`

安装指南见 `docs/guide.md`。

## 技能速查表

### 核心写作工作流技能

| 技能 | 类型 | 什么时候用 |
|------|------|-----------|
| `baoyu-cover-image` | 纯提示词 | 需要封面图提示词 + 图片 |
| `baoyu-article-illustrator` | TS 脚本 → bun | 文章写好了，需要分析配图位置、生成文内图提示词 |
| `baoyu-image-gen` | TS 脚本 → bun | 需要批量生图（支持 7 个提供商、参考图、比例控制、并发批处理） |
| `baoyu-format-markdown` | TS 脚本 → bun | 需要格式化排版（标题层级、分段、加粗、CJK 间距修正） |
| `humanizer-zh` | 纯提示词 | 观点原创型文章写完后去 AI 味（访谈重播跳过） |
| `easy-markdown-to-html` | TS 脚本 → bun | 需要转公众号兼容 HTML（doocs/md 引擎，主题/主题色/自定义 CSS 传参任意改，未传用默认值）。**替代 `baoyu-markdown-to-html`** |
| `easy-post-to-wechat` | TS 脚本 → bun | 发布到公众号草稿箱（API，复用 easy-markdown-to-html 渲染，图片自动上传）。**替代 `baoyu-post-to-wechat`** |
| `baoyu-translate` | TS 脚本 → bun | 需要翻译文章（快速/普通/精翻三种模式） |
| `baoyu-compress-image` | TS 脚本 → bun | 需要压缩图片（WebP/PNG/JPEG） |

### 编排器

| 技能 | 类型 | 什么时候用 | 依赖 |
|------|------|-----------|------|
| `xhs-auto-creator` | 编排器（调用其他技能）| 需要创作小红书图文笔记（自动走完选题→写稿→配图→生图→排版发布的全流程） | `baoyu-xhs-images` + `baoyu-compress-image` 等 |
| `xhs-content-creator` | 编排器（纯提示词） | 需要从一句话选题生成小红书完整图文内容（不含发布），配合 `xiaohongshu-ops` 使用 | 纯提示词，无脚本依赖 |
| `wechat-auto-creator` | 编排器 | 需要从一句话选题自动走完公众号写作完整流程（写稿→配图→发布→归档） | `easy-markdown-to-html` + `easy-post-to-wechat` + 配图/格式化/去AI味系列 |
| `wechat-copywriter` | 编排器 | 需要**仿写**博客/网页链接成公众号文章（抓取→补充官网资料→按指定文风重写→配图→发布），9 种文风可选 | `baoyu-url-to-markdown` + `easy-markdown-to-html` + `easy-post-to-wechat` + `humanizer-zh` 等 |
| `wechat-article-writer` | 纯提示词 | 需要写公众号文章（搜索资料→撰写→爆款标题→排版优化），不依赖图片素材 | 纯提示词，无脚本依赖 |
| `wechat-car-writer` | 编排器 | 需要根据车型名称自动生成汽车营销公众号文章（定位车型→采集真实参数→**官网官方图优先**→车评风格写稿→去AI味→发布），参数真实+交叉校验，合规严格 | `car-locate.ts` + `car-specs.ts` + `car-official.ts` + `cover.ts` + `easy-markdown-to-html` + `easy-post-to-wechat` + `humanizer-zh` 等 |
| `wechat-xhs-post` | 编排器 | 需要把已有小红书图文素材（`image-cards/`）复用成公众号长文（扩写→去AI味→WebP转PNG→发布） | `easy-markdown-to-html` + `easy-post-to-wechat` + `baoyu-compress-image` + `humanizer-zh` 等 |
| `xiaohongshu-ops` | 编排器 | 小红书运营相关操作（发布、管理） | 见其 SKILL.md |

### 内容获取与转换

| 技能 | 类型 | 什么时候用 |
|------|------|-----------|
| `baoyu-url-to-markdown` | TS 脚本 → bun | 需要把网页链接转成 Markdown |
| `baoyu-danger-x-to-markdown` | TS 脚本 → bun | 需要把推特/X 链接转成 Markdown |
| `baoyu-youtube-transcript` | TS 脚本 → bun | 需要获取 YouTube 视频字幕 |
| `baoyu-danger-gemini-web` | TS 脚本 → bun | 需要抓取 Gemini Web 内容 |

### 图文与设计

| 技能 | 类型 | 什么时候用 |
|------|------|-----------|
| `baoyu-xhs-images` | TS 脚本 → bun | 需要生成小红书风格图文卡片（12 种视觉风格、8 种布局） |
| `baoyu-comic` | TS 脚本 → bun | 需要生成漫画风格图片 |
| `baoyu-infographic` | TS 脚本 → bun | 需要生成信息图 |
| `baoyu-diagram` | TS 脚本 → bun | 需要生成图表/图示 |
| `baoyu-slide-deck` | TS 脚本 → bun | 需要生成幻灯片 |

### 多平台发布

| 技能 | 类型 | 什么时候用 |
|------|------|-----------|
| `baoyu-post-to-weibo` | TS 脚本 → bun | 需要发布到微博 |
| `baoyu-post-to-x` | TS 脚本 → bun | 需要发布到 X/Twitter |
| `baoyu-wechat-summary` | 纯提示词 | 需要生成文章摘要 |

### 系统工具

| 技能 | 类型 | 什么时候用 |
|------|------|-----------|
| `baoyu-electron-extract` | TS 脚本 → bun | 需要提取 Electron 应用内容 |
| `release-skills` | 发布工具 | 技能发布相关 |

## 写作工作流

### 公众号流程

三个编排器按素材来源分流，先判断用户输入走哪条：

| 输入形态 | 编排器 |
|---------|-------|
| 一句话选题（从零写） | `wechat-auto-creator` |
| 博客/网页链接（仿写） | `wechat-copywriter` |
| 已有小红书图文素材（`image-cards/`） | `wechat-xhs-post` |

手动流程（各步骤可单独调用技能）：

1. **写稿**：
   - 根据输入素材判断文章类型（字幕/访谈 → 访谈重播；其他 → 观点原创）
   - 按对应风格文件产出初稿，草稿存放在 `00-草稿/{选题名}/` 目录
   - 用户自行删改到满意后，进入后续步骤
2. **配图**：用 `baoyu-cover-image` + `baoyu-article-illustrator` 生成封面 + 文内配图提示词，统一写入 `image-prompts.md`；图片放 `images/` 目录。可选自动生图（`baoyu-image-gen`）或用户手动到 Gemini 生图
3. **格式化**：用 `baoyu-format-markdown` 补标题层级、分段和必要的强调
4. **去 AI 味**：
   - 观点原创型：用 `humanizer-zh` 过一遍，压掉太书面、太满、太客气的表达
   - 访谈重播型：跳过（此类型本身已有强风格约束）
5. **转 HTML**：用 `easy-markdown-to-html` 将 Markdown 转成公众号兼容的 HTML（doocs/md 引擎，`--theme`/`--color`/`--custom-css` 传参任意改，未传用默认值）
6. **发布**：用 `easy-post-to-wechat` 将文章发布到公众号「草稿箱」（API，自动上传本地图片与封面；可先 `--dry-run` 预览），发布后在后台确认封面图、摘要与图片展示无误
7. **归档**：将草稿产物移入 `01-文章/YYYYMMDD_标题简称/`，清理草稿目录
   - 目录命名：`YYYYMMDD_标题关键词`（日期 + 2-6 个字的标题简称）
   - 归档结构：
     ```
     01-文章/YYYYMMDD_标题简称/
     ├── article.md          ← 配图版终稿，图片路径统一改为 images/
     ├── article.html        ← 公众号 HTML
     ├── image-prompts.md    ← 合并所有提示词（封面 + 文内图）
     └── images/             ← 封面图 + 所有文内配图
     ```
   - 路径修正：归档时将 article.md 中的图片路径统一替换为 `images/`
   - 清理草稿：归档确认后删除 `00-草稿/` 中对应的所有草稿文件和临时目录
   - 更新选题库：在 `02-资源/选题库.md` 中将选题移至对应状态分区，更新总览表
   - 更新素材库：从刚归档的文章中提炼一条可复用的素材或洞察，追加到 `02-资源/素材库.md`

### 小红书流程

- 全自动（含发布）：用 `xhs-auto-creator` 编排器自动完成选题分析 → 写稿 → 配图设计 → 生图 → 排版发布的全流程。
- 仅内容生成（不含发布）：用 `xhs-content-creator` 生成图文内容，再用 `xiaohongshu-ops` 手动发布。

## 网页工具

当用户说"创建某某工具"时，默认按这个方式来建：

- 目录：`03-工具/网页工具/<工具名>/index.html`（单工具一个目录）
- 技术栈：尽量纯 HTML（内联 CSS + JS），不引入构建与依赖
- 索引：新增工具后同步更新 `03-工具/网页工具/README.md`

## 注意事项

- 无构建系统、无测试、无 lint — 这是内容工作流项目，不是纯代码项目
- `image-cards/` 和 `cover-image/` 是技能生图输出目录，已 gitignore，不需要手动管理
- `.mimocode/` 目录是独立的 Node.js 项目（mimocode 服务），与本工作流无关
- 图片路径在归档时必须改为相对路径 `images/`
- `humanizer-zh` 仅用于观点原创型文章，访谈重播型跳过
- **微信 API 不支持 WebP 图片**：上传会报 `40113: unsupported file type`。发布前所有图片（含封面）需转为 PNG，用 `baoyu-compress-image` 的 `-f png --keep` 或 PIL 转换（Windows 下勿用 ImageMagick 的 `convert`，会被 PowerShell 解析为别名）
- 发布公众号后建议在后台手动确认封面图、摘要与图片展示是否正常
