#!/usr/bin/env bun
/**
 * movie-data.ts — 电影数据采集器
 *
 * 从豆瓣电影采集结构化数据（评分、演职员、剧情简介、票房等），
 * 输出 movie-data.json。
 *
 * 数据源:
 *   豆瓣搜索: https://movie.douban.com/j/subject_suggest?q={电影名}  (JSON)
 *   豆瓣详情: https://movie.douban.com/subject/{id}/                  (HTML 解析)
 *   豆瓣评分 API: https://movie.douban.com/j/subject_abstract?subject_id={id}  (JSON)
 *
 * 用法:
 *   bun run movie-data.ts <电影名> <输出目录> [--json]
 *   bun run movie-data.ts "流浪地球3" "00-草稿/20260823_流浪地球3影评"
 *   bun run movie-data.ts "封神第二部" "00-草稿/20260823_封神影评" --json
 *
 * 输出:
 *   <输出目录>/movie-data.json   — 结构化电影数据
 *   JSON 摘要到 stdout（--json 模式）
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// ============================================================
// 常量
// ============================================================

const DOUBAN_SUGGEST_API = "https://movie.douban.com/j/subject_suggest";
const DOUBAN_ABSTRACT_API = "https://movie.douban.com/j/subject_abstract";
const DOUBAN_MOVIE_URL = "https://movie.douban.com/subject";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://movie.douban.com/",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

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

/** 安全的 JSON 解析 */
async function fetchJson(url: string, headers: Record<string, string> = HEADERS) {
  const r = await fetchWithRetry(url, headers);
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON parse failed: ${text.substring(0, 200)}`);
  }
}

/** 从 HTML 提取 JSON-LD */
function extractJsonLd(html: string): any | null {
  const match = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** 清理文本（去除多余空白） */
function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 从 HTML 提取纯文本 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#\d+;/g, "").trim();
}

// ============================================================
// 豆瓣数据采集
// ============================================================

/** 搜索电影，返回候选列表 */
async function searchMovie(name: string): Promise<{ id: string; title: string; year: string; url: string }[]> {
  console.log(`🔍 搜索电影: ${name}`);

  try {
    const data = await fetchJson(`${DOUBAN_SUGGEST_API}?q=${encodeURIComponent(name)}`);
    if (!Array.isArray(data)) {
      console.log("⚠️ 豆瓣搜索返回非数组格式");
      return [];
    }

    const results = data
      .filter((item: any) => item.type === "movie")
      .map((item: any) => ({
        id: item.id,
        title: cleanText(item.title),
        year: item.year || "",
        url: `${DOUBAN_MOVIE_URL}/${item.id}/`,
      }));

    console.log(`✓ 找到 ${results.length} 个候选`);
    return results;
  } catch (e) {
    console.log(`✗ 搜索失败: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/** 检查是否为豆瓣反爬虫挑战页面 */
function isDoubanChallengePage(html: string): boolean {
  return html.includes("载入中 ...") && html.includes("sec") && html.includes("sha512");
}

/** 从豆瓣详情页解析电影数据 */
async function parseMoviePage(movieId: string, movieName: string): Promise<Partial<MovieData>> {
  console.log(`📖 解析详情页: ${DOUBAN_MOVIE_URL}/${movieId}/`);

  try {
    const r = await fetchWithRetry(`${DOUBAN_MOVIE_URL}/${movieId}/`);
    const html = await r.text();

    // 检查是否遇到反爬虫挑战
    if (isDoubanChallengePage(html)) {
      console.log(`⚠️ 豆瓣反爬虫挑战页面，跳过详情页解析`);
      console.log(`  💡 提示: 可使用 movie-images.ts 采集图片，或手动补充数据`);
      return {};
    }

    const result: Partial<MovieData> = {};

    // 初始化 info - 使用搜索时获取的电影名
    result.info = {
      title: movieName,
      titleEn: "",
      year: "",
      doubanId: movieId,
      url: `${DOUBAN_MOVIE_URL}/${movieId}/`,
    };

    // 从 JSON-LD 提取信息（最可靠）
    const jsonLd = extractJsonLd(html);
    if (jsonLd) {
      if (jsonLd.name) result.info.title = cleanText(jsonLd.name);
      if (jsonLd.alternateName) result.info.titleEn = cleanText(jsonLd.alternateName);
      if (jsonLd.datePublished) result.info.year = jsonLd.datePublished.substring(0, 4);

      // 从 JSON-LD 提取导演
      if (jsonLd.director) {
        const directors = Array.isArray(jsonLd.director) ? jsonLd.director : [jsonLd.director];
        result.basic = result.basic || { director: [], actors: [], genre: [], region: "", language: "", duration: "", releaseDate: "" };
        result.basic.director = directors.map((d: any) => cleanText(d.name || d));
      }

      // 从 JSON-LD 提取演员
      if (jsonLd.actor) {
        const actors = Array.isArray(jsonLd.actor) ? jsonLd.actor : [jsonLd.actor];
        result.basic = result.basic || { director: [], actors: [], genre: [], region: "", language: "", duration: "", releaseDate: "" };
        result.basic.actors = actors.map((a: any) => cleanText(a.name || a));
      }

      // 从 JSON-LD 提取类型
      if (jsonLd.genre) {
        const genres = Array.isArray(jsonLd.genre) ? jsonLd.genre : [jsonLd.genre];
        result.basic = result.basic || { director: [], actors: [], genre: [], region: "", language: "", duration: "", releaseDate: "" };
        result.basic.genre = genres.map((g: string) => cleanText(g));
      }

      // 从 JSON-LD 提取片长
      if (jsonLd.duration) {
        result.basic = result.basic || { director: [], actors: [], genre: [], region: "", language: "", duration: "", releaseDate: "" };
        result.basic.duration = cleanText(jsonLd.duration);
      }

      // 从 JSON-LD 提取评分
      if (jsonLd.aggregateRating) {
        result.rating = {
          douban: jsonLd.aggregateRating.ratingValue ? parseFloat(jsonLd.aggregateRating.ratingValue) : null,
          doubanCount: jsonLd.aggregateRating.ratingCount ? parseInt(jsonLd.aggregateRating.ratingCount) : 0,
          ratingText: "",
        };
      }

      // 从 JSON-LD 提取图片
      if (jsonLd.image) {
        const imageUrls = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
        result.officialImages = [];
        for (const url of imageUrls.slice(0, 5)) {
          if (typeof url === "string" && url.startsWith("http")) {
            result.officialImages.push({
              url,
              type: "poster",
              description: "官方海报",
            });
          }
        }
      }
    }

    // 从 HTML 补充信息（JSON-LD 可能不完整）

    // 提取年份（如果 JSON-LD 没有）
    if (result.info && !result.info.year) {
      const yearPatterns = [
        /<span class="year">\((\d{4})\)<\/span>/,
        /\((\d{4})\)/,
      ];
      for (const pattern of yearPatterns) {
        const match = html.match(pattern);
        if (match) {
          result.info.year = match[1];
          break;
        }
      }
    }

    // 提取评分（如果 JSON-LD 没有）
    if (!result.rating || result.rating.douban === null) {
      const ratingPatterns = [
        /<strong[^>]*property="v:average"[^>]*>(.*?)<\/strong>/,
        /<span[^>]*class="rating_num"[^>]*>(.*?)<\/span>/,
      ];
      let ratingValue: number | null = null;
      for (const pattern of ratingPatterns) {
        const match = html.match(pattern);
        if (match) {
          const val = parseFloat(match[1]);
          if (!isNaN(val) && val > 0) {
            ratingValue = val;
            break;
          }
        }
      }

      const countPatterns = [
        /<span[^>]*property="v:votes"[^>]*>(.*?)<\/span>/,
        /(\d+)人评价/,
      ];
      let ratingCount = 0;
      for (const pattern of countPatterns) {
        const match = html.match(pattern);
        if (match) {
          ratingCount = parseInt(match[1]) || 0;
          break;
        }
      }

      const ratingTextMatch = html.match(/<span class="rating_per">(.*?)<\/span>/g);
      result.rating = {
        douban: ratingValue,
        doubanCount: ratingCount,
        ratingText: ratingTextMatch ? ratingTextMatch.map(m => m.replace(/<[^>]+>/g, "")).join(" ") : "",
      };
    }

    // 提取基本信息（如果 JSON-LD 没有完整信息）
    if (!result.basic || result.basic.director.length === 0) {
      const infoMatch = html.match(/<div id="info"[^>]*>([\s\S]*?)<\/div>/);
      if (infoMatch) {
        const infoHtml = infoMatch[1];
        const basic: MovieBasic = result.basic || {
          director: [],
          actors: [],
          genre: [],
          region: "",
          language: "",
          duration: "",
          releaseDate: "",
        };

        // 导演
        if (basic.director.length === 0) {
          const directorPatterns = [
            /<a[^>]*rel="v:directedBy"[^>]*>(.*?)<\/a>/g,
            /导演[：:]\s*<a[^>]*>(.*?)<\/a>/g,
          ];
          for (const pattern of directorPatterns) {
            const matches = [...infoHtml.matchAll(pattern)];
            if (matches.length > 0) {
              basic.director = matches.map(m => cleanText(m[1].replace(/<[^>]+>/g, "")));
              break;
            }
          }
        }

        // 主演
        if (basic.actors.length === 0) {
          const actorPatterns = [
            /<a[^>]*rel="v:starring"[^>]*>(.*?)<\/a>/g,
            /主演[：:]\s*<a[^>]*>(.*?)<\/a>/g,
          ];
          for (const pattern of actorPatterns) {
            const matches = [...infoHtml.matchAll(pattern)];
            if (matches.length > 0) {
              basic.actors = matches.map(m => cleanText(m[1].replace(/<[^>]+>/g, "")));
              break;
            }
          }
        }

        // 类型
        if (basic.genre.length === 0) {
          const genrePatterns = [
            /<span[^>]*property="v:genre"[^>]*>(.*?)<\/span>/g,
            /类型[：:]\s*<span[^>]*>(.*?)<\/span>/g,
          ];
          for (const pattern of genrePatterns) {
            const matches = [...infoHtml.matchAll(pattern)];
            if (matches.length > 0) {
              basic.genre = matches.map(m => cleanText(m[1].replace(/<[^>]+>/g, "")));
              break;
            }
          }
        }

        // 地区
        if (!basic.region) {
          const regionPatterns = [
            /制片国家\/地区[：:]\s*(.*?)\s*<br/,
            /地区[：:]\s*(.*?)\s*<br/,
          ];
          for (const pattern of regionPatterns) {
            const match = infoHtml.match(pattern);
            if (match) {
              basic.region = cleanText(match[1]);
              break;
            }
          }
        }

        // 语言
        if (!basic.language) {
          const langPatterns = [
            /语言[：:]\s*(.*?)\s*<br/,
          ];
          for (const pattern of langPatterns) {
            const match = infoHtml.match(pattern);
            if (match) {
              basic.language = cleanText(match[1]);
              break;
            }
          }
        }

        // 片长
        if (!basic.duration) {
          const durationPatterns = [
            /<span[^>]*property="v:runtime"[^>]*>(.*?)<\/span>/,
            /片长[：:]\s*(\d+)/,
          ];
          for (const pattern of durationPatterns) {
            const match = infoHtml.match(pattern);
            if (match) {
              basic.duration = cleanText(match[1].replace(/<[^>]+>/g, ""));
              break;
            }
          }
        }

        // 上映日期
        if (!basic.releaseDate) {
          const releasePatterns = [
            /<span[^>]*property="v:initialReleaseDate"[^>]*>(.*?)<\/span>/g,
            /上映日期[：:]\s*(.*?)\s*<br/,
          ];
          for (const pattern of releasePatterns) {
            const matches = [...infoHtml.matchAll(pattern)];
            if (matches.length > 0) {
              basic.releaseDate = matches.map(m => cleanText(m[1].replace(/<[^>]+>/g, ""))).join(" / ");
              break;
            }
          }
        }

        result.basic = basic;
      }
    }

    // 提取剧情简介（如果 JSON-LD 没有）
    if (!result.synopsis) {
      const synopsisPatterns = [
        /<span[^>]*property="v:summary"[^>]*>([\s\S]*?)<\/span>/,
        /<div class="indent"[^>]*id="link-report"[^>]*>([\s\S]*?)<\/div>/,
      ];
      for (const pattern of synopsisPatterns) {
        const match = html.match(pattern);
        if (match) {
          result.synopsis = cleanText(stripHtml(match[1]));
          break;
        }
      }
    }

    // 提取标签
    if (!result.tags || result.tags.length === 0) {
      const tagsPatterns = [
        /<a[^>]*class="tag"[^>]*>(.*?)<\/a>/g,
        /<span[^>]*class="tag"[^>]*>(.*?)<\/span>/g,
      ];
      for (const pattern of tagsPatterns) {
        const matches = [...html.matchAll(pattern)];
        if (matches.length > 0) {
          result.tags = matches.map(m => cleanText(m[1].replace(/<[^>]+>/g, "")));
          break;
        }
      }
    }

    // 提取获奖信息
    if (!result.awards || result.awards.length === 0) {
      const awardsMatch = html.match(/<div class="award"[^>]*>([\s\S]*?)<\/div>/g);
      if (awardsMatch) {
        result.awards = awardsMatch.slice(0, 5).map(m => cleanText(stripHtml(m)));
      }
    }

    // 提取图片（如果 JSON-LD 没有）
    if (!result.officialImages || result.officialImages.length === 0) {
      const posterMatch = html.match(/<li[^>]*class="poster-col"[^>]*>([\s\S]*?)<\/li>/g);
      const stillMatch = html.match(/<li[^>]*class="still-col"[^>]*>([\s\S]*?)<\/li>/g);
      const images: MovieImage[] = [];

      if (posterMatch) {
        for (const item of posterMatch.slice(0, 5)) {
          const imgMatch = item.match(/src="(https?:\/\/[^"]+)"/);
          const altMatch = item.match(/alt="([^"]+)"/);
          if (imgMatch) {
            images.push({
              url: imgMatch[1],
              type: "poster",
              description: altMatch ? cleanText(altMatch[1]) : "官方海报",
            });
          }
        }
      }

      if (stillMatch) {
        for (const item of stillMatch.slice(0, 10)) {
          const imgMatch = item.match(/src="(https?:\/\/[^"]+)"/);
          const altMatch = item.match(/alt="([^"]+)"/);
          if (imgMatch) {
            images.push({
              url: imgMatch[1],
              type: "still",
              description: altMatch ? cleanText(altMatch[1]) : "剧照",
            });
          }
        }
      }

      if (images.length > 0) {
        result.officialImages = images;
      }
    }

    // 确保基本信息完整
    if (!result.basic) {
      result.basic = {
        director: [],
        actors: [],
        genre: [],
        region: "",
        language: "",
        duration: "",
        releaseDate: "",
      };
    }

    if (!result.rating) {
      result.rating = {
        douban: null,
        doubanCount: 0,
        ratingText: "",
      };
    }

    if (!result.officialImages) {
      result.officialImages = [];
    }

    return result;
  } catch (e) {
    console.log(`✗ 解析详情页失败: ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
}

/** 从豆瓣评分 API 获取最新评分 */
async function fetchDoubanRating(movieId: string): Promise<{ rating: number | null; count: number } | null> {
  try {
    const data = await fetchJson(`${DOUBAN_ABSTRACT_API}?subject_id=${movieId}`);
    if (data && data.subject) {
      return {
        rating: data.subject.rate ? parseFloat(data.subject.rate) : null,
        count: data.subject.votes || 0,
      };
    }
    return null;
  } catch {
    return null;
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
    console.error("用法: bun run movie-data.ts <电影名> <输出目录> [--json]");
    process.exit(1);
  }

  const movieName = filteredArgs[0];
  const outputDir = filteredArgs[1];

  console.log(`\n🎬 开始采集电影数据: ${movieName}\n`);

  // 创建输出目录
  mkdirSync(join(outputDir, "images"), { recursive: true });

  // Step 1: 搜索电影
  const candidates = await searchMovie(movieName);
  if (candidates.length === 0) {
    console.error("✗ 未找到匹配的电影，请检查电影名");
    process.exit(1);
  }

  // 选择最佳匹配（第一个结果通常是最佳匹配）
  const bestMatch = candidates[0];
  console.log(`\n📌 选择最佳匹配: ${bestMatch.title} (${bestMatch.year}) - ${bestMatch.url}\n`);

  // Step 2: 解析详情页
  let pageData = await parseMoviePage(bestMatch.id, bestMatch.title);

  // 检查是否成功获取到数据
  const hasBasicData = pageData.basic && (pageData.basic.director.length > 0 || pageData.basic.actors.length > 0);

  // 如果 HTTP 方式失败，尝试浏览器渲染
  if (!hasBasicData) {
    console.log(`\n⚠️ HTTP 方式未获取到完整数据，尝试浏览器渲染...`);
    try {
      const browserScript = join(__dirname, "movie-data-browser.ts");
      if (existsSync(browserScript)) {
        console.log(`  🔄 启动浏览器渲染模式...`);
        const result = execSync(`bun run "${browserScript}" "${movieName}" "${outputDir}" --json`, {
          encoding: "utf-8",
          timeout: 180000, // 3 分钟超时
          stdio: ["ignore", "pipe", "pipe"],
        });

        // 解析浏览器渲染的结果
        const lines = result.split("\n");
        const jsonLine = lines.find(line => line.startsWith("{"));
        if (jsonLine) {
          const browserData = JSON.parse(jsonLine);
          if (browserData.info && browserData.basic) {
            pageData = browserData;
            console.log(`  ✓ 浏览器渲染成功！`);
          }
        }
      }
    } catch (e) {
      console.log(`  ✗ 浏览器渲染失败: ${e instanceof Error ? e.message : String(e)}`);
      console.log(`  💡 建议手动补充数据或使用其他来源`);
    }
  }

  // Step 3: 获取最新评分
  console.log("📊 获取最新评分...");
  const ratingData = await fetchDoubanRating(bestMatch.id);
  if (ratingData) {
    if (!pageData.rating) pageData.rating = { douban: null, doubanCount: 0, ratingText: "" };
    pageData.rating.douban = ratingData.rating;
    pageData.rating.doubanCount = ratingData.count;
    console.log(`✓ 豆瓣评分: ${ratingData.rating} (${ratingData.count} 人评价)`);
  }

  // Step 4: 组装最终数据
  const movieData: MovieData = {
    info: pageData.info || {
      title: movieName,
      titleEn: "",
      year: bestMatch.year,
      doubanId: bestMatch.id,
      url: bestMatch.url,
    },
    basic: pageData.basic || {
      director: [],
      actors: [],
      genre: [],
      region: "",
      language: "",
      duration: "",
      releaseDate: "",
    },
    rating: pageData.rating || {
      douban: null,
      doubanCount: 0,
      ratingText: "",
    },
    boxOffice: {
      total: "",
      firstDay: "",
      firstWeek: "",
    },
    synopsis: pageData.synopsis || "",
    tags: pageData.tags || [],
    awards: pageData.awards || [],
    officialImages: pageData.officialImages || [],
    fetchedAt: new Date().toISOString(),
    sources: {
      douban: bestMatch.url,
    },
  };

  // Step 5: 保存到文件
  const outputPath = join(outputDir, "movie-data.json");
  writeFileSync(outputPath, JSON.stringify(movieData, null, 2), "utf-8");
  console.log(`\n✓ 数据已保存到: ${outputPath}`);

  // 输出摘要
  console.log("\n" + "=".repeat(60));
  console.log(`📽️  电影: ${movieData.info.title} (${movieData.info.year})`);
  console.log(`🎬 导演: ${movieData.basic.director.join(", ") || "暂无"}`);
  console.log(`🎭 主演: ${movieData.basic.actors.slice(0, 3).join(", ") || "暂无"}`);
  console.log(`⭐ 评分: ${movieData.rating.douban || "暂无"} (${movieData.rating.doubanCount} 人评价)`);
  console.log(`📅 上映: ${movieData.basic.releaseDate || "暂无"}`);
  console.log(`⏱️  片长: ${movieData.basic.duration || "暂无"}`);
  console.log(`🖼️  图片: ${movieData.officialImages.length} 张`);
  console.log("=".repeat(60));

  // JSON 模式输出到 stdout
  if (jsonMode) {
    console.log("\n" + JSON.stringify(movieData));
  }
}

main().catch((e) => {
  console.error("❌ 致命错误:", e.message || e);
  process.exit(1);
});
