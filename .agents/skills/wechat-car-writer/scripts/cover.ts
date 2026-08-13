#!/usr/bin/env bun
/**
 * cover.ts — 公众号封面图生成器（实车图裁剪 + 标题文字叠层）
 *
 * 输入一张实车高清图，按公众号封面比例（2.35:1 或 1:1）居中裁剪，
 * 叠加标题/副标题文字，输出 PNG 封面。底图用真实车图，不用 AI 生图。
 *
 * 依赖: sharp（与 baoyu-compress-image 一致，bun 动态引入）
 *
 * 用法:
 *   bun run cover.ts <图片路径> --title "零跑A05正式上市" --subtitle "6.39万元起 · CLTC续航405km/510km"
 *   bun run cover.ts car-01.jpg --title "零跑A05" --ratio 1:1 -o cover.png
 *
 * 参数:
 *   <图片路径>        必填，实车图（外观正面或 45° 角最佳）
 *   --title <文字>    主标题（自动按长度缩字号）
 *   --subtitle <文字> 副标题（可选）
 *   --ratio <比例>    2.35:1（公众号封面，默认）| 1:1（朋友圈/方图）
 *   -o <路径>         输出路径，默认 images/cover.png
 *
 * 输出:
 *   900 宽 PNG（2.35:1 → 900×383；1:1 → 900×900），>500KB 请另行压缩
 */

import { dirname } from "path";
import { mkdirSync } from "fs";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 按标题长度选字号，避免溢出 */
function titleFontSize(title: string, w: number): number {
  // 中文每字约等于字号宽度，粗估画布可用宽度（左右留 60px 边距）
  const usable = w - 120;
  let size = 64;
  while (size > 32 && title.length * size > usable) size -= 4;
  return size;
}

function makeSvg(w: number, h: number, title: string, subtitle: string): string {
  const tSize = titleFontSize(title, w);
  const subSize = Math.max(24, Math.round(tSize * 0.55));
  const titleY = subtitle ? h - 120 : h - 90;
  const subY = h - 55;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.20)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.70)"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#shade)"/>
  <text x="60" y="${titleY}" font-family="'Microsoft YaHei','PingFang SC','SimHei','Noto Sans CJK SC',sans-serif"
        font-size="${tSize}" font-weight="bold" fill="#ffffff">${escapeXml(title)}</text>
  ${subtitle ? `<text x="60" y="${subY}" font-family="'Microsoft YaHei','PingFang SC','SimHei',sans-serif"
        font-size="${subSize}" fill="rgba(255,255,255,0.92)">${escapeXml(subtitle)}</text>` : ""}
</svg>`;
}

function printHelp(): void {
  console.log(`用法:
  bun run cover.ts <图片路径> --title "标题" [--subtitle "副标题"] [--ratio 2.35:1|1:1] [-o cover.png]

示例:
  bun run cover.ts images/car-01.jpg --title "零跑A05正式上市" --subtitle "6.39万元起 · CLTC续航405km/510km"
  bun run cover.ts car-01.jpg --title "零跑A05" --ratio 1:1 -o cover.png

说明:
  底图用实车高清图；按比例居中裁剪；文字叠层在底部渐变色带上。`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const imgPath = args.find((a) => !a.startsWith("--") && !a.startsWith("-"));
  if (!imgPath) throw new Error("缺少图片路径参数");

  const getOpt = (name: string) => {
    const i = args.indexOf(name);
    return i > -1 && args[i + 1] ? args[i + 1] : undefined;
  };
  const title = getOpt("--title") ?? "";
  const subtitle = getOpt("--subtitle") ?? "";
  const ratio = getOpt("--ratio") ?? "2.35:1";
  const outPath = getOpt("-o") ?? "images/cover.png";

  const W = 900;
  const H = ratio === "1:1" ? 900 : 383; // 2.35:1 → 900/383 ≈ 2.35
  const svg = makeSvg(W, H, title, subtitle);

  const sharp = (await import("sharp")).default;
  const buf = await sharp(imgPath)
    .resize(W, H, { fit: "cover", position: "centre" })
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer();

  mkdirSync(dirname(outPath), { recursive: true });
  await Bun.write(outPath, buf);
  console.log(`✅ 封面已生成: ${outPath} (${W}×${H}, ${(buf.byteLength / 1024).toFixed(0)}KB)`);
}

main().catch((e) => {
  console.error(`封面生成失败: ${e.message}`);
  process.exit(1);
});
