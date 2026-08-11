// Headless render pipeline: Markdown → WeChat-ready themed HTML.
// Adapted from packages/mcp-server/src/render-article.ts in the doocs/md monorepo.
import './polyfill.ts'

import fs from 'node:fs'
import path from 'node:path'
import { initRenderer } from '@md/core/renderer'
import { renderMarkdown, postProcessHtml } from '@md/core/utils'
import { processCSS } from '@md/core/theme/cssProcessor'
import { generateCSSVariables, generateHeadingStyles } from '@md/core/theme/cssVariables'
import type { HeadingLevel, HeadingStyleType } from '@md/shared/configs/style'
import type { ThemeName, HeadingStylesInput, LegendValue } from './config'
import { defaultRenderOptions, loadCodeBlockCSS } from './config'

export interface RenderOptions {
  markdown: string
  theme?: ThemeName
  primaryColor?: string
  fontFamily?: string
  fontSize?: string
  legend?: LegendValue
  isMacCodeBlock?: boolean
  isShowLineNumber?: boolean
  citeStatus?: boolean
  countStatus?: boolean
  themeMode?: `light` | `dark`
  isUseIndent?: boolean
  isUseJustify?: boolean
  headingStyles?: HeadingStylesInput
  codeBlockTheme?: string
  customCSS?: string
}

export interface RenderedOutput {
  html: string
  frontMatter: Record<string, unknown>
  readingTime: { words: number; minutes: number }
}

const themesDir = path.resolve(import.meta.dirname, `themes`)
const themeMap: Record<string, string> = {
  default: fs.readFileSync(path.join(themesDir, `default.css`), `utf-8`),
  grace: fs.readFileSync(path.join(themesDir, `grace.css`), `utf-8`),
  simple: fs.readFileSync(path.join(themesDir, `simple.css`), `utf-8`),
}
const baseCSSContent = fs.readFileSync(path.join(themesDir, `base.css`), `utf-8`)

function escapeStyleContent(css: string): string {
  return css.replace(/<\/style/gi, `<\\/style`)
}

function normalizeHeadingStyles(input?: HeadingStylesInput): Partial<Record<HeadingLevel, HeadingStyleType>> | undefined {
  if (!input)
    return undefined
  const normalized: Partial<Record<HeadingLevel, HeadingStyleType>> = {}
  for (const [level, style] of Object.entries(input)) {
    if (style && style !== `default`)
      normalized[level as HeadingLevel] = style
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function renderToHtml(input: RenderOptions): RenderedOutput {
  const theme = input.theme ?? defaultRenderOptions.theme
  const primaryColor = input.primaryColor ?? defaultRenderOptions.primaryColor
  const fontFamily = input.fontFamily ?? defaultRenderOptions.fontFamily
  const fontSize = input.fontSize ?? defaultRenderOptions.fontSize
  const legend = input.legend ?? defaultRenderOptions.legend
  const codeBlockTheme = input.codeBlockTheme ?? defaultRenderOptions.codeBlockTheme
  const headingStyles = normalizeHeadingStyles(input.headingStyles)

  const renderer = initRenderer({
    isMacCodeBlock: input.isMacCodeBlock ?? defaultRenderOptions.isMacCodeBlock,
    isShowLineNumber: input.isShowLineNumber ?? defaultRenderOptions.isShowLineNumber,
    citeStatus: input.citeStatus ?? defaultRenderOptions.citeStatus,
    countStatus: input.countStatus ?? defaultRenderOptions.countStatus,
    themeMode: input.themeMode ?? defaultRenderOptions.themeMode,
    legend,
  })

  const { html: baseHtml, readingTime } = renderMarkdown(input.markdown, renderer)
  const processedHtml = postProcessHtml(baseHtml, readingTime, renderer)
  const { yamlData } = renderer.parseFrontMatterAndContent(input.markdown)

  const cssConfig = {
    primaryColor,
    fontFamily,
    fontSize,
    isUseIndent: input.isUseIndent ?? defaultRenderOptions.isUseIndent,
    isUseJustify: input.isUseJustify ?? defaultRenderOptions.isUseJustify,
    headingStyles,
  }

  const variablesCSS = generateCSSVariables(cssConfig)
  const headingStylesCSS = generateHeadingStyles(cssConfig)
  const themeCSS = themeMap[theme] ?? themeMap.default

  // 设计 token 最小补齐：doocs/md 网页版在 :root 注入、但无头渲染漏掉的变量。
  // 主题里实际用到而没定义的只有 --foreground（标题/表格文字色与表格边框的根因）
  // 和 --blockquote-background（引用块底色）。缺了它们 hsl(var(--foreground))
  // 解析为非法颜色，整条声明被浏览器丢弃（表格边框丢失、default 主题 h1/h3/h4
  // 文字色失效）。值对照官网 apps/web/src/assets/index.css 亮色主题。
  // 仅补 token、不注入任何样式，不影响各主题标题的居中/背景设计。
  const designTokensCSS = `
:root {
  --foreground: 0 0% 3.9%;
  --blockquote-background: #f7f7f7;
}
`.trim()

  let hljsCSS = ``
  if (codeBlockTheme) {
    try {
      hljsCSS = escapeStyleContent(loadCodeBlockCSS(codeBlockTheme))
    }
    catch (error) {
      console.error(
        `[easy-markdown-to-html] 代码高亮主题 ${codeBlockTheme} 加载失败，跳过: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  const customCSS = escapeStyleContent(input.customCSS?.trim() ?? ``)

  const mergedCSS = [
    designTokensCSS,
    variablesCSS,
    baseCSSContent,
    themeCSS,
    headingStylesCSS,
    hljsCSS,
    customCSS,
  ].filter(Boolean).join(`\n\n`)

  const html = `<style>\n${processCSS(mergedCSS)}\n</style>\n${processedHtml}`

  return {
    html,
    frontMatter: yamlData,
    readingTime: {
      words: readingTime.words,
      minutes: readingTime.minutes,
    },
  }
}
