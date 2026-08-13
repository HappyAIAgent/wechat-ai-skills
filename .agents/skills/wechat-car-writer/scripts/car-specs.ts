#!/usr/bin/env bun
/**
 * car-specs.ts — 车型参数与图片采集器
 *
 * 根据 seriesId 从汽车之家抓取结构化参数（按分组、全车型矩阵）和官方图片，
 * 输出 spec-data.json + 下载图片到 images/。
 *
 * 数据源（汽车之家公开接口）:
 *   参数: https://car-web-api.autohome.com.cn/car/param/getParamConf?mode=1&site=1&seriesid={id}  (UTF-8 JSON)
 *   图片: https://car.m.autohome.com.cn/pic/getpiclist?seriesid={id}&pageindex={n}             (JSON, 每页10条)
 *
 * 用法:
 *   bun run car-specs.ts <seriesId> <输出目录> [--images N] [--no-images]
 *   bun run car-specs.ts 8569 "00-草稿/20260812_零跑A05上市"
 *   bun run car-specs.ts 8569 "00-草稿/20260812_零跑A05上市" --no-images
 *
 * 输出:
 *   <输出目录>/spec-data.json   — 结构化参数（分组 + 全车型对照矩阵 + 摘要）
 *   <输出目录>/images/          — 下载的官方图片（jpg，--no-images 时跳过）
 *   JSON 摘要到 stdout
 *
 * v2 改进（2026-08-13）:
 *   - 参数存全车型矩阵 values: [{spec, value}]，highlights 输出聚合值（如 "70 / 90"），
 *     不再只存第一个车型的参数
 *   - 图片解析 piclist 结构化字段，每条记录 specname（车型版本），不再用正则扫全 JSON
 *   - 图片下载支持分页抓取（默认凑够 --images 张），多级 CDN 变体回退（1200x0→800x0→原图），
 *     按大小过滤过小/坏图（<20KB 丢弃）
 *   - fetch 增加超时与重试
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const PARAM_API = "https://car-web-api.autohome.com.cn/car/param/getParamConf";
const PIC_API = "https://car.m.autohome.com.cn/pic/getpiclist";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://car.autohome.com.cn/",
};
const MOBILE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
  Referer: "https://car.m.autohome.com.cn/",
};

interface ParamValue {
  spec: string;
  value: string;
}

interface ParamItem {
  name: string;
  value: string;
  values: ParamValue[];
}

interface ParamGroup {
  group: string;
  items: ParamItem[];
}

interface SeriesInfo {
  seriesId: number;
  seriesName: string;
  brandName: string;
}

interface ImageEntry {
  file: string;
  specname: string;
  size: number;
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

async function fetchJson(url: string, headers: Record<string, string>, decode: "utf-8" | "gbk" = "utf-8") {
  const r = await fetchWithRetry(url, headers);
  const text = new TextDecoder(decode).decode(await r.arrayBuffer());
  return JSON.parse(text);
}

/** 解析 getParamConf → 分组参数（全车型矩阵） */
function parseParams(data: any): { groups: ParamGroup[]; specs: string[]; priceList: { spec: string; price: string }[]; info: SeriesInfo } {
  const result = data.result;
  const bread = result.bread;
  const titlelist: any[] = result.titlelist;
  const datalist: any[] = result.datalist;

  // 车型列表（列头）
  const specs = datalist.map((d: any) => d.specname || "未知车型");

  // 分组构建: titlelist 扁平化列头，与每个车型的 paramconflist 索引一一对应
  const groups: ParamGroup[] = [];
  let idx = 0;
  for (const t of titlelist) {
    const items: ParamItem[] = [];
    for (const item of t.items) {
      const values: ParamValue[] = datalist.map((d: any, di: number) => {
        const pc = d.paramconflist?.[idx];
        let v = "";
        if (pc) {
          if (Array.isArray(pc.sublist) && pc.sublist.length > 0) {
            v = pc.sublist.map((s: any) => (s.value ?? "") + (s.name ?? "")).join("、");
          } else {
            v = pc.itemname || "";
          }
        }
        return { spec: d.specname || `车型${di + 1}`, value: v };
      });
      items.push({ name: item.itemname, value: values[0]?.value ?? "", values });
      idx++;
    }
    groups.push({ group: t.itemtype, items });
  }

  // 全车型价格表: 找"厂商指导价(元)"列在所有车型上的值
  const flatTitles = titlelist.flatMap((t: any) => t.items as any[]);
  const priceColIdx = flatTitles.findIndex((it: any) => it.itemname === "厂商指导价(元)");
  const priceList: { spec: string; price: string }[] = [];
  for (const d of datalist) {
    const pc = d.paramconflist?.[priceColIdx];
    priceList.push({ spec: d.specname || "未知", price: pc?.itemname || "" });
  }

  return {
    groups,
    specs,
    priceList,
    info: {
      seriesId: bread.seriesid,
      seriesName: bread.seriesname,
      brandName: bread.brandname,
    },
  };
}

/** 聚合某参数的全车型值：去重、剥掉配置标记 ●、多值用 " / " 连接 */
function collectByName(groups: ParamGroup[], name: string): string {
  for (const g of groups) {
    for (const it of g.items) {
      if (it.name === name) {
        const vals = it.values
          .map((v) => v.value)
          .map((v) => v.replace(/^●/, ""))
          .filter((v) => v && v !== "-" && v !== "暂无报价");
        const uniq = [...new Set(vals)];
        if (uniq.length === 0) return "";
        return uniq.length === 1 ? uniq[0] : uniq.join(" / ");
      }
    }
  }
  return "";
}

/** 提取关键参数摘要（写文章最常用的字段，聚合全车型值） */
function extractHighlights(groups: ParamGroup[], priceList: { spec: string; price: string }[]): Record<string, string> {
  const map = new Map<string, string>();
  for (const g of groups) {
    for (const it of g.items) map.set(it.name, it.value.replace(/^●/, ""));
  }
  const get = (k: string) => map.get(k) ?? "";
  const pick = (keys: string[]) => keys.map((k) => map.get(k)).find((v) => v && v !== "-" && v !== "暂无报价") ?? "";

  return {
    厂商: get("厂商"),
    级别: get("级别"),
    能源类型: get("能源类型"),
    上市时间: get("上市时间"),
    厂商指导价: priceList.find((p) => p.price)?.price ?? "",
    车身结构: get("车身结构"),
    长宽高: get("长*宽*高(mm)"),
    轴距: get("轴距(mm)"),
    后备厢容积: collectByName(groups, "后备厢容积(L)"),
    整备质量: collectByName(groups, "整备质量(kg)"),
    最高车速: collectByName(groups, "最高车速(km/h)"),
    官方百公里加速: collectByName(groups, "官方0-100km/h加速(s)"),
    CLTC纯电续航: collectByName(groups, "CLTC纯电续航里程(km)"),
    电池容量: collectByName(groups, "电池能量(kWh)"),
    电池类型: collectByName(groups, "电池类型"),
    快充时间: collectByName(groups, "电池快充时间(分钟)") || collectByName(groups, "电池快充时间(小时)"),
    快充范围: collectByName(groups, "电池快充电量范围(%)"),
    慢充时间: collectByName(groups, "电池慢充时间(小时)"),
    百公里耗电量: collectByName(groups, "百公里耗电量(kWh/100km)"),
    电机总功率: collectByName(groups, "电动机总功率(kW)"),
    电机总扭矩: collectByName(groups, "电动机总扭矩(N·m)"),
    驱动方式: collectByName(groups, "驱动方式"),
    前悬架: collectByName(groups, "前悬架类型"),
    后悬架: collectByName(groups, "后悬架类型"),
    前轮胎规格: collectByName(groups, "前轮胎规格"),
    后轮胎规格: collectByName(groups, "后轮胎规格"),
    车机芯片: collectByName(groups, "车机智能芯片"),
    中控屏幕: collectByName(groups, "中控屏幕尺寸"),
    扬声器数量: collectByName(groups, "扬声器数量"),
    辅助驾驶等级: collectByName(groups, "辅助驾驶等级"),
    辅助驾驶芯片: collectByName(groups, "辅助驾驶芯片"),
    激光雷达: collectByName(groups, "激光雷达数量"),
    整车质保: collectByName(groups, "整车质保"),
  };
}

/** 下载图片列表（分页抓取 + 多级变体回退 + 大小过滤），返回带车型版本标注的条目 */
async function downloadImages(seriesId: number, outDir: string, max: number): Promise<ImageEntry[]> {
  const imgDir = join(outDir, "images");
  mkdirSync(imgDir, { recursive: true });

  const saved: ImageEntry[] = [];
  const seen = new Set<string>();
  const MIN_SIZE = 100 * 1024; // <100KB 视为缩略图/坏图（1200宽正常图约150-300KB）
  const VARIANTS = ["1200x0_", "800x0_"]; // 多级 CDN 变体（越靠前越好），全部失败回退原图

  // getpiclist 每页 10 条，分页抓取直到凑够 max 张（最多 20 页兜底）
  for (let page = 1; page <= 20 && saved.length < max; page++) {
    const pics = await fetchJson(`${PIC_API}?seriesid=${seriesId}&pageindex=${page}`, MOBILE_HEADERS);
    const piclist: any[] = pics.returncode === 0 && pics.result?.piclist ? pics.result.piclist : [];
    if (piclist.length === 0) break;

    for (const p of piclist) {
      if (saved.length >= max) break;
      const imgurl = p?.imgurl;
      if (!imgurl || seen.has(imgurl)) continue;
      seen.add(imgurl);

      const dir = imgurl.substring(0, imgurl.lastIndexOf("/") + 1);
      const fname0 = imgurl.substring(imgurl.lastIndexOf("/") + 1);

      // 多级变体，取第一个大小合格者
      let buf: Buffer | null = null;
      for (const v of VARIANTS) {
        try {
          const r = await fetchWithRetry(dir + v + fname0, { "User-Agent": MOBILE_HEADERS["User-Agent"] }, 15000, 2);
          const b = Buffer.from(await r.arrayBuffer());
          if (b.byteLength >= MIN_SIZE) {
            buf = b;
            break;
          }
        } catch {
          /* 尝试下一级变体 */
        }
      }
      // 变体全部失败/过小 → 回退原图
      if (!buf) {
        try {
          const r = await fetchWithRetry(imgurl, { "User-Agent": MOBILE_HEADERS["User-Agent"] }, 20000, 2);
          buf = Buffer.from(await r.arrayBuffer());
        } catch (e) {
          console.error(`  ✗ 图片下载失败 ${imgurl}: ${(e as Error).message}`);
        }
      }
      if (!buf || buf.byteLength < MIN_SIZE) {
        console.error(`  ⤬ 跳过过小/失败图片`);
        await new Promise((res) => setTimeout(res, 200));
        continue;
      }

      const ext = (imgurl.match(/\.(jpg|jpeg|png)/i)?.[1] || "jpg").toLowerCase();
      const fname = `car-${String(saved.length + 1).padStart(2, "0")}.${ext}`;
      writeFileSync(join(imgDir, fname), buf);
      saved.push({ file: fname, specname: p.specname || "", size: buf.byteLength });
      console.log(`  ✓ ${fname} (${(buf.byteLength / 1024).toFixed(0)}KB) ${p.specname || ""}`);
      await new Promise((res) => setTimeout(res, 200)); // 礼貌限速
    }
    console.log(`  第 ${page} 页完成，已收集 ${saved.length}/${max} 张`);
  }
  return saved;
}

function printHelp(): void {
  console.log(`用法:
  bun run car-specs.ts <seriesId> <输出目录> [--images N] [--no-images]

示例:
  bun run car-specs.ts 8569 "00-草稿/20260812_零跑A05上市"
  bun run car-specs.ts 8569 "00-草稿/20260812_零跑A05上市" --images 20
  bun run car-specs.ts 8569 "00-草稿/20260812_零跑A05上市" --no-images

说明:
  seriesId 可用 car-locate.ts 定位: bun run car-locate.ts "零跑A05"
  --no-images: 跳过图片下载（由 car-news-images.ts 接管）
  输出 spec-data.json(全车型参数矩阵) + images/(官方图片)。`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    process.exit(0);
  }
  const seriesId = Number(args[0]);
  const outDir = args[1];
  let maxImages = 20;
  const noImages = args.includes("--no-images");
  const imgIdx = args.indexOf("--images");
  if (imgIdx > 0 && args[imgIdx + 1]) maxImages = Number(args[imgIdx + 1]) || 20;

  if (!Number.isFinite(seriesId)) throw new Error("seriesId 必须是数字");
  mkdirSync(outDir, { recursive: true });

  // 1. 抓参数
  console.log(`抓取参数 seriesId=${seriesId} ...`);
  const paramData = await fetchJson(`${PARAM_API}?mode=1&site=1&seriesid=${seriesId}`, HEADERS);
  if (paramData.returncode !== 0) throw new Error(`参数接口失败: ${paramData.message}`);

  const { groups, specs, priceList, info } = parseParams(paramData);
  const highlights = extractHighlights(groups, priceList);
  console.log(`  车系: ${info.brandName} ${info.seriesName}`);
  console.log(`  车型数: ${specs.length}`);
  console.log(`  价格: ${priceList.map((p) => `${p.spec}→${p.price}`).join(" / ")}`);
  console.log(`  电机功率(聚合): ${highlights.电机总功率} | 续航(聚合): ${highlights.CLTC纯电续航}km`);

  // 2. 下载图片（--no-images 时跳过，由 car-news-images.ts 接管）
  let images: ImageEntry[] = [];
  if (noImages) {
    console.log("跳过图片下载（--no-images）");
  } else {
    console.log(`下载图片 (目标 ${maxImages} 张)...`);
    images = await downloadImages(seriesId, outDir, maxImages);
  }

  // 3. 写 spec-data.json
  const specData = {
    info,
    specs,
    priceList,
    highlights,
    groups,
    images,
    fetchedAt: new Date().toISOString(),
    sources: {
      params: `${PARAM_API}?mode=1&site=1&seriesid=${seriesId}`,
      pics: `${PIC_API}?seriesid=${seriesId}`,
    },
  };
  const specPath = join(outDir, "spec-data.json");
  writeFileSync(specPath, JSON.stringify(specData, null, 2));
  console.log(`\n✅ 完成`);
  console.log(`  参数: ${specPath}`);
  console.log(`  图片: ${images.length} 张 → ${join(outDir, "images")}`);
  console.log(`  价格: ${highlights.厂商指导价} | 续航: ${highlights.CLTC纯电续航}km | 轴距: ${highlights.轴距}mm`);
}

main().catch((e) => {
  console.error(`采集失败: ${e.message}`);
  process.exit(1);
});
