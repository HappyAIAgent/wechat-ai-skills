---
name: wechat-movie-review
description: |
  影评公众号文章生成器 — 输入电影名称，自动采集豆瓣/猫眼数据与官方海报，
  生成图文并茂、无AI味的影评公众号文章并发布到草稿箱。
  当用户提到"写一篇XX影评"、"XX电影怎么样"、"影评"时使用。
metadata:
  author: sisyphus
  version: "1.0.0"
  dependencies:
    - easy-markdown-to-html
    - easy-post-to-wechat
    - humanizer-zh
    - baoyu-image-gen
---

# 影评公众号文章生成器 (wechat-movie-review)

输入一个电影名称（如 "流浪地球3"、"封神第二部"），自动完成：
**数据采集 → 图片采集 → 写稿 → 去AI味 → 排版 → 发布草稿箱**。

## 工作流全景

```
用户输入: "写一篇流浪地球3的影评" / "流浪地球3"
  │
  ├─ Step 0: 参数解析 → 提取电影名、确认输出目录
  ├─ Step 1: 数据采集 → movie-data.ts 抓取豆瓣数据 → movie-data.json
  ├─ Step 2: 图片采集 → movie-images.ts 采集官方海报/剧照
  ├─ Step 3: 资料补充 → 搜索影评、票房、导演访谈等补充信息
  ├─ Step 4: 图片处理 → 压缩 + 来源标注 + 分类
  ├─ Step 5: 写稿 → 按 references/影评-写作风格.md + movie-data.json 生成
  ├─ Step 6: 去AI味 → humanizer-zh
  ├─ Step 7: 封面 → cover.ts 海报裁剪 + 标题文字
  ├─ Step 8: 排版发布 → easy-markdown-to-html + easy-post-to-wechat
  └─ Step 9: 归档 → 移入 01-文章/ + 更新选题库/素材库
```

## 参数说明

| 调用方式 | 示例 |
|---------|------|
| 基础调用 | `/wechat-movie-review 流浪地球3` |
| 指定剧透等级 | `/wechat-movie-review 流浪地球3 --spoiler 1` |
| 指定写作视角 | `/wechat-movie-review 流浪地球3 --perspective 深度影评` |
| 指定主题 | `/wechat-movie-review 流浪地球3 --theme 优雅` |
| 指定主题色 | `/wechat-movie-review 流浪地球3 --color 活力橘` |
| 仅生成不发布 | `/wechat-movie-review 流浪地球3 --dry-run` |
| 自动发布 | `/wechat-movie-review 流浪地球3 --publish` |

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<电影名>` | 电影名称（必填） | - |
| `--spoiler <0-2>` | 剧透等级：0=无剧透，1=少量暗示，2=可详细分析 | `1` |
| `--perspective <视角>` | 写作视角：深度影评/轻松解读/女性视角/硬核镜头解析 | `大众向通俗解读` |
| `--theme <主题>` | 排版主题（经典/优雅/简洁） | `经典` |
| `--color <颜色>` | 主题色（11 种预设色或 hex） | `经典蓝` |
| `--publish` | 跳过确认直接发布 | `false` |
| `--dry-run` | 仅生成不发布 | `false` |

## 输出目录

所有产物统一放在 `00-草稿/{YYYYMMDD_电影名影评}/` 目录下：
```
00-草稿/20260823_流浪地球3影评/
├── article.md           ← 配图版终稿
├── article.html         ← 公众号兼容 HTML
├── movie-data.json      ← 豆瓣结构化数据
├── sources.md           ← 资料来源、图片来源、数据校验记录
└── images/              ← 海报 + 剧照 + cover.png 封面
```

## 工作流程

### Step 0: 参数解析

从用户消息提取电影名（第一个非选项参数），确定：
- 剧透等级（`--spoiler`，默认 1）
- 写作视角（`--perspective`，默认大众向通俗解读）
- 输出目录 `00-草稿/{YYYYMMDD_电影名影评}/`（标题简称取电影名，如 `流浪地球3影评`）

同时读取：
- `references/影评-写作风格.md` — 影评文风规范（必读，本 skill 自带，见 `references/`）
- `02-资源/选题库.md` — 检查是否已有此选题（可选，属宿主项目，非本 skill 自带）
- `02-资源/素材库.md` — 搜索相关素材（可选，属宿主项目，非本 skill 自带）

### Step 1: 数据采集

```bash
bun run .agents/skills/wechat-movie-review/scripts/movie-data.ts "<电影名>" "00-草稿/{YYYYMMDD_电影名影评}" --json
```

- 输出 `movie-data.json`（评分、票房、演职员、剧情简介）
- **注意**：豆瓣有反爬虫机制，可能无法获取完整数据
- **检查数据完整性**：
  - 导演、主演、上映日期必须有值
  - 评分（豆瓣）尽量获取
  - 剧情简介必须有值（写作核心素材）
  - 若关键字段缺失，**必须用 web 搜索补充**：
    - 搜索"电影名 导演 演员 上映时间"
    - 搜索"电影名 豆瓣评分"
    - 搜索"电影名 剧情简介"
    - 搜索"电影名 票房"

### Step 2: 图片采集

```bash
bun run .agents/skills/wechat-movie-review/scripts/movie-images.ts "<电影名>" "00-草稿/{YYYYMMDD_电影名影评}" --min 10
```

- 优先采集官方海报（3-5 张）
- 补充剧照（8-12 张）
- 输出 `images/` + `images-meta.json` + `sources.md`
- **注意**：豆瓣有反爬虫机制，可能无法自动采集图片
- **若自动采集失败，必须手动处理**：
  1. 用 web 搜索"电影名 海报 剧照"
  2. 从豆瓣/猫眼/官方宣传页面手动下载图片
  3. 保存到 `images/` 目录，命名为 `poster-01.jpg`、`still-01.jpg` 等
  4. 手动创建 `images-meta.json` 记录图片信息
- **检查图片质量**：
  - 海报至少 2 张，剧照至少 6 张
  - 图片清晰度足够（>40KB）
  - 来源记录完整

### Step 3: 资料补充

用 web 搜索补充以下信息，**与 movie-data.json 交叉校验**：

1. **影评/分析**：专业影评人观点、豆瓣长评、知乎讨论
2. **票房数据**：猫眼专业版票房、首日/首周票房
3. **导演访谈**：创作背景、拍摄花絮、导演阐述
4. **社会反响**：观众评价、网络讨论、争议话题

**交叉校验规则**：
- 豆瓣评分与猫眼评分有差异时，**两个都记录**，写稿时注明"豆瓣 X 分 vs 猫眼 Y 分"
- 票房数据以猫眼专业版为准
- 剧情细节以官方物料（预告片/剧情简介）为准，不采信非官方剧透
- **拿不到的数据写"暂无官方数据"，严禁编造**

### Step 4: 图片处理

1. **压缩 >500KB 的图片**：
   ```bash
   # 用 baoyu-compress-image 处理（注意：不要用 -f webp，微信不支持）
   bun run .agents/skills/baoyu-compress-image/scripts/main.ts \
     "00-草稿/{YYYYMMDD_电影名影评}/images" -r -f jpeg -q 80
   ```

2. **标注图片来源**：
   - 从 `images-meta.json` 读取图片语义
   - 图注以 `images-meta.json` 的 `description` 字段为准
   - **不要用 Read 直接读图**（多数模型不支持图片输入会失败）

3. **检查图片来源多样性**：
   - 海报和剧照要分开
   - 不同场景的剧照要有代表性

### Step 5: 写稿

**读取 `references/影评-写作风格.md`**（本 skill 自带，见 `references/` 目录），按其中规范写作：
- 标题：电影名 + 核心观点/悬念 + 情感钩子
- **正文不写开头 H1**：公众号推文标题由发布环节 `--title` 单独控制，正文开头不要再写 `# 标题`（避免推文标题与正文大标题重复）。`article.md` 第一行直接是正文段落或 `##` 小节标题
- 结构：开头 → 基本信息 → 剧情概述 → 深度分析 → 亮点与不足 → 结尾
- **数据真实性（核心）**：
  - 电影名、导演、演员、上映日期从 `movie-data.json` 读取
  - 评分、票房从 `movie-data.json` 和 `sources.md` 读取
  - **禁止编造任何剧情细节或数据**
- **剧透控制**：
  - `--spoiler 0`：只交代背景设定，不透露任何剧情走向
  - `--spoiler 1`：可提及主线方向，不透露转折和结局
  - `--spoiler 2`：可分析关键场景，但仍建议标注"以下含剧透"
- 图片引用用 `![图注](images/poster-01.jpg)` 插入对应位置
- 初稿保存为 `00-草稿/{YYYYMMDD_电影名影评}/article-raw.md`

### Step 6: 去 AI 味

调用 `humanizer-zh` 处理 article-raw.md → `article.md`：
- 压掉形容词堆砌、AI 高频词、排比句
- 保留真实数据不动（只改表达，不改电影名/演员/评分）

### Step 7: 封面图

封面用**官方海报或剧照**（不用 AI 生图），用 `cover.ts` 脚本一键生成：

```bash
bun run .agents/skills/wechat-movie-review/scripts/cover.ts \
  "00-草稿/{YYYYMMDD_电影名影评}/images/poster-01.jpg" \
  --title "{文章标题}" \
  --subtitle "豆瓣8.5分 · 2026年度科幻"
```

1. 从 `images/` 挑一张最出彩的海报（优先官方海报，其次剧照）
2. 脚本自动裁剪为 2.35:1（公众号封面，默认）或 `--ratio 1:1`，叠加标题/副标题文字，输出 `images/cover.png`（必须 PNG）
3. 标题较长时脚本自适应缩字号；生成后检查文字是否完整、不被图片遮挡

### Step 8: 排版发布

```bash
# 转 HTML
bun run .agents/skills/easy-markdown-to-html/scripts/main.ts \
  "00-草稿/{YYYYMMDD_电影名影评}/article.md" \
  --theme {theme} --color {color}

# 发布到草稿箱（外发操作，发布前先与用户确认标题/摘要/封面）
bun run .agents/skills/easy-post-to-wechat/scripts/main.ts \
  "00-草稿/{YYYYMMDD_电影名影评}/article.html" \
  --thumb "00-草稿/{YYYYMMDD_电影名影评}/images/cover.png" \
  --title "{文章标题}"
```

**发布前检查正文无 H1**：公众号推文标题由发布 `--title` 单独控制，正文不应再有 `<h1>` 一级标题（避免与推文标题重复）。若 `article.md` 开头误留 `# 标题`（如早期草稿），发布前删掉该行并重新转 HTML。

**发布前交互式确认**（默认执行，`--publish` 跳过）：用 `AskUserQuestion` 询问用户下一步：

| 选项 | 行为 |
|------|------|
| **确认发布** | 执行上方 API 命令，提交到公众号草稿箱 |
| **修改文章** | 返回 Step 5 修改文章内容 |
| **取消发布** | 结束流程，产物保留在 `00-草稿/` 目录 |

确认发布前先 `--dry-run` 预览（渲染 + 图片扫描 + 标题提取，不发网络请求），核对标题、摘要、封面、图片数量无误后再正式发布。

### Step 9: 归档（可选）

发布成功后提示用户归档：
1. 移入 `01-文章/YYYYMMDD_电影名影评/`，article.md 图片路径改为 `images/`
2. 更新 `02-资源/选题库.md`（选题移至"已发布"）
3. 更新 `02-资源/素材库.md`（提炼一条可复用素材）

## 合规红线（写作时强制执行）

| 规则 | 要求 |
|------|------|
| 剧透控制 | 严格遵守 `--spoiler` 参数，0=无剧透，1=少量暗示，2=可详细分析 |
| 禁止编造 | 所有剧情、角色、票房数据必须来自调研素材，编造即报错 |
| 版权标注 | 使用剧照/海报必须注明来源（图源：豆瓣/官方海报） |
| 禁极限词 | 不用"神作""必看""炸裂""封神""年度最佳" |
| 禁人身攻击 | 批评作品不攻击创作者，不做道德审判 |
| 数据来源 | 引用第三方数据注明来源，不确定写"暂无官方数据" |

## 数据源说明

| 数据 | 来源 | 接口 |
|------|------|------|
| 电影基础信息 | 豆瓣电影 | `movie.douban.com/subject/{id}/`（HTML 解析） |
| 评分 | 豆瓣 | `movie.douban.com/j/subject_abstract`（JSON API） |
| 剧照/海报 | 豆瓣图片页 | `movie.douban.com/subject/{id}/photos?type=S/R` |
| 票房 | web 搜索 | 猫眼专业版/新浪娱乐（转载） |
| 影评/访谈 | web 搜索 | 豆瓣长评/知乎/新浪娱乐 |

> 注意：以上接口为公开页面接口，可能随网站改版变动。脚本解析失败时检查接口返回结构。

## 注意事项

- 本技能是**编排器**，调度已有子技能 + 自带 2 个数据脚本（`movie-data.ts` / `movie-images.ts`）
- **数据真实性是生命线**：所有剧情、演员、票房数据必须来自 movie-data.json，禁止编造
- **图片版权需谨慎**：官方海报/剧照可合理使用（注明来源），禁止盗摄/偷拍图
- **剧透控制是核心**：严格遵守 `--spoiler` 参数，不要"不小心"透露关键剧情
- 微信不支持 webp：所有图片发布前必须转 jpg（`baoyu-compress-image -f jpeg`）
- 电影名歧义（如 "封神" vs "封神第二部"）必须让用户确认
- 影评型 1500-2500 字；配图 8-15 张
- `humanizer-zh` 必做（影评最怕 AI 味）

## 豆瓣反爬虫机制说明

豆瓣有反爬虫机制（Proof-of-Work 挑战），但本技能已集成浏览器渲染方案：

**自动处理流程**：
1. `movie-data.ts` 首先尝试 HTTP 方式获取数据
2. 如果遇到反爬虫机制，**自动切换到浏览器渲染模式**（`movie-data-browser.ts`）
3. 浏览器渲染使用 Crawlee + Puppeteer，可绕过大部分反爬虫机制

**浏览器渲染模式**：
- 需要系统安装 Chrome 浏览器
- 首次运行可能需要等待较长时间（1-3 分钟）
- 如果浏览器渲染也失败，会提示手动补充数据

**备选方案**：
1. **优先使用 web 搜索补充数据**：搜索"电影名 导演 演员 剧情"等关键词
2. **手动下载图片**：从豆瓣/猫眼/官方宣传页面手动下载海报和剧照
3. **使用替代数据源**：猫眼电影、时光网、IMDb 等
4. **手动编辑 movie-data.json**：补充缺失的信息

**提示**：即使自动采集失败，技能仍可正常工作——只需手动补充 `movie-data.json` 和 `images/` 目录即可。
