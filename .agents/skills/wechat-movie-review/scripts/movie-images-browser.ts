#!/usr/bin/env bun
/**
 * movie-images-browser.ts — 浏览器渲染版电影图片采集器
 *
 * 使用 Crawlee + Puppeteer 渲染豆瓣页面，绕过反爬虫机制，
 * 采集官方海报和剧照。
 *
 * 用法:
 *   bun run movie-images-browser.ts "<电影名>" "<输出目录>" [--min N] [--json]
 *   bun run movie-images-browser.ts "流浪地球3" "00-草稿/20260823_流浪地球3影评" --min 10
 *
 * 输出:
 *   <输出目录>/images/poster-NN.jpg   — 海报
 *   <输出目录>/images/still-NN.jpg    — 剧照
 *   <输出目录>/images-meta.json       — 图片语义元数据
 *   <输出目录>/sources.md             — 图片来源记录
 *   JSON 摘要到 stdout
 */

import { PuppeteerCrawler, log } from "crawlee";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

// 压制 Crawlee 框架日志
log.setLevel(log.LEVELS.ERROR);

function logMsg(msg: string): void {
  process.stderr.write(`[movie-images-browser] ${msg}\n`);
}

// ============================================================
// 常量
// ============================================================

const MIN_IMAGE_SIZE = 40 * 1024; // 40KB
const TARGET_IMAGE_SIZE = 500 * 1024; // 500KB

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
// 浏览器图片采集
// ============================================================

async function fetchImagesWithBrowser(movieId: string, movieName: string, minCount: number): Promise<{ url: string; type: "poster" | "still"; description: string }[]> {
  const images: { url: string; type: "poster" | "still"; description: string }[] = [];

  logMsg(`使用浏览器采集图片: ${movieName}`);

  // 采集海报
  const posterUrl = `https://movie.douban.com/subject/${movieId}/photos?type=R`;
  logMsg(`采集海报: ${posterUrl}`);

  const posterCrawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 60,
    maxRequestRetries: 1,
    launchContext: {
      launchOptions: {
        headless: true,
        channel: "chrome",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    },
    async requestHandler({ page }) {
      await page.goto(posterUrl, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 3000));

      // 提取海报图片
      const posters = await page.evaluate(() => {
        const items: { url: string; description: string }[] = [];
        const imgs = document.querySelectorAll(".poster-col img, .cover img, .photo_wrap img");

        for (const img of Array.from(imgs).slice(0, 10)) {
          const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
          const alt = img.getAttribute("alt") || "官方海报";

          // 转换为大图 URL
          const largeUrl = src
            .replace(/\/s_ratio_poster\//, "/l_ratio_poster/")
            .replace(/\/m\//, "/l/")
            .replace(/\/sqxs\//, "/l/");

          if (largeUrl.startsWith("http")) {
            items.push({ url: largeUrl, description: alt });
          }
        }

        return items;
      });

      for (const item of posters) {
        images.push({
          url: item.url,
          type: "poster",
          description: item.description,
        });
      }

      logMsg(`找到 ${posters.length} 张海报`);
    },
  });

  try {
    await posterCrawler.run([posterUrl]);
  } catch (e) {
    logMsg(`海报采集失败: ${(e as Error).message}`);
  }

  // 采集剧照
  const stillUrl = `https://movie.douban.com/subject/${movieId}/photos?type=S`;
  logMsg(`采集剧照: ${stillUrl}`);

  const stillCrawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 60,
    maxRequestRetries: 1,
    launchContext: {
      launchOptions: {
        headless: true,
        channel: "chrome",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    },
    async requestHandler({ page }) {
      await page.goto(stillUrl, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 3000));

      // 滚动页面加载更多图片
      logMsg("滚动加载更多图片...");
      let prev = 0;
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise((r) => setTimeout(r, 500));
        const h = await page.evaluate(() => document.body.scrollHeight);
        if (h === prev) break;
        prev = h;
      }

      // 提取剧照图片
      const stills = await page.evaluate(() => {
        const items: { url: string; description: string }[] = [];
        const imgs = document.querySelectorAll(".poster-col img, .photo_wrap img, .still img");

        for (const img of Array.from(imgs).slice(0, 20)) {
          const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
          const alt = img.getAttribute("alt") || "剧照";

          // 转换为大图 URL
          const largeUrl = src
            .replace(/\/sqxs\//, "/l/")
            .replace(/\/m\//, "/l/")
            .replace(/\/s_ratio_poster\//, "/l_ratio_poster/");

          if (largeUrl.startsWith("http")) {
            items.push({ url: largeUrl, description: alt });
          }
        }

        return items;
      });

      for (const item of stills) {
        images.push({
          url: item.url,
          type: "still",
          description: item.description,
        });
      }

      logMsg(`找到 ${stills.length} 张剧照`);
    },
  });

  try {
    await stillCrawler.run([stillUrl]);
  } catch (e) {
    logMsg(`剧照采集失败: ${(e as Error).message}`);
  }

  return images;
}

// ============================================================
// 图片下载
// ============================================================

async function downloadImage(url: string, outputPath: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Referer: "https://movie.douban.com/",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());

    // 检查大小
    if (buffer.length < MIN_IMAGE_SIZE) {
      logMsg(`  ⤬ 跳过（太小: ${Math.round(buffer.length / 1024)}KB）`);
      return null;
    }

    // 压缩
    const compressed = await compressIfNeeded(buffer);
    writeFileSync(outputPath, compressed);
    return compressed;
  } catch (e) {
    logMsg(`  ✗ 下载失败: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function downloadImages(
  images: { url: string; type: "poster" | "still"; description: string }[],
  outputDir: string,
  minCount: number
): Promise<ImageEntry[]> {
  const results: ImageEntry[] = [];
  const seenHashes = new Set<string>();
  const imagesDir = join(outputDir, "images");
  mkdirSync(imagesDir, { recursive: true });

  let posterCount = 0;
  let stillCount = 0;

  logMsg(`\n📥 开始下载图片（目标: ${minCount} 张）\n`);

  for (const img of images) {
    if (results.length >= minCount * 2) break; // 最多下载 2 倍目标数量

    const prefix = img.type === "poster" ? "poster" : "still";
    const count = img.type === "poster" ? ++posterCount : ++stillCount;
    const filename = `${prefix}-${String(count).padStart(2, "0")}.jpg`;
    const outputPath = join(imagesDir, filename);

    logMsg(`  📥 下载 ${filename}: ${img.description || img.url.substring(0, 50)}...`);

    const buffer = await downloadImage(img.url, outputPath);
    if (!buffer) continue;

    // 去重
    const hash = contentHash(buffer);
    if (seenHashes.has(hash)) {
      logMsg(`  ⤬ 跳过（重复）`);
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

    logMsg(`  ✓ 已保存: ${filename} (${Math.round(buffer.length / 1024)}KB)`);
    await sleep(300);
  }

  return results;
}

// ============================================================
// 输出文件生成
// ============================================================

function generateImagesMeta(images: ImageEntry[]): ImageMeta[] {
  return images.map((img) => ({
    file: img.file,
    type: img.type,
    alt: img.meta?.alt || "",
    description: img.meta?.description || "",
    source: img.source,
  }));
}

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
    console.error("用法: bun run movie-images-browser.ts <电影名> <输出目录> [--min N] [--json]");
    process.exit(1);
  }

  const movieName = filteredArgs[0];
  const outputDir = filteredArgs[1];

  logMsg(`\n🎬 开始采集电影图片（浏览器渲染模式）: ${movieName}\n`);

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
      logMsg("⚠️ 无法读取 movie-data.json，将尝试搜索");
    }
  }

  if (!movieId) {
    console.error("✗ 未找到 movie-data.json，请先运行 movie-data.ts");
    process.exit(1);
  }

  // 使用浏览器采集图片
  const allImages = await fetchImagesWithBrowser(movieId, movieName, minCount);

  logMsg(`\n📊 共收集到 ${allImages.length} 张图片 URL`);

  // 下载图片
  const downloadedImages = await downloadImages(allImages, outputDir, minCount);

  if (downloadedImages.length === 0) {
    logMsg("\n⚠️ 未成功下载任何图片");
    process.exit(1);
  }

  // 生成输出文件
  const imagesMeta = generateImagesMeta(downloadedImages);
  const sourcesMd = generateSourcesMd(downloadedImages, movieName, movieUrl);

  writeFileSync(join(outputDir, "images-meta.json"), JSON.stringify(imagesMeta, null, 2), "utf-8");
  writeFileSync(join(outputDir, "sources.md"), sourcesMd, "utf-8");

  logMsg(`\n✓ 图片采集完成`);
  logMsg(`  - 下载: ${downloadedImages.length} 张`);
  logMsg(`  - 海报: ${downloadedImages.filter(i => i.type === "poster").length} 张`);
  logMsg(`  - 剧照: ${downloadedImages.filter(i => i.type === "still").length} 张`);
  logMsg(`  - 元数据: images-meta.json`);
  logMsg(`  - 来源记录: sources.md`);

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
