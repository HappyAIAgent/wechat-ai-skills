# xhs-content-creator 使用示例

## 示例 1：基础使用

```bash
# 输入一个选题，自动生成完整内容
/xhs-content-creator "为什么口袋里的手机，总让你觉得它震了？"
```

**输出**：
```
image-cards/phantom-vibration/
├── source.md           # 用户原始输入
├── analysis.md         # 内容分析
├── outline.md          # 出图大纲
├── article.md          # 完整文案
├── summary.md          # 结构化发布文案
├── images/             # 原始图片
├── compress/           # 压缩后的图片
└── prompts/            # 每张图的 prompt 文件
```

## 示例 2：快速模式

```bash
# 跳过写稿，直接用描述出图
/xhs-content-creator "幻觉震动：为什么你的手机总在震？" --fast
```

**适用场景**：
- 用户已有完整文案描述
- 只需要生成图片卡片
- 快速验证想法

## 示例 3：自定义风格

```bash
# 指定图片风格
/xhs-content-creator "避坑指南：这些 AI 工具别再用了" --style bold
```

**可用风格**：
- `notion` — 知识科普
- `cute` — 可爱风格
- `fresh` — 清新风格
- `warm` — 温暖风格
- `bold` — 大胆风格
- `chalkboard` — 黑板风格
- `minimal` — 极简风格
- `pop` — 波普风格

## 示例 4：只生成文案

```bash
# 不生成图片，只生成文案
/xhs-content-creator "如何用 AI 提高工作效率？" --no-images
```

**输出**：
```
image-cards/ai-efficiency/
├── source.md           # 用户原始输入
├── analysis.md         # 内容分析
├── outline.md          # 出图大纲
└── summary.md          # 结构化发布文案
```

## 示例 5：跳过确认

```bash
# 跳过确认步骤，直接生成
/xhs-content-creator "现代人的手机依赖症" --no-confirm
```

**适用场景**：
- 批量生成内容
- 自动化工作流
- 信任 AI 生成结果

## 输出文件说明

### source.md
用户原始输入内容。

### analysis.md
内容分析结果，包括：
- 主题关键词
- 目标受众
- 内容类型
- 风格建议

### outline.md
出图大纲，包括：
- 每张图的内容描述
- 视觉要点
- 风格建议

### summary.md
结构化发布文案，包括：
- 标题（主选 + 备选）
- 开头钩子
- 正文（3 段）
- 互动提问
- 话题（5-8 个）
- 配图说明
- 配图路径

### prompts/
每张图的 prompt 文件，用于：
- 记录生成参数
- 方便重新生成
- 作为创作参考

### images/
原始图片文件（PNG 格式）。

### compress/
压缩后的图片文件（WebP 格式），用于：
- 小红书发布
- 社交媒体分享
- 节省存储空间
