---
name: easy-post-to-wechat
description: Publishes an article draft to the WeChat Official Account 草稿箱. Accepts a Markdown file (rendered by easy-markdown-to-html with the same theme/color/custom-css parameter freedom) or a ready HTML file; uploads local images and cover to WeChat, then creates a draft via draft/add. Use when user asks "发布公众号", "发到草稿箱", "post to wechat", "发布草稿".
version: 0.1.0
---

# easy-post-to-wechat

发布公众号文章到「草稿箱」的技能。配套 `easy-markdown-to-html`：传入 Markdown 时自动调用它渲染成主题化 HTML（主题/主题色/自定义 CSS 均可传参），也可直接传入已渲染好的 HTML。发布流程复用微信官方 API（`draft/add`），纯内置 fetch 实现，无第三方依赖。

与 `baoyu-post-to-wechat` 的区别：**渲染交给 easy-markdown-to-html（doocs/md 引擎），发布为自包含 API 实现**，不依赖 Chrome 浏览器。

## 运行方式

```bash
bun {baseDir}/scripts/main.ts <article.md|article.html> [选项]
```

> `{baseDir}` = 本 SKILL.md 所在目录。`bun` 优先；没有则 `npx -y bun`。

## 参数

### 输入与元信息

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<file.md>` | Markdown 输入，自动调用 `easy-markdown-to-html` 渲染（须已安装该技能） | — |
| `<file.html>` | 直接发布已渲染好的 HTML（不再渲染） | — |
| `--no-render` | 强制跳过渲染（仅限 HTML 输入时使用） | 关 |
| `--title <text>` | 文章标题；**传入时自动剥离正文开头的重复 H1**（doocs/md 渲染默认保留正文首个 `# 标题`，与公众号标题重复） | frontmatter `title` → HTML 内 `wechat-meta` 注释 → 正文首个 h1/h2 → 文件名 |
| `--digest <text>` | 摘要（≤120 字） | frontmatter `description` → HTML 内 `wechat-meta` 注释 → 正文首 120 字 |
| `--author <text>` | 作者署名 | frontmatter `author` |
| `--thumb <图片>` | 封面图（本地路径，PNG/JPG） | 文章内第一张本地图片 |
| `--keep-html <路径>` | 保留渲染出的 HTML 到指定路径 | md 同目录同名 `.html` |

### 透传给 easy-markdown-to-html 的渲染参数（Markdown 输入时生效）

`--theme <name>`、`--color <name|hex>`、`--custom-css <css>`、`--font-family`、`--font-size`、`--legend`、`--heading-styles`、`--code-block-theme`、`--mac-code-block`、`--no-mac-code-block`、`--line-number`、`--cite`、`--count`、`--indent`、`--justify`、`--theme-mode`。**不传时使用技能默认值**（代码高亮默认 `github-dark`、Mac 样式默认开启为项目偏好，其余对齐 doocs/md）。详见 `easy-markdown-to-html` 的参数表。

### 发布选项

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--no-comment` | 关闭文章留言 | 开留言 |
| `--only-fans-comment` | 仅关注后可留言 | 所有人可留言 |

## 示例

```bash
# 最小：Markdown → 默认主题渲染 → 发布草稿
bun {baseDir}/scripts/main.ts article.md

# 指定主题/主题色 + 自定义封面
bun {baseDir}/scripts/main.ts article.md --theme grace --color "#E60000" --thumb images/cover.png

# 指定标题摘要作者
bun {baseDir}/scripts/main.ts article.md --title "一人企业的生意经" --digest "三条亲测有效的方法" --author "xuanzhangran"

# 直接发布已渲染的 HTML
bun {baseDir}/scripts/main.ts article.html
```

## 工作流程

1. **渲染**：Markdown 输入 → shell-out 调用 `easy-markdown-to-html` 渲染为主题化 HTML（输出 HTML 路径 + frontmatter）
2. **元信息**：标题/摘要/作者 按参数 → frontmatter → 正文 的优先级取用；**标题来自 `--title`/frontmatter 时，自动剥离正文开头的重复 H1**（标题回退自正文 h1/h2 时保留，避免标题丢失）
3. **凭证**：读取 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`（`process.env` → `<cwd>/.baoyu-skills/.env`），换取 access_token
4. **上传正文图片**：HTML 内所有本地 `<img src="本地路径">` 通过 `/cgi-bin/media/uploadimg` 上传，替换为 mmbiz 永久 URL；远程图片（http/https/data/mmbiz）原样保留
5. **上传封面**：`--thumb` 或文章第一张本地图 → `/cgi-bin/material/add_material` 得到 thumb_media_id
6. **创建草稿**：`/cgi-bin/draft/add`（article_type=news，默认开留言）

## 输出

```json
{
  "ok": true,
  "mediaId": "...",
  "title": "…",
  "digest": "…",
  "thumbMediaId": "…",
  "htmlPath": "/abs/path/article.html",
  "message": "已创建草稿，请到公众号后台「草稿箱」确认后发布"
}
```

发布后在后台确认封面图、摘要与图片展示是否正常。

## 注意事项

- **微信 API 不支持 WebP**：本地图片为 `.webp` 时会报错，请先用 `baoyu-compress-image` 转成 PNG
- 封面与正文图片需为本地文件路径（相对当前工作目录或文章目录解析）
- 远程图片 URL 不会上传，直接保留原 URL（是否可用取决于微信后台）
- 若缺少 `easy-markdown-to-html` 技能，可先对 HTML 调用加 `--no-render`

## 暂不支持（v2 规划）

- 浏览器发布方式（Chrome CDP 自动化后台操作）——如 `baoyu-post-to-wechat` 的浏览器流程
- 贴图（`newspic`）类型文章、多图文一次性发布
- 发布前图片本地压缩（建议配合 `baoyu-compress-image` 预压缩）

## 文件结构

```
easy-post-to-wechat/
├── SKILL.md
├── scripts/
│   ├── main.ts          ← CLI 入口（参数解析、渲染 shell-out、图片上传、发布）
│   └── wechat-api.ts    ← 自包含微信 API（token / uploadimg / add_material / draft/add）
└── package.json         ← 无第三方依赖（内置 fetch + FormData）
```
