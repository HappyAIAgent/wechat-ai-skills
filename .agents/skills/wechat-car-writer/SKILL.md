---
name: wechat-car-writer
description: |
  汽车营销公众号文章生成器 — 输入车型名称，自动采集真实参数与官方图片，
  生成图文并茂、无AI味的新车上市类公众号文章并发布到草稿箱。
  当用户提到"写一篇某某车的文章"、"某某车上市"、"汽车营销文"、"车评"、"车型介绍"时使用。
metadata:
  author: sisyphus
  version: "1.0.0"
  dependencies:
    - baoyu-compress-image
    - easy-markdown-to-html
    - easy-post-to-wechat
    - humanizer-zh
---

# 汽车营销公众号文章生成器 (wechat-car-writer)

输入一个车型名称（如 "零跑A05"、"比亚迪 海豹06 GT"、"小米SU7"），自动完成：
**定位车型 → 采集真实参数 → 采集官方图片 → 补充上市信息 → 按车评风格写稿 → 去AI味 → 排版 → 发布草稿箱**。

## 通用性保证（任何厂商不改 skill 即可用）

本技能**不依赖厂商适配**就能覆盖国内所有主流汽车品牌：

- **参数**：汽车之家 `getParamConf`（seriesId 制，全品牌覆盖）——通用地基
- **图片兜底**：汽车之家 `getpiclist`（全品牌覆盖），保证任何车型都有图
- **官网增强**：`car-news-images.ts` 内置 30+ 厂商官网映射，SPA 页面**四级回退采集**——① HTML 内嵌 JSON 提取（首选，无需浏览器）→ ② **Crawlee+PuppeteerCrawler 滚动渲染（主方案，`crawlee-fetch.ts`）** → ③ crawl4ai 滚动渲染（备选）→ ④ baoyu-fetch CDP（兜底），自动抓取官网高清无水印图片，同时提取每张图的区块语义（`images-meta.json`，图注用）

**官网无水印图是第一优先级**：已适配厂商优先抓官网图（权威、无平台水印）→ 新闻稿配图（无平台水印）→ 汽车之家兜底。

### 已适配官网（SPA 支持）

| 分类 | 品牌 |
|------|------|
| 新势力 | 零跑、小鹏、蔚来、理想、哪吒、高合、极狐、飞凡、智己、阿维塔、极石、创维 |
| 传统车企新能源 | 比亚迪、吉利、长城、哈弗、欧拉、岚图、极氪、银河、深蓝、启源 |
| 合资/外资 | 特斯拉、宝马、奔驰、奥迪、大众、丰田、本田、日产 |
| 其他 | 小米、华为、问界、仰望、方程豹 |

### 自定义官网

```bash
# 自动匹配官网
bun run car-news-images.ts "零跑A05" "00-草稿/零跑A05"

# 自定义官网 URL
bun run car-news-images.ts "理想L6" "00-草稿/理想L6" --official-url "https://www.lixiang.com/l6"

# 跳过官网采集
bun run car-news-images.ts "特斯拉Model 3" "00-草稿/Model3" --no-official
```

## 工作流全景

```
用户输入: "写一篇零跑A05的文章" / "零跑A05"
  │
  ├─ Step 0: 参数解析 → 提取车型名、确认年份/版本、确定输出目录
  ├─ Step 1: 车型定位 → car-locate.ts 定位 seriesId（多候选时交互消歧）
  ├─ Step 2: 参数采集 → car-specs.ts --no-images 抓参数 → spec-data.json
  ├─ Step 2.5: 官方配图 → car-news-images.ts（官网优先 SPA 支持 → 新闻稿 → 汽车之家兜底）
  ├─ Step 3: 资料补充 → 搜索上市新闻/价格/权益/官方信息（交叉校验参数）
  ├─ Step 4: 图片处理 → webp转png（如有）+ 压缩（>500KB）+ 来源多样性检查
  ├─ Step 5: 写稿 → 按 references/汽车营销-写作风格.md + spec-data.json + sources.md 采用值生成
  ├─ Step 6: 去AI味 → humanizer-zh
  ├─ Step 7: 封面 → cover.ts 实车图裁剪 + 标题文字
  ├─ Step 8: 排版发布 → easy-markdown-to-html + easy-post-to-wechat
  └─ Step 9: 归档 → 移入 01-文章/ + 更新选题库/素材库
```

## 参数说明

| 调用方式 | 示例 |
|---------|------|
| 基础调用 | `/wechat-car-writer 零跑A05` |
| 指定年份/版本 | `/wechat-car-writer "2026款 比亚迪 海豹06 GT"` |
| 指定文章类型 | `/wechat-car-writer 零跑A05 --type 上市新闻` |
| 指定主题 | `/wechat-car-writer 零跑A05 --theme 优雅` |
| 指定主题色 | `/wechat-car-writer 零跑A05 --color 活力橘` |
| 仅生成不发布 | `/wechat-car-writer 零跑A05 --dry-run` |
| 自动发布 | `/wechat-car-writer 零跑A05 --publish` |
| 自定义官网 | `/wechat-car-writer 零跑A05 --official-url "https://www.leapmotor.com/a05"` |
| 跳过官网 | `/wechat-car-writer 零跑A05 --no-official` |

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `<车型名>` | 车型名称（必填），可带品牌/年份 | - |
| `--type <类型>` | 文章类型：上市新闻/车型导购/试驾体验 | `上市新闻` |
| `--theme <主题>` | 排版主题（经典/优雅/简洁） | `经典` |
| `--color <颜色>` | 主题色（11 种预设色或 hex） | `经典蓝` |
| `--publish` | 跳过确认直接发布 | `false` |
| `--dry-run` | 仅生成不发布 | `false` |
| `--official-url <URL>` | 自定义官网 URL | 自动匹配 |
| `--official-min <N>` | 官网图达到 N 张即只用官网素材（跳过新闻稿/汽车之家） | `5` |
| `--no-official` | 跳过官网图片采集 | `false` |

## 输出目录

所有产物统一放在 `00-草稿/{YYYYMMDD_标题简称}/` 目录下：
```
00-草稿/20260812_零跑A05上市/
├── article.md           ← 配图版终稿
├── article.html         ← 公众号兼容 HTML
├── spec-data.json       ← 真实参数矩阵（基准数据源，多版本 values）
├── sources.md           ← 资料来源、图片来源、交叉校验记录 + 文章采用的关键数据（最终口径）
└── images/              ← 官方通稿配图（news-01.jpg）+ 汽车之家回退（car-01.jpg）+ cover.png 封面
```

## 工作流程

### Step 0: 参数解析

从用户消息提取车型名（第一个非选项参数），确定：
- 文章类型（`--type`，默认上市新闻）
- 输出目录 `00-草稿/{YYYYMMDD_标题简称}/`（标题简称取车型名，如 `零跑A05上市`）

同时读取：
- `references/汽车营销-写作风格.md` — 车评文风规范（必读，本 skill 自带，见 `references/`）
- `02-资源/选题库.md` — 检查是否已有此选题（可选，属宿主项目，非本 skill 自带）
- `02-资源/素材库.md` — 搜索相关素材（可选，属宿主项目，非本 skill 自带）

### Step 1: 车型定位

```bash
bun run .agents/skills/wechat-car-writer/scripts/car-locate.ts "<车型名>" --json
```

- 输出候选列表（seriesId + 车系名 + 匹配度）
- **多条候选时**（如 "海豹" 匹配多个车系），用 AskUserQuestion 让用户确认选哪个：
  - 列出候选（seriesId + 名称 + 价格区间）
  - 用户选择后记下 seriesId
- 定位失败时：提示用户补全品牌名或检查拼写

### Step 2: 参数采集

```bash
# 参数采集（汽车之家 getParamConf，权威结构化；--no-images 跳过图片下载）
bun run .agents/skills/wechat-car-writer/scripts/car-specs.ts <seriesId> "00-草稿/{YYYYMMDD_标题简称}" --no-images
```

- 生成 `spec-data.json`（分组参数矩阵 + highlights 聚合摘要）
- **检查 spec-data.json 质量**：
  - `highlights` 关键字段是否齐全（价格/尺寸/续航/动力）；聚合值如 "70 / 90" 表示跨版本区间
  - **多版本参数看 `groups` 里各 item 的 `values` 矩阵**（每个版本一个值，如电机功率 405版70kW / 510版90kW），`value` 仅为第一个版本的值
  - 车型列表 `specs` 是否完整
  - 参数值里带 `●` 前缀（配置标记）写文章时去掉

### Step 2.5: 官方配图采集（三重来源，官网优先）

图片按优先级依次尝试，抓够 15-30 张即停：

```bash
# 1) 官网优先（car-news-images.ts 四级回退：HTML 内嵌 JSON → Crawlee+Puppeteer → crawl4ai → CDP，无水印 4K 大图）
#    注意：--min N 的下载上限 = N×2，建议 --min 15 拿满 30 张官网图
bun run .agents/skills/wechat-car-writer/scripts/car-news-images.ts "<车型名>" "00-草稿/{YYYYMMDD_标题简称}" --min 15

# 2) 官网抓不到/不足 → 新闻稿配图（必应搜索→新浪/IT之家/网易解析，无平台水印）
#    （同上脚本，官网 0 张时自动走新闻稿；不足 min 时自动回退汽车之家）

# 3) 仍不足 → 汽车之家兜底（脚本内自动回退，1200 宽变体约 300KB）
```

- **官网素材足够即停**：官网图下载成功 ≥ `--official-min` 张（默认 **5 张**）时，视为官网素材足够，**自动跳过新闻稿采集和汽车之家回退**——只用官网无水印图，不混入其他来源（实测：理想L8官网185张图直接全量使用，零跑官网15张达标即停）
- **场景图自动过滤**：`car-news-images.ts` 内置 `SCENE_IMAGE_KEYWORDS`（driving/turing/safety/acceleration/road/charging 等路径关键词），自动排除官网营销素材里的"车+风景"场景图（山路驾驶、城市道路、加速测试等），只保留实车图（外观/内饰/空间/座舱）。实测 AITO官网 16 张图分类准确率 100%，汽车之家图库不受影响
- **滚动渲染（懒加载 SPA 关键）**：`car-news-images.ts` 官网采集四级回退——① HTML 内嵌 JSON（理想等，无需浏览器）→ ② **Crawlee+PuppeteerCrawler 滚动渲染（主方案**，`crawlee-fetch.ts`，实测 C16 31 张/理想i8 27 张，Puppeteer 用 `channel:'chrome'` 自动定位系统 Chrome，bun 直接运行 TS，生态契合）→ ③ crawl4ai `scan_full_page` 滚动渲染（备选，自带图片评分，实测 C16 29 张）→ ④ baoyu-fetch CDP（最后兜底，不滚动只能拿首屏）。crawlee+puppeteer 已装到项目 node_modules，crawl4ai 已装到 `.venv`（`car-news-images.ts` 的 `ensurePythonEnv()` 会在无 `.venv` 时自动创建、未装 crawl4ai 时自动 pip 安装，回退链路开箱即用）
- **官网不足时**：官网 < 5 张 → 走新闻稿补充；官网+新闻稿仍不足 `--min` → 汽车之家兜底
- **优先级**：官网（内嵌 JSON 首选 + CDP 回退，最权威无水印）> 新闻稿通稿配图（无平台水印）> 汽车之家（兜底）
- **输出**：
  - `images/` — 官网图（`news-*`，来自官网/新闻稿）+ 汽车之家图（`car-*`），**>500KB 下载时自动压缩并转 jpg**
  - `images-meta.json` — 每张官网图的语义（区块标题/附近文本/alt，**图注工作流主依据**）
  - `sources.md` 图片来源节（新闻稿/回退来源 + 每张图的 URL 与语义）
  - 更新 `spec-data.json` 的 `images` 数组（含 `source` 字段）
- **清理**：官网图足够（≥5 张）时自动不下载低优先级来源的图，避免混合
- **检查**：图片数量 ≥15 张、<500KB、来源记录完整

### Step 3: 资料补充与交叉校验（关键）

用 web 搜索补充以下信息，**与 spec-data.json 交叉校验**：

1. **上市信息**：上市日期、上市地点、官方定位、车系背景（如 "A系列第二款车型"）
2. **价格**：各版型指导价（对照 spec-data.json 的厂商指导价）
3. **权益政策**：限时权益、金融政策、质保（**必须记录截止时间**）
4. **核心卖点**：发布会通稿里的亮点（快充时间、芯片型号、空间数据）

**交叉校验规则（重点）**：
- 汽车之家参数表与新闻稿/发布会数据不一致时，**以官方发布会通稿为准**（通过新闻稿转载获取，通稿源头即官方）
- **官网抓取能力分厂商**（实测 2026-08）：
  - **HTML 内嵌 JSON 可抓**（首选，无需浏览器）：理想 lixiang.com、比亚迪、小鹏等，页面数据以 JSON（`lxCdnUrl`/`__NEXT_DATA__` 等）内嵌在 HTML，直接抓源码→提取数据源 JSON→递归捞图片 URL，一次拿全车型大图（理想L8 实测 185 张 4K 图）
  - **纯 SPA 无内嵌 JSON**：如零跑 leapmotor.com（4KB 空壳）→ `car-news-images.ts` 自动回退 **Crawlee+Puppeteer 滚动渲染**（主方案，`crawlee-fetch.ts`，实测 C16 34 张）→ crawl4ai → baoyu-fetch CDP；再不行才走汽车之家兜底
  - **官网参数一律不抓**（各厂商结构不统一）：参数只用汽车之家 getParamConf + 官方发布会通稿交叉校验
  - 官网车型页用于人工核对关键差异字段（参数库与通稿不一致时，让用户上官网车型页确认）
- 常见差异：车机芯片型号、快充时间口径（如汽车之家"快充30分钟" vs 官方"30%-80%仅16分钟"）、电池容量
- 校验结果记录到 `sources.md`：
  ```
  ## 数据差异记录
  | 字段 | 汽车之家 | 新闻稿/官方 | 采用 |
  |------|---------|-----------|------|
  | 车机芯片 | 8155P | 8295P | 官方（8295P） |
  | 快充时间 | 30分钟 | 30%-80%仅16分钟 | 官方口径 |
  ```
- **回写最终口径**：把采用的数字整理进 `sources.md` 的「文章采用的关键数据」节，**这是写稿的最终数据源之一**（与 spec-data.json 互补，后者提供基准框架）
- **快充/充电时间口径（常见差异）**：参数库的"快充 30 分钟"常是笼统值；官方口径常是"30%-80% 仅 X 分钟"（含 C 倍率与峰值功率）。**写稿必须以官方发布会口径为准，并标注充电区间**
- **拿不到的数据写"官方暂未公布"，严禁编造**

### Step 4: 图片处理

1. **混合来源**：官网（`car-news-images.ts`，HTML 内嵌 JSON → Crawlee+Puppeteer → crawl4ai → CDP 四级回退，最权威无水印）→ 新闻稿通稿配图（`car-news-images.ts`，无平台水印）→ 汽车之家（兜底）；官网/新闻稿不足 15 张时用下一优先级补齐
2. **下载时已自动压缩**：`car-news-images.ts` 对 >500KB 的图用 sharp 自动压缩（1200 宽 q80，仍超则 1000 宽 q65）并转 jpg（微信不支持 webp）——**正常流程无需手动压缩**
3. 特殊情况才手动兜底（如历史遗留大图），用**限定目录压缩脚本**（安全，绝不误伤其他草稿）：
   ```bash
   bun run .agents/skills/wechat-car-writer/scripts/compress-images.ts \
     "00-草稿/{YYYYMMDD_标题简称}"
   ```
   - 只处理指定目录的 `images/`，>500KB 自动压缩并统一转 jpg，跳过已达标图
   - 勿用 baoyu-compress-image 处理单张大图（默认输出 webp 微信不兼容，且 `-f png --keep` 会把原图改名 `_original` 造成文件丢失）
   - 勿用 os.walk/递归扫描全盘压缩——会误伤其他文章草稿的图片
4. 从下载图中挑出 15-30 张质量好的实车图（外观多角度/内饰/细节）；**图注以 `images-meta.json` 的语义字段为准**（官网区块标题 + 附近文本 + alt），**不要依赖模型读图**（多数模型不支持图片输入，Read 图片会失败）
   - 若下载图不足 15 张：用 `baoyu-url-to-markdown` 抓取懂车帝图库页补充下载
5. **注意图片来源多样性**：新闻稿配图来自多站点（新浪/IT之家/网易），图注时注意不同源的图片风格差异

### Step 5: 写稿

**读取 `references/汽车营销-写作风格.md`**（本 skill 自带，见 `references/` 目录），按其中规范写作：
- 标题：车型 + 上市动作 + 价格锚点 + 1-2 个核心卖点
- **正文不写开头 H1**：公众号推文标题由发布环节 `--title` 单独控制，正文开头不要再写 `# 标题`（避免推文标题与正文大标题重复）。`article.md` 第一行直接是正文段落或 `##` 小节标题
- 结构：直入开头 → 价格 → 定位 → 核心参数（表格+解读）→ 权益 → 结尾
- **参数真实性（核心，双数据源）**：
  - **基准**：基础框架参数（尺寸/轴距/价格/动力/续航/配置）从 `spec-data.json` 的 `highlights` 与 `groups` 读取，禁止凭记忆写数字
  - **多版本差异看 `groups` 里 item 的 `values` 矩阵**（每个版本一个值），正文按版本分别表述；`highlights` 聚合值如 "70 / 90" 是跨版本区间，不要照抄成单值
  - **最终口径**：核心卖点数字（快充时间、芯片型号、得房率、空间/安全数据等）以 Step 3 交叉校验后写入 `sources.md` 的「文章采用的关键数据」为准
- 参数呈现用表格 + 白话解读双轨
- 遵守合规红线（工况标注、禁极限词、权益截止时间、充电区间口径）
- 初稿保存为 `00-草稿/{YYYYMMDD_标题简称}/article-raw.md`
- **配图注前必须确认图片内容**：优先读 `images-meta.json`（`file` → 语义字段：官网区块标题/附近文本/alt）确认每张图是外观/内饰/细节、哪个角度；**不要用 Read 直接读图**（多数模型不支持图片输入会失败），也不要凭文件名猜内容。若模型支持读图（如 Claude），可再用 Read 抽查确认
- 图片引用用 `![图注](images/car-01.jpg)` 插入对应位置

### Step 6: 去 AI 味

调用 `humanizer-zh` 处理 article-raw.md → `article.md`：
- 压掉形容词堆砌、AI 高频词、排比句
- 保留真实参数不动（只改表达，不改数据）

### Step 7: 封面图

封面用**实车高清图**（不用 AI 生图），用 `cover.ts` 脚本一键生成：

```bash
bun run .agents/skills/wechat-car-writer/scripts/cover.ts \
  "00-草稿/{YYYYMMDD_标题简称}/images/car-01.jpg" \
  --title "{文章标题}" \
  --subtitle "6.39万元起 · CLTC续航405km/510km"
```

1. 从 `images/` 挑一张最出彩的外观图（正面或 45° 角；先看 `images-meta.json` 语义确认是前脸/外观图，模型支持读图时可 Read 抽查）
2. 脚本自动裁剪为 2.35:1（公众号封面，默认）或 `--ratio 1:1`，叠加标题/副标题文字，输出 `images/cover.png`（必须 PNG）
3. 标题较长时脚本自适应缩字号；生成后检查文字是否完整、不被图片遮挡（模型不支持读图时，用 PIL 检查尺寸/坐标即可，文字完整性发布前让用户在草稿箱预览确认）
4. 封面 >500KB 时用 `compress-images.ts` 压缩（会转 jpg，发布时 `--thumb` 路径同步改为 `cover.jpg`）

### Step 8: 排版发布

```bash
# 转 HTML
bun run .agents/skills/easy-markdown-to-html/scripts/main.ts \
  "00-草稿/{YYYYMMDD_标题简称}/article.md" \
  --theme {theme} --color {color}

# 发布到草稿箱（外发操作，发布前先与用户确认标题/摘要/封面）
# 注意：封面若经 compress-images.ts 压缩会变成 cover.jpg，--thumb 路径随之调整
bun run .agents/skills/easy-post-to-wechat/scripts/main.ts \
  "00-草稿/{YYYYMMDD_标题简称}/article.html" \
  --thumb "00-草稿/{YYYYMMDD_标题简称}/images/cover.png" \
  --title "{文章标题}"
```

**发布前检查正文无 H1**：公众号推文标题由发布 `--title` 单独控制，正文不应再有 `<h1>` 一级标题（避免与推文标题重复）。若 `article.md` 开头误留 `# 标题`（如早期草稿），发布前删掉该行并重新转 HTML。

发布前确认：标题、摘要、封面、图片数量。默认交互确认，`--publish` 跳过。

### Step 9: 归档（可选）

发布成功后提示用户归档：
1. 移入 `01-文章/YYYYMMDD_标题简称/`，article.md 图片路径改为 `images/`
2. 更新 `02-资源/选题库.md`（选题移至"已发布"）
3. 更新 `02-资源/素材库.md`（提炼一条可复用素材）

## 合规红线（写作时强制执行）

| 规则 | 要求 |
|------|------|
| 工况标注 | 续航/油耗/电耗必须带 CLTC/NEDC/WLTC 标注 |
| 充电时间口径 | 快充必须注明充电区间（如"30%-80% 仅16分钟"），以官方发布会口径为准 |
| 价格口径 | 注明"指导价/上市价"，区分权益价 |
| 禁极限词 | 最/第一/唯一/绝无仅有等（除非官方口径且加引号） |
| 权益截止时间 | 限时权益必须写截止时间 |
| 数据来源 | 引用第三方数据注明来源 |
| 不确定数据 | 写"官方暂未公布"，不编造 |

## 数据源说明

| 数据 | 来源 | 接口 |
|------|------|------|
| 品牌/车系定位 | 汽车之家 | `AsLeftMenu/As_LeftListNew.ashx`（GBK） |
| 车型参数 | 汽车之家 | `car-web-api.autohome.com.cn/car/param/getParamConf`（UTF-8 JSON，全车型 values 矩阵） |
| 官方通稿配图（主源） | 官网/新浪/IT之家/网易 | `car-news-images.ts` 官网四级回退（内嵌JSON→Crawlee+Puppeteer→crawl4ai→CDP）+ 必应搜索→站点解析→下载（无平台水印） |
| 汽车之家图片（回退） | 汽车之家 | `car.m.autohome.com.cn/pic/getpiclist`（分页抓取，1200宽变体约150-300KB，带水印） |
| 上市新闻/权益 | web 搜索 | 懂车帝/新浪汽车/IT之家/易车（转载发布会通稿） |
| 交叉校验 | 官方发布会通稿 | 通过新闻稿转载获取，优先于聚合平台数据；校验后的采用值回写 `sources.md`；官网参数结构不统一不自动化抓取，仅人工核对 |

> 注意：以上接口为公开页面接口，可能随网站改版变动。脚本解析失败时检查接口返回结构。

## 注意事项

- 本技能是**编排器**，调度已有子技能 + 自带 5 个数据脚本（`car-locate.ts` / `car-specs.ts` / `car-news-images.ts` / `cover.ts` / `compress-images.ts`）
- **参数真实性是生命线**：数字来自 spec-data.json（基准）+ sources.md「文章采用的关键数据」（最终口径），交叉校验后采用
- **图片主源为官方通稿配图**（`car-news-images.ts`，无平台水印），不足时回退汽车之家（sources.md 标注来源）；**图注以 `images-meta.json` 语义字段为准**（弥补模型不能读图），模型支持读图时可再 Read 抽查
- **注意图片来源多样性**：新闻稿配图来自多站点（新浪/IT之家/网易），不同源的图片风格和尺寸可能不同
- 图片用真实车图，不用 AI 生图画车（AI 画车必翻车）
- 微信不支持 webp：所有图片发布前必须转 jpg（`car-news-images.ts` 下载时自动处理；`compress-images.ts` 兜底）
- 车型名歧义（海豹 vs 海豹06 vs 海豹07）必须让用户确认
- 上市新闻型 1200-2000 字；配图 15-30 张
- `humanizer-zh` 必做（汽车营销文最怕 AI 味）
