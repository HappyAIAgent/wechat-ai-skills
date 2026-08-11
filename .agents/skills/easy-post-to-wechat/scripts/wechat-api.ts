// Self-contained WeChat Official Account API helpers for easy-post-to-wechat.
// Uses only Node/Bun built-ins (global fetch + FormData) — no third-party deps.
// Endpoints follow the WeChat 公众号 API (api.weixin.qq.com).
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const TOKEN_URL = `https://api.weixin.qq.com/cgi-bin/token`
const UPLOAD_BODY_IMG_URL = `https://api.weixin.qq.com/cgi-bin/media/uploadimg`
const UPLOAD_MATERIAL_URL = `https://api.weixin.qq.com/cgi-bin/material/add_material`
const DRAFT_URL = `https://api.weixin.qq.com/cgi-bin/draft/add`

export interface WechatCredentials {
  appId: string
  appSecret: string
}

/** Read a simple KEY=value env file (ignores comments / malformed lines). */
function loadEnvFile(file: string): Record<string, string> {
  const env: Record<string, string> = {}
  if (!fs.existsSync(file))
    return env
  for (const line of fs.readFileSync(file, `utf-8`).split(`\n`)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (match) {
      env[match[1]] = match[2]!.trim().replace(/^["']|["']$/g, ``)
    }
  }
  return env
}

/**
 * Resolve WeChat credentials: process.env → <cwd>/.baoyu-skills/.env.
 * Same lookup as baoyu-post-to-wechat.
 */
export function loadCredentials(): WechatCredentials {
  const cwdEnv = loadEnvFile(path.join(process.cwd(), `.baoyu-skills`, `.env`))
  const appId = process.env.WECHAT_APP_ID ?? cwdEnv.WECHAT_APP_ID
  const appSecret = process.env.WECHAT_APP_SECRET ?? cwdEnv.WECHAT_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error(
      `缺少 WECHAT_APP_ID / WECHAT_APP_SECRET。请在 <项目根>/.baoyu-skills/.env 或环境变量中配置。`,
    )
  }
  return { appId, appSecret }
}

export async function fetchAccessToken(appId: string, appSecret: string): Promise<string> {
  const url = `${TOKEN_URL}?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
  const res = await fetch(url)
  const data = await res.json() as { access_token?: string; errcode?: number; errmsg?: string }
  if (data.errcode)
    throw new Error(`获取 access_token 失败 ${data.errcode}: ${data.errmsg}`)
  if (!data.access_token)
    throw new Error(`获取 access_token 失败：接口未返回 access_token`)
  return data.access_token
}

function mimeOf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
  }
  return map[ext] ?? 'application/octet-stream'
}

function assertSupportedImage(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === `.webp`) {
    throw new Error(
      `微信 API 不支持 WebP 图片: ${filePath}（会报 40113: unsupported file type）。` +
      `请先用 baoyu-compress-image 转成 PNG，或 --thumb 传入 PNG 封面。`,
    )
  }
}

/**
 * Upload a body image (content image) → returns a permanent mmbiz.qpic.cn URL
 * usable directly inside the article HTML.
 */
export async function uploadBodyImage(accessToken: string, filePath: string): Promise<string> {
  const absolute = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(absolute))
    throw new Error(`正文图片不存在: ${absolute}`)
  assertSupportedImage(absolute)

  const form = new FormData()
  form.append(`media`, new Blob([fs.readFileSync(absolute)], { type: mimeOf(absolute) }), path.basename(absolute))
  const res = await fetch(`${UPLOAD_BODY_IMG_URL}?access_token=${accessToken}`, { method: `POST`, body: form })
  const data = await res.json() as { url?: string; errcode?: number; errmsg?: string }
  if (data.errcode)
    throw new Error(`上传正文图片失败 ${data.errcode}: ${data.errmsg}`)
  if (!data.url)
    throw new Error(`上传正文图片失败：接口未返回 url`)
  return data.url
}

/**
 * Upload a permanent image material → returns thumb_media_id (cover).
 */
export async function uploadThumbMaterial(accessToken: string, filePath: string): Promise<string> {
  const absolute = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(absolute))
    throw new Error(`封面图片不存在: ${absolute}`)
  assertSupportedImage(absolute)

  const form = new FormData()
  form.append(`media`, new Blob([fs.readFileSync(absolute)], { type: mimeOf(absolute) }), path.basename(absolute))
  const res = await fetch(`${UPLOAD_MATERIAL_URL}?type=image&access_token=${accessToken}`, { method: `POST`, body: form })
  const data = await res.json() as { media_id?: string; errcode?: number; errmsg?: string }
  if (data.errcode)
    throw new Error(`上传封面素材失败 ${data.errcode}: ${data.errmsg}`)
  if (!data.media_id)
    throw new Error(`上传封面素材失败：接口未返回 media_id`)
  return data.media_id
}

export interface DraftArticle {
  title: string
  author?: string
  digest?: string
  content: string
  thumbMediaId: string
  needOpenComment?: number
  onlyFansCanComment?: number
}

/** Create a draft (草稿箱) via draft/add. Returns the draft media_id. */
export async function createDraft(accessToken: string, article: DraftArticle): Promise<string> {
  const payload: Record<string, unknown> = {
    article_type: `news`,
    title: article.title,
    content: article.content,
    thumb_media_id: article.thumbMediaId,
    need_open_comment: article.needOpenComment ?? 1,
    only_fans_can_comment: article.onlyFansCanComment ?? 0,
  }
  if (article.author)
    payload.author = article.author
  if (article.digest)
    payload.digest = article.digest

  const res = await fetch(`${DRAFT_URL}?access_token=${accessToken}`, {
    method: `POST`,
    headers: { 'Content-Type': `application/json` },
    body: JSON.stringify({ articles: [payload] }),
  })
  const data = await res.json() as { media_id?: string; errcode?: number; errmsg?: string }
  if (data.errcode)
    throw new Error(`发布草稿失败 ${data.errcode}: ${data.errmsg}`)
  if (!data.media_id)
    throw new Error(`发布草稿失败：接口未返回 media_id`)
  return data.media_id
}
