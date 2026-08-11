# AI 写公众号工作流

一套基于 Claude Code 的微信公众号写作工作流。核心思路：你是导演，AI 是编剧——你负责"讲什么"，AI 负责"怎么写"。

## 项目结构

```
├── 00-草稿/            ← 正在写的文章（一个选题一个目录）
├── 01-文章/            ← 发布后归档（按日期+标题命名）
├── 02-资源/            ← 写作风格、素材库、选题库
├── 03-工具/            ← 自己造的网页小工具
└── CLAUDE.md           ← 项目说明，AI 读这个就知道怎么干活
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

所有技能通过 Claude Code Skills 安装，来源于 [baoyu-skills](https://github.com/JimLiu/baoyu-skills/) 和 [humanizer-zh](https://github.com/op7418/humanizer-zh)。

| 技能 | 用途 |
|-----|------|
| `baoyu-cover-image` | 生成封面图提示词 + 图片 |
| `baoyu-article-illustrator` | 分析文章配图位置，生成文内配图提示词 |
| `baoyu-image-gen` | 调用 API 批量生图 |
| `baoyu-format-markdown` | Markdown 格式化（标题、分段、强调） |
| `humanizer-zh` | 去除 AI 写作痕迹 |
| `baoyu-markdown-to-html` | Markdown → 公众号兼容 HTML（多种主题） |
| `baoyu-post-to-wechat` | 发布到微信公众号草稿箱 |
| `baoyu-translate` | 文章翻译（快速/普通/精翻三种模式） |
| `baoyu-compress-image` | 图片压缩（WebP/PNG） |

## 两种文章类型

| 类型 | 风格文件 | 什么时候写 |
|-----|---------|----------|
| 观点原创 | `02-资源/写作风格.md` | 有链接/素材/选题，写自己的观点 |
| 访谈重播 | `02-资源/播客现场重播员-写作风格.md` | 有字幕文件/播客/访谈视频 |

## 快速上手

1. 安装 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
2. 克隆本项目
3. 在项目目录下打开 Claude Code
4. 把你的素材（观点/字幕文件）丢给 AI，它会按 `CLAUDE.md` 中的工作流自动执行

## 相关资源

- [宝玉的技能仓库](https://github.com/JimLiu/baoyu-skills/)
- [humanizer-zh 去 AI 味技能](https://github.com/op7418/humanizer-zh)
- [获取 Google API Key](https://aistudio.google.com/api-keys)（用于 Gemini 生图）
- [Obsidian Clipper 插件](https://github.com/obsidianmd/obsidian-clipper)（用于获取视频字幕）
