#!/usr/bin/env bun
/**
 * extract-svg.ts
 *
 * 从 HTML 中提取内嵌 SVG 元素，替换 CSS 变量，转为 PNG。
 * 用于处理网页中内嵌的架构图、流程图等 SVG 图片。
 *
 * 实现：基于 cheerio DOM 解析（健壮版，替代早期正则 + Python 回退方案）。
 *   - cheerio 以 HTML 模式加载，容错处理不规范网页
 *   - $("svg") 提取内嵌 SVG（正确处理嵌套、属性含 >、任意标签名）
 *   - $.xml() 序列化为合法 XML（自动闭合标签、转义实体、保留命名空间）
 *   - sharp 渲染 PNG
 *
 * 用法:
 *   bun run extract-svg.ts <html_file> <output_dir> [--prefix arch]
 *
 * 输出:
 *   - <output_dir>/<prefix>-<n>.png  — 转换后的 PNG 文件
 *   - <output_dir>/<prefix>-<n>.svg  — 渲染失败时保存的清洗后 SVG（调试用）
 *   - JSON 摘要输出到 stdout
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { load, type Cheerio, type Element } from "cheerio";

// ── CSS 变量提取 ──────────────────────────────────────────────

/**
 * 从 HTML 中提取 CSS 变量定义
 * 支持 <style> 标签内和内联 style 属性中的变量
 */
function extractCSSVariables(html: string): Record<string, string> {
  const vars: Record<string, string> = {};

  // 匹配 --xxx: yyy; 格式的 CSS 变量定义
  // 支持 <style> 块和内联样式
  const varPattern = /--([a-zA-Z][\w-]*):\s*([^;}{]+)/g;
  let match: RegExpExecArray | null;

  while ((match = varPattern.exec(html)) !== null) {
    const name = `--${match[1]}`;
    const value = match[2].trim();
    // 后出现的变量覆盖先出现的（CSS 层叠规则）
    vars[name] = value;
  }

  return vars;
}

/**
 * 将 XML 字符串中的 CSS 变量替换为实际值
 * 处理 var(--xxx) 和 var(--xxx, fallback) 两种形式
 */
function replaceCSSVariables(xml: string, vars: Record<string, string>): string {
  // 替换 var(--xxx, fallback) — 优先用变量值，变量不存在时用 fallback
  let result = xml.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g,
    (_, varName, fallback) => {
      return vars[varName] || (fallback || "").trim() || "inherit";
    }
  );

  // 替换残余的 var(--xxx) 无 fallback 情况
  result = result.replace(
    /var\(\s*(--[\w-]+)\s*\)/g,
    (_, varName) => {
      return vars[varName] || "inherit";
    }
  );

  return result;
}

// ── SVG 处理 ──────────────────────────────────────────────────

/**
 * 判断 SVG 是否包含有意义的内容（排除纯装饰性 SVG）
 */
function hasMeaningfulText($el: Cheerio<Element>): boolean {
  return $el.text().replace(/\s+/g, "").length >= 2;
}

/**
 * 在 DOM 层面准备 SVG 元素用于渲染：
 *  - 确保 xmlns 命名空间
 *  - 由 viewBox 推导显式 width/height（修复 width="100%" 或缺失的情况）
 *  - 插入白色背景矩形作为第一个子元素
 *  - 合并中文字体到根元素 style
 */
function prepareSVGElement($el: Cheerio<Element>): void {
  // 1. 确保 XML 命名空间
  if (!$el.attr("xmlns")) {
    $el.attr("xmlns", "http://www.w3.org/2000/svg");
  }

  // 2. 由 viewBox 推导尺寸（支持负数与浮点数）
  const vb = $el.attr("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [x, y, w, h] = parts;
      const widthAttr = $el.attr("width");
      const heightAttr = $el.attr("height");
      // 将 width="100%"（或缺失尺寸）替换为显式像素，保证 librsvg 正确渲染
      if (!widthAttr || widthAttr.trim().includes("%")) {
        $el.attr("width", String(Math.round(w)));
      }
      if (!heightAttr || heightAttr.trim().includes("%")) {
        $el.attr("height", String(Math.round(h)));
      }
      // 3. 插入白色背景矩形（覆盖整个 viewBox 区域）
      $el.prepend(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>`);
    }
  }

  // 4. 添加中文字体：合并进根元素已有 style，否则追加
  const fontFamily =
    "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const style = $el.attr("style") || "";
  if (!style.includes("font-family")) {
    const joined = `${style}${style && !style.endsWith(";") ? ";" : ""}font-family:${fontFamily};`;
    $el.attr("style", joined);
  }
}

// ── 主流程 ────────────────────────────────────────────────────

interface ExtractResult {
  totalSVGs: number;
  converted: number;
  skipped: number;
  files: Array<{ name: string; width: number; height: number; sizeKB: number }>;
  errors: string[];
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("用法: bun run extract-svg.ts <html_file> <output_dir> [--prefix arch]");
    process.exit(1);
  }

  const htmlPath = args[0];
  const outputDir = args[1];
  const prefix = args.includes("--prefix")
    ? args[args.indexOf("--prefix") + 1]
    : "arch";

  // 读取 HTML
  if (!existsSync(htmlPath)) {
    console.error(`文件不存在: ${htmlPath}`);
    process.exit(1);
  }

  const html = readFileSync(htmlPath, "utf8");

  // 确保输出目录存在
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // 提取 CSS 变量
  const cssVars = extractCSSVariables(html);

  // 提取 SVG（cheerio DOM 解析，容错处理不规范 HTML）
  const $ = load(html);
  const svgEls = $("svg");

  const result: ExtractResult = {
    totalSVGs: svgEls.length,
    converted: 0,
    skipped: 0,
    files: [],
    errors: [],
  };

  if (svgEls.length === 0) {
    console.log(JSON.stringify(result));
    return;
  }

  // 动态导入 sharp
  let sharp: any;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("需要安装 sharp: bun add sharp");
    process.exit(1);
  }

  let index = 0;
  for (const el of svgEls) {
    index++;
    const $el = $(el);

    // 检查是否包含有意义的内容（排除纯装饰性 SVG）
    if (!hasMeaningfulText($el)) {
      result.skipped++;
      continue;
    }

    // DOM 级准备：xmlns / 尺寸 / 白底 / 中文字体
    prepareSVGElement($el);

    // 序列化为合法 XML 字符串
    let xml = $.xml($el);

    // 替换 CSS 变量
    xml = replaceCSSVariables(xml, cssVars);

    // 获取 viewBox 尺寸（输出 JSON 用；prepareSVGElement 已写入 width/height）
    const widthAttr = $el.attr("width");
    const heightAttr = $el.attr("height");
    const width = widthAttr ? Math.round(parseFloat(widthAttr)) : 680;
    const height = heightAttr ? Math.round(parseFloat(heightAttr)) : 400;

    const outName = `${prefix}-${index}.png`;
    const outPath = join(outputDir, outName);
    const svgDebugPath = join(outputDir, `${prefix}-${index}.svg`);

    try {
      await sharp(Buffer.from(xml)).png().toFile(outPath);

      const size = statSync(outPath).size;
      result.converted++;
      result.files.push({
        name: outName,
        width,
        height,
        sizeKB: Math.round((size / 1024) * 10) / 10,
      });
    } catch (err: any) {
      // 保存清洗后的 SVG 供调试
      try {
        writeFileSync(svgDebugPath, xml, "utf8");
      } catch {}
      result.errors.push(
        `SVG ${index}: ${err.message.split("\n")[0]} (清洗后 SVG 已保存到 ${svgDebugPath})`
      );
    }
  }

  console.log(JSON.stringify(result));
}

main();
