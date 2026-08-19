// Option lists and default values for easy-markdown-to-html.
// Defaults mirror the doocs/md open-source project (packages/mcp-server/src/config-options.ts):
// when a parameter is not passed, the project's default is used.
import fs from 'node:fs'
import path from 'node:path'

export const colorPresets: ReadonlyArray<{ value: string; label: string }> = [
  { value: `#0F4C81`, label: `经典蓝` },
  { value: `#009874`, label: `翡翠绿` },
  { value: `#FA5151`, label: `活力橘` },
  { value: `#FECE00`, label: `柠檬黄` },
  { value: `#92617E`, label: `薰衣紫` },
  { value: `#55C9EA`, label: `天空蓝` },
  { value: `#B76E79`, label: `玫瑰金` },
  { value: `#556B2F`, label: `橄榄绿` },
  { value: `#333333`, label: `石墨黑` },
  { value: `#A9A9A9`, label: `雾烟灰` },
  { value: `#FFB7C5`, label: `樱花粉` },
]

export const themeNames = [`default`, `grace`, `simple`] as const
export type ThemeName = (typeof themeNames)[number]

const themeAliases: Readonly<Record<string, ThemeName>> = {
  [`default`]: `default`,
  [`经典`]: `default`,
  [`grace`]: `grace`,
  [`优雅`]: `grace`,
  [`simple`]: `simple`,
  [`简洁`]: `simple`,
}

export function resolveThemeName(value: string): ThemeName {
  const theme = themeAliases[value.trim()]
  if (theme)
    return theme
  throw new Error(`无效主题: ${value}（可选: ${themeNames.join(' / ')}，中文: 经典/优雅/简洁）`)
}

export const fontFamilyPresets = [
  { label: `无衬线`, value: `-apple-system-font,BlinkMacSystemFont, Helvetica Neue, PingFang SC, Hiragino Sans GB , Microsoft YaHei UI , Microsoft YaHei ,Arial,sans-serif` },
  { label: `衬线`, value: `Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', Cambria, Cochin, Georgia, Times, 'Times New Roman', serif` },
  { label: `等宽`, value: `Menlo, Monaco, 'Courier New', monospace` },
]

export const fontSizeOptions = [`14px`, `15px`, `16px`, `17px`, `18px`]

export const legendOptions = [`title-alt`, `alt-title`, `title`, `alt`, `filename`, `none`] as const
export type LegendValue = (typeof legendOptions)[number]

export const headingStyleOptions = [`default`, `color-only`, `border-bottom`, `border-left`, `custom`] as const
export type HeadingStyleType = (typeof headingStyleOptions)[number]
export type HeadingStylesInput = Partial<Record<`h1` | `h2` | `h3` | `h4` | `h5` | `h6`, HeadingStyleType>>

// highlight.js style names that ship inside the installed highlight.js package.
// easy-markdown-to-html reads these locally (offline) instead of fetching from a CDN.
export const codeBlockThemeOptions = [
  `github`, `github-dark`, `atom-one-light`, `atom-one-dark`,
  `monokai`, `vs`, `xcode`, `nord`, `tokyo-night-light`, `tokyo-night-dark`,
] as const

export const defaultRenderOptions = {
  theme: `default` as ThemeName,
  primaryColor: colorPresets[0].value,
  fontFamily: fontFamilyPresets[0].value,
  fontSize: `16px`,
  legend: `alt` as LegendValue,
  // 项目偏好：代码高亮默认深色 + Mac 窗口样式（偏离开源默认 github/关，为项目统一风格）
  codeBlockTheme: `github-dark`,
  isMacCodeBlock: true,
  isShowLineNumber: false,
  citeStatus: false,
  countStatus: false,
  themeMode: `light` as const,
  isUseIndent: false,
  isUseJustify: false,
}

/** Resolve a color value that may be a preset name or a hex string. */
export function resolvePrimaryColor(value: string): string {
  const preset = colorPresets.find((c) => c.value.toLowerCase() === value.toLowerCase())
    ?? colorPresets.find((c) => c.label === value)
  if (preset)
    return preset.value
  if (/^#[0-9a-f]{3,8}$/i.test(value))
    return value
  throw new Error(`无效主题色: ${value}（可用预设: ${colorPresets.map(c => c.label).join('/')}，或任意 hex，如 #E60000）`)
}

/** Read the merged highlight.js CSS for a theme name from the local package. */
export function loadCodeBlockCSS(name: string): string {
  const cssPath = path.resolve(
    import.meta.dirname,
    `../node_modules/highlight.js/styles/${name}.min.css`,
  )
  try {
    return fs.readFileSync(cssPath, `utf-8`)
  }
  catch {
    const fallback = path.resolve(import.meta.dirname, `../node_modules/highlight.js/styles/${name}.css`)
    try {
      return fs.readFileSync(fallback, `utf-8`)
    }
    catch {
      throw new Error(`找不到代码高亮主题 ${name} 的本地 CSS（已安装 highlight.js?）`)
    }
  }
}
