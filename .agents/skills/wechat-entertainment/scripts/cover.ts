#!/usr/bin/env bun
/**
 * cover.ts — 八卦文章封面图生成器
 *
 * 生成 900×383 (2.35:1) 公众号封面，带深色半透明遮罩和白色文字。
 * 封面风格偏八卦/爆料感，使用醒目字体和对比色。
 *
 * 依赖: sharp（自动安装）
 *
 * 用法:
 *   bun run cover.ts --title "XX深夜密会神秘人" --subtitle "狗仔队独家追踪" --images cover.jpg output.png
 *   bun run cover.ts --title "XX官宣恋情" --subtitle "经纪人证实" --images img1.jpg img2.jpg output.png
 */

import sharp from "sharp";
import { existsSync } from "fs";

// ============================================================
// CLI 参数解析
// ============================================================

interface CliArgs {
  title: string;
  subtitle: string;
  images: string[];
  outputPath: string;
  width: number;
  height: number;
  style: "default" | "breaking" | "exclusive" | "gossip";
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const opts: CliArgs = {
    title: "",
    subtitle: "",
    images: [],
    outputPath: "",
    width: 900,
    height: 383,
    style: "default",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--title":
        opts.title = args[++i];
        break;
      case "--subtitle":
        opts.subtitle = args[++i];
        break;
      case "--images":
        while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
          opts.images.push(args[++i]);
        }
        break;
      case "--width":
        opts.width = parseInt(args[++i], 10);
        break;
      case "--height":
        opts.height = parseInt(args[++i], 10);
        break;
      case "--style":
        opts.style = args[++i] as CliArgs["style"];
        break;
      default:
        if (!args[i].startsWith("--") && !opts.outputPath) {
          opts.outputPath = args[i];
        }
    }
  }

  if (!opts.title || !opts.outputPath) {
    console.error("用法: bun run cover.ts --title <标题> --subtitle <副标题> [--images <图1> ...] <输出路径>");
    console.error("选项:");
    console.error("  --style <default|breaking|exclusive|gossip>  封面风格");
    process.exit(1);
  }

  return opts;
}

// ============================================================
// 颜色方案（八卦风格）
// ============================================================

const COLOR_SCHEMES = {
  // 默认八卦风格：深紫色背景，金色点缀
  default: {
    overlay: "rgba(45, 0, 80, 0.75)",
    titleColor: "#FFD700",
    subtitleColor: "#FFFFFF",
    accentColor: "#FF4500",
  },
  // 突发新闻风格：红色背景
  breaking: {
    overlay: "rgba(180, 0, 0, 0.8)",
    titleColor: "#FFFFFF",
    subtitleColor: "#FFD700",
    accentColor: "#FF0000",
  },
  // 独家爆料风格：深蓝色背景
  exclusive: {
    overlay: "rgba(0, 20, 80, 0.8)",
    titleColor: "#00FFFF",
    subtitleColor: "#FFFFFF",
    accentColor: "#1E90FF",
  },
  // 吃瓜风格：绿色背景
  gossip: {
    overlay: "rgba(0, 80, 0, 0.75)",
    titleColor: "#FFFFFF",
    subtitleColor: "#90EE90",
    accentColor: "#32CD32",
  },
};

// ============================================================
// 文字排版
// ============================================================

/** 按字数自动换行 */
function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const char of text) {
    if (current.length >= maxChars) {
      lines.push(current);
      current = "";
    }
    current += char;
  }
  if (current) lines.push(current);
  return lines;
}

/** 生成 SVG 覆盖层 */
function createSvgOverlay(opts: CliArgs): Buffer {
  const { width, height, title, subtitle, style } = opts;
  const colors = COLOR_SCHEMES[style];

  // 标题文字大小自适应
  const titleFontSize = title.length <= 10 ? 52 : title.length <= 15 ? 44 : 36;
  const subtitleFontSize = 24;
  const titleLines = wrapText(title, Math.floor(width / (titleFontSize * 0.6)));
  const subtitleLines = subtitle ? wrapText(subtitle, Math.floor(width / (subtitleFontSize * 0.6))) : [];

  // 计算文字总高度
  const titleLineHeight = titleFontSize * 1.4;
  const subtitleLineHeight = subtitleFontSize * 1.4;
  const totalTextHeight = titleLines.length * titleLineHeight + subtitleLines.length * subtitleLineHeight + 20;

  // 文字区域位置（垂直居中偏下）
  const textAreaY = (height - totalTextHeight) / 2 + 20;

  // 构建 SVG
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;

  // 背景遮罩
  svg += `<rect width="${width}" height="${height}" fill="${colors.overlay}"/>`;

  // 顶部装饰条（红色/金色）
  svg += `<rect x="0" y="0" width="${width}" height="4" fill="${colors.accentColor}"/>`;

  // 底部装饰条
  svg += `<rect x="0" y="${height - 4}" width="${width}" height="4" fill="${colors.accentColor}"/>`;

  // 左侧装饰条
  svg += `<rect x="0" y="0" width="4" height="${height}" fill="${colors.accentColor}"/>`;

  // 标题文字（带阴影）
  for (let i = 0; i < titleLines.length; i++) {
    const y = textAreaY + i * titleLineHeight + titleFontSize;

    // 阴影
    svg += `<text x="${width / 2}" y="${y + 2}" text-anchor="middle" font-family="PingFang SC, Heiti SC, Microsoft YaHei, sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="black" opacity="0.5">${escapeXml(titleLines[i])}</text>`;

    // 主文字
    svg += `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="PingFang SC, Heiti SC, Microsoft YaHei, sans-serif" font-size="${titleFontSize}" font-weight="bold" fill="${colors.titleColor}">${escapeXml(titleLines[i])}</text>`;
  }

  // 副标题
  for (let i = 0; i < subtitleLines.length; i++) {
    const y = textAreaY + titleLines.length * titleLineHeight + 20 + i * subtitleLineHeight + subtitleFontSize;
    svg += `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="PingFang SC, Heiti SC, Microsoft YaHei, sans-serif" font-size="${subtitleFontSize}" fill="${colors.subtitleColor}" opacity="0.9">${escapeXml(subtitleLines[i])}</text>`;
  }

  // 左上角标签（如 "独家" "爆料"）
  if (style === "exclusive" || style === "breaking") {
    const tagText = style === "exclusive" ? "独家" : "突发";
    const tagWidth = 60;
    const tagHeight = 24;
    svg += `<rect x="10" y="10" width="${tagWidth}" height="${tagHeight}" rx="4" fill="${colors.accentColor}"/>`;
    svg += `<text x="${10 + tagWidth / 2}" y="${10 + tagHeight / 2 + 6}" text-anchor="middle" font-family="PingFang SC, Heiti SC, Microsoft YaHei, sans-serif" font-size="14" font-weight="bold" fill="white">${tagText}</text>`;
  }

  // 右下角 "吃瓜" 水印
  if (style === "gossip") {
    svg += `<text x="${width - 10}" y="${height - 10}" text-anchor="end" font-family="PingFang SC, Heiti SC, Microsoft YaHei, sans-serif" font-size="14" fill="${colors.subtitleColor}" opacity="0.5">🍉 吃瓜</text>`;
  }

  svg += `</svg>`;
  return Buffer.from(svg);
}

/** 转义 XML 特殊字符 */
function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ============================================================
// 图片处理
// ============================================================

/** 合成封面 */
async function createCover(opts: CliArgs): Promise<Buffer> {
  const { width, height, images } = opts;

  // 准备背景
  let background: sharp.Sharp;

  if (images.length > 0) {
    // 使用第一张图片作为背景
    const bgPath = images[0];
    if (!existsSync(bgPath)) {
      throw new Error(`背景图片不存在: ${bgPath}`);
    }

    background = sharp(bgPath).resize(width, height, { fit: "cover", position: "center" });
  } else {
    // 无图片时使用纯色背景
    background = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 30, g: 0, b: 50 },
      },
    });
  }

  // 创建 SVG 覆盖层
  const svgOverlay = createSvgOverlay(opts);

  // 合成
  const output = await background
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return output;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const opts = parseArgs();

  console.log(`\n🎨 生成八卦封面: ${opts.title}`);
  console.log(`📐 尺寸: ${opts.width}×${opts.height}`);
  console.log(`🎨 风格: ${opts.style}`);
  console.log(`🖼️  背景图: ${opts.images.length} 张\n`);

  try {
    const output = await createCover(opts);

    // 保存
    const { writeFileSync } = await import("fs");
    writeFileSync(opts.outputPath, output);
    console.log(`✓ 封面已保存: ${opts.outputPath} (${(output.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.error(`❌ 生成失败: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

main();
