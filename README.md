# AI 写公众号工作流

一套基于主流 Agent 工具的微信公众号写作 Skills 大全。核心思路：你是导演，AI 是编剧——你负责"讲什么"，AI 负责"怎么写"。

支持 **OpenCode、Claude Code、Codex** 等几乎所有主流 Agent 工具——技能基于开放的 **Agent Skills 标准**存放于 `.agents/skills/`（`SKILL.md` + 脚本），不绑定任何单一工具。

## 项目结构

```
├── 00-草稿/              ← 正在写的文章（一个选题一个目录）
├── 01-文章/              ← 发布后归档（按日期+标题命名）
├── 02-资源/              ← 写作风格、素材库、选题库
├── 03-工具/              ← 自己造的网页小工具
└── CLAUDE.md/AGENTS.md   ← 项目说明，AI 读这个就知道怎么干活
```

## 写作流程

```
记灵感 → 展开观点 → 创建草稿 → 删改到满意 → 配图 → 格式化 → 去 AI 味 → 转 HTML → 发布 → 归档
```

| 步骤 | 做什么 | 谁来做 |
|-----|-------|-------|
| 记灵感 | 手机备忘录存一句话 | 你 |
| 展开观点 | 把想法、例子、感受全倒出来 | 你 |
| 创建草稿 | 按风格文件生成初稿 | AI |
| 删改到满意 | 通读、删废话、补真实细节 | 你 |
| 配图 | 生成封面 + 文内配图提示词 | AI |
| 格式化 | 补标题层级、分段、强调 | AI |
| 去 AI 味 | 压掉太书面太客气的表达 | AI |
| 转 HTML | Markdown → 公众号兼容 HTML | AI |
| 发布 | 推送到公众号草稿箱 | AI |
| 归档 | 移入 `01-文章/`，清理草稿 | AI |

## 使用的技能

所有技能以 Agent Skills 标准安装，来源于 [baoyu-skills](https://github.com/JimLiu/baoyu-skills/)、[humanizer-zh](https://github.com/op7418/humanizer-zh) 等开源仓库。完整清单见 `CLAUDE.md` 技能速查表，核心工作流如下：

| 技能 | 用途 |
|-----|------|
| `wechat-auto-creator` | 一句话选题 → 公众号写作全自动流水线（写稿→配图→发布→归档） |
| `wechat-copywriter` | 仿写博客/网页链接成公众号文章，9 种文风可选 |
| `wechat-xhs-post` | 复用小红书图文素材生成公众号长文 |
| `xhs-auto-creator` | 一句话选题 → 小红书图文全自动流水线 |
| `baoyu-cover-image` | 生成封面图提示词 + 图片 |
| `baoyu-article-illustrator` | 分析文章配图位置，生成文内配图提示词 |
| `baoyu-image-gen` | 调用 API 批量生图（7 个提供商） |
| `baoyu-format-markdown` | Markdown 格式化（标题、分段、强调） |
| `humanizer-zh` | 去除 AI 写作痕迹 |
| `easy-markdown-to-html` | Markdown → 公众号兼容 HTML（doocs/md 引擎，主题可换） |
| `easy-post-to-wechat` | 发布到微信公众号草稿箱（API，替代旧 `baoyu-post-to-wechat`） |
| `baoyu-translate` | 文章翻译（快速/普通/精翻三种模式） |
| `baoyu-compress-image` | 图片压缩（WebP/PNG） |
| `baoyu-url-to-markdown` | 网页链接转 Markdown |
| `baoyu-youtube-transcript` | 获取 YouTube 视频字幕 |
| `baoyu-xhs-images` | 小红书风格图文卡片生成 |

## 两种文章类型

| 类型 | 风格文件 | 什么时候写 |
|-----|---------|----------|
| 观点原创 | `02-资源/写作风格.md` | 有链接/素材/选题，写自己的观点 |
| 访谈重播 | `02-资源/播客现场重播员-写作风格.md` | 有字幕文件/播客/访谈视频 |

## 工具兼容性

技能以跨工具的 **Agent Skills 标准**存放在 `.agents/skills/<技能名>/`（`SKILL.md` + `scripts/`），脚本用 Bun 直接执行，因此可被几乎所有主流 Agent 工具识别：

| 工具 | 如何识别技能 | 状态 |
|------|-------------|------|
| **OpenCode** | 直接读取 `.agents/skills/` | ✅ 开箱即用 |
| **Claude Code** | 读取 `.claude/skills/`（符号链接指向 `.agents/skills/`） | ✅ 已配置 |
| **Codex / Gemini CLI / Cursor 等** | 读取 `.agents/skills/`（Agent Skills 标准） | ✅ 通常开箱即用 |

> Windows 注意：Claude Code 依赖 `.claude/skills/` 下的符号链接，若技能消失（`/skills` 为空）说明链接退化成了空目录，修复方法见 `CLAUDE.md`「Windows 符号链接陷阱」。

## 快速上手

1. 安装任一主流 Agent 工具：[OpenCode](https://opencode.ai)、[Claude Code](https://docs.anthropic.com/en/docs/claude-code) 等
2. 克隆本项目到个人电脑本地
3. 在项目目录下打开 Agent 工具
4. 把你的素材（观点/字幕文件）丢给 AI，它会按 `CLAUDE.md`/`AGENTS.md` 中的工作流自动执行

## 相关资源

- [宝玉的技能仓库](https://github.com/JimLiu/baoyu-skills/)
- [humanizer-zh 去 AI 味技能](https://github.com/op7418/humanizer-zh)
- [获取 OpenAI API Key](https://platform.openai.com/api-keys)（用于 gpt-image-2 生图）
- [获取 Google API Key](https://aistudio.google.com/api-keys)（用于 Gemini 生图）
- [Obsidian Clipper 插件](https://github.com/obsidianmd/obsidian-clipper)（用于获取视频字幕）
