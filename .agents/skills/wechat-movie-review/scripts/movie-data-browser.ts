#!/usr/bin/env bun
/**
 * movie-data-browser.ts — 浏览器渲染版电影数据采集器
 *
 * 使用 Crawlee + Puppeteer 渲染豆瓣页面，绕过反爬虫机制，
 * 提取完整的电影数据（导演、演员、评分、剧情等）。
 *
 * 用法:
 *   bun run movie-data-browser.ts <电影名> <输出目录> [--json]
 *   bun run movie-data-browser.ts "流浪地球3" "00-草稿/20260823_流浪地球3影评"
 *
 * 输出:
 *   <输出目录>/movie-data.json   — 结构化电影数据
 *   JSON 摘要到 stdout（--json 模式）
 */

import { PuppeteerCrawler, log } from "crawlee";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// 压制 Crawlee 框架日志
log.setLevel(log.LEVELS.ERROR);

function logMsg(msg: string): void {
  process.stderr.write(`[movie-browser] ${msg}\n`);
}

// ============================================================
// 类型定义
// ============================================================

interface MovieInfo {
  title: string;
  titleEn: string;
  year: string;
  doubanId: string;
  url: string;
}

interface MovieBasic {
  director: string[];
  actors: string[];
  genre: string[];
  region: string;
  language: string;
  duration: string;
  releaseDate: string;
}

interface MovieRating {
  douban: number | null;
  doubanCount: number;
  ratingText: string;
}

interface MovieBoxOffice {
  total: string;
  firstDay: string;
  firstWeek: string;
}

interface MovieImage {
  url: string;
  type: "poster" | "still" | "behind_scenes";
  description: string;
}

interface MovieData {
  info: MovieInfo;
  basic: MovieBasic;
  rating: MovieRating;
  boxOffice: MovieBoxOffice;
  synopsis: string;
  tags: string[];
  awards: string[];
  officialImages: MovieImage[];
  fetchedAt: string;
  sources: {
    douban: string;
    [key: string]: string;
  };
}

// ============================================================
// 工具函数
// ============================================================

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ============================================================
// 浏览器数据采集
// ============================================================

async function fetchMovieDataWithBrowser(movieName: string, movieId: string): Promise<Partial<MovieData>> {
  const url = `https://movie.douban.com/subject/${movieId}/`;
  logMsg(`使用浏览器渲染: ${url}`);

  const result: Partial<MovieData> = {
    info: {
      title: movieName,
      titleEn: "",
      year: "",
      doubanId: movieId,
      url,
    },
    basic: {
      director: [],
      actors: [],
      genre: [],
      region: "",
      language: "",
      duration: "",
      releaseDate: "",
    },
    rating: {
      douban: null,
      doubanCount: 0,
      ratingText: "",
    },
    boxOffice: {
      total: "",
      firstDay: "",
      firstWeek: "",
    },
    synopsis: "",
    tags: [],
    awards: [],
    officialImages: [],
  };

  const crawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 120,
    maxRequestRetries: 1,
    launchContext: {
      launchOptions: {
        headless: true,
        channel: "chrome",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    },
    async requestHandler({ page }) {
      logMsg("加载页面...");
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

      // 等待页面加载完成（可能有 Proof-of-Work 挑战）
      logMsg("等待页面渲染...");
      await new Promise((r) => setTimeout(r, 5000));

      // 检查是否还在挑战页面
      const isChallenge = await page.evaluate(() => {
        return document.body.innerText.includes("载入中") || document.querySelector("#sec") !== null;
      });

      if (isChallenge) {
        logMsg("检测到挑战页面，等待自动完成...");
        // 等待挑战完成（页面会自动提交表单）
        await new Promise((r) => setTimeout(r, 10000));
        // 等待页面跳转
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 3000));
      }

      logMsg("提取电影数据...");

      // 提取页面数据
      const pageData = await page.evaluate(() => {
        const data: any = {};

        // 提取标题
        const titleEl = document.querySelector("h1 span[property='v:itemreviewed']") || document.querySelector("h1");
        if (titleEl) {
          data.title = titleEl.textContent?.trim() || "";
        }

        // 提取年份
        const yearEl = document.querySelector(".year");
        if (yearEl) {
          const yearMatch = yearEl.textContent?.match(/(\d{4})/);
          if (yearMatch) data.year = yearMatch[1];
        }

        // 提取评分
        const ratingEl = document.querySelector("strong[property='v:average']");
        if (ratingEl) {
          data.rating = parseFloat(ratingEl.textContent || "0") || null;
        }

        const votesEl = document.querySelector("span[property='v:votes']");
        if (votesEl) {
          data.ratingCount = parseInt(votesEl.textContent || "0") || 0;
        }

        // 提取基本信息
        const infoEl = document.querySelector("#info");
        if (infoEl) {
          const infoText = infoEl.textContent || "";

          // 导演
          const directorEls = infoEl.querySelectorAll("a[rel='v:directedBy']");
          data.director = Array.from(directorEls).map(el => el.textContent?.trim() || "").filter(Boolean);

          // 主演
          const actorEls = infoEl.querySelectorAll("a[rel='v:starring']");
          data.actors = Array.from(actorEls).map(el => el.textContent?.trim() || "").filter(Boolean);

          // 类型
          const genreEls = infoEl.querySelectorAll("span[property='v:genre']");
          data.genre = Array.from(genreEls).map(el => el.textContent?.trim() || "").filter(Boolean);

          // 片长
          const durationEl = infoEl.querySelector("span[property='v:runtime']");
          if (durationEl) {
            data.duration = durationEl.textContent?.trim() || "";
          }

          // 上映日期
          const releaseEls = infoEl.querySelectorAll("span[property='v:initialReleaseDate']");
          data.releaseDate = Array.from(releaseEls).map(el => el.textContent?.trim() || "").filter(Boolean).join(" / ");

          // 地区和语言（从文本中提取）
          const regionMatch = infoText.match(/制片国家\/地区:\s*(.+?)(?:\s*语言|$)/);
          if (regionMatch) data.region = regionMatch[1].trim();

          const langMatch = infoText.match(/语言:\s*(.+?)(?:\s*上映日期|$)/);
          if (langMatch) data.language = langMatch[1].trim();
        }

        // 提取剧情简介
        const synopsisEl = document.querySelector("span[property='v:summary']") || document.querySelector("#link-report .all.hidden") || document.querySelector("#link-report span");
        if (synopsisEl) {
          data.synopsis = synopsisEl.textContent?.trim() || "";
        }

        // 提取标签
        const tagEls = document.querySelectorAll(".tags-body a");
        data.tags = Array.from(tagEls).map(el => el.textContent?.trim() || "").filter(Boolean);

        // 提取图片
        const posterEls = document.querySelectorAll(".poster-col img");
        const stillEls = document.querySelectorAll(".related-pic-bd img");
        data.images = [];

        for (const img of posterEls) {
          const src = img.getAttribute("src") || img.getAttribute("data-src");
          if (src) {
            data.images.push({
              url: src,
              type: "poster",
              description: img.getAttribute("alt") || "官方海报",
            });
          }
        }

        for (const img of stillEls) {
          const src = img.getAttribute("src") || img.getAttribute("data-src");
          if (src) {
            data.images.push({
              url: src,
              type: "still",
              description: img.getAttribute("alt") || "剧照",
            });
          }
        }

        return data;
      });

      // 整理数据
      if (pageData.title) result.info!.title = cleanText(pageData.title);
      if (pageData.year) result.info!.year = pageData.year;

      if (pageData.director) result.basic!.director = pageData.director.map(cleanText);
      if (pageData.actors) result.basic!.actors = pageData.actors.map(cleanText);
      if (pageData.genre) result.basic!.genre = pageData.genre.map(cleanText);
      if (pageData.region) result.basic!.region = cleanText(pageData.region);
      if (pageData.language) result.basic!.language = cleanText(pageData.language);
      if (pageData.duration) result.basic!.duration = cleanText(pageData.duration);
      if (pageData.releaseDate) result.basic!.releaseDate = cleanText(pageData.releaseDate);

      if (pageData.rating !== undefined) result.rating!.douban = pageData.rating;
      if (pageData.ratingCount) result.rating!.doubanCount = pageData.ratingCount;

      if (pageData.synopsis) result.synopsis = cleanText(pageData.synopsis);
      if (pageData.tags) result.tags = pageData.tags.map(cleanText);
      if (pageData.images) result.officialImages = pageData.images;

      logMsg(`提取完成: ${result.info!.title} (${result.info!.year})`);
      logMsg(`  导演: ${result.basic!.director.join(", ") || "暂无"}`);
      logMsg(`  主演: ${result.basic!.actors.slice(0, 3).join(", ") || "暂无"}`);
      logMsg(`  评分: ${result.rating!.douban || "暂无"}`);
      logMsg(`  图片: ${result.officialImages!.length} 张`);
    },
  });

  try {
    await crawler.run([url]);
    return result;
  } catch (e) {
    logMsg(`浏览器渲染失败: ${(e as Error).message}`);
    return result;
  }
}

// ============================================================
// 搜索电影
// ============================================================

async function searchMovie(name: string): Promise<{ id: string; title: string; year: string }[]> {
  logMsg(`搜索电影: ${name}`);

  // 使用豆瓣 suggest API（JSON，不需要浏览器）
  try {
    const suggestUrl = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(name)}`;
    const response = await fetch(suggestUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Referer: "https://movie.douban.com/",
      },
    });
    const data = await response.json();

    if (Array.isArray(data)) {
      const results = data
        .filter((item: any) => item.type === "movie")
        .map((item: any) => ({
          id: item.id,
          title: cleanText(item.title),
          year: item.year || "",
        }));

      logMsg(`找到 ${results.length} 个候选`);
      return results;
    }
  } catch (e) {
    logMsg(`Suggest API 失败: ${(e as Error).message}`);
  }

  // 如果 suggest API 失败，使用浏览器搜索
  logMsg("尝试浏览器搜索...");

  const searchResults: { id: string; title: string; year: string }[] = [];

  const crawler = new PuppeteerCrawler({
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
      const searchUrl = `https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(name)}`;
      logMsg(`加载搜索页: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise((r) => setTimeout(r, 5000));

      // 提取搜索结果
      const results = await page.evaluate(() => {
        const items: { id: string; title: string; year: string }[] = [];
        const cards = document.querySelectorAll(".item-root a[href*='subject']");

        for (const card of Array.from(cards).slice(0, 5)) {
          const href = card.getAttribute("href") || "";
          const idMatch = href.match(/subject\/(\d+)/);
          if (!idMatch) continue;

          const titleEl = card.querySelector(".title-text") || card.querySelector("h3");
          const title = titleEl?.textContent?.trim() || "";

          const metaEl = card.querySelector(".meta");
          const yearMatch = metaEl?.textContent?.match(/(\d{4})/);
          const year = yearMatch ? yearMatch[1] : "";

          if (title) {
            items.push({ id: idMatch[1], title, year });
          }
        }

        return items;
      });

      searchResults.push(...results);
    },
  });

  try {
    await crawler.run([`https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(name)}`]);
    logMsg(`找到 ${searchResults.length} 个候选`);
    return searchResults;
  } catch (e) {
    logMsg(`浏览器搜索失败: ${(e as Error).message}`);
    return searchResults;
  }
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const filteredArgs = args.filter(a => a !== "--json");

  if (filteredArgs.length < 2) {
    console.error("用法: bun run movie-data-browser.ts <电影名> <输出目录> [--json]");
    process.exit(1);
  }

  const movieName = filteredArgs[0];
  const outputDir = filteredArgs[1];

  logMsg(`\n🎬 开始采集电影数据（浏览器渲染模式）: ${movieName}\n`);

  // 创建输出目录
  mkdirSync(join(outputDir, "images"), { recursive: true });

  // Step 1: 搜索电影
  const candidates = await searchMovie(movieName);
  if (candidates.length === 0) {
    logMsg("⚠️ 搜索未找到结果，尝试直接使用电影名...");
    // 如果搜索失败，尝试直接构造 URL
    // 这里需要用户提供豆瓣 ID
    console.error("✗ 未找到匹配的电影，请检查电影名或提供豆瓣 ID");
    process.exit(1);
  }

  // 选择最佳匹配
  const bestMatch = candidates[0];
  logMsg(`\n📌 选择最佳匹配: ${bestMatch.title} (${bestMatch.year})\n`);

  // Step 2: 使用浏览器获取详情
  const movieData = await fetchMovieDataWithBrowser(bestMatch.title, bestMatch.id);

  // Step 3: 保存到文件
  const outputPath = join(outputDir, "movie-data.json");
  writeFileSync(outputPath, JSON.stringify(movieData, null, 2), "utf-8");
  logMsg(`\n✓ 数据已保存到: ${outputPath}`);

  // 输出摘要
  console.log("\n" + "=".repeat(60));
  console.log(`📽️  电影: ${movieData.info?.title} (${movieData.info?.year})`);
  console.log(`🎬 导演: ${movieData.basic?.director.join(", ") || "暂无"}`);
  console.log(`🎭 主演: ${movieData.basic?.actors.slice(0, 3).join(", ") || "暂无"}`);
  console.log(`⭐ 评分: ${movieData.rating?.douban || "暂无"} (${movieData.rating?.doubanCount} 人评价)`);
  console.log(`📅 上映: ${movieData.basic?.releaseDate || "暂无"}`);
  console.log(`⏱️  片长: ${movieData.basic?.duration || "暂无"}`);
  console.log(`🖼️  图片: ${movieData.officialImages?.length || 0} 张`);
  console.log("=".repeat(60));

  // JSON 模式输出
  if (jsonMode) {
    console.log("\n" + JSON.stringify(movieData));
  }
}

main().catch((e) => {
  console.error("❌ 致命错误:", e.message || e);
  process.exit(1);
});
