#!/usr/bin/env bun
/**
 * compress-images.ts — 限定目录图片压缩（避免 os.walk 误伤其他草稿）
 *
 * 只处理命令行显式指定的目录，>500KB 的图用 sharp 压缩到 <500KB
 * （1200 宽 q80，仍超则 1000 宽 q65），并统一转为 jpg（微信不支持 webp）。
 * 绝不递归扫描父目录或全盘，防止误压缩其他文章图片。
 *
 * 用法:
 *   bun run compress-images.ts "<文章目录或 images 目录>"
 *
 * 说明:
 *   <目录> 应指向文章目录（其下 images/ 内的图会被处理）；
 *   也支持直接指向 images/ 目录本身。
 */
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import { join, basename } from "path";

const TARGET_SIZE = 500 * 1024; // 微信加载目标 <500KB

function logMsg(msg: string): void {
  process.stderr.write(`[compress-images] ${msg}\n`);
}

async function compressImage(buf: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const compressed = await sharp(buf)
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  if (compressed.byteLength > TARGET_SIZE) {
    return await sharp(buf)
      .rotate()
      .resize({ width: 1000, withoutEnlargement: true })
      .jpeg({ quality: 65 })
      .toBuffer();
  }
  return compressed;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length < 1 || args[0] === "--help" || args[0] === "-h") {
    console.log(`用法:
  bun run compress-images.ts "<文章目录或 images 目录>"

说明:
  只处理指定目录内的图片（jpg/png/webp），>500KB 自动压缩并统一转 jpg。
  默认取 <目录>/images/；若参数本身以 images 结尾则直接处理该目录。
  绝不扫描父目录或其他草稿，安全。`);
    process.exit(0);
  }

  let target = args[0];
  if (!basename(target).toLowerCase().startsWith("images")) {
    target = join(target, "images");
  }
  if (!existsSync(target)) {
    logMsg(`目录不存在: ${target}`);
    process.exit(1);
  }

  const files = readdirSync(target).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  if (files.length === 0) {
    logMsg(`无图片文件: ${target}`);
    return;
  }

  let compressed = 0;
  let skipped = 0;
  for (const f of files) {
    const filePath = join(target, f);
    let buf: Buffer;
    try {
      buf = readFileSync(filePath);
    } catch (e) {
      logMsg(`读取失败: ${f}: ${(e as Error).message}`);
      continue;
    }

    // 已是 jpg 且 <500KB：跳过
    if (buf.byteLength <= TARGET_SIZE && /\.jpe?g$/i.test(f)) {
      skipped++;
      continue;
    }

    try {
      const newBuf = await compressImage(buf);
      // 统一输出 jpg，删除原 webp/png
      const outName = f.replace(/\.(jpe?g|png|webp)$/i, ".jpg");
      const outPath = join(target, outName);
      writeFileSync(outPath, newBuf);
      if (outPath !== filePath) rmSync(filePath, { force: true });
      compressed++;
      logMsg(`✓ ${f} → ${outName} (${(newBuf.byteLength / 1024).toFixed(0)}KB)`);
    } catch (e) {
      logMsg(`压缩失败（保留原图）: ${f}: ${(e as Error).message}`);
      skipped++;
    }
  }

  logMsg(`完成: 压缩 ${compressed} 张，跳过 ${skipped} 张`);
}

main();
