#!/usr/bin/env python3
"""
crawl4ai-fetch.py — 官网图片采集（crawl4ai 滚动渲染）

解决 baoyu-fetch CDP 无法触发页面滚动懒加载的问题（零跑/小鹏等 SPA 车型页，
图片需滚动页面才加载）。crawl4ai 的 scan_full_page=True 会滚动整个页面，
配合 wait_for_images 拿到全部实车图。

用法:
  python crawl4ai-fetch.py <url> [--min-score N] [--out json路径]

输出:
  stdout JSON: {"status":"ok","images":[{"url":"...","score":N},...]}
  或 {"status":"error","message":"..."}

依赖:
  crawl4ai（自动准备：car-news-images.ts 的 ensurePythonEnv() 会在无 .venv 时自动创建、
  未装 crawl4ai 时自动 pip install crawl4ai）——首次需安装浏览器:
  python -m playwright install chromium  或使用系统 Chrome（chrome_channel="chrome"）
"""
import asyncio
import json
import sys

def log(msg):
    sys.stderr.write(msg + "\n")
    sys.stderr.flush()

async def fetch(url: str, min_score: int) -> dict:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

    browser_config = BrowserConfig(
        headless=True,
        browser_type="chromium",
        chrome_channel="chrome",  # 优先使用系统 Chrome，避免下载浏览器
        verbose=False,
    )
    run_config = CrawlerRunConfig(
        wait_for_images=True,
        scan_full_page=True,      # 滚动整页触发懒加载 ← 关键
        scroll_delay=0.3,
        cache_mode=CacheMode.BYPASS,
        verbose=False,
    )

    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url, config=run_config)
        if not result.success:
            return {"status": "error", "message": result.error_message}

        imgs = result.media.get("images", [])
        images = []
        seen = set()
        for i in imgs:
            src = i.get("src", "")
            score = i.get("score") or 0
            if not src or src in seen:
                continue
            seen.add(src)
            if score >= min_score:
                images.append({"url": src, "score": score})

        log(f"crawl4ai: 共 {len(imgs)} 张，过滤后 ≥{min_score} 分 {len(images)} 张")
        return {"status": "ok", "images": images, "total": len(imgs)}

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        log("用法: crawl4ai-fetch.py <url> [--min-score N] [--out path]")
        sys.exit(1)
    url = args[0]
    min_score = 3
    out_path = None
    if "--min-score" in args:
        min_score = int(args[args.index("--min-score") + 1])
    if "--out" in args:
        out_path = args[args.index("--out") + 1]

    result = asyncio.run(fetch(url, min_score))
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False)
        log(f"已写入: {out_path}")
    else:
        print(json.dumps(result, ensure_ascii=False))
