// easy-post-to-wechat — 发布公众号草稿的 CLI 入口。
// 流程：Markdown/HTML → 图片上传微信（uploadimg / add_material）→ draft/add 创建草稿。
// Markdown 渲染复用 easy-markdown-to-html（shell-out，与 baoyu-post-to-wechat 同款模式）。
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

import { loadCredentials, fetchAccessToken, uploadBodyImage, uploadThumbMaterial, createDraft } from './wechat-api.ts'

interface CliArgs {
  input: string
  title?: string
  digest?: string
  author?: string
  thumb?: string
  keepHtml?: string
  noRender: boolean
  dryRun: boolean
  needOpenComment: number
  onlyFansCanComment: number
  renderArgs: string[]
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { input: '', noRender: false, dryRun: false, needOpenComment: 1, onlyFansCanComment: 0, renderArgs: [] }
  const renderOptionKeys = new Set([
    `--theme`, `--color`, `--custom-css`, `--font-family`, `--font-size`, `--legend`,
    `--heading-styles`, `--code-block-theme`, `--theme-mode`,
  ])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    switch (arg) {
      case `--title`: args.title = argv[++i]; break
      case `--digest`: args.digest = argv[++i]; break
      case `--author`: args.author = argv[++i]; break
      case `--thumb`: args.thumb = argv[++i]; break
      case `--keep-html`: args.keepHtml = argv[++i]; break
      case `--no-render`: args.noRender = true; break
      case `--dry-run`: args.dryRun = true; break
      case `--no-comment`: args.needOpenComment = 0; break
      case `--only-fans-comment`: args.onlyFansCanComment = 1; break
      case `--mac-code-block`:
      case `--no-mac-code-block`:
      case `--line-number`:
      case `--cite`:
      case `--count`:
      case `--indent`:
      case `--justify`:
        args.renderArgs.push(arg); break
      default:
        if (renderOptionKeys.has(arg)) {
          args.renderArgs.push(arg, argv[++i] ?? ``)
        } else if (arg.startsWith(`-`)) {
          throw new Error(`未知参数: ${arg}`)
        } else {
          args.input = arg
        }
    }
  }
  if (!args.input)
    throw new Error(`用法: bun {baseDir}/scripts/main.ts <article.md|article.html> [选项]`)
  return args
}

// ---- 渲染（Markdown → HTML）----

/** 定位同仓库下的 easy-markdown-to-html 技能脚本路径。 */
function locateRenderScript(): string {
  const candidates = [
    // 常规：两个 skill 同在 .agents/skills/ 下
    path.resolve(import.meta.dirname, `../../easy-markdown-to-html/scripts/main.ts`),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate))
      return candidate
  }
  throw new Error(
    `未找到 easy-markdown-to-html 技能（期望路径: ${candidates[0]}）。` +
    `请先安装 easy-markdown-to-html，或对 HTML 文件直接调用并加 --no-render。`,
  )
}

interface RenderResult { htmlPath: string; frontMatter: Record<string, string> }

function renderMarkdown(mdPath: string, outHtmlPath: string, renderArgs: string[]): RenderResult {
  const renderScript = locateRenderScript()
  const bun = process.platform === `win32` ? `bun.exe` : `bun`
  const run = spawnSync(bun, [renderScript, mdPath, `--out`, outHtmlPath, ...renderArgs], {
    encoding: `utf-8`,
    env: process.env,
  })
  if (run.error)
    throw new Error(`无法执行 bun: ${run.error.message}`)
  if (run.status !== 0)
    throw new Error(`easy-markdown-to-html 渲染失败:\n${run.stderr || run.stdout}`)
  try {
    const parsed = JSON.parse(run.stdout.trim()) as RenderResult
    return { htmlPath: parsed.htmlPath, frontMatter: parsed.frontMatter ?? {} }
  } catch {
    throw new Error(`easy-markdown-to-html 输出非 JSON:\n${run.stdout}`)
  }
}

// ---- HTML 处理 ----

/**
 * 剥离 doocs/md 渲染产物里 base.css 遗留的 #output 作用域，
 * 让规则能匹配无 #output 祖先的 section.container 片段。
 * 与 md 网页版 share-styles.ts 的 stripOutputScope 一致。
 */
function stripOutputScope(css: string): string {
  let out = css
  out = out.replace(/#output\s*\{/g, `body {`)
  out = out.replace(/#output\s+/g, ``)
  out = out.replace(/^#output\s*/gm, ``)
  return out
}

/**
 * 把 <style> 块内联进每个元素，供微信使用。
 * 微信图文渲染不忠实应用 <style> 块，只认元素上的内联样式；
 * 官方 doocs/md 的 processClipboardContent 正是用 juice 做这步
 * （md/apps/web/src/services/export/clipboard.ts）。
 * 本地 article.html 保持浏览器友好版本不变，只在发布时转换。
 */
async function inlineStylesForWechat(html: string): Promise<string> {
  const { default: juice } = await import(`juice`)
  const scoped = html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attr: string, body: string) =>
    `<style${attr}>${stripOutputScope(body)}</style>`,
  )
  let out = juice(scoped, {
    inlinePseudoElements: true,
    preserveImportant: true,
    resolveCSSVariables: false,
  })
  // 微信专属修正（对齐 processClipboardContent）：
  // processCSS 已把 --md-* 等解析成字面值，以下 replace 只是兜底
  out = out
    .replace(/([^-])top:(.*?)em/g, `$1transform: translateY($2em)`)
    .replace(/hsl\(var\(--foreground\)\)/g, `#3f3f3f`)
    .replace(/var\(--blockquote-background\)/g, `#f7f7f7`)
    .replace(/var\(--md-primary-color\)/g, `#0F4C81`)
    .replace(/--md-primary-color:.+?;/g, ``)
    .replace(/--md-font-family:.+?;/g, ``)
    .replace(/--md-font-size:.+?;/g, ``)
  return out
}

function stripTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ``)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ``)
    .replace(/<[^>]+>/g, ` `)
    .replace(/&nbsp;/g, ` `)
    .replace(/\s+/g, ` `)
    .trim()
}

function extractFirstHeading(html: string): string | undefined {
  const match = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/i)
  if (!match)
    return undefined
  return stripTags(match[1]!).trim()
}

/**
 * 剥离正文开头的重复 H1（公众号标题已由 --title / frontmatter 提供时调用）。
 * doocs/md 渲染默认保留正文首个 `# 标题`，若发布标题来自外部参数，正文里
 * 再显示一次大标题就是重复的。仅当 H1 是 section 容器第一个子元素时剥离，
 * 避免误伤正文中间的小节标题；标题回退自正文 H1 时不应调用本函数。
 */
function stripLeadingH1(html: string): string {
  const re = /(<section[^>]*>)\s*<h1[^>]*>[\s\S]*?<\/h1>/i
  const match = re.exec(html)
  if (!match)
    return html
  return html.slice(0, match.index + match[1]!.length) + html.slice(match.index + match[0]!.length)
}

function truncate(text: string, max: number): string {
  if (text.length <= max)
    return text
  return text.slice(0, max - 1).replace(/\s+\S*$/, ``) + `…`
}

interface LocalImage { src: string; localPath: string }

/** 扫描 HTML 中所有可上传的本地图片（跳过 http/https/data/mmbiz 与不存在的文件）。 */
function scanLocalImages(html: string, baseDir: string): LocalImage[] {
  const images: LocalImage[] = []
  const imgTagRe = /<img[^>]*>/g
  let match: RegExpExecArray | null
  while ((match = imgTagRe.exec(html))) {
    const tag = match[0]!
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i)
    if (!srcMatch)
      continue
    const src = srcMatch[1]!
    if (/^(https?:|data:|mmbiz)/i.test(src))
      continue
    const localPath = path.resolve(baseDir, src)
    if (!fs.existsSync(localPath)) {
      console.warn(`[warn] 本地图片不存在，跳过: ${localPath}`)
      continue
    }
    images.push({ src, localPath })
  }
  return images
}

/** 上传 HTML 内的本地图片，返回替换后的 HTML 与首个图片的本地路径。 */
async function uploadLocalImages(html: string, baseDir: string, accessToken: string):
  Promise<{ html: string; firstLocalImage?: string }> {
  const images = scanLocalImages(html, baseDir)
  let firstLocalImage: string | undefined
  const replacements: Array<{ index: number; length: number; url: string }> = []
  const imgTagRe = /<img[^>]*>/g
  let match: RegExpExecArray | null
  let imageIndex = 0
  while ((match = imgTagRe.exec(html))) {
    const tag = match[0]!
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i)
    if (!srcMatch)
      continue
    const src = srcMatch[1]!
    if (!/^(https?:|data:|mmbiz)/i.test(src)) {
      const image = images[imageIndex]
      imageIndex++
      if (!image || image.src !== src)
        continue
      const url = await uploadBodyImage(accessToken, image.localPath)
      if (!firstLocalImage)
        firstLocalImage = image.localPath
      // src 值在 html 中的绝对偏移 = 标签起点 + src="..." 起点 + 值在其中的位置
      const absIndex = match.index + srcMatch.index + srcMatch[0].indexOf(src)
      replacements.push({ index: absIndex, length: src.length, url })
    }
  }
  // 从后往前替换，保证偏移不失效
  let out = html
  for (const r of replacements.sort((a, b) => b.index - a.index))
    out = out.slice(0, r.index) + r.url + out.slice(r.index + r.length)
  return { html: out, firstLocalImage }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const input = path.resolve(args.input)
  if (!fs.existsSync(input))
    throw new Error(`文件不存在: ${input}`)

  const ext = path.extname(input).toLowerCase()

  // 1) 渲染 / 直接用 HTML
  let htmlPath = input
  let frontMatter: Record<string, string> = {}
  const isMarkdown = ext === `.md` || ext === `.markdown`
  if (isMarkdown && !args.noRender) {
    const outHtml = args.keepHtml ?? path.join(path.dirname(input), path.basename(input, ext) + `.html`)
    const result = renderMarkdown(input, outHtml, args.renderArgs)
    htmlPath = result.htmlPath
    frontMatter = result.frontMatter
  } else if (isMarkdown) {
    throw new Error(`--no-render 仅适用于 HTML 输入`)
  }

  let html = fs.readFileSync(htmlPath, `utf-8`)

  // 1.5) 回读 easy-markdown-to-html 嵌入的 frontmatter 元信息注释（HTML 输入路径用）
  const metaComment = html.match(/<!--\s*wechat-meta:([A-Za-z0-9+/=]+)\s*-->/)
  if (metaComment) {
    try {
      const meta = JSON.parse(Buffer.from(metaComment[1]!, `base64`).toString(`utf-8`)) as Record<string, string>
      if (meta.title)
        frontMatter.title ??= meta.title
      if (meta.description)
        frontMatter.description ??= meta.description
    } catch {
      // 注释解析失败忽略，回退到标题参数 → H1/H2 → 文件名
    }
    html = html.replace(metaComment[0]!, ``) // 发布内容里剔除元信息注释
  }

  // 1.6) CSS 内联（微信不认 <style> 块，只认元素内联样式；对齐官方 processClipboardContent）
  html = await inlineStylesForWechat(html)

  // 2) 标题 / 摘要 / 作者
  const externalTitle = args.title ?? frontMatter.title
  const title = truncate(
    externalTitle ?? extractFirstHeading(html) ?? path.basename(input, ext),
    64,
  )
  // 2.1) 标题由外部提供（--title / frontmatter）时，正文开头的重复 H1 无保留价值，自动剥离。
  //      （标题回退自正文 H1 时保留 H1，否则标题就丢了）
  if (externalTitle)
    html = stripLeadingH1(html)
  const digestRaw = args.digest ?? frontMatter.description
  const digest = digestRaw ? truncate(digestRaw, 120) : undefined
  const author = args.author ?? frontMatter.author

  // 2.5) 干跑：渲染 + 扫描 + 元信息后即停，不发任何网络请求
  if (args.dryRun) {
    const images = scanLocalImages(html, path.dirname(htmlPath))
    console.log(JSON.stringify({
      dryRun: true,
      htmlPath,
      title,
      digest: digest ?? null,
      author: author ?? null,
      images: images.map((i) => ({ src: i.src, localPath: i.localPath })),
      thumb: args.thumb ?? images[0]?.localPath ?? null,
      renderArgs: args.renderArgs,
    }, null, 2))
    return
  }

  // 3) 凭证 + token
  const { appId, appSecret } = loadCredentials()
  const accessToken = await fetchAccessToken(appId, appSecret)

  // 4) 上传正文本地图片
  const uploaded = await uploadLocalImages(html, path.dirname(htmlPath), accessToken)
  html = uploaded.html

  // 5) 封面
  const thumbLocal = args.thumb ?? uploaded.firstLocalImage
  if (!thumbLocal)
    throw new Error(`无法确定封面：请用 --thumb 指定封面图（或确保文章 HTML 内至少有一张本地图片）`)
  const thumbMediaId = await uploadThumbMaterial(accessToken, thumbLocal)

  // 6) 创建草稿
  const mediaId = await createDraft(accessToken, {
    title,
    author,
    digest,
    content: html,
    thumbMediaId,
    needOpenComment: args.needOpenComment,
    onlyFansCanComment: args.onlyFansCanComment,
  })

  console.log(JSON.stringify({
    ok: true,
    mediaId,
    title,
    digest: digest ?? null,
    thumbMediaId,
    htmlPath,
    message: `已创建草稿，请到公众号后台「草稿箱」确认后发布`,
  }, null, 2))
}

main().catch((err) => {
  console.error(`[easy-post-to-wechat] ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
