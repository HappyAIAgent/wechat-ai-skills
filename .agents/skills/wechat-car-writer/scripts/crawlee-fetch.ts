#!/usr/bin/env bun
/**
 * crawlee-fetch.ts — Crawlee + PuppeteerCrawler 官网图片采集（主方案）
 *
 * 用 Crawlee PuppeteerCrawler + 手动滚动触发懒加载，提取 SPA 车型页图片。
 * 浏览器通过 puppeteer channel:'chrome' 自动定位系统 Chrome（无绝对路径）。
 *
 * 用法:
 *   bun run crawlee-fetch.ts <url>
 *   （或 node crawlee-fetch.ts <url>）
 *
 * 输出:
 *   stdout JSON: {"status":"ok","images":[{"url":"..."}],"total":N}
 *   （框架日志已压到 ERROR，stdout 只含纯 JSON，供 car-news-images.ts 解析）
 */
import { PuppeteerCrawler, log } from "crawlee";

// 关键：Crawlee 框架自身日志（Starting/Finished/统计等，带 ANSI 颜色）
// 默认写 stdout，会污染输出的纯 JSON。压到 ERROR 级别以下。
log.setLevel(log.LEVELS.ERROR);

function logMsg(msg: string): void {
  process.stderr.write(`[crawlee-puppeteer] ${msg}\n`);
}

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.log(JSON.stringify({ status: "error", message: "缺少 URL" }));
    process.exit(1);
  }

  const images: string[] = [];
  const seen = new Set<string>();
  const imageMeta = new Map<string, { url: string; alt: string; headings: string[]; nearbyText: string }>();

  const crawler = new PuppeteerCrawler({
    maxRequestsPerCrawl: 1,
    requestHandlerTimeoutSecs: 90,
    maxRequestRetries: 0,
    launchContext: {
      // 用 channel: 'chrome' 让 puppeteer 自动定位系统 Chrome（不写死绝对路径）
      launchOptions: {
        headless: true,
        channel: "chrome",
        args: ["--no-sandbox"],
      },
    },
    async requestHandler({ page }) {
      logMsg(`加载页面: ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 3000));

      // 手动滚动触发懒加载（Crawlee 内置 infiniteScroll 会卡死，改手动）
      logMsg("滚动触发懒加载...");
      let prev = 0;
      for (let i = 0; i < 25; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise((r) => setTimeout(r, 500));
        const h = await page.evaluate(() => document.body.scrollHeight);
        if (h === prev) break;
        prev = h;
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise((r) => setTimeout(r, 800));
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 1200));

      // 提取所有图片 URL + 每张图所在区块的语义标题
      // （Puppeteer 渲染时同时抓取 img 附近容器文本，生成 images-meta.json 供图注使用，
      //   避免写稿时因模型不支持读图而无法确认图片内容）
      logMsg("提取图片 URL 与区块语义...");
      const items: { url: string; alt: string; headings: string[]; nearbyText: string }[] = await page.evaluate(() => {
        const out: { url: string; alt: string; headings: string[]; nearbyText: string }[] = [];
        const imgs = Array.from(document.querySelectorAll("img")).filter((i) => {
          const src = i.currentSrc || i.src || i.getAttribute("data-src") || "";
          return src.startsWith("http") && !src.includes("data:");
        });

        // 全局标题表（按 DOM 顺序），用于父容器无标题时的回退
        const titleEls: { el: Element; text: string }[] = [];
        for (const el of document.querySelectorAll("h1,h2,h3,h4,h5,h6,strong,[class*='title'],[class*='Title']")) {
          const t = (el.textContent || "").trim();
          if (t && t.length > 1 && t.length < 60 && !titleEls.some((x) => x.text === t)) {
            titleEls.push({ el, text: t });
          }
        }

        for (const img of imgs) {
          const src = img.currentSrc || img.src || img.getAttribute("data-src") || "";
          let headings: string[] = [];
          let nearbyText = "";

          // 1. 父容器 h1-h6/strong + p 文本（向上 8 层）
          let node: Element | null = img;
          for (let depth = 0; depth < 8 && node; depth++) {
            node = node.parentElement;
            if (!node) break;
            for (const h of node.querySelectorAll("h1,h2,h3,h4,h5,h6,strong")) {
              const t = (h.textContent || "").trim();
              if (t && t.length > 1 && t.length < 60 && !headings.includes(t) && headings.length < 6) headings.push(t);
            }
            if (!nearbyText) {
              for (const p of node.querySelectorAll("p")) {
                const t = (p.textContent || "").trim();
                if (t && t.length > 2 && t.length < 80) {
                  nearbyText = t;
                  break;
                }
              }
            }
            if (headings.length >= 3) break;
          }

          // 2. 父容器无标题 → 回退：DOM 顺序最近的前置标题
          if (headings.length === 0 && titleEls.length > 0) {
            let best: { el: Element; text: string } | null = null;
            let bestPos = Number.MAX_SAFE_INTEGER;
            for (const t of titleEls) {
              if (t.el.contains(img)) {
                best = t;
                break;
              }
              const pos = t.el.compareDocumentPosition(img);
              // 标题在 img 之前（或包裹）才采用；取最接近的
              if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
                const p = (t.el as HTMLElement).offsetTop || 0;
                if (p <= bestPos) {
                  bestPos = p;
                  best = t;
                }
              }
            }
            if (best) headings = [best.text];
          }

          out.push({ url: src, alt: (img.getAttribute("alt") || "").trim(), headings: headings.slice(0, 5), nearbyText });
        }
        return out;
      });

      const seenItems = new Set<string>();
      for (const item of items) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          seenItems.add(item.url);
          images.push(item.url);
        }
      }
      // 记录语义（即使 URL 重复也保留第一条语义）
      for (const item of items) {
        if (!imageMeta.has(item.url)) imageMeta.set(item.url, item);
      }
      logMsg(`提取 ${items.length} 个 img，去重后 ${images.length} 张`);
    },
  });

  try {
    await crawler.run([url]);
    const out = {
      status: "ok" as const,
      images: images.map((u) => ({
        url: u,
        meta: imageMeta.get(u) ? { alt: imageMeta.get(u)!.alt, headings: imageMeta.get(u)!.headings } : undefined,
      })),
      total: images.length,
    };
    console.log(JSON.stringify(out));
  } catch (e) {
    console.log(JSON.stringify({ status: "error", message: (e as Error).message }));
    process.exit(1);
  }
}

main();
