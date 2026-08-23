#!/usr/bin/env bun
/**
 * entertainment-research.ts — 娱乐热点事件调研器
 *
 * 从微博热搜和娱乐新闻网站采集热点事件数据，
 * 输出 entertainment-data.json。
 *
 * 数据源:
 *   微博热搜: https://weibo.com/ajax/side/hotSearch  (JSON)
 *   新浪娱乐: ent.sina.com.cn  (HTML 解析)
 *   网易娱乐: ent.163.com      (HTML 解析)
 *
 * 用法:
 *   bun run entertainment-research.ts <事件名> <输出目录> [--json]
 *   bun run entertainment-research.ts "XX恋情" "00-草稿/20260823_XX恋情"
 *   bun run entertainment-research.ts "XX争议" "00-草稿/20260823_XX争议" --json
 *
 * 输出:
 *   <输出目录>/entertainment-data.json   — 结构化事件数据
 *   JSON 摘要到 stdout（--json 模式）
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ============================================================
// 常量
// ============================================================

const WEIBO_HOT_SEARCH_API = "https://weibo.com/ajax/side/hotSearch";
const SINA_ENT_URL = "https://ent.sina.com.cn";
const NETEASE_ENT_URL = "https://ent.163.com";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://weibo.com/",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

// ============================================================
// 类型定义
// ============================================================

interface EventInfo {
  title: string;
  keywords: string[];
  category: string;
  hotRank: number | null;
  hotValue: number | null;
}

interface TimelineEntry {
  timestamp: string;
  event: string;
  source: string;
  sourceUrl: string;
  credibility: "high" | "medium" | "low" | "unverified";
}

interface Perspective {
  party: string;
  statement: string;
  source: string;
  sourceUrl: string;
  credibility: "high" | "medium" | "low" | "unverified";
}

interface PublicReaction {
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  topComments: {
    content: string;
    likes: number;
    source: string;
  }[];
  commentVolume: number;
}

interface RelatedEvent {
  title: string;
  relevance: "high" | "medium" | "low";
  url: string;
}

interface EntertainmentData {
  event: EventInfo;
  timeline: TimelineEntry[];
  perspectives: Perspective[];
  publicReaction: PublicReaction;
  relatedEvents: RelatedEvent[];
  fetchedAt: string;
  sources: {
    weibo: string;
    sina: string;
    netease: string;
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

/** 清理文本（去除多余空白） */
function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 从 HTML 提取纯文本 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#\d+;/g, "").trim();
}

/** 获取当前时间的 ISO 字符串 */
function getCurrentISOString(): string {
  return new Date().toISOString();
}

// ============================================================
// 微博热搜采集
// ============================================================

interface WeiboHotSearchItem {
  word: string;
  num: number;
  category: string;
  flag_desc: string;
  is_hot: boolean;
  is_new: boolean;
}

/** 从微博热搜采集热点事件 */
async function fetchWeiboHotSearch(eventName: string): Promise<{ rank: number | null; hotValue: number | null; category: string }> {
  console.log(`🔍 采集微博热搜: ${eventName}`);

  try {
    const data = await fetchJson(WEIBO_HOT_SEARCH_API);
    const realtime = data?.data?.realtime || [];

    // 搜索匹配的热搜词
    for (let i = 0; i < realtime.length; i++) {
      const item = realtime[i];
      if (item.word && (item.word.includes(eventName) || eventName.includes(item.word))) {
        console.log(`✓ 找到热搜匹配: ${item.word} (排名 ${i + 1}, 热度 ${item.num})`);
        return {
          rank: i + 1,
          hotValue: item.num,
          category: item.category || "",
        };
      }
    }

    console.log(`⚠️ 未在热搜中找到精确匹配，将使用事件名作为关键词`);
    return { rank: null, hotValue: null, category: "" };
  } catch (e) {
    console.log(`✗ 微博热搜采集失败: ${e instanceof Error ? e.message : String(e)}`);
    return { rank: null, hotValue: null, category: "" };
  }
}

/** 从微博搜索相关新闻 */
async function searchWeiboNews(eventName: string): Promise<{ title: string; url: string; source: string }[]> {
  console.log(`📰 搜索微博新闻: ${eventName}`);

  const results: { title: string; url: string; source: string }[] = [];

  try {
    // 使用微博搜索 API
    const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(eventName)}&typeall=1&suball=1&timescope=custom:2026-08-20:2026-08-24&Refer=g`;
    const r = await fetchWithRetry(searchUrl);
    const html = await r.text();

    // 提取微博帖子
    const postMatches = html.match(/<div class="card-wrap"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g);
    if (postMatches) {
      for (const post of postMatches.slice(0, 5)) {
        const titleMatch = post.match(/<p class="txt"[^>]*>([\s\S]*?)<\/p>/);
        const linkMatch = post.match(/href="(\/[^"]+)"/);
        if (titleMatch) {
          const title = cleanText(stripHtml(titleMatch[1]));
          const url = linkMatch ? `https://weibo.com${linkMatch[1]}` : "";
          if (title.length > 10) {
            results.push({
              title: title.substring(0, 100),
              url,
              source: "weibo",
            });
          }
        }
      }
    }

    console.log(`✓ 找到 ${results.length} 条微博`);
    return results;
  } catch (e) {
    console.log(`✗ 微博搜索失败: ${e instanceof Error ? e.message : String(e)}`);
    return results;
  }
}

// ============================================================
// 娱乐新闻采集
// ============================================================

/** 从新浪娱乐搜索新闻 */
async function searchSinaEnt(eventName: string): Promise<{ title: string; url: string; source: string }[]> {
  console.log(`📰 搜索新浪娱乐: ${eventName}`);

  const results: { title: string; url: string; source: string }[] = [];

  try {
    const searchUrl = `https://search.sina.com.cn/?q=${encodeURIComponent(eventName)}&c=news&from=channel&ie=utf-8`;
    const r = await fetchWithRetry(searchUrl);
    const html = await r.text();

    // 提取搜索结果
    const resultMatches = html.match(/<h2><a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>/g);
    if (resultMatches) {
      for (const match of resultMatches.slice(0, 5)) {
        const linkMatch = match.match(/href="([^"]*)"/);
        const titleMatch = match.match(/>([\s\S]*?)<\/a>/);
        if (linkMatch && titleMatch) {
          const url = linkMatch[1];
          const title = cleanText(stripHtml(titleMatch[1]));
          if (title.length > 10 && url.includes("ent.sina.com.cn")) {
            results.push({
              title: title.substring(0, 100),
              url,
              source: "sina",
            });
          }
        }
      }
    }

    console.log(`✓ 找到 ${results.length} 条新浪娱乐新闻`);
    return results;
  } catch (e) {
    console.log(`✗ 新浪娱乐搜索失败: ${e instanceof Error ? e.message : String(e)}`);
    return results;
  }
}

/** 从网易娱乐搜索新闻 */
async function searchNeteaseEnt(eventName: string): Promise<{ title: string; url: string; source: string }[]> {
  console.log(`📰 搜索网易娱乐: ${eventName}`);

  const results: { title: string; url: string; source: string }[] = [];

  try {
    const searchUrl = `https://www.163.com/search?keyword=${encodeURIComponent(eventName)}&type=ent`;
    const r = await fetchWithRetry(searchUrl);
    const html = await r.text();

    // 提取搜索结果
    const resultMatches = html.match(/<a[^>]*href="([^"]*)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/g);
    if (resultMatches) {
      for (const match of resultMatches.slice(0, 5)) {
        const linkMatch = match.match(/href="([^"]*)"/);
        const titleMatch = match.match(/>([\s\S]*?)<\/a>/);
        if (linkMatch && titleMatch) {
          const url = linkMatch[1];
          const title = cleanText(stripHtml(titleMatch[1]));
          if (title.length > 10) {
            results.push({
              title: title.substring(0, 100),
              url,
              source: "netease",
            });
          }
        }
      }
    }

    console.log(`✓ 找到 ${results.length} 条网易娱乐新闻`);
    return results;
  } catch (e) {
    console.log(`✗ 网易娱乐搜索失败: ${e instanceof Error ? e.message : String(e)}`);
    return results;
  }
}

// ============================================================
// 数据整合
// ============================================================

/** 整合多方数据 */
function integrateData(
  eventName: string,
  weiboHot: { rank: number | null; hotValue: number | null; category: string },
  weiboNews: { title: string; url: string; source: string }[],
  sinaNews: { title: string; url: string; source: string }[],
  neteaseNews: { title: string; url: string; source: string }[]
): EntertainmentData {
  // 构建时间线
  const timeline: TimelineEntry[] = [];
  const now = getCurrentISOString();

  // 添加微博热搜事件
  if (weiboHot.rank) {
    timeline.push({
      timestamp: now,
      event: `${eventName} 冲上微博热搜第${weiboHot.rank}位，热度 ${weiboHot.hotValue}`,
      source: "weibo",
      sourceUrl: WEIBO_HOT_SEARCH_API,
      credibility: "high",
    });
  }

  // 添加新闻事件
  for (const news of [...weiboNews, ...sinaNews, ...neteaseNews].slice(0, 5)) {
    timeline.push({
      timestamp: now,
      event: news.title,
      source: news.source,
      sourceUrl: news.url,
      credibility: news.source === "weibo" ? "medium" : "medium",
    });
  }

  // 构建多方说法
  const perspectives: Perspective[] = [];

  // 当事人说法（需要后续补充）
  perspectives.push({
    party: "当事人",
    statement: "暂无官方回应",
    source: "pending",
    sourceUrl: "",
    credibility: "unverified",
  });

  // 经纪公司说法（需要后续补充）
  perspectives.push({
    party: "经纪公司",
    statement: "暂无官方声明",
    source: "pending",
    sourceUrl: "",
    credibility: "unverified",
  });

  // 网友反应
  const publicReaction: PublicReaction = {
    sentiment: "mixed",
    topComments: [
      {
        content: "等待当事人回应",
        likes: 0,
        source: "weibo",
      },
    ],
    commentVolume: weiboHot.hotValue || 0,
  };

  // 相关事件
  const relatedEvents: RelatedEvent[] = [];
  for (const news of [...sinaNews, ...neteaseNews].slice(0, 3)) {
    relatedEvents.push({
      title: news.title,
      relevance: "medium",
      url: news.url,
    });
  }

  return {
    event: {
      title: eventName,
      keywords: [eventName],
      category: weiboHot.category || "争议",
      hotRank: weiboHot.rank,
      hotValue: weiboHot.hotValue,
    },
    timeline,
    perspectives,
    publicReaction,
    relatedEvents,
    fetchedAt: now,
    sources: {
      weibo: WEIBO_HOT_SEARCH_API,
      sina: SINA_ENT_URL,
      netease: NETEASE_ENT_URL,
    },
  };
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const filteredArgs = args.filter(a => a !== "--json");

  if (filteredArgs.length < 2) {
    console.error("用法: bun run entertainment-research.ts <事件名> <输出目录> [--json]");
    process.exit(1);
  }

  const eventName = filteredArgs[0];
  const outputDir = filteredArgs[1];

  console.log(`\n🎬 开始调研娱乐热点: ${eventName}\n`);

  // 创建输出目录
  mkdirSync(join(outputDir, "images"), { recursive: true });

  // Step 1: 采集微博热搜
  const weiboHot = await fetchWeiboHotSearch(eventName);

  // Step 2: 搜索微博新闻
  const weiboNews = await searchWeiboNews(eventName);

  // Step 3: 搜索新浪娱乐新闻
  const sinaNews = await searchSinaEnt(eventName);

  // Step 4: 搜索网易娱乐新闻
  const neteaseNews = await searchNeteaseEnt(eventName);

  // Step 5: 整合数据
  const entertainmentData = integrateData(eventName, weiboHot, weiboNews, sinaNews, neteaseNews);

  // Step 6: 保存到文件
  const outputPath = join(outputDir, "entertainment-data.json");
  writeFileSync(outputPath, JSON.stringify(entertainmentData, null, 2), "utf-8");
  console.log(`\n✓ 数据已保存到: ${outputPath}`);

  // 输出摘要
  console.log("\n" + "=".repeat(60));
  console.log(`🎬 事件: ${entertainmentData.event.title}`);
  console.log(`🔥 热搜排名: ${entertainmentData.event.hotRank || "未上榜"}`);
  console.log(`📊 热度值: ${entertainmentData.event.hotValue || "暂无"}`);
  console.log(`📰 微博新闻: ${weiboNews.length} 条`);
  console.log(`📰 新浪娱乐: ${sinaNews.length} 条`);
  console.log(`📰 网易娱乐: ${neteaseNews.length} 条`);
  console.log(`⏰ 时间线: ${entertainmentData.timeline.length} 个节点`);
  console.log("=".repeat(60));

  // JSON 模式输出到 stdout
  if (jsonMode) {
    console.log("\n" + JSON.stringify(entertainmentData));
  }
}

main().catch((e) => {
  console.error("❌ 致命错误:", e.message || e);
  process.exit(1);
});
