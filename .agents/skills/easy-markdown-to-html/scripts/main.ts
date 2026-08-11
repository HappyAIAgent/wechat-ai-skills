// easy-markdown-to-html CLI — Markdown → WeChat-ready themed HTML.
// Themes/colors/custom CSS are passed as parameters; anything omitted falls back
// to the doocs/md open-source project defaults.
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { renderToHtml } from './render'
import type { RenderOptions } from './render'
import {
  codeBlockThemeOptions,
  colorPresets,
  defaultRenderOptions,
  fontFamilyPresets,
  fontSizeOptions,
  headingStyleOptions,
  legendOptions,
  resolvePrimaryColor,
  themeNames,
} from './config'
import type { HeadingStylesInput, ThemeName } from './config'

const HEADING_LEVELS = [`h1`, `h2`, `h3`, `h4`, `h5`, `h6`]

/**
 * 把 frontmatter 的 title/description 以 HTML 注释嵌入输出文件。
 * 发布环节 easy-post-to-wechat 收到的是 HTML（frontmatter 已丢失），
 * 靠这个注释把标题/摘要回传。base64 编码避免 `--` 破坏 HTML 注释语法。
 */
function buildMetaComment(frontMatter: Record<string, string>): string {
  const meta: Record<string, string> = {}
  for (const key of [`title`, `description`]) {
    if (frontMatter[key])
      meta[key] = frontMatter[key]
  }
  if (Object.keys(meta).length === 0)
    return ``
  const payload = Buffer.from(JSON.stringify(meta)).toString(`base64`)
  return `<!-- wechat-meta:${payload} -->\n`
}

function printUsage(exitCode = 0): never {
  console.log(`把 Markdown 转成公众号兼容的主题化 HTML（doocs/md 渲染引擎）

用法:
  bun main.ts <markdown文件> [选项]

选项:
  --theme <name>            主题: ${themeNames.join(' / ')}（默认 ${defaultRenderOptions.theme}）
  --color <name|hex>        主题色: 预设 ${colorPresets.map(c => `${c.label}=${c.value}`).join(' ')}
                            或任意 hex（默认 ${defaultRenderOptions.primaryColor}）
  --custom-css <css>        任意自定义 CSS，优先级最高（可自由造主题）
  --font-family <name|css>  字体: ${fontFamilyPresets.map(f => f.label).join(' / ')} 或 CSS 值
  --font-size <px>          字号: ${fontSizeOptions.join(' / ')}（默认 ${defaultRenderOptions.fontSize}）
  --legend <value>          图片题注: ${legendOptions.join(' / ')}（默认 ${defaultRenderOptions.legend}）
  --heading-styles <kv>     标题样式: 如 "h2=border-bottom,h3=color-only"
                            可选值: ${headingStyleOptions.join(' / ')}
  --code-block-theme <name> 代码高亮: ${codeBlockThemeOptions.join(' / ')}（默认 ${defaultRenderOptions.codeBlockTheme}）
  --mac-code-block          代码块 Mac 风格标题栏（默认关闭）
  --line-number             代码块显示行号（默认关闭）
  --cite                    外链转底部引用（默认关闭）
  --count                   显示阅读时长/字数（默认关闭）
  --indent                  段落首行缩进（默认关闭）
  --justify                 段落两端对齐（默认关闭）
  --theme-mode <light|dark> 图表配色模式（默认 light）
  --out <路径>              输出 HTML 路径（默认与 md 同目录同名）
  --help                    显示帮助

输出:
  HTML 文件默认保存到输入 md 的同目录（article.md → article.html）
  控制台输出 JSON: { htmlPath, words, minutes, frontMatter }
`)
  process.exit(exitCode)
}

function parseKeyValue(value: string): { key: string; val: string } {
  const idx = value.indexOf(`=`)
  if (idx === -1)
    throw new Error(`参数格式错误，应为 key=value: ${value}`)
  return { key: value.slice(0, idx).trim(), val: value.slice(idx + 1).trim() }
}

function parseHeadingStyles(raw: string | undefined): HeadingStylesInput | undefined {
  if (!raw)
    return undefined
  const result: HeadingStylesInput = {}
  for (const item of raw.split(`,`)) {
    const { key, val } = parseKeyValue(item)
    if (!HEADING_LEVELS.includes(key))
      throw new Error(`无效标题级别: ${key}（可选: ${HEADING_LEVELS.join(', ')}）`)
    if (!headingStyleOptions.includes(val as never))
      throw new Error(`无效标题样式: ${val}（可选: ${headingStyleOptions.join(', ')}）`)
    result[key as keyof HeadingStylesInput] = val as HeadingStylesInput[keyof HeadingStylesInput]
  }
  return result
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.length === 0 || args.includes(`--help`) || args.includes(`-h`))
    printUsage(0)

  const opts: RenderOptions = { markdown: `` }
  let inputPath: string | undefined
  let outPath: string | undefined

  const parseValue = (i: number, flag: string): string => {
    const arg = args[i]!
    if (arg.includes(`=`))
      return arg.slice(flag.length + 1)
    const next = args[i + 1]
    if (next === undefined)
      throw new Error(`缺少 ${flag} 的值`)
    return next
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!
    if (arg.startsWith(`--`)) {
      const flag = arg.split(`=`)[0]!
      switch (flag) {
        case `--theme`:
          opts.theme = parseValue(i, flag) as ThemeName
          if (!themeNames.includes(opts.theme as never))
            throw new Error(`无效主题: ${opts.theme}（可选: ${themeNames.join(', ')}）`)
          if (!arg.includes(`=`)) i += 1
          break
        case `--color`:
          opts.primaryColor = resolvePrimaryColor(parseValue(i, flag))
          if (!arg.includes(`=`)) i += 1
          break
        case `--custom-css`:
          opts.customCSS = parseValue(i, flag)
          if (!arg.includes(`=`)) i += 1
          break
        case `--font-family`:
          opts.fontFamily = parseValue(i, flag)
          if (!arg.includes(`=`)) i += 1
          break
        case `--font-size`:
          opts.fontSize = parseValue(i, flag)
          if (!arg.includes(`=`)) i += 1
          break
        case `--legend`:
          opts.legend = parseValue(i, flag) as RenderOptions[`legend`]
          if (!legendOptions.includes(opts.legend as never))
            throw new Error(`无效 legend: ${opts.legend}（可选: ${legendOptions.join(', ')}）`)
          if (!arg.includes(`=`)) i += 1
          break
        case `--heading-styles`:
          opts.headingStyles = parseHeadingStyles(parseValue(i, flag))
          if (!arg.includes(`=`)) i += 1
          break
        case `--code-block-theme`:
          opts.codeBlockTheme = parseValue(i, flag)
          if (!codeBlockThemeOptions.includes(opts.codeBlockTheme as never))
            throw new Error(`无效代码高亮主题: ${opts.codeBlockTheme}（可选: ${codeBlockThemeOptions.join(', ')}）`)
          if (!arg.includes(`=`)) i += 1
          break
        case `--mac-code-block`:
          opts.isMacCodeBlock = true
          break
        case `--no-mac-code-block`:
          opts.isMacCodeBlock = false
          break
        case `--line-number`:
          opts.isShowLineNumber = true
          break
        case `--cite`:
          opts.citeStatus = true
          break
        case `--count`:
          opts.countStatus = true
          break
        case `--indent`:
          opts.isUseIndent = true
          break
        case `--justify`:
          opts.isUseJustify = true
          break
        case `--theme-mode`:
          opts.themeMode = parseValue(i, flag) as `light` | `dark`
          if (![`light`, `dark`].includes(opts.themeMode))
            throw new Error(`无效 theme-mode: ${opts.themeMode}（可选: light / dark）`)
          if (!arg.includes(`=`)) i += 1
          break
        case `--out`:
          outPath = parseValue(i, flag)
          if (!arg.includes(`=`)) i += 1
          break
        default:
          throw new Error(`未知参数: ${flag}\n用 --help 查看用法`)
      }
      continue
    }
    if (inputPath === undefined) {
      inputPath = arg
    }
    else {
      throw new Error(`多余的参数: ${arg}`)
    }
  }

  if (!inputPath) {
    console.error(`缺少输入文件`)
    printUsage(1)
  }

  const markdownPath = path.resolve(process.cwd(), inputPath)
  if (!markdownPath.toLowerCase().endsWith(`.md`)) {
    console.error(`输入文件必须是 .md`)
    process.exit(1)
  }
  if (!fs.existsSync(markdownPath)) {
    console.error(`文件不存在: ${markdownPath}`)
    process.exit(1)
  }

  opts.markdown = fs.readFileSync(markdownPath, `utf-8`)
  const { html, frontMatter, readingTime } = renderToHtml(opts)

  const finalPath = outPath
    ? path.resolve(process.cwd(), outPath)
    : markdownPath.replace(/\.md$/i, `.html`)
  if (fs.existsSync(finalPath)) {
    const backup = `${finalPath}.bak-${Date.now()}`
    fs.renameSync(finalPath, backup)
    console.error(`[easy-markdown-to-html] 已备份旧文件到: ${backup}`)
  }
  fs.writeFileSync(finalPath, buildMetaComment(frontMatter) + html, `utf-8`)

  console.log(JSON.stringify({
    htmlPath: finalPath,
    words: readingTime.words,
    minutes: readingTime.minutes,
    theme: opts.theme ?? defaultRenderOptions.theme,
    primaryColor: opts.primaryColor ?? defaultRenderOptions.primaryColor,
    frontMatter,
  }, null, 2))
}

try {
  main()
}
catch (error) {
  console.error(`错误: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
