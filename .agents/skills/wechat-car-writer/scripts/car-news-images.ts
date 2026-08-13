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

// ─── 常量 ───────────────────────────────────────────────────────────────────────

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.bing.com/",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

// 域名白名单：优先从这些站点抓取新闻稿配图（新浪/IT之家/网易有专门解析器，其余走通用解析）
const DOMAIN_WHITELIST = [
  // 汽车垂直
  "autohome.com.cn",
  "www.autohome.com.cn",
  "www.che168.com",
  "www.dongchedi.com",
  "www.pcauto.com.cn",
  "yiche.com",
  "news.yiche.com",
  "www.xcar.com.cn",
  "www.icauto.com.cn",
  "www.cheyun.com",
  "www.d1ev.com", // 第一电动
  "gasgoo.com", // 盖世汽车
  // 门户汽车
  "auto.sina.com.cn",
  "finance.sina.com.cn",
  "k.sina.com.cn",
  "auto.163.com",
  "m.163.com",
  "www.163.com",
  "auto.sohu.com",
  "www.sohu.com",
  "auto.qq.com",
  "new.qq.com",
  "auto.ifeng.com",
  // 科技/资讯
  "www.ithome.com",
  "m.ithome.com",
  "36kr.com",
  "www.huxiu.com",
  "www.kuaikeji.com", // 快科技
  "www.techweb.com.cn",
  // 其他
  "auto.cnr.cn",
  "auto.cri.cn",
  "cnautonews.com",
  "www.autoreport.cn",
];

// 新浪图片过滤关键词（logo/分享层/水印）
const SINA_FILTER_KEYWORDS = [
  "efade7fd",
  "auto_qr",
  "layersina",
  "layerweibo",
  "layerauto",
  "layerxny",
  "removebg_",
  "share_",
  "logo",
  "icon",
  "avatar",
];

const MIN_IMAGE_SIZE = 50 * 1024; // <50KB 过滤缩略图/坏图
const MAX_IMAGE_SIZE = 500 * 1024; // >500KB 需压缩
const DELAY_MS = 200; // 礼貌限速

// ─── 类型 ───────────────────────────────────────────────────────────────────────

interface ImageEntry {
  file: string;
  url: string;
  source: string; // 媒体名（新浪/IT之家/网易）
  article: string; // 原文章链接
  size: number;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────────

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
  if (buf.byteLength <= MAX_IMAGE_SIZE) return buf;
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buf)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
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
  md += `图片来源: 官方发布会通稿配图（新浪/IT之家/网易等）\n\n`;
  md += `## 图片列表\n\n`;
  md += `| 文件 | 大小 | 来源 | 原文章 |\n`;
  md += `|------|------|------|--------|\n`;

  for (const img of images) {
    const size = `${(img.size / 1024).toFixed(0)}KB`;
    md += `| ${img.file} | ${size} | ${img.source} | ${img.article} |\n`;
  }

  return md;
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
  bun run car-news-images.ts "<车型名>" "<输出目录>" [--min N] [--no-fallback]

示例:
  bun run car-news-images.ts "零跑A05" "00-草稿/20260812_零跑A05上市"
  bun run car-news-images.ts "比亚迪海豹06GT" "00-草稿/20260813_海豹06GT" --min 15

说明:
  从必应搜索新闻稿 → 解析配图 → 下载去重 → 记录来源。
  不足 --min 张（默认12）时回退汽车之家 getpiclist 补齐。
  输出 images/ + sources.md，同时更新 spec-data.json 的 images 数组。`);
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
  const noFallback = args.includes("--no-fallback");

  const minIdx = args.indexOf("--min");
  if (minIdx > 0 && args[minIdx + 1]) minImages = Number(args[minIdx + 1]) || 12;

  mkdirSync(outDir, { recursive: true });

  console.log(`🚗 车型: ${carName}`);
  console.log(`📁 输出: ${outDir}`);
  console.log(`🎯 最少图片: ${minImages} 张\n`);

  // 1. 必应搜索（多关键词合并，提高新闻稿命中率）
  const queries = [`"${carName}" 上市`, `"${carName}" 价格 配置`, `"${carName}" 新车发布`];
  const seenUrls = new Set<string>();
  const results: SearchResult[] = [];
  for (const q of queries) {
    const r = await searchBing(q);
    for (const item of r) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        results.push(item);
      }
    }
    if (results.length >= 10) break;
  }

  if (results.length === 0) {
    console.log("  ⚠ 未找到新闻稿，直接走汽车之家回退");
  }

  // 2. 抓取文章页面 → 解析配图
  const allImageUrls = new Set<string>();
  const imageToArticle = new Map<string, string>();
  const imageToSource = new Map<string, string>();

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

  console.log(`\n📊 共发现 ${allImageUrls.size} 张去重配图`);

  // 3. 下载新闻稿配图
  const newsImages: ImageEntry[] = [];
  const seenHashes = new Set<string>();

  for (const url of allImageUrls) {
    if (newsImages.length >= minImages * 2) break; // 多下载一些，后面有过滤

    const hash = urlHash(url);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);

    const source = imageToSource.get(url) || "未知";
    const article = imageToArticle.get(url) || "";

    try {
      // 处理协议相对路径
      let fullUrl = url;
      if (fullUrl.startsWith("//")) fullUrl = "https:" + fullUrl;

      const r = await fetchWithRetry(fullUrl, { "User-Agent": HEADERS["User-Agent"] }, 20000, 2);
      const buf = await compressIfNeeded(Buffer.from(await r.arrayBuffer()));

      if (buf.byteLength < MIN_IMAGE_SIZE) {
        console.log(`  ⤬ 跳过 ${url.substring(0, 50)}... (${(buf.byteLength / 1024).toFixed(0)}KB < ${MIN_IMAGE_SIZE / 1024}KB)`);
        await sleep(DELAY_MS);
        continue;
      }

      const ext = (url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || "jpg").toLowerCase();
      const fname = `news-${String(newsImages.length + 1).padStart(2, "0")}.${ext === "jpeg" ? "jpg" : ext}`;
      writeFileSync(join(outDir, "images", fname), buf);

      newsImages.push({
        file: fname,
        url,
        source,
        article,
        size: buf.byteLength,
      });

      console.log(`  ✓ ${fname} (${(buf.byteLength / 1024).toFixed(0)}KB) [${source}]`);
    } catch (e) {
      console.error(`  ✗ 下载失败 ${url.substring(0, 50)}...: ${(e as Error).message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n📊 新闻稿配图下载完成: ${newsImages.length} 张`);

  // 4. 回退：不足 minImages 张时回退汽车之家
  let fallbackImages: { file: string; specname: string; size: number }[] = [];

  if (!noFallback && newsImages.length < minImages) {
    console.log(`\n⚠ 新闻稿配图不足 ${minImages} 张，回退汽车之家 getpiclist 补齐...`);

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

  // 6. 更新 spec-data.json
  const specDataPath = join(outDir, "spec-data.json");
  mergeImagesToSpecData(specDataPath, newsImages, fallbackImages);

  // 7. 输出摘要
  const totalImages = newsImages.length + fallbackImages.length;
  console.log(`\n✅ 完成`);
  console.log(`  新闻稿配图: ${newsImages.length} 张`);
  console.log(`  汽车之家回退: ${fallbackImages.length} 张`);
  console.log(`  总计: ${totalImages} 张 → ${join(outDir, "images")}`);
  console.log(`  来源记录: ${join(outDir, "sources.md")}`);

  // stdout JSON 供调用方读取
  console.log(
    JSON.stringify({
      carName,
      newsImages: newsImages.length,
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
