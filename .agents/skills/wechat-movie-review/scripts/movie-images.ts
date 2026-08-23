#!/usr/bin/env bun
/**
 * movie-images.ts — 电影图片采集器
 *
 * 从豆瓣电影采集官方海报和剧照，下载并压缩，输出 images-meta.json 和 sources.md。
 *
 * 数据源:
 *   豆瓣图片页: https://movie.douban.com/subject/{id}/photos?type=S  (剧照)
 *               https://movie.douban.com/subject/{id}/photos?type=R  (海报)
 *   豆瓣详情页内嵌图片（从 movie-data.json 读取）
 *
 * 用法:
 *   bun run movie-images.ts "<电影名>" "<输出目录>" [--min N] [--json]
 *   bun run movie-images.ts "流浪地球3" "00-草稿/20260823_流浪地球3影评" --min 10
 *
 * 输出:
 *   <输出目录>/images/poster-NN.jpg   — 海报
 *   <输出目录>/images/still-NN.jpg    — 剧照
 *   <输出目录>/images-meta.json       — 图片语义元数据
 *   <输出目录>/sources.md             — 图片来源记录
 *   JSON 摘要到 stdout
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { execSync } from "child_process";

// ============================================================
// 常量
// ============================================================

const DOUBAN_PHOTOS_URL = "https://movie.douban.com/subject";
const MIN_IMAGE_SIZE = 40 * 1024; // 40KB
const TARGET_IMAGE_SIZE = 500 * 1024; // 500KB
const DELAY_MS = 300; // 请求间隔

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://movie.douban.com/",
  Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
};

// ============================================================
// 类型定义
// ============================================================

interface ImageEntry {
  file: string;
  url: string;
  source: string;
  type: "poster" | "still";
  size: number;
  meta?: {
    alt: string;
    description: string;
  };
}

interface ImageMeta {
  file: string;
  type: "poster" | "still";
  alt: string;
  description: string;
  source: string;
}

// ============================================================
// 工具函数
// ============================================================

/** fetch 带超时与重试 */
async function fetchWithRetry(url: string, headers: Record<string, string> = HEADERS, timeoutMs = 15000, retries = 3): Promise<Response> {
  let lastErr: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch(url, { headers, signal: ctrl.signal });
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

/** 计算内容 hash（用于去重） */
function contentHash(buffer: Buffer): string {
  return createHash("md5").update(buffer).digest("hex");
}

/** 延迟 */
function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/** 压缩图片（如果超过目标大小） */
async function compressIfNeeded(buffer: Buffer, targetSize = TARGET_IMAGE_SIZE): Promise<Buffer> {
  if (buffer.length <= targetSize) return buffer;

  try {
    const sharp = require("sharp");
    // 第一次压缩：1200 宽，质量 80
    let result = await sharp(buffer)
      .rotate()
      .resize(1200, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    if (result.length > targetSize) {
      // 第二次压缩：1000 宽，质量 65
      result = await sharp(buffer)
        .rotate()
        .resize(1000, undefined, { withoutEnlargement: true })
        .jpeg({ quality: 65 })
        .toBuffer();
    }

    return result;
  } catch {
    // sharp 不可用时返回原图
    return buffer;
  }
}

// ============================================================
// 豆瓣图片采集
// ============================================================

/** 从豆瓣图片页提取图片 URL */
async function fetchDoubanPhotos(movieId: string, type: "S" | "R" = "S", max = 20): Promise<{ url: string; alt: string }[]> {
  console.log(`🖼️  采集豆瓣${type === "S" ? "剧照" : "海报"}: ${movieId}`);

  const results: { url: string; alt: string }[] = [];
  let page = 0;
  const pageSize = 30;

  try {
    while (results.length < max) {
      const url = `${DOUBAN_PHOTOS_URL}/${movieId}/photos?type=${type}&start=${page * pageSize}&size=${pageSize}&sortby=vote`;
      const r = await fetchWithRetry(url);
      const html = await r.text();

      // 提取图片 URL 和 alt 文本
      const imgMatches = html.match(/<img[^>]*src="(https?:\/\/img[^"]+)"[^>]*alt="([^"]*)"[^>]*>/g);
      if (!imgMatches || imgMatches.length === 0) break;

      for (const match of imgMatches) {
        if (results.length >= max) break;
        const srcMatch = match.match(/src="(https?:\/\/img[^"]+)"/);
        const altMatch = match.match(/alt="([^"]*)"/);
        if (srcMatch) {
          // 转换为大图 URL（豆瓣图片 CDN）
          const thumbUrl = srcMatch[1];
          const largeUrl = thumbUrl.replace(/\/s_ratio_poster\//, "/l_ratio_poster/").replace(/\/m/, "/l");
          results.push({
            url: largeUrl,
            alt: altMatch ? altMatch[1] : "",
          });
        }
      }

      page++;
      await sleep(DELAY_MS);
    }

    console.log(`✓ 找到 ${results.length} 张${type === "S" ? "剧照" : "海报"}`);
    return results;
  } catch (e) {
    console.log(`✗ 采集失败: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/** 从 movie-data.json 读取已采集的图片 */
function loadExistingImages(outputDir: string): { url: string; type: "poster" | "still"; description: string }[] {
  const dataPath = join(outputDir, "movie-data.json");
  if (!existsSync(dataPath)) return [];

  try {
    const data = JSON.parse(readFileSync(dataPath, "utf-8"));
    if (data.officialImages && Array.isArray(data.officialImages)) {
      return data.officialImages.map((img: any) => ({
        url: img.url,
        type: img.type === "poster" ? "poster" : "still",
        description: img.description || "",
      }));
    }
  } catch {
    // 忽略解析错误
  }
  return [];
}

// ============================================================
// 图片下载
// ============================================================

/** 下载单张图片 */
async function downloadImage(url: string, outputPath: string): Promise<Buffer | null> {
  try {
    const r = await fetchWithRetry(url);
    const buffer = Buffer.from(await r.arrayBuffer());

    // 检查大小
    if (buffer.length < MIN_IMAGE_SIZE) {
      console.log(`  ⤬ 跳过（太小: ${Math.round(buffer.length / 1024)}KB）`);
      return null;
    }

    // 压缩
    const compressed = await compressIfNeeded(buffer);
    writeFileSync(outputPath, compressed);
    return compressed;
  } catch (e) {
    console.log(`  ✗ 下载失败: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** 批量下载图片 */
async function downloadImages(
  images: { url: string; type: "poster" | "still"; description: string }[],
  outputDir: string,
  minCount = 10
): Promise<ImageEntry[]> {
  const results: ImageEntry[] = [];
  const seenHashes = new Set<string>();
  const imagesDir = join(outputDir, "images");
  mkdirSync(imagesDir, { recursive: true });

  let posterCount = 0;
  let stillCount = 0;

  console.log(`\n📥 开始下载图片（目标: ${minCount} 张）\n`);

  for (const img of images) {
    if (results.length >= minCount * 2) break; // 最多下载 2 倍目标数量

    const prefix = img.type === "poster" ? "poster" : "still";
    const count = img.type === "poster" ? ++posterCount : ++stillCount;
    const filename = `${prefix}-${String(count).padStart(2, "0")}.jpg`;
    const outputPath = join(imagesDir, filename);

    console.log(`  📥 下载 ${filename}: ${img.description || img.url.substring(0, 50)}...`);

    const buffer = await downloadImage(img.url, outputPath);
    if (!buffer) continue;

    // 去重
    const hash = contentHash(buffer);
    if (seenHashes.has(hash)) {
      console.log(`  ⤬ 跳过（重复）`);
      continue;
    }
    seenHashes.add(hash);

    results.push({
      file: `images/${filename}`,
      url: img.url,
      source: "豆瓣",
      type: img.type,
      size: buffer.length,
      meta: {
        alt: img.description,
        description: img.description,
      },
    });

    console.log(`  ✓ 已保存: ${filename} (${Math.round(buffer.length / 1024)}KB)`);
    await sleep(DELAY_MS);
  }

  return results;
}

// ============================================================
// 输出文件生成
// ============================================================

/** 生成 images-meta.json */
function generateImagesMeta(images: ImageEntry[]): ImageMeta[] {
  return images.map((img) => ({
    file: img.file,
    type: img.type,
    alt: img.meta?.alt || "",
    description: img.meta?.description || "",
    source: img.source,
  }));
}

/** 生成 sources.md */
function generateSourcesMd(images: ImageEntry[], movieName: string, movieUrl: string): string {
  let md = `# 图片来源记录\n\n`;
  md += `## 电影: ${movieName}\n`;
  md += `## 数据源: [豆瓣电影](${movieUrl})\n\n`;
  md += `## 图片列表\n\n`;
  md += `| 文件 | 类型 | 大小 | 来源 | 描述 |\n`;
  md += `|------|------|------|------|------|\n`;

  for (const img of images) {
    const sizeKB = Math.round(img.size / 1024);
    const typeStr = img.type === "poster" ? "海报" : "剧照";
    const desc = img.meta?.description || "-";
    md += `| ${img.file} | ${typeStr} | ${sizeKB}KB | ${img.source} | ${desc} |\n`;
  }

  md += `\n## 版权说明\n\n`;
  md += `- 以上图片来自豆瓣电影，版权归原作者所有\n`;
  md += `- 仅用于影评文章配图，非商业用途\n`;
  md += `- 如有侵权，请联系删除\n`;

  return md;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const minFlag = args.indexOf("--min");
  const minCount = minFlag !== -1 ? parseInt(args[minFlag + 1]) || 10 : 10;
  const filteredArgs = args.filter((a, i) => a !== "--json" && (i < minFlag || i > minFlag + 1));

  if (filteredArgs.length < 2) {
    console.error("用法: bun run movie-images.ts <电影名> <输出目录> [--min N] [--json]");
    process.exit(1);
  }

  const movieName = filteredArgs[0];
  const outputDir = filteredArgs[1];

  console.log(`\n🎬 开始采集电影图片: ${movieName}\n`);

  // 读取 movie-data.json 获取电影 ID
  const movieDataPath = join(outputDir, "movie-data.json");
  let movieId = "";
  let movieUrl = "";

  if (existsSync(movieDataPath)) {
    try {
      const data = JSON.parse(readFileSync(movieDataPath, "utf-8"));
      movieId = data.info?.doubanId || "";
      movieUrl = data.info?.url || "";
    } catch {
      console.log("⚠️ 无法读取 movie-data.json，将尝试搜索");
    }
  }

  if (!movieId) {
    console.error("✗ 未找到 movie-data.json，请先运行 movie-data.ts");
    process.exit(1);
  }

  // 收集图片 URL
  const allImages: { url: string; type: "poster" | "still"; description: string }[] = [];

  // 1. 从 movie-data.json 读取已有图片
  const existingImages = loadExistingImages(outputDir);
  if (existingImages.length > 0) {
    console.log(`📦 从 movie-data.json 读取到 ${existingImages.length} 张图片`);
    allImages.push(...existingImages);
  }

  // 2. 从豆瓣图片页采集海报
  if (allImages.filter(i => i.type === "poster").length < 5) {
    const posters = await fetchDoubanPhotos(movieId, "R", 5);
    for (const p of posters) {
      allImages.push({ url: p.url, type: "poster", description: p.alt || "官方海报" });
    }
  }

  // 3. 从豆瓣图片页采集剧照
  if (allImages.filter(i => i.type === "still").length < minCount) {
    const stills = await fetchDoubanPhotos(movieId, "S", minCount);
    for (const s of stills) {
      allImages.push({ url: s.url, type: "still", description: s.alt || "剧照" });
    }
  }

  // 如果 HTTP 方式获取的图片不足，尝试浏览器渲染
  if (allImages.length < minCount) {
    console.log(`\n⚠️ HTTP 方式获取图片不足（${allImages.length}/${minCount}），尝试浏览器渲染...`);
    try {
      const browserScript = join(__dirname, "movie-images-browser.ts");
      if (existsSync(browserScript)) {
        console.log(`  🔄 启动浏览器渲染模式...`);
        const result = execSync(`bun run "${browserScript}" "${movieName}" "${outputDir}" --min ${minCount} --json`, {
          encoding: "utf-8",
          timeout: 180000, // 3 分钟超时
          stdio: ["ignore", "pipe", "pipe"],
        });

        // 解析浏览器渲染的结果
        const lines = result.split("\n");
        const jsonLine = lines.find(line => line.startsWith("{"));
        if (jsonLine) {
          const browserData = JSON.parse(jsonLine);
          if (browserData.images && browserData.images.length > 0) {
            // 合并浏览器获取的图片（去重）
            const existingUrls = new Set(allImages.map(i => i.url));
            for (const img of browserData.images) {
              if (!existingUrls.has(img.url)) {
                allImages.push({
                  url: img.url,
                  type: img.type,
                  description: img.description,
                });
                existingUrls.add(img.url);
              }
            }
            console.log(`  ✓ 浏览器渲染成功，新增 ${browserData.images.length} 张图片`);
          }
        }
      }
    } catch (e) {
      console.log(`  ✗ 浏览器渲染失败: ${e instanceof Error ? e.message : String(e)}`);
      console.log(`  💡 建议手动下载图片`);
    }
  }

  console.log(`\n📊 共收集到 ${allImages.length} 张图片 URL`);

  // 下载图片
  const downloadedImages = await downloadImages(allImages, outputDir, minCount);

  if (downloadedImages.length === 0) {
    console.log("\n⚠️ 未成功下载任何图片");
    process.exit(1);
  }

  // 生成输出文件
  const imagesMeta = generateImagesMeta(downloadedImages);
  const sourcesMd = generateSourcesMd(downloadedImages, movieName, movieUrl);

  writeFileSync(join(outputDir, "images-meta.json"), JSON.stringify(imagesMeta, null, 2), "utf-8");
  writeFileSync(join(outputDir, "sources.md"), sourcesMd, "utf-8");

  console.log(`\n✓ 图片采集完成`);
  console.log(`  - 下载: ${downloadedImages.length} 张`);
  console.log(`  - 海报: ${downloadedImages.filter(i => i.type === "poster").length} 张`);
  console.log(`  - 剧照: ${downloadedImages.filter(i => i.type === "still").length} 张`);
  console.log(`  - 元数据: images-meta.json`);
  console.log(`  - 来源记录: sources.md`);

  // JSON 模式输出
  if (jsonMode) {
    console.log("\n" + JSON.stringify({
      movieName,
      total: downloadedImages.length,
      posters: downloadedImages.filter(i => i.type === "poster").length,
      stills: downloadedImages.filter(i => i.type === "still").length,
      images: downloadedImages,
    }));
  }
}

main().catch((e) => {
  console.error("❌ 致命错误:", e.message || e);
  process.exit(1);
});
