#!/usr/bin/env bun
/**
 * car-locate.ts — 车型名称定位器
 *
 * 根据用户输入的车型名（如 "零跑A05"、"比亚迪 海豹06 GT"、"Model Y"），
 * 在汽车之家数据库中定位到系列 ID（seriesId），供 car-specs.ts 抓取参数。
 *
 * 数据源（汽车之家，均为公开接口）：
 *   1. 品牌列表: https://car.autohome.com.cn/AsLeftMenu/As_LeftListNew.ashx?typeId=1&brandId=0&fctId=0&seriesId=0  (GBK)
 *   2. 品牌下车系: 同上接口 brandId={brandId}  (GBK)
 *
 * 用法:
 *   bun run car-locate.ts "零跑A05"
 *   bun run car-locate.ts "比亚迪 海豹06 GT" --json
 *
 * 输出:
 *   - 匹配到的候选列表（JSON 到 stdout，默认含多条候选，按匹配度排序）
 *   - 候选包含: seriesId / seriesName / brandName / minPrice / maxPrice / score
 */

const BASE = "https://car.autohome.com.cn/AsLeftMenu/As_LeftListNew.ashx";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://car.autohome.com.cn/",
};

interface Brand {
  brandId: number;
  name: string;
}

interface Series {
  seriesId: number;
  name: string;
  minPrice?: number;
  maxPrice?: number;
}

interface Candidate extends Series {
  brandName: string;
  score: number;
}

/** fetch 带超时与重试 */
async function fetchWithRetry(url: string, headers: Record<string, string>, timeoutMs = 15000, retries = 3): Promise<Response> {
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

/** 抓取并 GBK 解码 */
async function fetchGbk(url: string): Promise<string> {
  const r = await fetchWithRetry(url, HEADERS);
  return new TextDecoder("gbk").decode(await r.arrayBuffer());
}

/** 解析品牌列表 HTML → Brand[] */
function parseBrands(html: string): Brand[] {
  const brands: Brand[] = [];
  // <li id='b318'><h3><a href='/price/brand-318.html'><i class='icon10 icon10-sjr'></i>零跑汽车<em>(193)</em></a></h3></li>
  const re = /<li id='b(\d+)'><h3><a href='[^']*brand-(\d+)\.html'[^>]*>.*?<\/i>([^<]+?)<em>\((\d+)\)<\/em><\/a><\/h3><\/li>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    brands.push({ brandId: Number(m[1]), name: m[3].trim() });
  }
  return brands;
}

/** 解析品牌下车系列表 HTML → Series[] */
function parseSeries(html: string): Series[] {
  const series: Series[] = [];
  // <dd><a id='series_8569' href='/price/series-8569.html'>零跑A05 <em>(5)</em></a></dd>
  const re = /<a id='series_(\d+)' href='[^']*series-\d+\.html'[^>]*>([^<]+?)\s*<em>\((\d+)\)<\/em><\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    series.push({ seriesId: Number(m[1]), name: m[2].trim() });
  }
  return series;
}

/** 规范化文本：去空白、统一大小写、去常见后缀词 */
function norm(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** 计算匹配分: 0-100 */
function scoreMatch(input: string, candidate: string): number {
  const a = norm(input);
  const b = norm(candidate);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a)) return 90; // 候选名包含输入（零跑A05 包含 A05）
  if (a.includes(b)) return 80; // 输入包含候选名
  // 编辑距离粗略近似：前缀匹配
  let prefix = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  if (prefix >= Math.max(2, Math.floor(Math.min(a.length, b.length) * 0.5))) {
    return 50 + Math.round((prefix / Math.max(a.length, b.length)) * 40);
  }
  return 0;
}

function printHelp(): void {
  console.log(`用法:
  bun run car-locate.ts "车型名" [--json]

示例:
  bun run car-locate.ts "零跑A05"
  bun run car-locate.ts "比亚迪 海豹06 GT"
  bun run car-locate.ts "Model Y" --json

说明:
  输出候选列表(按匹配度排序), 取 seriesId 传给 car-specs.ts 抓参数。`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    process.exit(0);
  }
  const jsonOut = args.includes("--json");
  const query = args.filter((a) => a !== "--json").join(" ").trim();

  // Step 1: 抓全部品牌
  const brandHtml = await fetchGbk(`${BASE}?typeId=1&brandId=0&fctId=0&seriesId=0`);
  const brands = parseBrands(brandHtml);
  if (brands.length === 0) throw new Error("品牌列表解析失败（页面结构可能已变更）");

  // Step 2: 品牌匹配 — 找输入中命中的品牌
  // 策略: 品牌名出现在输入里（比亚迪 海豹 → 比亚迪），或输入出现在品牌名里（零跑A05 → 零跑汽车）
  const q = query;
  const matchedBrands = brands
    .map((b) => ({
      brand: b,
      score: Math.max(scoreMatch(q, b.name), scoreMatch(q, b.name.replace(/汽车$/, ""))),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  let brandList: Brand[];
  let restQuery: string;

  if (matchedBrands.length > 0) {
    // 取最高分品牌，输入剩余部分作为车系关键词
    const top = matchedBrands[0];
    brandList = [top.brand];
    restQuery = q.replace(new RegExp(top.brand.name.replace(/汽车$/, ""), "g"), "").trim();
    if (!restQuery) restQuery = q.replace(new RegExp(top.brand.name, "g"), "").trim();
  } else {
    // 无品牌命中: 尝试用全品牌列表做车系搜索（遍历所有品牌太慢，仅用常见做法——提示用户）
    brandList = [];
    restQuery = q;
  }

  const candidates: Candidate[] = [];

  if (brandList.length > 0) {
    // Step 3: 抓品牌下车系
    const seriesHtml = await fetchGbk(`${BASE}?typeId=1&brandId=${brandList[0].brandId}&fctId=0&seriesId=0`);
    const series = parseSeries(seriesHtml);
    for (const s of series) {
      const score = scoreMatch(restQuery, s.name.replace(brandList[0].name.replace(/汽车$/, ""), ""));
      if (score > 0) {
        candidates.push({ ...s, brandName: brandList[0].name, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
  } else {
    // Step 3 兜底: 无品牌命中 → 全站搜索页（UTF-8, 结果按相关度排序）
    const searchHtml = await fetchGbk(
      `https://www.autohome.com.cn/search/?q=${encodeURIComponent(q)}`
    );
    // 提取 seriesId/seriesName 配对, 按出现顺序(≈相关度)
    const re = /"seriesId":(\d+),"seriesName":"([^"]+)"/g;
    let m: RegExpExecArray | null;
    const seen = new Set<number>();
    let rank = 0;
    while ((m = re.exec(searchHtml)) !== null) {
      const id = Number(m[1]);
      const name = m[2].trim();
      if (seen.has(id)) continue;
      seen.add(id);
      const score = scoreMatch(q, name);
      if (score > 0) {
        candidates.push({ seriesId: id, name, brandName: "", score: Math.min(100, score + Math.max(0, 8 - rank)) });
      }
      rank++;
      if (rank > 60) break;
    }
    candidates.sort((a, b) => b.score - a.score);
  }

  if (jsonOut || candidates.length > 0) {
    console.log(JSON.stringify({ query, candidates: candidates.slice(0, 8) }, null, 2));
  }

  if (candidates.length === 0) {
    console.error(`未匹配到车系。请尝试：`);
    console.error(`  1. 补全品牌名，如 "比亚迪 海豹06 GT"`);
    console.error(`  2. 检查车型名拼写`);
    console.error(`  3. 使用已知 seriesId 直接调用 car-specs.ts`);
    process.exit(1);
  }

  if (!jsonOut) {
    console.log(`\n匹配到 ${candidates.length} 个候选（取前 8 个）:`);
    for (const c of candidates.slice(0, 8)) {
      const price = c.minPrice !== undefined ? `${(c.minPrice / 10000).toFixed(2)}-${(c.maxPrice! / 10000).toFixed(2)}万` : "价格未知";
      console.log(`  seriesId=${c.seriesId} | ${c.brandName} ${c.name} | ${price} | score=${c.score}`);
    }
    console.log(`\n用 seriesId 抓参数: bun run .agents/skills/wechat-car-writer/scripts/car-specs.ts ${candidates[0].seriesId} <输出目录>`);
  }
}

main().catch((e) => {
  console.error(`定位失败: ${e.message}`);
  process.exit(1);
});
