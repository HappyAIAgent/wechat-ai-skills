#!/usr/bin/env bun
/**
 * car-official.ts — 官网官方图采集器（官网优先）
 *
 * 按厂商适配 SSR 官网（HTML 内联 JSON），提取车型官方图并做语义分类，
 * 官网抓不到或图不足时回退汽车之家（配合 car-specs.ts）。
 *
 * 实测结论（2026-08-13）：
 *   - 比亚迪 www.byd.com/cn      ✅ SSR 内联 JSON，车型页 80+ 张分类官方图
 *   - 小鹏   www.xiaopeng.com/   ✅ SSR 内联 JSON（待接入适配器）
 *   - 零跑   www.leapmotor.com/  ❌ 纯 SPA 空壳（4KB），无法脚本抓取 → 走汽车之家
 *
 * 用法:
 *   bun run car-official.ts "<车型名>" <输出目录> [--brand 比亚迪] [--images N]
 *
 * 示例:
 *   bun run car-official.ts "海豹06GT" "00-草稿/20260813_比亚迪海豹06GT上市" --brand 比亚迪
 *
 * 输出:
 *   <输出目录>/images/{category}-NN.jpg   — 语义命名官方图（resize 1200 宽，<500KB）
 *   <输出目录>/images/descriptions.json   — 每张图的语义描述（写稿配图注用）
 *   JSON 摘要到 stdout
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.byd.com/",
};
const MAX_IMAGES = 25;
const MIN_SIZE = 40 * 1024; // 官网图压缩后 <40KB 视为坏图

interface CarEntry {
  title: string;
  linkMob: string;
}

interface ImageCandidate {
  url: string;
  category: string; // 语义分类：kv / product / detail / exterior / interior / other
  desc: string;     // 图注描述
}

interface OfficialAdapter {
  brand: string;                         // 品牌中文名（比亚迪）
  homeUrl: string;
  parseHome: (html: string) => CarEntry[];
  parseModel: (html: string) => ImageCandidate[];
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

async function fetchText(url: string, headers: Record<string, string>): Promise<string> {
  const r = await fetchWithRetry(url, headers);
  return await r.text();
}

/** 提取车型名的型号特征（数字+字母连续段），如 "海豹06GT" → ["06gt"] */
function extractFeatures(query: string): string[] {
  const feats = query.toLowerCase().match(/[a-z]{1,}[0-9][a-z0-9]*|[0-9][a-z0-9]*/g) ?? [];
  // 过滤掉纯年份（如 2026）和太短的（1 个字符）
  return feats.filter((f) => f.length >= 2 && !/^2\d{3}$/.test(f));
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s-_/]+/g, "");
}

/**
 * ────────── 比亚迪适配器（SSR 内联 JSON，已验证）──────────
 */
const BYD_ADAPTER: OfficialAdapter = {
  brand: "比亚迪",
  homeUrl: "https://www.byd.com/cn",

  // 首页 HTML 内联所有车型 JSON：title + linkMob（车型页 URL）
  parseHome(html: string): CarEntry[] {
    // 官网把内联 JSON 做了 HTML 实体编码（&quot; 代替 "，\/ 代替 /），先解码
    const dec = html.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replaceAll("\\/", "/");
    const cars: CarEntry[] = [];
    const re = /"title":"([^"]{2,40})"[\s\S]{0,600}?"linkMob":"(\/cn\/[^"]{5,100})"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(dec)) !== null) {
      const title = m[1].trim();
      const linkMob = m[2].trim();
      // 跳过无 title 或重复
      if (!title || linkMob.includes("find-store") || cars.some((c) => c.title === title)) continue;
      cars.push({ title, linkMob });
    }
    return cars;
  },

  // 车型页内联 JSON：按 material 目录语义分类
  parseModel(html: string): ImageCandidate[] {
    const dec = html.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replaceAll("\\/", "/");
    const out: ImageCandidate[] = [];
    const urls = [...new Set([...dec.matchAll(/\/material\/[^"'\s)]*?\.(jpg|jpeg|png|webp)/g)].map((m) => m[0]))];
    for (const u of urls) {
      const c = classifyByd(u);
      if (c) out.push(c);
    }
    return out;
  },
};

/** 比亚迪图片 URL → 语义分类；跳过手机竖版与视频帧 */
function classifyByd(url: string): ImageCandidate | null {
  const u = url.toLowerCase();
  // 手机竖版（1125x2000）与 kv 手机版不用于公众号横版配图，仅 kv 选桌面
  if (u.includes("1125x2000") || u.includes("1125x2000")) return null;
  if (u.includes("text-video") || u.includes("/video/")) return null;
  if (u.includes("kv-banner") || u.includes("kv-p") || u.includes("/kv/")) {
    return { url, category: "kv", desc: "KV主视觉" };
  }
  if (u.includes("product-image")) {
    return { url, category: "product", desc: "产品实拍图" };
  }
  if (u.includes("detail-ksp")) {
    return { url, category: "detail", desc: "核心亮点细节图" };
  }
  if (u.includes("exterior") || u.includes("-ex-") || u.includes("waiguan")) {
    return { url, category: "exterior", desc: "外观图" };
  }
  if (u.includes("interior") || u.includes("-in-") || u.includes("neishi")) {
    return { url, category: "interior", desc: "内饰图" };
  }
  // 其余按路径中的 section 目录粗分
  const seg = u.match(/ocean\/product\/[^/]+\/[^/]+/);
  return { url, category: "other", desc: seg ? seg[0].split("/").pop() ?? "官方图" : "官方图" };
}

/**
 * ────────── 小鹏适配器（SSR + URL 编码 JSON，已验证）──────────
 * 首页车型 JSON 被 URL 编码（%5C%22 = \"），需分段解码避免非法 % 抛错；
 * 车型页图片为直接 HTML 引用（xps01.xiaopeng.com/cms/material/pic/...）。
 */
const XIAOPENG_ADAPTER: OfficialAdapter = {
  brand: "小鹏",
  homeUrl: "https://www.xiaopeng.com/",

  parseHome(html: string): CarEntry[] {
    const cars: CarEntry[] = [];
    // 分段解码：按 %XX 切分后逐段 try-catch（decodeURIComponent 全页会因非法 % 抛错）
    const parts = html.split(/(%[0-9a-fA-F]{2})/g);
    const dec = parts
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      })
      .join("")
      .replaceAll('\\"', '"')
      .replaceAll("\\/", "/");
    const re = /"text":"([^"]{1,40})","link":"(\/[^"]{3,80}\.html)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(dec)) !== null) {
      const title = m[1].trim();
      // 过滤按钮文本等非车型条目
      if (title.includes("立即") || title.includes("预约") || title.includes("点击") || cars.some((c) => c.title === title)) continue;
      cars.push({ title, linkMob: m[2] });
    }
    return cars;
  },

  parseModel(html: string): ImageCandidate[] {
    const out: ImageCandidate[] = [];
    const urls = [...new Set([...html.matchAll(/https:\/\/xps0\d\.xiaopeng\.com\/cms\/material\/pic\/[^"']+?\.(jpg|png|webp)/g)].map((m) => m[0]))];
    for (const u of urls) {
      out.push({ url: u, category: "official", desc: "小鹏官方图" });
    }
    return out;
  },
};

/**
 * ────────── 小米汽车适配器（Next.js + CDN 图，已验证）──────────
 * 车型页 URL = /su7、/yu7（小写型号，无 .html）；首页车型入口为 JS 导航，
 * 从文本提取车型名构造 URL。图片在 s1.xiaomiev.com/activity-outer-assets/...，
 * 需过滤 icons/ 与 app_photo/app_scan 等非实车图，优先 pc 桌面版。
 */
const XIAOMI_ADAPTER: OfficialAdapter = {
  brand: "小米汽车",
  homeUrl: "https://www.xiaomiev.com/",

  parseHome(html: string): CarEntry[] {
    const names = [...new Set([...html.matchAll(/\b(?:新一代)?(小米)?(SU7|YU7|SUV|PRO|MAX)\b/g)].map((m) => m[2].toUpperCase()))];
    const cars: CarEntry[] = [];
    for (const n of names) {
      if (!n || n === "PRO" || n === "MAX" || cars.some((c) => c.title === n)) continue;
      cars.push({ title: n, linkMob: `/${n.toLowerCase()}` });
    }
    return cars;
  },

  parseModel(html: string): ImageCandidate[] {
    const out: ImageCandidate[] = [];
    const urls = [...new Set([...html.matchAll(/https:\/\/s1\.xiaomiev\.com\/[^"'\s)]*?\.(jpg|jpeg|png|webp)/g)].map((m) => m[0]))];
    for (const u of urls) {
      // 过滤 icons/ 与功能图标图
      if (u.includes("/icons/")) continue;
      if (/(app_photo|app_scan|wxamp|login_default|favicon|logo|footer|header|qrcode)/.test(u)) continue;
      // 优先 pc 桌面版，跳过移动版 m/
      if (u.includes("/m/")) continue;
      if (/\.svg$/.test(u)) continue;
      out.push({ url: u, category: "official", desc: "小米官方图" });
    }
    return out;
  },
};

/** 蔚来图片语义分类 */
function classifyNio(url: string): ImageCandidate | null {
  const u = url.toLowerCase();
  if (u.includes("navigation") || u.includes("vehicle-menu") || u.includes("/products/") || u.includes("find-us") || u.includes("about-us")) return null;
  if (u.includes("top-hero") || u.includes("/kv") || u.includes("banner")) return { url, category: "kv", desc: "主视觉" };
  if (u.includes("exterior")) return { url, category: "exterior", desc: "外观图" };
  if (u.includes("interior")) return { url, category: "interior", desc: "内饰图" };
  if (u.includes("innovation") || u.includes("detail") || u.includes("feature") || u.includes("space")) return { url, category: "detail", desc: "亮点细节图" };
  return { url, category: "official", desc: "蔚来官方图" };
}

/**
 * ────────── 蔚来适配器（SSR + CDN 图，已验证）──────────
 * 首页车型入口 <a href="/et7" name="ET7">；车型页图片在
 * cdn-public.nio.com/.../images/{model}-2024/{section}/{item}-desktop.jpg，section 带语义。
 */
const NIO_ADAPTER: OfficialAdapter = {
  brand: "蔚来",
  homeUrl: "https://www.nio.cn/",

  parseHome(html: string): CarEntry[] {
    const cars: CarEntry[] = [];
    const re = /<a href="(\/[a-z0-9-]+)" name="([A-Z0-9]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      const name = m[2];
      if (!cars.some((c) => c.title === name)) cars.push({ title: name, linkMob: href });
    }
    return cars;
  },

  parseModel(html: string): ImageCandidate[] {
    const out: ImageCandidate[] = [];
    const urls = [...new Set([...html.matchAll(/https:\/\/cdn-public\.nio\.com\/[^"'\s)]*?\.(jpg|jpeg|png|webp)/g)].map((m) => m[0]))];
    for (const u of urls) {
      if (u.includes("-mobile")) continue; // 优先 desktop 桌面版
      const c = classifyNio(u);
      if (c) out.push(c);
    }
    return out;
  },
};

/**
 * ────────── 问界（AITO）适配器（AEM /dam/ CDN，已验证）──────────
 * 首页车型链接 https://aito.auto/model/{slug}/（如 m7-new、m9-new）；
 * 车型页图片在 /dam/content/dam/aito/cn/model/{model}-{year}/images/，排除视频海报与响应式变体。
 */
const AITO_ADAPTER: OfficialAdapter = {
  brand: "问界",
  homeUrl: "https://aito.auto/",

  parseHome(html: string): CarEntry[] {
    const cars: CarEntry[] = [];
    const re = /href="https?:\/\/aito\.auto\/model\/([a-z0-9-]+)\/?"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const slug = m[1];
      const name = slug.replace(/-/g, " ").toUpperCase();
      const linkMob = `/model/${slug}/`;
      if (!cars.some((c) => c.linkMob === linkMob)) cars.push({ title: `问界${name}`, linkMob });
    }
    return cars;
  },

  parseModel(html: string): ImageCandidate[] {
    const out: ImageCandidate[] = [];
    const urls = [...new Set([...html.matchAll(/\/dam\/content\/dam\/aito\/cn\/model\/[^"'\s)]*?\.(jpg|jpeg|png|webp)/g)].map((m) => m[0]))];
    for (const u of urls) {
      if (u.includes("/videos/")) continue; // 视频海报
      if (/(thumb|-xs|-pad|-mob|-2x)/.test(u)) continue; // 缩略图与响应式变体
      out.push({ url: "https://aito.auto" + u, category: "official", desc: "问界官方图" });
    }
    return out;
  },
};

/** 品牌别名表：用户输入「小米SU7」→ 匹配注册表「小米汽车」 */
const BRAND_ALIASES: Record<string, string[]> = {
  比亚迪: ["比亚迪", "byd"],
  小鹏: ["小鹏", "xpeng", "mona"],
  小米汽车: ["小米", "xiaomi", "su7", "yu7"],
  蔚来: ["蔚来", "nio"],
  问界: ["问界", "aito", "wj"],
};

/**
 * ────────── 厂商注册表（新增厂商在此扩展）──────────
 * 设计原则：注册表是"可插拔增强"。未注册厂商 → 自动跳过官网采集，走新闻稿/汽车之家兜底，不阻塞主流程。
 */
const OFFICIAL_ADAPTERS: Record<string, OfficialAdapter> = {
  比亚迪: BYD_ADAPTER,
  小鹏: XIAOPENG_ADAPTER,
  小米汽车: XIAOMI_ADAPTER,
  蔚来: NIO_ADAPTER,
  问界: AITO_ADAPTER,
};

/** 匹配官网车型（title + linkMob 拼音特征） */
function matchModel(adapter: OfficialAdapter, cars: CarEntry[], query: string): CarEntry | null {
  const q = norm(query);
  const feats = extractFeatures(query);
  let best: CarEntry | null = null;
  let bestScore = 0;
  for (const c of cars) {
    const title = norm(c.title);
    const link = norm(c.linkMob);
    let score = 0;
    // 型号特征（拼音 linkMob 最可靠，如 海豹06GT→linkMob 含 "06gt"）
    for (const f of feats) {
      if (link.includes(f)) score += 60;
      if (title.includes(f)) score += 30;
    }
    // 完整/包含匹配（长标题才给高分，避免"海豹"这类大类名误匹配）
    if (title === q) score += 150;
    else if (title.length >= 3 && title.includes(q)) score += 100;
    else if (q.length >= 4 && q.includes(title) && title.length >= 4) score += 80;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= 40 ? best : null;
}

/** 下载并压缩官网图 → images/，返回 {file, desc, size} */
async function downloadImages(adapter: OfficialAdapter, candidates: ImageCandidate[], outDir: string, max: number) {
  const imgDir = join(outDir, "images");
  mkdirSync(imgDir, { recursive: true });
  const sharp = (await import("sharp")).default;

  // 分类排序：kv → product → detail → exterior → interior → other，同类保持顺序
  const order: Record<string, number> = { kv: 0, product: 1, detail: 2, exterior: 3, interior: 4, other: 5 };
  const sorted = [...candidates].sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9));

  const saved: { file: string; category: string; desc: string; size: number }[] = [];
  const used = new Set<string>();

  for (const c of sorted) {
    if (saved.length >= max) break;
    // 同类去重：official（无子分类，如小鹏）上限 20；语义分类（kv/product/detail）上限 8
    const maxPerCat = c.category === "official" ? 20 : 8;
    const catCount = saved.filter((s) => s.category === c.category).length;
    if (catCount >= maxPerCat) continue;
    const key = c.url;
    if (used.has(key)) continue;
    used.add(key);

    try {
      const abs = c.url.startsWith("http") ? c.url : new URL(c.url, adapter.homeUrl).toString();
      const r = await fetchWithRetry(abs, HEADERS, 20000, 2);
      const orig = Buffer.from(await r.arrayBuffer());
      if (orig.byteLength < 10 * 1024) continue; // 原图过小丢弃
      // resize 到 1200 宽，jpg 压缩
      const img = await sharp(orig)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      if (img.byteLength < MIN_SIZE) continue;
      const n = String((saved.filter((s) => s.category === c.category).length) + 1).padStart(2, "0");
      const fname = `${c.category}-${n}.jpg`;
      writeFileSync(join(imgDir, fname), img);
      saved.push({ file: fname, category: c.category, desc: c.desc, size: img.byteLength });
      console.log(`  ✓ ${fname} (${(img.byteLength / 1024).toFixed(0)}KB) [${c.desc}]`);
      await new Promise((res) => setTimeout(res, 150));
    } catch (e) {
      console.error(`  ✗ 下载失败 ${c.url.slice(0, 80)}: ${(e as Error).message}`);
    }
  }
  return saved;
}

function printHelp(): void {
  console.log(`用法:
  bun run car-official.ts "<车型名>" <输出目录> [--brand 比亚迪] [--images N]

示例:
  bun run car-official.ts "海豹06GT" "00-草稿/20260813_比亚迪海豹06GT上市" --brand 比亚迪

说明:
  官网优先采集官方图（比亚迪/小鹏 SSR 官网可抓；零跑等 SPA 官网抓不到，回退 car-specs.ts）。
  输出语义命名图片到 images/ + descriptions.json（写稿配图注用）。`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const query = args.find((a) => !a.startsWith("--") && !a.startsWith("-")) ?? "";
  const outDir = args.filter((a) => !a.startsWith("--") && !a.startsWith("-"))[1];
  const brandIdx = args.indexOf("--brand");
  const brandArg = brandIdx > -1 && args[brandIdx + 1] ? args[brandIdx + 1] : "";
  let max = MAX_IMAGES;
  const imgIdx = args.indexOf("--images");
  if (imgIdx > -1 && args[imgIdx + 1]) max = Number(args[imgIdx + 1]) || MAX_IMAGES;

  // 确定品牌：显式参数，或从车型名匹配品牌别名（小米SU7 → 小米汽车）
  let brand = brandArg;
  if (!brand) {
    for (const [b, aliases] of Object.entries(BRAND_ALIASES)) {
      if (aliases.some((a) => query.toLowerCase().includes(a.toLowerCase()))) {
        brand = b;
        break;
      }
    }
  }
  const adapter = brand ? OFFICIAL_ADAPTERS[brand] : undefined;
  if (!adapter) {
    console.log(`ℹ 厂商「${brand || "未知"}」官网暂不支持脚本采集（或为 SPA 官网）。请用 car-specs.ts 从汽车之家采集图片。`);
    process.exit(0);
  }

  console.log(`官网采集: ${brand} ← ${adapter.homeUrl}`);
  const home = await fetchText(adapter.homeUrl, HEADERS);
  const cars = adapter.parseHome(home);
  console.log(`  首页解析到 ${cars.length} 个车型条目`);
  if (cars.length === 0) {
    console.error("✗ 首页解析失败（官网结构可能变更），回退 car-specs.ts");
    process.exit(1);
  }

  const model = matchModel(adapter, cars, query);
  if (!model) {
    console.error(`✗ 未在官网匹配到车型「${query}」，回退 car-specs.ts`);
    console.error(`  官网车型示例: ${cars.slice(0, 5).map((c) => c.title).join(" / ")}`);
    process.exit(1);
  }
  console.log(`  匹配车型: ${model.title} → ${model.linkMob}`);
  const modelUrl = model.linkMob.startsWith("http") ? model.linkMob : new URL(model.linkMob, adapter.homeUrl).toString();
  const modelHtml = await fetchText(modelUrl, HEADERS);
  const candidates = adapter.parseModel(modelHtml);
  console.log(`  车型页解析到 ${candidates.length} 张候选官方图`);
  if (candidates.length === 0) {
    console.error("✗ 车型页无图片（官网结构可能变更），回退 car-specs.ts");
    process.exit(1);
  }

  const saved = await downloadImages(adapter, candidates, outDir, max);
  if (saved.length === 0) {
    console.error("✗ 官网图全部下载失败，回退 car-specs.ts");
    process.exit(1);
  }

  // 写语义描述文件（写稿配图注用）
  const descPath = join(outDir, "images", "descriptions.json");
  writeFileSync(descPath, JSON.stringify(saved, null, 2));
  console.log(`\n✅ 官网采集完成: ${saved.length} 张 → ${join(outDir, "images")}`);
  console.log(`  图注描述: ${descPath}`);
  console.log(`  分类: ${JSON.stringify(saved.reduce((a, s) => ((a[s.desc] = (a[s.desc] || 0) + 1), a), {} as Record<string, number>))}`);
}

main().catch((e) => {
  console.error(`官网采集失败: ${e.message}`);
  process.exit(1);
});
