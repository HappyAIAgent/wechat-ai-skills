#!/usr/bin/env bun
/**
 * car-news-images.ts — 官方通稿配图采集器
 *
 * 从必应搜索新闻稿 → 按站点解析配图 → 下载去重 → 记录来源 → 不足时回退汽车之家。
 *
 * 数据源（官方通稿配图）:
 *   新浪: auto.sina.com.cn, n.sinaimg.cn 图片
 *   IT之家: www.ithome.com, data-original 懒加载图片
 *   网易: m.163.com, dingyue.ws.126.net 原图
 *
 * 用法:
 *   bun run car-news-images.ts "<车型名>" "<输出目录>" [--min N] [--no-fallback]
 *
 * 示例:
 *   bun run car-news-images.ts "零跑A05" "00-草稿/20260812_零跑A05上市"
 *   bun run car-news-images.ts "比亚迪海豹06GT" "00-草稿/20260813_海豹06GT" --min 15
 *
 * 输出:
 *   <输出目录>/images/          — 下载的新闻稿配图（jpg/png）
 *   <输出目录>/sources.md       — 图片来源记录
 *   images 数组到 stdout（JSON）
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";
import {
  HEADERS,
  DOMAIN_WHITELIST,
  SINA_FILTER_KEYWORDS,
  EXCLUDE_IMAGE_KEYWORDS,
  MIN_IMAGE_SIZE,
  MAX_IMAGE_SIZE,
  TARGET_IMAGE_SIZE,
  DELAY_MS,
  PY_SCRIPT,
  SCENE_IMAGE_KEYWORDS,
  OFFICIAL_SITES,
  OFFICIAL_MODEL_SITES,
} from "./car-news-images-config";

// ─── Python venv / crawl4ai 环境准备（方案 D 用） ────────────────────────────────
// 目标：无 venv 自动创建，未装 crawl4ai 自动 pip 安装，让回退链路开箱即用。

/** 探测 venv python 路径（Windows: .venv/Scripts/python.exe，macOS/Linux: .venv/bin/python） */
function venvPython(): string | null {
  const candidates =
    process.platform === "win32"
      ? [join(process.cwd(), ".venv/Scripts/python.exe")]
      : [join(process.cwd(), ".venv/bin/python")];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

/** 确保 crawl4ai 可用：返回可执行的 python 路径；失败抛错（由调用方 catch 后走下一级回退） */
function ensurePythonEnv(): string {
  // 1) 定位 python：优先项目 venv，没有则用系统 python
  let pythonBin = venvPython() ?? "python";

  // 2) venv 不存在 → 自动创建（用系统 python 建 venv）
  if (!venvPython()) {
    console.log("  ⚙️ 未检测到项目 .venv，正在创建虚拟环境…");
    execSync(`"${pythonBin}" -m venv "${join(process.cwd(), ".venv")}"`, {
      encoding: "utf-8",
      timeout: 120000,
      stdio: ["ignore", "inherit", "inherit"],
    });
    pythonBin = venvPython()!; // 创建成功后必存在
    if (!pythonBin) throw new Error("venv 创建失败：未找到 .venv/Scripts/python.exe");
  }

  // 3) crawl4ai 未安装 → pip 安装
  try {
    execSync(`"${pythonBin}" -c "import crawl4ai"`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    console.log("  ⚙️ 未检测到 crawl4ai，正在安装（pip install crawl4ai，可能需数分钟）…");
    execSync(`"${pythonBin}" -m pip install crawl4ai`, {
      encoding: "utf-8",
      timeout: 600000, // 10 分钟：crawl4ai 依赖较多
      stdio: ["ignore", "inherit", "inherit"],
    });
  }

  return pythonBin;
}

/** 检查图片 URL 是否为场景图/风景图（应排除，非实车图） */
function shouldExcludeSceneImage(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return SCENE_IMAGE_KEYWORDS.some((keyword) => lowerUrl.includes(keyword));
}

// ─── 类型 ───────────────────────────────────────────────────────────────────────

interface ImageEntry {
  file: string;
  url: string;
  source: string; // 媒体名（新浪/IT之家/网易）
  article: string; // 原文章链接
  size: number;
  meta?: { alt: string; headings: string[]; nearbyText: string }; // 官网图语义（图注用）
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────────

/** 检查图片 URL 是否应该被排除（logo、图标、二维码等） */
function shouldExcludeImage(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return EXCLUDE_IMAGE_KEYWORDS.some((keyword) => lowerUrl.includes(keyword));
}

/** 计算内容 hash（用于去重） */
function contentHash(buffer: Buffer): string {
  return createHash("md5").update(buffer).digest("hex");
}

// ─── 官网图片采集（SPA 嵌入式 JSON 提取） ────────────────────────────────
//
// 很多车企官网（理想/零跑/小鹏等）是 SPA，车辆大图并不出现在渲染后的
// <img> 标签里，而是以内嵌 JSON 数据形式存在（如 ideal 的 lxCdnUrl 指向
// 页面配置 JSON，内含全部章节组件和图片 URL）。直接抓 HTML 源码反而能拿到
// 完整图片清单，且无需启动 Chrome。
//
// 提取策略（按优先级）：
//   1. 抓官网 HTML 源码
//   2. 扫描 HTML 中形如 lxCdnUrl/jsonUrl 的 .json 数据源 URL，下载并递归提取图片
//   3. 扫描 HTML 内联 <script> 中的 JSON（__NEXT_DATA__ / window.__INITIAL_STATE__ 等）
//   4. 回退 baoyu-fetch（Chrome CDP 渲染）提取 <img>

/** 从任意文本中提取图片 URL（http(s)，jpeg/jpg/png/webp 结尾，可带查询串） */
function extractImageUrlsFromText(text: string): string[] {
  const urls: string[] = [];
  // 匹配 "https://cdn.xxx/path/image.jpg?size=1" 或 /image.png（JSON 中带引号或裸文本）
  const re = /https?:\/\/[^\s"'<>\\]+?\.(?:jpe?g|png|webp)(?:\?[^\s"'<>\\]*)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const u = m[0];
    // 过滤损坏 URL：页面内嵌 JSON 常被 HTML 转义（&quot;），正则排除类拦不住转义引号，
    // 匹配结果会横跨整个 JSON 串（如 "...bao8.html&quot;,&quot;text&quot;... 直到下一个真 .jpg"）。
    // 含 &quot;/&#34;/{/}/字面引号 的 URL 一律视为损坏。
    if (/&(?:quot|#34);|[{}"]/.test(u)) continue;
    urls.push(u);
  }
  return [...new Set(urls)];
}

/** 递归遍历 JSON 对象，收集所有图片 URL（保留路径层级去重） */
function extractImageUrlsFromJson(node: unknown, out: Set<string>): void {
  if (node == null) return;
  if (typeof node === "string") {
    for (const u of extractImageUrlsFromText(node)) out.add(u);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) extractImageUrlsFromJson(item, out);
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      extractImageUrlsFromJson(v, out);
    }
  }
}

/** 从 HTML 中提取嵌入式 JSON 数据源 URL（lxCdnUrl/jsonUrl/__NEXT_DATA__ 等） */
function extractEmbeddedJsonUrls(html: string): string[] {
  const urls: string[] = [];
  // 常见字段名：lxCdnUrl / jsonUrl / dataUrl / pageJsonUrl / pageDataUrl / __NEXT_DATA__
  const keyRe = /"(?:lxCdnUrl|jsonUrl|dataUrl|pageJsonUrl|pageDataUrl|__NEXT_DATA__|__INITIAL_STATE__)"\s*:\s*"([^"]+\.json(?:[^"]*)?)"/gi;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(html)) !== null) {
    const u = m[1];
    if (u.startsWith("http://") || u.startsWith("https://")) urls.push(u);
    else if (u.startsWith("//")) urls.push("https:" + u);
    else if (u.startsWith("/")) urls.push(u); // 相对路径，由调用方拼 base
  }
  return [...new Set(urls)];
}

/** 从 HTML 中提取内联 <script> JSON 块（__NEXT_DATA__ 等） */
function extractInlineScriptJson(html: string): string[] {
  const blocks: string[] = [];
  // <script id="__NEXT_DATA__" type="application/json">{...}</script>
  const re1 = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(html)) !== null) blocks.push(m[1]);
  // window.__INITIAL_STATE__ = {...}
  const re2 = /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/i;
  const m2 = re2.exec(html);
  if (m2) blocks.push(m2[1]);
  return blocks;
}

/** HTML 实体反转义（data-json 属性值是 HTML 转义 JSON） */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** 提取 HTML 中所有 data-json="..." 属性值（反转义后返回，供 JSON.parse） */
function extractDataJsonBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /data-json="([\s\S]*?)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) blocks.push(decodeHtmlEntities(m[1]));
  return blocks;
}

/** 从车型页 URL 推断车型 slug（/bao5 → "bao5"）；无明确车型段返回空串 */
function inferModelSlug(url: string): string {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
    if (/\.\w+$/.test(seg)) return ""; // 带扩展名（.html）→ 品牌/非车型页
    return /^[a-z0-9][a-z0-9-]{1,19}$/i.test(seg) ? seg.toLowerCase() : "";
  } catch {
    return "";
  }
}

/** 相对图片路径解析为绝对 URL */
function resolveImageUrl(u: string, baseUrl: string): string | null {
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) {
    try {
      return new URL(u, baseUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 递归遍历内嵌 JSON，收集图片 URL + 语义标题（供图注使用）。
 * - 图片字段：img.pc / bg.pc / posterpc / img（字符串）等，相对路径拼 baseUrl 转绝对
 * - 语义标题：title.text / text.title.text / name.text / tabTitle.text / tabDes.text
 * - 车型过滤：页面含多车型导航图（豹5页混入豹8/钛3/钛7），modelSlug 非空时只保留本车型图
 * - 排除导航图标路径（toubudaohang/chexi/daohang）
 */
function extractImagesWithMetaFromJson(
  node: unknown,
  baseUrl: string,
  modelSlug: string,
  urls: Set<string>,
  metaMap: Map<string, OfficialImage["meta"]>
): void {
  if (node == null) return;
  if (typeof node === "string") {
    for (const u of extractImageUrlsFromText(node)) urls.add(u);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) extractImagesWithMetaFromJson(item, baseUrl, modelSlug, urls, metaMap);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;

    let semantic = "";
    let nearbyText = "";
    const textObj = obj.text;
    if (textObj && typeof textObj === "object") {
      const tt = (textObj as Record<string, unknown>).title;
      if (tt && typeof tt === "object") {
        const tv = (tt as Record<string, unknown>).text;
        if (typeof tv === "string" && tv.trim() && tv.trim().length < 60) semantic = tv.trim();
      }
      const dd = (textObj as Record<string, unknown>).des;
      if (dd && typeof dd === "object") {
        const dv = (dd as Record<string, unknown>).text;
        if (typeof dv === "string" && dv.trim()) nearbyText = dv.trim().slice(0, 60);
      }
    }
    if (!semantic) {
      for (const c of [obj.title, obj.name, obj.tabTitle, obj.tabDes]) {
        if (c && typeof c === "object") {
          const tv = (c as Record<string, unknown>).text;
          if (typeof tv === "string" && tv.trim() && tv.trim().length < 60) {
            semantic = tv.trim();
            break;
          }
        }
      }
    }

    const imageCandidates: string[] = [];
    for (const ik of ["pc", "bg", "posterpc", "img"] as const) {
      const v = obj[ik];
      if (typeof v === "string") imageCandidates.push(v);
      else if (v && typeof v === "object") {
        const vp = (v as Record<string, unknown>).pc;
        if (typeof vp === "string") imageCandidates.push(vp);
      }
    }

    for (const u of imageCandidates) {
      if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u)) continue;
      const absUrl = resolveImageUrl(u, baseUrl);
      if (!absUrl) continue;
      if (/toubudaohang|\/chexi\/|daohang/i.test(absUrl)) continue;
      if (modelSlug && !absUrl.toLowerCase().includes(modelSlug)) continue;
      urls.add(absUrl);
      if (semantic) {
        metaMap.set(absUrl, { alt: semantic, headings: [semantic], nearbyText });
      }
    }

    for (const v of Object.values(obj)) extractImagesWithMetaFromJson(v, baseUrl, modelSlug, urls, metaMap);
  }
}

/** 抓取官网 HTML 源码（普通 fetch，无需浏览器） */
async function fetchOfficialHtml(url: string): Promise<string> {
  const r = await fetchWithRetry(url, HEADERS, 30000, 2);
  return await r.text();
}

/**
 * 采集官网图片（增强版）
 *
 * 四级回退链（HTML 提取失败后逐级尝试）：
 *   A. 抓 HTML 源码提取内嵌 JSON / 内联 script / img 标签（理想等站点，无需浏览器）
 *   B. Crawlee + PuppeteerCrawler 滚动渲染（主方案，SPA 懒加载站点，bun 运行 TS）
 *   C. crawl4ai 滚动渲染（备选，自带图片评分过滤）
 *   D. baoyu-fetch Chrome CDP 渲染（最后兜底）
 * 返回去重后的图片 URL 数组（每项带可选语义 meta，供图注使用）。
 */
type OfficialImage = { url: string; meta?: { alt: string; headings: string[]; nearbyText: string } };
async function fetchOfficialImages(url: string): Promise<OfficialImage[]> {
  const urls = new Set<string>();
  const metaMap = new Map<string, OfficialImage["meta"]>();
  let modelSlug = "";

  try {
    // ── 方案 A：直接抓 HTML 源码 ──
    console.log(`  抓取官网 HTML: ${url}`);
    const html = await fetchOfficialHtml(url);

    // A1: 提取嵌入式 .json 数据源并下载
    const jsonUrls = extractEmbeddedJsonUrls(html);
    for (const ju of jsonUrls) {
      try {
        const absUrl = ju.startsWith("http") ? ju : new URL(ju, url).toString();
        const r = await fetchWithRetry(absUrl, HEADERS, 30000, 2);
        const jsonText = await r.text();
        extractImageUrlsFromJson(JSON.parse(jsonText), urls);
        console.log(`    ✓ 数据源 JSON: ${absUrl.substring(0, 80)} → ${urls.size} 张图`);
      } catch (e) {
        console.error(`    ⤬ 数据源 JSON 解析失败: ${(e as Error).message}`);
      }
    }

    // A2: 提取内联 <script> JSON
    const inlineBlocks = extractInlineScriptJson(html);
    for (const block of inlineBlocks) {
      try {
        extractImageUrlsFromJson(JSON.parse(block), urls);
      } catch {
        // 内联 JSON 可能不完整（截断），直接用正则捞图片 URL
        for (const u of extractImageUrlsFromText(block)) urls.add(u);
      }
    }

    // A2.5: 解析 data-json 属性块（HTML 转义 JSON，含相对路径实车图 + 语义标题）
    // 方程豹等站点把车型页内容整体塞进 data-json="..." 属性，图片多为相对路径
    // （/material/...），A3 的绝对 URL 正则抓不到。反转义 + JSON.parse + 递归提取。
    modelSlug = inferModelSlug(url);
    const dataJsonBlocks = extractDataJsonBlocks(html);
    let dataJsonCount = 0;
    for (const block of dataJsonBlocks) {
      try {
        const parsed = JSON.parse(block);
        const before = urls.size;
        extractImagesWithMetaFromJson(parsed, url, modelSlug, urls, metaMap);
        dataJsonCount += urls.size - before;
      } catch {
        // 单块解析失败不阻塞，继续其他块
      }
    }
    if (dataJsonBlocks.length > 0) {
      console.log(`  data-json 内嵌解析: 新增 ${dataJsonCount} 张（共 ${urls.size} 张）`);
    }

    // A3: 直接扫描整个 HTML 的图片 URL（<img src> / CSS background / JSON 字符串）
    for (const u of extractImageUrlsFromText(html)) {
      // 车型 slug 过滤（仅产品资产路径）：车型页常混入其他车型素材（豹5页有钛3视频海报），
      // 只保留本车型路径下的图；理想等 hash URL 站点路径不含车型段，不受影响。
      if (modelSlug && /\/material\/|\/product-detail\/|\/product\//i.test(u) && !u.toLowerCase().includes(modelSlug)) {
        continue;
      }
      urls.add(u);
    }

    console.log(`  HTML 内嵌解析: ${urls.size} 张图`);
  } catch (e) {
    console.error(`  ✗ 官网 HTML 抓取失败: ${(e as Error).message}`);
  }

  // ── 方案 C：回退 Crawlee + PuppeteerCrawler（滚动渲染，主方案） ──
  // 滚动触发懒加载是 SPA 车型页（零跑/小鹏等）拿到实车图的关键。
  // Crawlee+Puppeteer 实测优于 crawl4ai（C16 31张 vs 29张，理想i8 27张 vs 6张），
  // 且 Puppeteer 用 channel:'chrome' 自动定位系统 Chrome（无绝对路径），
  // bun 可直接运行 TS，生态与项目（Bun/TS）契合。
  // 注意：即使获取到图片，如果都是被排除的（如 logo），也应回退到 Crawlee
  const hasUsableImages = [...urls].some(u => !shouldExcludeImage(u) && !shouldExcludeSceneImage(u));
  if (!hasUsableImages) {
    try {
      console.log(`  回退 Crawlee+Puppeteer 滚动渲染: ${url}`);
      const tsScript = join(process.cwd(), ".agents/skills/wechat-car-writer/scripts/crawlee-fetch.ts");
      const result = execSync(
        `bun "${tsScript}" "${url}"`,
        { encoding: "utf-8", timeout: 120000 }
      );
      const data = JSON.parse(result);
      if (data.status === "ok" && data.images) {
        for (const img of data.images) {
          if (img.url) {
            urls.add(img.url);
            // 记录语义 meta（图注用，弥补模型不能读图）
            if (img.meta && (img.meta.headings?.length > 0 || img.meta.nearbyText || img.meta.alt)) {
              metaMap.set(img.url, img.meta);
            }
          }
        }
        console.log(`    crawlee-puppeteer: ${data.images.length} 张官网图`);
      }
    } catch (e) {
      console.error(`  ✗ 官网 Crawlee+Puppeteer 抓取失败: ${(e as Error).message}`);
    }
  }

  // ── 方案 D：再回退 crawl4ai（滚动渲染，备选） ──
  // Crawlee+Puppeteer 失败或无图时，用 crawl4ai 的 scan_full_page 滚动渲染。
  // crawl4ai 自带图片评分（score），可过滤低质图；失败时才走 baoyu-fetch。
  // 环境自动准备：无 .venv 自动创建，未装 crawl4ai 自动 pip 安装（ensurePythonEnv）。
  if (urls.size === 0) {
    try {
      console.log(`  回退 crawl4ai 滚动渲染: ${url}`);
      const pythonBin = ensurePythonEnv();
      const result = execSync(
        `"${pythonBin}" "${PY_SCRIPT}" "${url}" --min-score 3`,
        { encoding: "utf-8", timeout: 120000 }
      );
      // stdout 为 JSON（脚本日志走 stderr，execSync 默认捕获 stdout）
      const data = JSON.parse(result);
      if (data.status === "ok" && data.images) {
        for (const img of data.images) {
          if (img.url) urls.add(img.url);
        }
        console.log(`    crawl4ai: ${data.images.length} 张官网图`);
      }
    } catch (e) {
      console.error(`  ✗ 官网 crawl4ai 抓取失败: ${(e as Error).message}`);
    }
  }

  // ── 方案 B：最后回退 baoyu-fetch（Chrome CDP 渲染） ──
  if (urls.size === 0) {
    try {
      console.log(`  回退 Chrome CDP 渲染: ${url}`);
      const cliPath = join(process.cwd(), ".agents/skills/baoyu-url-to-markdown/scripts/lib/cli.ts");
      const result = execSync(
        `bun "${cliPath}" "${url}" --format json`,
        { encoding: "utf-8", timeout: 60000 }
      );
      const data = JSON.parse(result);
      if (data.status === "ok" && data.media) {
        for (const media of data.media) {
          if (media.kind === "image" && media.url) urls.add(media.url);
        }
      }
    } catch (e) {
      console.error(`  ✗ 官网 CDP 抓取失败: ${(e as Error).message}`);
    }
  }

  // 最终统一过滤：A2 内联 script JSON、A2.5 字符串分支、Crawlee 回退等路径
  // 均可能混入其他车型素材（豹5页有钛3海报），在返回前统一剔除，避免漏网。
  const finalUrls = [...urls].filter(
    (u) =>
      !(modelSlug && /\/material\/|\/product-detail\/|\/product\//i.test(u) && !u.toLowerCase().includes(modelSlug))
  );
  return finalUrls.map((u) => ({ url: u, meta: metaMap.get(u) }));
}

/** fetch 带超时与重试 */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 15000,
  retries = 3
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < retries - 1) await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  throw lastErr!;
}

/** 解码必应重定向 URL：bing.com/ck/a?...&u=a1aHR0c... → base64 decode */
function decodeBingRedirect(url: string): string {
  try {
    const u = new URL(url);
    const uParam = u.searchParams.get("u");
    if (uParam && uParam.startsWith("a")) {
      // 去掉前缀 'a'，base64 decode
      const base64 = uParam.substring(1);
      const decoded = Buffer.from(base64, "base64").toString("utf-8");
      if (decoded.startsWith("http")) return decoded;
    }
  } catch {}
  return url;
}

/** 从 URL 提取域名 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** 检查域名是否在白名单 */
function isWhitelistedDomain(url: string): boolean {
  const domain = extractDomain(url);
  return DOMAIN_WHITELIST.some((d) => domain === d || domain.endsWith("." + d));
}

/** 标准化 URL（去重用） */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // 去掉常见追踪参数
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    u.searchParams.delete("from");
    u.searchParams.delete("share_id");
    return u.toString();
  } catch {
    return url;
  }
}

/** URL 哈希（去重用） */
function urlHash(url: string): string {
  return createHash("md5").update(normalizeUrl(url)).digest("hex").substring(0, 12);
}

/** 延迟 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── 搜索引擎 ─────────────────────────────────────────────────────────────────────

/** 必应搜索 */
async function searchBing(query: string): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encoded}&setlang=zh-CN&cc=CN&count=20`;

  console.log(`  搜索必应: ${query}`);
  const r = await fetchWithRetry(url, HEADERS, 20000);
  const html = await r.text();

  const results: SearchResult[] = [];
  // 解析搜索结果: 按 <li class="b_algo"> 分块提取
  const blockRe = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;

  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];

    // 提取 href
    const hrefMatch = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"/i);
    let rawUrl = hrefMatch ? hrefMatch[1] : "";
    if (!rawUrl) continue;

    // 解码必应重定向
    rawUrl = decodeBingRedirect(rawUrl);

    // 提取 h2 标题
    const h2Match = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const title = h2Match ? h2Match[1].replace(/<[^>]+>/g, "").trim() : "";
    const snippet = ""; // snippet 提取可选

    if (!isWhitelistedDomain(rawUrl)) continue;

    results.push({ url: rawUrl, title, snippet });
    if (results.length >= 10) break;
  }

  console.log(`  找到 ${results.length} 条白名单结果`);
  return results;
}

// ─── 站点解析器 ─────────────────────────────────────────────────────────────────────

/** 新浪：直接 <img src="//n.sinaimg.cn/..."> */
function parseSinaImages(html: string, articleUrl: string): string[] {
  const images: string[] = [];
  const re = /<img[^>]+src="(\/\/n\.sinaimg\.cn\/[^"]+)"[^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    let img = "https:" + m[1];
    // 过滤 logo/分享层
    const lower = img.toLowerCase();
    if (SINA_FILTER_KEYWORDS.some((kw) => lower.includes(kw))) continue;
    images.push(img);
  }

  return [...new Set(images)];
}

/** IT之家：data-original 懒加载（原图无变体，需压缩） */
function parseIthomeImages(html: string, articleUrl: string): string[] {
  const images: string[] = [];
  // data-original="https://img.ithome.com/..."
  const re1 = /data-original="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi;
  let m: RegExpExecArray | null;

  while ((m = re1.exec(html)) !== null) {
    images.push(m[1]);
  }

  // 备用: <img src="https://img.ithome.com/...">
  const re2 = /<img[^>]+src="(https?:\/\/img\.ithome\.com\/[^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>/gi;
  while ((m = re2.exec(html)) !== null) {
    images.push(m[1]);
  }

  return [...new Set(images)];
}

/** 网易：data-src/src（dingyue.ws.126.net 原图 + nimg.ws.126.net thumbnail） */
function parseNeteaseImages(html: string, articleUrl: string): string[] {
  const images: string[] = [];
  // dingyue.ws.126.net 原图
  const re1 = /(?:data-src|src)="(https?:\/\/dingyue\.ws\.126\.net\/[^"]+\.(?:jpg|jpeg|png))"/gi;
  let m: RegExpExecArray | null;

  while ((m = re1.exec(html)) !== null) {
    let img = m[1];
    // nimg.ws.126.net thumbnail 变体：解码 url 参数获取原图
    if (img.includes("nimg.ws.126.net")) {
      try {
        const u = new URL(img);
        const origParam = u.searchParams.get("url");
        if (origParam) img = decodeURIComponent(origParam);
      } catch {}
    }
    images.push(img);
  }

  // 备用: <img src="//nimg.ws.126.net/...">
  const re2 = /src="(\/\/nimg\.ws\.126\.net\/[^"]+\.(?:jpg|jpeg|png))"/gi;
  while ((m = re2.exec(html)) !== null) {
    images.push("https:" + m[1]);
  }

  return [...new Set(images)];
}

/** 通用解析：其他站点兜底 */
function parseGenericImages(html: string, articleUrl: string): string[] {
  const images: string[] = [];
  const re = /<img[^>]+(?:data-original|data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp))"[^>]*>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    let img = m[1];
    // 相对路径 → 绝对
    if (img.startsWith("//")) {
      img = "https:" + img;
    } else if (img.startsWith("/")) {
      try {
        const u = new URL(articleUrl);
        img = u.origin + img;
      } catch {}
    }
    if (img.startsWith("http")) images.push(img);
  }

  return [...new Set(images)];
}

/** 根据域名选择解析器 */
function parseArticleImages(html: string, articleUrl: string): string[] {
  const domain = extractDomain(articleUrl);

  if (domain.includes("sina.com.cn")) {
    return parseSinaImages(html, articleUrl);
  }
  if (domain.includes("ithome.com")) {
    return parseIthomeImages(html, articleUrl);
  }
  if (domain.includes("163.com")) {
    return parseNeteaseImages(html, articleUrl);
  }
  return parseGenericImages(html, articleUrl);
}

// ─── 图片下载 ─────────────────────────────────────────────────────────────────────

/** 下载单张图片，返回 Buffer */
async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    // 处理协议相对路径
    if (url.startsWith("//")) url = "https:" + url;

    const r = await fetchWithRetry(url, { "User-Agent": HEADERS["User-Agent"] }, 20000, 2);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < MIN_IMAGE_SIZE) return null;
    return buf;
  } catch {
    return null;
  }
}

/** 大图压缩：>500KB 时 resize 到 1200 宽 + jpeg q80（公众号加载要求 <500KB） */
async function compressIfNeeded(buf: Buffer): Promise<Buffer> {
  if (buf.byteLength <= TARGET_IMAGE_SIZE) return buf;
  try {
    const sharp = (await import("sharp")).default;
    const compressed = await sharp(buf)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    // 压缩后仍超 500KB 的进一步降质，确保达标（公众号加载）
    if (compressed.byteLength > TARGET_IMAGE_SIZE) {
      return await sharp(buf)
        .rotate()
        .resize({ width: 1000, withoutEnlargement: true })
        .jpeg({ quality: 65 })
        .toBuffer();
    }
    return compressed;
  } catch {
    return buf;
  }
}

/** 批量下载图片，去重，返回 ImageEntry[] */
async function downloadImages(
  urls: string[],
  outDir: string,
  articleUrl: string,
  source: string
): Promise<ImageEntry[]> {
  const imgDir = join(outDir, "images");
  mkdirSync(imgDir, { recursive: true });

  const saved: ImageEntry[] = [];
  const seenHashes = new Set<string>();
  const seenUrls = new Set<string>();

  for (const url of urls) {
    const norm = normalizeUrl(url);
    if (seenUrls.has(norm)) continue;
    seenUrls.add(norm);

    const hash = urlHash(url);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    const buf = await downloadImage(url);
    if (!buf) {
      console.log(`  ⤬ 跳过 ${url.substring(0, 60)}...`);
      await sleep(DELAY_MS);
      continue;
    }

    const ext = (url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || "jpg").toLowerCase();
    const fname = `news-${String(saved.length + 1).padStart(2, "0")}.${ext === "jpeg" ? "jpg" : ext}`;
    writeFileSync(join(imgDir, fname), buf);

    saved.push({
      file: fname,
      url,
      source,
      article: articleUrl,
      size: buf.byteLength,
    });

    console.log(
      `  ✓ ${fname} (${(buf.byteLength / 1024).toFixed(0)}KB) [${source}]`
    );
    await sleep(DELAY_MS);
  }

  return saved;
}

// ─── 来源记录 ─────────────────────────────────────────────────────────────────────

/** 生成 sources.md 图片来源节 */
function generateSourcesMd(images: ImageEntry[], carName: string): string {
  let md = `# 图片来源\n\n`;
  md += `车型: ${carName}\n`;
  md += `采集时间: ${new Date().toISOString()}\n`;
  md += `图片来源: 官方发布会通稿配图（官网/新浪/IT之家/网易等）\n\n`;
  md += `## 图片列表\n\n`;
  md += `| 文件 | 大小 | 来源 | 语义（官网区块标题） | 原文章/URL |\n`;
  md += `|------|------|------|---------------------|-----------|\n`;

  for (const img of images) {
    const size = `${(img.size / 1024).toFixed(0)}KB`;
    const sem = img.meta?.headings?.length
      ? img.meta.headings.slice(0, 2).join(" / ")
      : (img.meta?.nearbyText || "").slice(0, 30) || "-";
    const ref = img.article && !img.article.includes("http") && !img.article.startsWith("https://www.")
      ? img.article
      : img.url;
    md += `| ${img.file} | ${size} | ${img.source} | ${sem} | ${ref} |\n`;
  }

  return md;
}

/** 写出 images-meta.json：file → URL + 语义（图注工作流用，弥补模型不能读图） */
function writeImagesMeta(outDir: string, images: ImageEntry[]): void {
  try {
    const meta = images.map((img) => ({
      file: img.file,
      url: img.url,
      source: img.source,
      semantics: img.meta?.headings?.length ? img.meta.headings.slice(0, 3) : [],
      nearbyText: img.meta?.nearbyText || "",
      alt: img.meta?.alt || "",
    }));
    writeFileSync(join(outDir, "images-meta.json"), JSON.stringify({ generatedAt: new Date().toISOString(), images: meta }, null, 2));
    console.log(`  ✓ 已生成 images-meta.json（${meta.length} 张图的语义信息，供图注使用）`);
  } catch (e) {
    console.error(`  ⚠ 生成 images-meta.json 失败: ${(e as Error).message}`);
  }
}

/** 追加到 spec-data.json 的 images 数组（合并现有结构） */
function mergeImagesToSpecData(
  specDataPath: string,
  newsImages: ImageEntry[],
  fallbackImages: { file: string; specname: string; size: number }[]
): void {
  if (!existsSync(specDataPath)) return;

  try {
    const specData = JSON.parse(readFileSync(specDataPath, "utf-8"));

    // 保留原有汽车之家图片（如果有），加上新闻稿图片
    const existingImages = specData.images || [];
    const mergedImages = [
      ...newsImages.map((img) => ({
        file: img.file,
        specname: "",
        size: img.size,
        source: `官方通稿-${img.source}`,
      })),
      ...fallbackImages.map((img) => ({
        file: img.file,
        specname: img.specname,
        size: img.size,
        source: "汽车之家",
      })),
    ];

    specData.images = mergedImages;
    specData.imageSources = {
      newsImages: newsImages.length,
      fallbackImages: fallbackImages.length,
      total: mergedImages.length,
    };

    writeFileSync(specDataPath, JSON.stringify(specData, null, 2));
  } catch (e) {
    console.error(`  ⚠ 更新 spec-data.json 失败: ${(e as Error).message}`);
  }
}

// ─── 主流程 ─────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`用法:
  bun run car-news-images.ts "<车型名>" "<输出目录>" [options]

选项:
  --min N              最少图片数量（默认 12；注意：实际下载上限 = N × 2，
                       即 --min 12 会尝试下载最多 24 张。建议官网图源用 --min 15 拿满）
  --official-min N     官网图达到 N 张即视为素材足够，跳过新闻稿与汽车之家（默认 5）
  --no-fallback        不回退汽车之家
  --official-url URL   自定义官网 URL（跳过自动匹配）
  --no-official        跳过官网图片采集

示例:
  bun run car-news-images.ts "零跑A05" "00-草稿/20260812_零跑A05上市"
  bun run car-news-images.ts "比亚迪海豹06GT" "00-草稿/20260813_海豹06GT" --min 15
  bun run car-news-images.ts "理想L6" "00-草稿/20260813_理想L6" --official-url "https://www.lixiang.com/l6"
  bun run car-news-images.ts "特斯拉Model 3" "00-草稿/20260813_Model3" --no-official
  bun run car-news-images.ts "理想L8" "00-草稿/20260813_理想L8" --official-min 3

说明:
  图片采集优先级：官网 > 新闻稿 > 汽车之家回退。
  官网支持 SPA 页面：优先解析 HTML 内嵌 JSON（lxCdnUrl/__NEXT_DATA__ 等，
  无需浏览器），失败再回退 Crawlee+Puppeteer 滚动渲染（主方案，同时提取
  每张图的区块语义标题），再回退 crawl4ai，最后 baoyu-fetch CDP。
  官网图下载成功 >= official-min 张时，只用官网素材（无水印），
  自动跳过新闻稿采集与汽车之家回退。
  下载时 >500KB 的图自动压缩（sharp，1200 宽 q80），保证公众号加载速度。
  输出 images/ + sources.md（含 URL 与语义列）+ images-meta.json（图注用），
  同时更新 spec-data.json 的 images 数组。`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    process.exit(0);
  }

  const carName = args[0];
  const outDir = args[1];
  let minImages = 12;
  let officialMin = 5;
  const noFallback = args.includes("--no-fallback");
  const noOfficial = args.includes("--no-official");

  const minIdx = args.indexOf("--min");
  if (minIdx > 0 && args[minIdx + 1]) minImages = Number(args[minIdx + 1]) || 12;

  const officialMinIdx = args.indexOf("--official-min");
  if (officialMinIdx > 0 && args[officialMinIdx + 1]) {
    officialMin = Number(args[officialMinIdx + 1]) || 5;
  }

  // 自定义官网 URL
  let customOfficialUrl = "";
  const officialUrlIdx = args.indexOf("--official-url");
  if (officialUrlIdx > 0 && args[officialUrlIdx + 1]) {
    customOfficialUrl = args[officialUrlIdx + 1];
  }

  mkdirSync(outDir, { recursive: true });

  console.log(`🚗 车型: ${carName}`);
  console.log(`📁 输出: ${outDir}`);
  console.log(`🎯 最少图片: ${minImages} 张`);
  console.log(`🏭 官网素材阈值: ${officialMin} 张（官网图达标则跳过新闻稿/汽车之家）`);
  if (noOfficial) console.log(`⚠️  跳过官网图片采集`);
  if (customOfficialUrl) console.log(`🌐 自定义官网: ${customOfficialUrl}`);
  console.log("");

  // 0. 官网图片采集（可选，优先级最高）
const allImageUrls = new Set<string>();
const imageToArticle = new Map<string, string>();
const imageToSource = new Map<string, string>();
const imageToMeta = new Map<string, { alt: string; headings: string[]; nearbyText: string }>();
  // 官网图片 URL 集合（用于统计官网素材是否足够）
  const officialUrls = new Set<string>();

  // 官网图片采集
  let officialUrl = customOfficialUrl;
  if (!noOfficial && !officialUrl) {
    // 优先匹配车型级别官网（更精确）
    for (const [model, url] of Object.entries(OFFICIAL_MODEL_SITES)) {
      if (carName.includes(model)) {
        officialUrl = url;
        console.log(`  匹配到车型官网: ${model} → ${url}`);
        break;
      }
    }
    // 未匹配到车型级别时，回退到品牌根页面
    if (!officialUrl) {
      for (const [brand, url] of Object.entries(OFFICIAL_SITES)) {
        if (carName.includes(brand)) {
          officialUrl = url;
          console.log(`  匹配到品牌官网: ${brand} → ${url}`);
          break;
        }
      }
    }
  }

  if (!noOfficial && officialUrl) {
    console.log(`\n🏭 官网图片采集: ${officialUrl}`);
    const officialImages = await fetchOfficialImages(officialUrl);
    console.log(`  解析到 ${officialImages.length} 张官网配图`);
    
    for (const img of officialImages) {
      if (!allImageUrls.has(img.url)) {
        allImageUrls.add(img.url);
        officialUrls.add(img.url);
        imageToArticle.set(img.url, officialUrl);
        imageToSource.set(img.url, "官网");
        if (img.meta) imageToMeta.set(img.url, img.meta);
      }
    }
  } else if (noOfficial) {
    console.log(`\n⚠️  已跳过官网图片采集`);
  } else {
    console.log(`\nℹ️  未找到匹配的官网，请使用 --official-url 指定`);
  }

  // 0.5 官网素材判定：官网图足够时跳过新闻稿（避免混入其他来源）
  // 注意：这里判定的是"解析到的官网 URL 数"，下载阶段会再按实际成功数判定
  const officialEnough = !noOfficial && officialUrls.size >= officialMin;
  if (officialEnough) {
    console.log(`\n✅ 官网配图 ${officialUrls.size} 张 ≥ ${officialMin} 张，官网素材足够，跳过新闻稿采集`);
  }

  // 1. 必应搜索新闻稿（官网素材不足时执行；多关键词合并，提高新闻稿命中率）
  const queries = [`"${carName}" 上市`, `"${carName}" 价格 配置`, `"${carName}" 新车发布`];
  const seenSearchUrls = new Set<string>();
  const results: SearchResult[] = [];
  if (!officialEnough) {
    for (const q of queries) {
      const r = await searchBing(q);
      for (const item of r) {
        if (!seenSearchUrls.has(item.url)) {
          seenSearchUrls.add(item.url);
          results.push(item);
        }
      }
      if (results.length >= 10) break;
    }

    if (results.length === 0) {
      console.log("  ⚠ 未找到新闻稿，直接走汽车之家回退");
    }
  } else {
    console.log("  ⤬ 跳过必应搜索（官网素材已足够）");
  }

  // 2. 抓取文章页面 → 解析配图（官网素材不足时执行）
  if (!officialEnough) {
    for (const result of results.slice(0, 5)) {
      const domain = extractDomain(result.url);
      let source = "未知";
      if (domain.includes("sina.com.cn")) source = "新浪";
      else if (domain.includes("ithome.com")) source = "IT之家";
      else if (domain.includes("163.com")) source = "网易";
      else if (domain.includes("yiche.com")) source = "易车";
      else if (domain.includes("autohome.com.cn")) source = "汽车之家";

      console.log(`\n📰 抓取: [${source}] ${result.title.substring(0, 40)}...`);

      try {
        const r = await fetchWithRetry(result.url, HEADERS, 20000);
        const html = await r.text();
        const images = parseArticleImages(html, result.url);

        console.log(`  解析到 ${images.length} 张配图`);

        for (const img of images) {
          if (!allImageUrls.has(img)) {
            allImageUrls.add(img);
            imageToArticle.set(img, result.url);
            imageToSource.set(img, source);
          }
        }
      } catch (e) {
        console.error(`  ✗ 抓取失败: ${(e as Error).message}`);
      }

      await sleep(500); // 礼貌限速
    }
  }

  console.log(`\n📊 共发现 ${allImageUrls.size} 张去重配图`);

  // 3. 下载图片（官网优先，统计官网成功数）
  const imgDir = join(outDir, "images");
  mkdirSync(imgDir, { recursive: true });
  const newsImages: ImageEntry[] = [];
  const seenContentHashes = new Set<string>(); // 内容 hash 去重
  const seenUrls = new Set<string>(); // URL 去重
  let officialDownloaded = 0; // 官网图实际成功下载数

  for (const url of allImageUrls) {
    // 官网素材已达标时：只下载官网图（allImageUrls 中官网在前，非官网自然被跳过）
    if (officialDownloaded >= officialMin && !officialUrls.has(url)) continue;

    if (newsImages.length >= minImages * 2) break; // 多下载一些，后面有过滤

    // URL 去重
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    // 排除 logo、图标、二维码等
    if (shouldExcludeImage(url)) {
      console.log(`  ⤬ 排除 ${url.substring(0, 50)}... (包含排除关键词)`);
      continue;
    }

    // 排除场景图/风景图（官网/新闻稿的营销素材，非实车图）
    if (shouldExcludeSceneImage(url)) {
      console.log(`  ⤬ 排除 ${url.substring(0, 50)}... (场景/风景图)`);
      continue;
    }

    const source = imageToSource.get(url) || "未知";
    const article = imageToArticle.get(url) || "";
    const isOfficial = officialUrls.has(url);

    try {
      // 处理协议相对路径
      let fullUrl = url;
      if (fullUrl.startsWith("//")) fullUrl = "https:" + fullUrl;

      const r = await fetchWithRetry(fullUrl, { "User-Agent": HEADERS["User-Agent"] }, 20000, 2);
      const buf = Buffer.from(await r.arrayBuffer());

      // 内容 hash 去重（防止同一张图片从不同 URL 下载）
      const contentMd5 = contentHash(buf);
      if (seenContentHashes.has(contentMd5)) {
        console.log(`  ⤬ 跳过 ${url.substring(0, 50)}... (内容重复)`);
        await sleep(DELAY_MS);
        continue;
      }
      seenContentHashes.add(contentMd5);

      // 大小过滤
      if (buf.byteLength < MIN_IMAGE_SIZE) {
        console.log(`  ⤬ 跳过 ${url.substring(0, 50)}... (${(buf.byteLength / 1024).toFixed(0)}KB < ${MIN_IMAGE_SIZE / 1024}KB)`);
        await sleep(DELAY_MS);
        continue;
      }

      if (buf.byteLength > MAX_IMAGE_SIZE) {
        console.log(`  ⤬ 跳过 ${url.substring(0, 50)}... (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB > ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`);
        await sleep(DELAY_MS);
        continue;
      }

      // 压缩 if needed
      const compressedBuf = await compressIfNeeded(buf);

      const ext = (url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || "jpg").toLowerCase();
      const fname = `news-${String(newsImages.length + 1).padStart(2, "0")}.${ext === "jpeg" ? "jpg" : ext}`;
      writeFileSync(join(outDir, "images", fname), compressedBuf);

      newsImages.push({
        file: fname,
        url,
        source,
        article,
        size: compressedBuf.byteLength,
        meta: imageToMeta.get(url),
      });

      if (isOfficial) officialDownloaded++;

      console.log(`  ✓ ${fname} (${(compressedBuf.byteLength / 1024).toFixed(0)}KB) [${source}]`);
    } catch (e) {
      console.error(`  ✗ 下载失败 ${url.substring(0, 50)}...: ${(e as Error).message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n📊 图片下载完成: ${newsImages.length} 张（官网 ${officialDownloaded} 张）`);

  // 4. 回退：官网素材未达标 且 总数不足 minImages 张时回退汽车之家
  let fallbackImages: { file: string; specname: string; size: number }[] = [];

  const officialMet = officialDownloaded >= officialMin;
  if (officialMet) {
    console.log(`\n✅ 官网图 ${officialDownloaded} 张 ≥ ${officialMin} 张，官网素材足够，跳过汽车之家回退`);
  }

  if (!noFallback && !officialMet && newsImages.length < minImages) {
    console.log(`\n⚠ 图片不足 ${minImages} 张（官网仅 ${officialDownloaded} 张），回退汽车之家 getpiclist 补齐...`);

    // 尝试读取 spec-data.json 获取 seriesId
    const specDataPath = join(outDir, "spec-data.json");
    if (existsSync(specDataPath)) {
      try {
        const specData = JSON.parse(readFileSync(specDataPath, "utf-8"));
        const seriesId = specData.info?.seriesId;

        if (seriesId) {
          // 复用 car-specs.ts 的下载逻辑
          const PIC_API = "https://car.m.autohome.com.cn/pic/getpiclist";
          const MOBILE_HEADERS = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
            Referer: "https://car.m.autohome.com.cn/",
          };

          const imgDir = join(outDir, "images");
          mkdirSync(imgDir, { recursive: true });
          
          let autohomePage = 1;
          const seenAutohome = new Set<string>();

          while (newsImages.length + fallbackImages.length < minImages && autohomePage <= 10) {
            const picsUrl = `${PIC_API}?seriesid=${seriesId}&pageindex=${autohomePage}`;
            console.log(`  汽车之家第 ${autohomePage} 页: ${picsUrl}`);
            
            const r = await fetchWithRetry(picsUrl, MOBILE_HEADERS, 15000, 2);
            const picsData = await r.json();

            const piclist: any[] =
              picsData.returncode === 0 && picsData.result?.piclist
                ? picsData.result.piclist
                : [];

            console.log(`  解析到 ${piclist.length} 条记录`);
            if (piclist.length === 0) break;

            for (const p of piclist) {
              if (newsImages.length + fallbackImages.length >= minImages) break;

              const imgurl = p?.imgurl;
              if (!imgurl || seenAutohome.has(imgurl)) continue;
              seenAutohome.add(imgurl);

              try {
                // 先试 1200 宽 CDN 变体（约 300KB，满足公众号 <500KB），失败再回退原图
                const dir = imgurl.substring(0, imgurl.lastIndexOf("/") + 1);
                const fname0 = imgurl.substring(imgurl.lastIndexOf("/") + 1);
                let buf: Buffer | null = null;
                const vresp = await fetchWithRetry(dir + "1200x0_" + fname0, MOBILE_HEADERS, 15000, 2).catch(() => null);
                if (vresp) buf = Buffer.from(await vresp.arrayBuffer());
                if (!buf || buf.byteLength < MIN_IMAGE_SIZE) {
                  const oresp = await fetchWithRetry(imgurl, MOBILE_HEADERS, 20000, 2).catch(() => null);
                  buf = oresp ? Buffer.from(await oresp.arrayBuffer()) : null;
                }
                if (buf) buf = await compressIfNeeded(buf);

                if (!buf || buf.byteLength < MIN_IMAGE_SIZE) {
                  console.log(`  ⤬ 跳过过小图片 (${(buf?.byteLength || 0) / 1024}KB)`);
                  await sleep(200);
                  continue;
                }

                const ext = (imgurl.match(/\.(jpg|jpeg|png)/i)?.[1] || "jpg").toLowerCase();
                const fname = `car-${String(fallbackImages.length + 1).padStart(2, "0")}.${ext}`;
                writeFileSync(join(outDir, "images", fname), buf);

                fallbackImages.push({
                  file: fname,
                  specname: p.specname || "",
                  size: buf.byteLength,
                });

                console.log(`  ✓ ${fname} (${(buf.byteLength / 1024).toFixed(0)}KB) [汽车之家]`);
              } catch (e) {
                console.error(`  ✗ 下载失败: ${(e as Error).message}`);
              }

              await sleep(200);
            }

            autohomePage++;
          }
        }
      } catch (e) {
        console.error(`  ⚠ 汽车之家回退失败: ${(e as Error).message}`);
      }
    } else {
      console.log("  ⚠ 无 spec-data.json，无法回退汽车之家");
    }
  }

  // 5. 写 sources.md（追加模式：保留已有的交叉校验记录，追加图片来源节）
  const allImages = [
    ...newsImages,
    ...fallbackImages.map((img) => ({
      file: img.file,
      url: "",
      source: "汽车之家",
      article: "",
      size: img.size,
    })),
  ];

  const imgSection = generateSourcesMd(allImages, carName);
  const sourcesPath = join(outDir, "sources.md");
  if (existsSync(sourcesPath)) {
    const existing = readFileSync(sourcesPath, "utf-8").trimEnd();
    writeFileSync(sourcesPath, existing + "\n\n---\n\n" + imgSection);
  } else {
    writeFileSync(sourcesPath, imgSection);
  }

  // 5.5 输出 images-meta.json（图注工作流用）
  writeImagesMeta(outDir, newsImages);

  // 6. 更新 spec-data.json
  const specDataPath = join(outDir, "spec-data.json");
  mergeImagesToSpecData(specDataPath, newsImages, fallbackImages);

  // 7. 输出摘要
  const totalImages = newsImages.length + fallbackImages.length;
  const newsOnly = newsImages.length - officialDownloaded;
  console.log(`\n✅ 完成`);
  console.log(`  官网图片: ${officialDownloaded} 张`);
  console.log(`  新闻稿配图: ${newsOnly} 张`);
  console.log(`  汽车之家回退: ${fallbackImages.length} 张`);
  console.log(`  总计: ${totalImages} 张 → ${join(outDir, "images")}`);
  console.log(`  来源记录: ${join(outDir, "sources.md")}`);

  // stdout JSON 供调用方读取
  console.log(
    JSON.stringify({
      carName,
      officialImages: officialDownloaded,
      newsImages: newsOnly,
      fallbackImages: fallbackImages.length,
      total: totalImages,
      images: allImages.map((img) => ({
        file: img.file,
        source: img.source,
        size: img.size,
      })),
    })
  );
}

main().catch((e) => {
  console.error(`采集失败: ${e.message}`);
  process.exit(1);
});
