---
name: wechat-entertainment
description: 娱乐八卦公众号文章生成器 — 从热点事件自动生成完整图文并茂的公众号文章（调研→配图→写作→去AI味→发布）
---

# wechat-entertainment

> 娱乐八卦公众号文章生成器。
> 从热点事件名出发，自动完成：事件调研 → 封面/配图 → 写作 → 去AI味 → 排版 → 发布 → 归档。

## 触发信号

当用户给出以下类型的输入时使用本技能：
- 事件名称（如"XX恋情""XX塌房""XX争议"）
- 热搜关键词
- "帮我写一篇关于 XX 的公众号文章"
- "XX 事件写篇文章"

## 快速开始

```
/entertainment <事件名>
```

示例：
```
/entertainment "XX深夜密会"
/entertainment "XX塌房" --sentiment negative
/entertainment "XX官宣恋情" --perspective neutral --publish
```

## 工作流程

### Step 1: 事件调研

```bash
bun run .agents/skills/wechat-entertainment/scripts/entertainment-research.ts "<事件名>" "00-草稿/20260823_事件简称"
```

输出 `entertainment-data.json`，包含：
- 事件基础信息（标题、关键词、分类）
- 时间线（多个节点，每个节点有可信度标记）
- 多方说法（当事人、经纪公司、知情人士、媒体等）
- 网友反应（情绪分布、热门评论）
- 相关事件

### Step 2: 封面生成

```bash
# 默认八卦风格
bun run .agents/skills/wechat-entertainment/scripts/cover.ts \
  --title "事件标题" \
  --subtitle "一句话事件核心" \
  --style default \
  --images cover.jpg \
  00-草稿/20260823_事件简称/images/cover.png

# 可选风格
# --style breaking   突发新闻（红底白字）
# --style exclusive  独家爆料（蓝底青字）
# --style gossip     吃瓜日常（绿底白字）
```

### Step 3: 配图

1. 搜索事件相关图片（当事人照片、现场图等）
2. 下载到 `00-草稿/20260823_事件简称/images/`
3. **微信 API 不支持 WebP**，所有图片必须转为 PNG/JPG：
   ```bash
   bun run .agents/skills/baoyu-compress-image/scripts/main.ts \
     -f png --keep 00-草稿/20260823_事件简称/images/*.webp
   ```
4. 创建 `00-草稿/20260823_事件简称/image-prompts.md`

### Step 4: 写作

按 `references/娱乐八卦-写作风格.md` 的风格指南写作：

1. 加载 `entertainment-data.json` 中的事件数据
2. 加载风格指南 `references/娱乐八卦-写作风格.md`
3. 生成初稿 `article.md`

**文章结构**：
```
标题（情绪+悬念+人物）
├─ 开头（1-3 句话交代核心事件，制造"吃瓜"氛围）
├─ 事件时间线（时间+事件+来源，标注可信度）
├─ 当事人说法（直接引述，明确来源）
├─ 经纪公司/团队回应（官方声明）
├─ 知情人士透露（匿名需标注"据知情人士透露"）
├─ 网友反应（热门评论、情绪分布）
├─ 业内观察（行业影响分析，300-500 字）
└─ 结尾（留思考题，引导评论区互动）
```

**可信度标注**：
| 来源 | 标记 | 处理方式 |
|------|------|---------|
| 当事人/官方声明 | 可信 | 可直接引用 |
| 主流媒体 | 较可信 | 可引用，注明媒体名 |
| 知情人士/匿名 | 存疑 | 必须加"据知情人士透露""疑似" |
| 无来源/截图 | 未证实 | 必须加"网传""待核实" |

**配图位置**：
- 第 15 行左右（开场情绪图）
- 第 40 行左右（当事人形象图）
- 第 70 行左右（现场/细节图）
- 每张配图加文字说明（如"图：XX被拍到深夜密会"）

### Step 5: 去 AI 味

```bash
npx @anthropic-ai/claude-code skills run humanizer-zh "00-草稿/20260823_事件简称/article.md"
```

**注意**：八卦文章的"去AI味"重点是：
- 去掉太书面的表达，换成口语化、八卦味的语气
- 加入网络热梗（"吃瓜""塌房""官宣"等）
- 保持事实准确性，不改变事件细节
- 保留可信度标注，不淡化"网传""疑似"等措辞

### Step 6: 格式化

```bash
bun run .agents/skills/baoyu-format-markdown/scripts/main.ts "00-草稿/20260823_事件简称/article.md"
```

### Step 7: 转 HTML

```bash
bun run .agents/skills/easy-markdown-to-html/scripts/main.ts "00-草稿/20260823_事件简称/article.md"
```

可选参数：
```bash
--theme <主题>       # 默认
--color <主题色>     # 默认 #FF4500（八卦风格用橙红色）
--custom-css <css>   # 自定义样式
```

### Step 8: 发布

```bash
# 预览
bun run .agents/skills/easy-post-to-wechat/scripts/main.ts "00-草稿/20260823_事件简称/article.html" \
  --appid $WECHAT_APP_ID --secret $WECHAT_APP_SECRET \
  --cover "00-草稿/20260823_事件简称/images/cover.png" \
  --dry-run

# 确认后发布
bun run .agents/skills/easy-post-to-wechat/scripts/main.ts "00-草稿/20260823_事件简称/article.html" \
  --appid $WECHAT_APP_ID --secret $WECHAT_APP_SECRET \
  --cover "00-草稿/20260823_事件简称/images/cover.png"
```

### Step 9: 归档

```
00-草稿/20260823_事件简称/
    → 01-文章/20260823_事件简称/
    ├── article.md
    ├── article.html
    ├── entertainment-data.json
    ├── image-prompts.md
    └── images/
        ├── cover.png
        ├── 多方说法.jpg
        ├── 时间线.jpg
        └── 现场图.jpg
```

归档步骤：
1. 将 `article.md` 中的图片路径改为 `images/xxx`
2. 将整个目录移到 `01-文章/`
3. 删除 `00-草稿/` 中的草稿目录
4. 更新 `02-资源/选题库.md`（如有对应选题）

## 完整命令序列（复制粘贴版）

```bash
# 设置变量
EVENT="XX恋情"
SHORT="XX恋情"
DATE=$(date +%Y%m%d)
DIR="00-草稿/${DATE}_${SHORT}"

# Step 1: 调研
bun run .agents/skills/wechat-entertainment/scripts/entertainment-research.ts "$EVENT" "$DIR"

# Step 2: 封面
bun run .agents/skills/wechat-entertainment/scripts/cover.ts \
  --title "$EVENT" --subtitle "事件核心一句话" --style gossip \
  --images cover.jpg "$DIR/images/cover.png"

# Step 4-6: 写作（由 AI 完成）
# ... 写作完成后 ...

# Step 5: 去AI味
npx @anthropic-ai/claude-code skills run humanizer-zh "$DIR/article.md"

# Step 6: 格式化
bun run .agents/skills/baoyu-format-markdown/scripts/main.ts "$DIR/article.md"

# Step 7: 转HTML
bun run .agents/skills/easy-markdown-to-html/scripts/main.ts "$DIR/article.md" --color "#FF4500"

# Step 8: 发布
bun run .agents/skills/easy-post-to-wechat/scripts/main.ts "$DIR/article.html" \
  --appid $WECHAT_APP_ID --secret $WECHAT_APP_SECRET \
  --cover "$DIR/images/cover.png" --dry-run

# Step 9: 归档
mv "$DIR" "01-文章/${DATE}_${SHORT}"
```

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<事件名>` | 必需，要写的事件名称 | - |
| `--sentiment` | 文章情绪倾向（positive/negative/neutral） | neutral |
| `--perspective` | 叙事视角（neutral/supporting/opposing） | neutral |
| `--publish` | 直接发布到公众号草稿箱 | false |
| `--dry-run` | 预览发布效果，不实际发布 | false |
| `--theme` | HTML 主题 | 默认 |
| `--color` | HTML 主题色 | #FF4500 |

## 注意事项

1. **事实是底线**：没有来源的信息不能写，宁可少写不可编造
2. **多方信源**：一个事件至少采访 2-3 个不同角度的说法
3. **分寸感**：八卦可以有，恶意不能有；调侃可以有，攻击不能有
4. **法律意识**：注意名誉权、隐私权，避免"实锤"式表述（除非有官方声明）
5. **可信度透明**：每个信息点都要标注来源可信度，让读者自己判断
6. **不蹭灾难**：不消费他人苦难，不拿悲剧当流量密码
7. **微信图片限制**：所有图片必须转为 PNG/JPG，WebP 会上传失败
8. **时效性**：热点事件变化快，写作时注明"截至发稿时"

## 数据源说明

| 数据源 | 采集方式 | 备注 |
|--------|---------|------|
| 微博热搜 | `https://weibo.com/ajax/side/hotSearch` | JSON API，稳定性高 |
| 微博搜索 | `https://s.weibo.com/weibo?q=...` | HTML 解析，可能需要 cookie |
| 新浪娱乐 | `https://ent.sina.com.cn` + 搜索 | HTML 解析 |
| 网易娱乐 | `https://ent.163.com` + 搜索 | HTML 解析 |

## 常见问题

**Q: 微博热搜 API 返回空数据？**
A: 可能需要 cookie 或 IP 被限制。脚本会自动降级到其他数据源。

**Q: 搜索结果不够多？**
A: 可以手动补充新闻链接，脚本支持多个数据源混合。

**Q: 文章太短/太长？**
A: 调整 `references/娱乐八卦-写作风格.md` 中的字数要求，或在写作时明确指定字数范围。

**Q: 封面图生成失败？**
A: 检查背景图片路径是否正确，确保图片格式为 JPG/PNG（非 WebP）。

## 扩展阅读

- 写作风格：`references/娱乐八卦-写作风格.md`
- 娱乐新闻写作教程：参考各平台娱乐频道的写作风格
- 公众号运营：参考 `02-资源/写作风格.md`
