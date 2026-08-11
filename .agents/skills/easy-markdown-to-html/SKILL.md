---
name: easy-markdown-to-html
description: Converts Markdown to WeChat-compatible themed HTML using the doocs/md rendering engine. Theme (default/grace/simple), theme color (any hex), custom CSS, fonts, heading styles, and code highlighting are all passed as parameters; omitted parameters fall back to the doocs/md project defaults. Use when user asks "md 转 html", "markdown to html", "easy-markdown", needs styled/主题化 HTML output from markdown, or wants fine control over theme/color/custom CSS.
version: 0.1.0
---

# easy-markdown-to-html

基于 [doocs/md](https://github.com/doocs/md) 渲染引擎的无头 Markdown → 公众号 HTML 转换技能。与 `baoyu-markdown-to-html` 的区别：**主题、主题色、自定义 CSS 全部通过传参控制，未传参数一律使用 doocs/md 开源项目默认值**，扩展性强、排版美观。

## 运行方式

```bash
bun {baseDir}/scripts/main.ts <markdown文件> [选项]
```

> `{baseDir}` = 本 SKILL.md 所在目录。`bun` 优先；没有则 `npx -y bun`。

## 参数

| 参数 | 说明 | 默认值（doocs/md 项目默认） |
|------|------|------|
| `--theme <name>` | 主题：`default`(经典) / `grace`(优雅) / `simple`(简洁) | `default` |
| `--color <name\|hex>` | 主题色：预设名或任意 hex（如 `#E60000`）。影响标题/链接/引用块等 | `#0F4C81`(经典蓝) |
| `--custom-css <css>` | 任意自定义 CSS，**优先级最高**，可自由覆盖出任意新主题 | 空 |
| `--font-family <name\|css>` | 字体：`无衬线` / `衬线` / `等宽` 或任意 CSS font-family | 系统无衬线栈 |
| `--font-size <px>` | 字号：`14px`~`18px` | `16px` |
| `--legend <value>` | 图片题注：`title-alt` / `alt-title` / `title` / `alt` / `filename` / `none` | `alt` |
| `--heading-styles <kv>` | 标题样式，如 `h2=border-bottom,h3=color-only`；值：`color-only` / `border-bottom` / `border-left` | 默认（无装饰） |
| `--code-block-theme <name>` | 代码高亮：`github` / `github-dark` / `monokai` / `vs` / `xcode` / `nord` / `atom-one-dark` 等 | `github-dark`* |
| `--mac-code-block` | 代码块显示 Mac 风格标题栏 | 开*（`--no-mac-code-block` 关闭） |
| `--line-number` | 代码块显示行号 | 关 |
| `--cite` | 普通外链转底部引用（公众号友好） | 关 |
| `--count` | 开头显示阅读时长 / 字数 | 关 |
| `--indent` | 段落首行缩进 `2em` | 关 |
| `--justify` | 段落两端对齐 | 关 |
| `--theme-mode <light\|dark>` | 图表配色模式（预留，当前 diagram 已禁用） | `light` |
| `--out <路径>` | 指定输出 HTML 路径 | md 同目录同名 `.html` |

主题色预设：`#0F4C81` 经典蓝、`#009874` 翡翠绿、`#FA5151` 活力橘、`#FECE00` 柠檬黄、`#92617E` 薰衣紫、`#55C9EA` 天空蓝、`#B76E79` 玫瑰金、`#556B2F` 橄榄绿、`#333333` 石墨黑、`#A9A9A9` 雾烟灰、`#FFB7C5` 樱花粉。

> \* 两项**项目偏好默认**（偏离开源 doocs/md 默认 `github` / 关）：代码高亮默认 `github-dark`、Mac 窗口样式默认开启。其余参数未传时均使用 doocs/md 项目默认值。

## 示例

```bash
# 默认（default 主题 + 经典蓝 + github-dark 代码高亮 + Mac 样式）
bun {baseDir}/scripts/main.ts article.md

# 指定主题 + 主题色
bun {baseDir}/scripts/main.ts article.md --theme grace --color red

# 优雅主题 + 红色 + 任意自定义 CSS（自由造主题）
bun {baseDir}/scripts/main.ts article.md --theme grace --color "#E60000" --custom-css "blockquote{background:#f7f7f7} h1{letter-spacing:0.05em}"

# 公众号友好：外链转底部引用 + 阅读时长
bun {baseDir}/scripts/main.ts article.md --cite --count

# 标题样式 + 代码高亮 + 行号
bun {baseDir}/scripts/main.ts article.md --heading-styles "h2=border-bottom,h3=color-only" --code-block-theme monokai --line-number
```

## 输出

- HTML 文件：输入 `article.md` → `article.html`（若已存在自动备份为 `.bak-<时间戳>`）
- 控制台 JSON：`{ htmlPath, words, minutes, theme, primaryColor, frontMatter }`
- **元信息回传**：若 frontmatter 含 `title`/`description`，会以 `<!-- wechat-meta:... -->` HTML 注释（base64）嵌入输出文件首行，供 `easy-post-to-wechat` 回读标题/摘要（HTML 输入路径下 frontmatter 不会丢失）

## 支持与不支持

**支持**：标准 Markdown、代码高亮、表格、GFM/Obsidian 引用块（`> [!NOTE]` / `::: type`）、脚注、ruby 注音、`[toc]` 目录、`==高亮==`、内联数学公式（MathJax 简化渲染）。

**暂不支持（v2 规划）**：
- Mermaid / PlantUML / infographic 图表渲染 —— 已禁用相关扩展，` ```mermaid ` 等会兜底渲染为代码块，不崩溃。后续可用 headless Chrome（如 `baoyu-post-to-wechat` 的 CDP 方案）补齐。
- 图片处理（本地图上传微信素材）—— 属于发布环节，交给 `easy-post-to-wechat`。
- 完整数学公式排版 —— 当前 MathJax 为占位渲染，美观排版待后续接入真实 KaTeX/MathJax。

## 文件结构

```
easy-markdown-to-html/
├── SKILL.md
├── scripts/
│   ├── main.ts          ← CLI 入口（参数解析、读写文件）
│   ├── render.ts        ← 渲染管线（移植自 doocs/md packages/mcp-server/render-article.ts）
│   ├── config.ts        ← 默认值与选项表（对齐 doocs/md config-options.ts）
│   ├── polyfill.ts      ← 无头浏览器 polyfill（MathJax / window / document）
│   └── themes/          ← base.css + default/grace/simple 主题 CSS
├── vendor/
│   ├── core/            ← doocs/md @md/core 源码（已裁剪 diagram 扩展）
│   └── shared/          ← doocs/md @md/shared 源码（类型/工具子集）
├── package.json         ← 依赖：@md/core、@md/shared 为 file: 本地 vendor
└── tsconfig.json
```

源码 vendor 自 doocs/md 仓库（`packages/core`、`packages/shared`、`packages/mcp-server`），修改技能时直接编辑 `vendor/` 下文件即可。
