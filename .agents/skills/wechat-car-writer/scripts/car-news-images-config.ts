#!/usr/bin/env bun
/**
 * car-news-images-config.ts — car-news-images.ts 的常量配置
 *
 * 单独管理采集脚本的全部常量：请求头、域名白名单、过滤关键词、
 * 图片尺寸阈值、场景图关键词、品牌/车型官网 URL 映射。
 *
 * 维护提示：
 *   - 品牌官网 URL（OFFICIAL_SITES）与车型官网 URL（OFFICIAL_MODEL_SITES）
 *     的权威清单见 `../references/汽车官网车型页地址库.md`（2026-08 实测验证）。
 *   - 新增/失效车型先查该清单再改本文件映射。
 */

import { join } from "path";

// ─── 请求头 ─────────────────────────────────────────────────────────────────────

export const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://www.bing.com/",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

// ─── 域名白名单 ─────────────────────────────────────────────────────────────────
// 优先从这些站点抓取新闻稿配图（新浪/IT之家/网易有专门解析器，其余走通用解析）

export const DOMAIN_WHITELIST = [
  // 汽车垂直
  "autohome.com.cn",
  "www.autohome.com.cn",
  "www.che168.com",
  "www.dongchedi.com",
  "www.pcauto.com.cn",
  "yiche.com",
  "news.yiche.com",
  "www.xcar.com.cn",
  "www.icauto.com.cn",
  "www.cheyun.com",
  "www.d1ev.com", // 第一电动
  "gasgoo.com", // 盖世汽车
  // 门户汽车
  "auto.sina.com.cn",
  "finance.sina.com.cn",
  "k.sina.com.cn",
  "auto.163.com",
  "m.163.com",
  "www.163.com",
  "auto.sohu.com",
  "www.sohu.com",
  "auto.qq.com",
  "new.qq.com",
  "auto.ifeng.com",
  // 科技/资讯
  "www.ithome.com",
  "m.ithome.com",
  "36kr.com",
  "www.huxiu.com",
  "www.kuaikeji.com", // 快科技
  "www.techweb.com.cn",
  // 其他
  "auto.cnr.cn",
  "auto.cri.cn",
  "cnautonews.com",
  "www.autoreport.cn",
];

// ─── 新浪图片过滤关键词（logo/分享层/水印） ─────────────────────────────────────

export const SINA_FILTER_KEYWORDS = [
  "efade7fd",
  "auto_qr",
  "layersina",
  "layerweibo",
  "layerauto",
  "layerxny",
  "removebg_",
  "share_",
  "logo",
  "icon",
  "avatar",
];

// ─── 排除的图片关键词（logo、图标、二维码等） ──────────────────────────────────

export const EXCLUDE_IMAGE_KEYWORDS = [
  "logo",
  "icon",
  "qr",
  "qrcode",
  "二维码",
  "分享",
  "share",
  "weibo",
  "weixin",
  "微信",
  "微博",
  "topbar",
  "footer",
  "header",
  "nav",
  "menu",
  "placeholder",
  "loading",
  "blank",
  "pixel",
  "tracker",
  "analytics",
  "sprite",
  "btn",
  "button",
];

// ─── 图片尺寸阈值 ───────────────────────────────────────────────────────────────

export const MIN_IMAGE_SIZE = 50 * 1024; // <50KB 过滤缩略图/坏图
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // >10MB 跳过（异常大图）
export const TARGET_IMAGE_SIZE = 500 * 1024; // 下载后压缩目标：>500KB 即压缩（微信加载要求）
export const DELAY_MS = 200; // 礼貌限速

// ─── Python venv / crawl4ai 环境准备（方案 D 用） ──────────────────────────────
// 目标：无 venv 自动创建，未装 crawl4ai 自动 pip 安装，让回退链路开箱即用。

export const PY_SCRIPT = join(process.cwd(), ".agents/skills/wechat-car-writer/scripts/crawl4ai-fetch.py");

// ─── 场景图排除关键词 ───────────────────────────────────────────────────────────
// 车企官网（尤其 AITO/问界、零跑等）的营销素材里混有大量"车+风景"场景图：
// 山路驾驶、城市道路、雪地越野、充电演示、加速测试等。这类图车占比小、
// 以风景/场景为主体，不适合作为车型配图。而实车图（外观/内饰/细节/颜色）
// 通常路径含 exterior/interior/space/cockpit/hero/overview 等。
//
// 注意：这里只用"排除式"关键词（明确是场景/功能演示），不用"保留式"，
// 因为各官网 URL 命名差异大（理想用 hash、AITO 用语义路径），
// 只排除明确的场景特征词，避免误杀不同站点的实车图。

export const SCENE_IMAGE_KEYWORDS = [
  // 驾驶/道路场景
  "driving",
  "driver",
  "drive-",
  "road",
  "highway",
  "freeway",
  "city-drive",
  "urban",
  "street",
  "traffic",
  "overtaking",
  "lane",
  // 越野/地形场景
  "offroad",
  "off-road",
  "terrain",
  "mountain",
  "snow",
  "desert",
  "mud",
  "gravel",
  "trail",
  // 功能演示/测试
  "acceleration",
  "0-100",
  "braking",
  "brake",
  "test",
  "testing",
  "range-extension",
  "battery-life",
  "charging",
  "charge-",
  "charging-station",
  "energy",
  // 智驾/安全演示
  "turing",
  "ads-",
  "ads4",
  "safety",
  "collision",
  "aeb",
  "parking",
  "valet",
  "nca",
  "noa",
  "navigation",
  // 场景/背景图
  "landscape",
  "scenery",
  "scene",
  "scenic",
  "background-scene",
  "camping",
  "travel",
  "trip",
  "family-life",
  "lifestyle",
];

// ─── 品牌官网 URL 映射（覆盖主流品牌，2026-08 实测验证） ───────────────────────

export const OFFICIAL_SITES: Record<string, string> = {
  // 新势力
  "零跑": "https://cn.leapmotor.com/",
  "小鹏": "https://www.xiaopeng.com/",
  "蔚来": "https://www.nio.cn/",
  "理想": "https://www.lixiang.com/",
  "哪吒": "https://www.hozonauto.com/",
  "高合": "https://www.hiphi.cn/",
  "极狐": "https://www.arcfox.com.cn/",
  "飞凡": "https://www.risingauto.com/",
  "智己": "https://www.immotors.com/",
  "阿维塔": "https://www.avatr.com/",
  "极石": "https://www.roxmotor.com/",
  "创维": "https://www.skyworthev.com/",

  // 传统车企新能源
  "比亚迪": "https://www.byd.com/cn",
  "腾势": "https://www.denza.com/",
  "吉利": "https://www.geely.com/",
  "长城": "https://www.gwm.com.cn/",
  "魏牌": "https://www.wey.com/",
  "坦克": "https://www.tanksuv.com/",
  "哈弗": "https://www.haval.com.cn/",
  "欧拉": "https://www.oraev.com/",
  "岚图": "https://www.voyah.com.cn/",
  "极氪": "https://www.zeekrlife.com/",
  "银河": "https://www.galaxy-geely.com/",
  "深蓝": "https://www.deepal.com.cn/",
  "启源": "https://www.changan.com.cn/qiyuan/",

  // 传统自主品牌（2026-08-15 新增，全部 curl 实测 200）
  "奇瑞": "https://www.chery.cn/",
  "风云": "https://fulwin.chery.cn/", // 奇瑞风云独立子站（非 chery.cn 子路径）
  "星途": "https://www.exeedcars.com/", // 注意不是 exeed.cn
  "捷途": "https://www.jetour.com.cn/",
  "iCAR": "https://www.icarglobal.com/zh/",
  "凯翼": "https://www.kaiyihome.com/",
  "红旗": "https://hongqi.faw.cn/", // faw-hongqi.com.cn 是域名停放页勿用
  "风神": "https://www.dfpv.com.cn/", // 东风风神
  "奕派": "https://www.yipai.com.cn/", // 东风奕派
  "纳米": "https://www.dna-nev.com.cn/", // 东风纳米（与奕派同套前端）
  "风行": "https://www.fxauto.com.cn/", // 东风风行
  "猛士": "https://www.m-hero.com/", // mhero.com（无连字符）是停靠域名勿用
  "长安": "https://www.changan.com.cn/",
  "传祺": "https://www.gacmotor.com/", // 广汽传祺（trumpchi.gacmotor.com 已废弃）
  "广汽传祺": "https://www.gacmotor.com/",
  "埃安": "https://www.aion.com.cn/", // 广汽埃安（gacne.com.cn 301 跳转至此）
  "广汽埃安": "https://www.aion.com.cn/",
  "昊铂": "https://www.hyptec.com/", // 广汽旗下高端品牌（hyper.com.cn 301 跳转）
  "荣威": "https://www.roewe.com.cn/",
  "名爵": "https://www.saicmg.com/", // mgmotor.com.cn 已失效
  "五菱": "https://www.wuling.com/",
  "宝骏": "https://www.wuling.com/baojun", // 宝骏无独立域名，挂在五菱站下
  "北京汽车": "https://www.beijingauto.com.cn/", // baicmotor.com 是集团官网无实车图
  "奔腾": "https://benteng.faw.cn/", // bentengauto.com 已被博彩站劫持勿用
  "领克": "https://www.lynkco.com.cn/", // lynkco.com 301 跳转至此

  // 合资/外资
  "特斯拉": "https://www.tesla.cn/",
  "宝马": "https://www.bmw.com.cn/",
  "奔驰": "https://www.mercedes-benz.com.cn/",
  "奥迪": "https://www.audi.cn/",
  "大众": "https://www.vw.com.cn/",
  "丰田": "https://www.gac-toyota.com.cn/",
  "本田": "https://www.ghac.cn/",
  "日产": "https://www.dongfeng-nissan.com.cn/",

  // 其他
  "小米": "https://www.xiaomiev.com/",
  "问界": "https://aito.auto/",
  "华为": "https://hima.auto/",
  "仰望": "https://www.yangwangauto.com/",
  "方程豹": "https://www.fangchengbao.com/",
};

// ─── 车型级别官网 URL 映射（优先级高于品牌根页面） ─────────────────────────────
// 当车型名匹配时，使用具体的子页面 URL 而不是品牌首页
// 2026-08 实测验证：所有 URL 均返回 200（SPA 壳页面用 curl 亦可访问，采集时走无头浏览器）

export const OFFICIAL_MODEL_SITES: Record<string, string> = {
  // 岚图
  "梦想家": "https://www.voyah.com.cn/newDreamer26.html",
  "岚图知音": "https://www.voyah.com.cn/newCourage.html",
  "岚图FREE": "https://www.voyah.com.cn/free+.html",
  "岚图追光": "https://www.voyah.com.cn/passion.html",
  // 理想
  "理想L6": "https://www.lixiang.com/L6",
  "理想L8": "https://www.lixiang.com/L8",
  "理想L9": "https://www.lixiang.com/L9",
  "理想MEGA": "https://www.lixiang.com/mega",
  "理想i6": "https://www.lixiang.com/i6",
  "理想i8": "https://www.lixiang.com/i8",
  // 方程豹（品牌根页为 SPA 首页无实车图，车型页才有）
  "豹5": "https://www.fangchengbao.com/bao5",
  "豹8": "https://www.fangchengbao.com/bao8",
  "钛3": "https://www.fangchengbao.com/tai3",
  "钛7": "https://www.fangchengbao.com/tai7",
  // 比亚迪（王朝+海洋）
  "汉L": "https://www.byd.com/cn/dynasty-home/models/han/han-l-ev",
  "唐L": "https://www.byd.com/cn/dynasty-home/models/tang/tang-l-ev",
  "秦L": "https://www.byd.com/cn/dynasty-home/models/qin/qin-l-ev",
  "比亚迪夏": "https://www.byd.com/cn/dynasty-home/models/xia/26-xia",
  "宋Ultra": "https://www.byd.com/cn/dynasty-home/models/song/song-Ultra-DM-i",
  "海豹08": "https://www.byd.com/cn/ocean-home/models/haibao/haibao-08-EV",
  "海豹06": "https://www.byd.com/cn/ocean-home/models/haibao/26-haibao-06-GT",
  "海狮06": "https://www.byd.com/cn/ocean-home/models/haishi/26-haishi-06-DM-i",
  "海鸥": "https://www.byd.com/cn/ocean-home/models/haiou/26-haiou",
  // 王朝/海洋系列首页（兜底：匹配到系列名但未命中具体车型时使用）
  "王朝": "https://www.byd.com/cn/dynasty-home",
  "海洋": "https://www.byd.com/cn/ocean-home",
  // 腾势（独立官网 denza.com，比亚迪全资子品牌）
  "腾势D9": "https://www.denza.com/cn/product-detail/d9",
  "腾势N7": "https://www.denza.com/cn/product-detail/n7",
  "腾势N8L": "https://www.denza.com/cn/product-detail/n8l",
  "腾势N9": "https://www.denza.com/cn/product-detail/n9",
  "腾势Z9GT": "https://www.denza.com/cn/product-detail/z9gt",
  "腾势Z9": "https://www.denza.com/cn/product-detail/z9",
  // 吉利（各车型独立子域）
  "星瑞": "https://preface.geely.com/preface",
  "星越L": "https://xingyue.geely.com/xingyuel",
  "吉利星愿": "https://xy.geely.com/jlxy",
  "ICON": "https://icon.geely.com/icon",
  "帝豪": "https://dh.geely.com/SS21",
  "博越": "https://boyue.geely.com/quanxinboyue",
  "豪越L": "https://haoyue.geely.com/hyl3",
  "缤越": "https://binyue.geely.com/byl",
  // 魏牌
  "蓝山": "https://www.wey.com/lanshan-new.html",
  "魏牌V8X": "https://www.wey.com/V8X.html",
  "魏牌V9X": "https://www.wey.com/V9X.html",
  "高山": "https://www.wey.com/gaoshan.html",
  "摩卡": "https://www.wey.com/mocca.html",
  // 坦克
  "坦克300": "https://www.tanksuv.com/tank300-new.html",
  "坦克400": "https://www.tanksuv.com/tank400-h.html",
  "坦克500": "https://www.tanksuv.com/tank500-h.html",
  "坦克700": "https://www.tanksuv.com/tank700.html",
  // 哈弗
  "哈弗H10": "https://www.haval.com.cn/h10/",
  "哈弗猛龙": "https://www.haval.com.cn/menglong/",
  "枭龙MAX": "https://www.haval.com.cn/xiaolongmax/",
  "哈弗H9": "https://www.haval.com.cn/h9/",
  "哈弗H6L": "https://www.haval.com.cn/h6l/",
  "哈弗H6": "https://www.haval.com.cn/newh6/",
  "哈弗H5": "https://www.haval.com.cn/h5/",
  "大狗": "https://www.haval.com.cn/dgplus/",
  // 欧拉
  "欧拉好猫": "https://www.oraev.com/haomao.html",
  "闪电猫": "https://www.oraev.com/EC24.html",
  "芭蕾猫": "https://www.oraev.com/ES13.html",
  // 极氪（SPA 壳，采集走无头浏览器）
  "极氪001": "https://www.zeekrlife.com/zh-cn/zeekr001",
  "极氪007": "https://www.zeekrlife.com/zh-cn/zeekr007",
  "极氪009": "https://www.zeekrlife.com/zh-cn/zeekr009",
  "极氪7X": "https://www.zeekrlife.com/zh-cn/zeekr7x",
  "极氪MIX": "https://www.zeekrlife.com/zh-cn/zeekrmix",
  // 吉利银河
  "银河E8": "https://www.galaxy-geely.com/E8",
  "银河E5": "https://www.galaxy-geely.com/E5",
  "银河M7": "https://www.galaxy-geely.com/M7",
  "银河星耀7": "https://www.galaxy-geely.com/xingyao7",
  "银河星愿": "https://www.galaxy-geely.com/xingyuan",
  "翼真L380": "https://www.galaxy-geely.com/L380",
  // 深蓝（SPA 壳，采集走无头浏览器）
  "深蓝SL03": "https://www.deepal.com.cn/SL03",
  "深蓝S05": "https://www.deepal.com.cn/S05",
  "深蓝S07": "https://www.deepal.com.cn/S07",
  "深蓝S09": "https://www.deepal.com.cn/S09",
  "深蓝L07": "https://www.deepal.com.cn/L07",
  "深蓝G318": "https://www.deepal.com.cn/G318",
  // 启源（无独立车型页，用品牌页兜底）
  "启源": "https://www.changan.com.cn/qiyuan/",
  // 零跑
  "零跑D99": "https://cn.leapmotor.com/D99.html",
  "零跑D19": "https://cn.leapmotor.com/D19.html",
  "零跑A10": "https://cn.leapmotor.com/A10.html",
  "零跑B01": "https://cn.leapmotor.com/B01-selling.html",
  "零跑B10": "https://cn.leapmotor.com/B10-intelligent.html",
  "零跑C16": "https://cn.leapmotor.com/C16.html",
  "零跑C11": "https://cn.leapmotor.com/C11.html",
  "零跑C10": "https://cn.leapmotor.com/C10.html",
  "零跑C01": "https://cn.leapmotor.com/C01-aggregation.html",
  "零跑T03": "https://cn.leapmotor.com/T03-polymerization.html",
  // 小鹏
  "小鹏G9L": "https://www.xiaopeng.com/g9l.html",
  "小鹏L03": "https://www.xiaopeng.com/l03.html",
  "小鹏GX": "https://www.xiaopeng.com/gx.html",
  "小鹏M03": "https://www.xiaopeng.com/m03.html",
  "小鹏P7+": "https://www.xiaopeng.com/p7_plus_2026.html",
  "小鹏G6": "https://www.xiaopeng.com/g6_2026.html",
  "小鹏G7": "https://www.xiaopeng.com/g7_2026.html",
  "小鹏G9": "https://www.xiaopeng.com/g9_2026.html",
  "小鹏X9": "https://www.xiaopeng.com/x9_2026.html",
  // 蔚来
  "蔚来ES9": "https://www.nio.cn/es9",
  "蔚来ES8": "https://www.nio.cn/es8",
  "蔚来ES6": "https://www.nio.cn/es6",
  "蔚来EC6": "https://www.nio.cn/ec6",
  "蔚来ET9": "https://www.nio.cn/et9",
  "蔚来ET5": "https://www.nio.cn/et5",
  // 哪吒
  "哪吒S猎装": "https://www.hozonauto.com/s-liezhuang.html",
  "哪吒L": "https://www.hozonauto.com/l.html",
  "哪吒X": "https://www.hozonauto.com/x.html",
  "哪吒S": "https://www.hozonauto.com/s.html",
  "哪吒AYA": "https://www.hozonauto.com/aya.html",
  "哪吒GT": "https://www.hozonauto.com/gt.html",
  // 高合
  "HiPhiA": "https://www.hiphi.cn/hiphia.html",
  "HiPhiX": "https://www.hiphi.cn/hiphix.html",
  "HiPhiY": "https://www.hiphi.cn/hiphiy.html",
  "HiPhiZ": "https://www.hiphi.cn/hiphiz.html",
  // 极狐
  "极狐V9": "https://www.arcfox.com.cn/V9/index.html",
  "极狐T1": "https://www.arcfox.com.cn/T1/index.html",
  "极狐S3": "https://www.arcfox.com.cn/S3/index.html",
  "阿尔法S5": "https://www.arcfox.com.cn/NewS5/index.html",
  "阿尔法T5": "https://www.arcfox.com.cn/T5/index.html",
  "阿尔法S6": "https://www.arcfox.com.cn/S6/index.html",
  "阿尔法T6": "https://www.arcfox.com.cn/T6/index.html",
  "考拉S": "https://www.arcfox.com.cn/kaolaS/index.html",
  // 飞凡
  "飞凡R7": "https://www.risingauto.com/r7/",
  "飞凡RC7": "https://www.risingauto.com/rc7/",
  "飞凡F7": "https://www.risingauto.com/f7/",
  // 智己
  "智己LS9": "https://www.immotors.com/website/ls9_detail",
  "智己LS8": "https://www.immotors.com/website/ls8_detail",
  "智己LS6": "https://www.immotors.com/website/ls6_detail",
  "智己L6": "https://www.immotors.com/website/l6_detail",
  "智己LS7": "https://www.immotors.com/website/ls7_detail",
  "智己L7": "https://www.immotors.com/website/l7_detail",
  // 阿维塔
  "阿维塔07L": "https://www.avatr.com/07L",
  "阿维塔06T": "https://www.avatr.com/06T",
  "阿维塔07": "https://www.avatr.com/07",
  "阿维塔06": "https://www.avatr.com/06",
  "阿维塔11": "https://www.avatr.com/11",
  "阿维塔12": "https://www.avatr.com/12",
  // 极石
  "极石ADAMAS": "https://www.roxmotor.com/adamas/",
  "极石01": "https://www.roxmotor.com/rox01/",
  // 创维
  "创维EV6": "https://www.skyworthev.com/ev6",
  "创维HT-i": "https://www.skyworthev.com/HTi",
  "创维HT-iII": "https://www.skyworthev.com/HTi2",
  // 特斯拉（中国官网仅 Model 3/Y）
  "Model3": "https://www.tesla.cn/model3",
  "ModelY": "https://www.tesla.cn/modely",
  // 宝马
  "宝马i3": "https://www.bmw.com.cn/zh/all-models/bmw-i/i3/2026/inspire.html",
  "宝马i5": "https://www.bmw.com.cn/zh/all-models/bmw-i/i5/2024/inspire.html",
  "宝马X3": "https://www.bmw.com.cn/zh/all-models/x-series/X3/2024/inspire.html",
  // 奔驰
  "奔驰EQE": "https://www.mercedes-benz.com.cn/vehicles/eq/eqe.html",
  "EQE纯电SUV": "https://www.mercedes-benz.com.cn/vehicles/eq/EQE-SUV.html",
  "奔驰EQA": "https://www.mercedes-benz.com.cn/vehicles/eq/eqa-suv.html",
  "奔驰C级": "https://www.mercedes-benz.com.cn/vehicles/sedan/c-class-l.html",
  // 奥迪
  "奥迪A4L": "https://www.audi.cn/zh/models/a/a4/a4l.html",
  "奥迪A6L": "https://www.audi.cn/zh/models/a/a6/a6l.html",
  "奥迪Q5L": "https://www.audichina.cn/zh/models/q/q5/new_q5l.html",
  "奥迪Q5e-tron": "https://www.audichina.cn/zh/models/q/q5/q5-etron.html",
  // 丰田（车型页在广汽丰田子站）
  "凯美瑞": "https://www.gac-toyota.com.cn/vehicles/newcamry",
  "汉兰达": "https://www.gac-toyota.com.cn/vehicles/newhighlander",
  "铂智3X": "https://www.gac-toyota.com.cn/vehicles/bozhi3X",
  "赛那": "https://www.gac-toyota.com.cn/vehicles/sienna",
  // 本田
  "雅阁": "https://www.ghac.cn/vehicles/accord",
  "皓影": "https://www.ghac.cn/vehicles/breeze",
  "CR-V": "https://www.dongfeng-honda.com/cr-v/",
  // 日产
  "天籁": "https://www.dongfeng-nissan.com.cn/car/altima/",
  "轩逸": "https://www.dongfeng-nissan.com.cn/car/sylphy-15th",
  "ARIYA": "https://ariya.dongfeng-nissan.com.cn/",
  // 小米
  "小米SU7": "https://www.xiaomiev.com/su7",
  "小米YU7": "https://www.xiaomiev.com/yu7",
  "SU7Ultra": "https://www.xiaomiev.com/ultra",
  "澎程N90": "https://www.xiaomiev.com/skynomad/n90",
  "澎程N70": "https://www.xiaomiev.com/skynomad/n70",
  // 问界
  "问界M5": "https://aito.auto/model/m5-new/",
  "问界M6": "https://aito.auto/model/m6/",
  "问界M7": "https://aito.auto/model/m7-new/",
  "问界M8": "https://aito.auto/model/m8",
  "问界M9": "https://aito.auto/model/m9-new/",
  // 鸿蒙智行（华为）
  "智界S7": "https://hima.auto/zhijie/s7/",
  "智界R7": "https://hima.auto/zhijie/r7/",
  "智界V9": "https://hima.auto/zhijie/v9/",
  "享界S9": "https://hima.auto/xiangjie/s9/",
  "享界S9T": "https://hima.auto/xiangjie/s9t/",
  "尊界S800": "https://hima.auto/zunjie/s800/",
  "尊界V800": "https://hima.auto/zunjie/v800/",
  "尚界Z7": "https://hima.auto/shangjie/z7-z7t/",
  "尚界H5": "https://hima.auto/shangjie/h5/",
  // 仰望
  "仰望U7": "https://www.yangwangauto.com/u7-detail-page.html",
  "仰望U8": "https://www.yangwangauto.com/u8",
  "仰望U8L": "https://www.yangwangauto.com/c-u8-l.html",
  "仰望U9": "https://www.yangwangauto.com/u9-detail-page.html",
  "仰望U9X": "https://www.yangwangauto.com/u9x-detail-page.html",

  // ─── 传统自主品牌车型（2026-08-15 新增，全部 curl 实测 200） ───────────────
  // 匹配规则：同一品牌的"具体型号"键必须排在"兜底键"之前（includes 首匹配即 break）
  // 跨品牌可能撞车的短键必须加品牌前缀（如 红旗H5 防抢哈弗H5、传祺M6/M8 防抢问界M6/M8、
  //   传祺E8 防抢银河E8、荣威i5 防抢宝马i5、北京X7 防抢捷途X70系、风行M7 防抢问界M7/银河M7、
  //   凯翼X3 防抢风云X3、宝骏E6 防抢其他 E6）

  // 奇瑞（chery.cn/vehicles/）
  "瑞虎9X": "https://www.chery.cn/vehicles/tiggo9x/",
  "瑞虎9CDM": "https://www.chery.cn/vehicles/tiggo9cdm/",
  "瑞虎9C-DM": "https://www.chery.cn/vehicles/tiggo9cdm/",
  "瑞虎9": "https://www.chery.cn/vehicles/tiggo9/",
  "瑞虎8PLUS": "https://www.chery.cn/vehicles/tiggo8plusnew/",
  "瑞虎8PRO": "https://www.chery.cn/vehicles/tiggo8prochampion/",
  "瑞虎8虎款": "https://www.chery.cn/vehicles/tiggo8tiger/",
  "瑞虎8豹款": "https://www.chery.cn/vehicles/tiggo8leopard/",
  "瑞虎8卓越": "https://www.chery.cn/vehicles/tiggo8zhuoyue/",
  "瑞虎8": "https://www.chery.cn/vehicles/tiggo8tiger/",
  "瑞虎7L": "https://www.chery.cn/vehicles/tiggo7l/",
  "瑞虎7PLUS": "https://www.chery.cn/vehicles/tiggo7plusnew/",
  "瑞虎7高能": "https://www.chery.cn/vehicles/tiggo7gaoneng/",
  "瑞虎7": "https://www.chery.cn/vehicles/tiggo7new/",
  "瑞虎5运动": "https://www.chery.cn/vehicles/tiggo5yundong/",
  "瑞虎5x高能": "https://www.chery.cn/vehicles/tiggo5xgaoneng/",
  "瑞虎5x卓越": "https://www.chery.cn/vehicles/tiggo5xzhuoyue/",
  "瑞虎5x": "https://www.chery.cn/vehicles/tiggo5xgaoneng/",
  "瑞虎5": "https://www.chery.cn/vehicles/tiggo5yundong/",
  "瑞虎3x": "https://www.chery.cn/vehicles/tiggo3xnew/",
  "艾瑞泽8PRO": "https://www.chery.cn/vehicles/arrizo8pro/",
  "艾瑞泽8": "https://www.chery.cn/vehicles/arrizo8/",
  "艾瑞泽5": "https://www.chery.cn/vehicles/arrizo5/",

  // 风云（fulwin.chery.cn/vehicles/，奇瑞风云独立子站）
  "风云A9L": "https://fulwin.chery.cn/vehicles/a9l/",
  "风云A9": "https://fulwin.chery.cn/vehicles/a9/",
  "风云A8L": "https://fulwin.chery.cn/vehicles/a8l/",
  "风云T9L": "https://fulwin.chery.cn/vehicles/t9l/",
  "风云T9超长续航": "https://fulwin.chery.cn/vehicles/t9longrange/",
  "风云T9": "https://fulwin.chery.cn/vehicles/t9/",
  "风云T11": "https://fulwin.chery.cn/vehicles/t11/",
  "风云T10": "https://fulwin.chery.cn/vehicles/t10/",
  "风云T8": "https://fulwin.chery.cn/vehicles/t8/",
  "风云T7": "https://fulwin.chery.cn/vehicles/t7/",
  "风云X3L": "https://fulwin.chery.cn/vehicles/x3l/",
  "风云X3PLUS": "https://fulwin.chery.cn/vehicles/x3plus/",
  "风云X3": "https://fulwin.chery.cn/vehicles/x3/",

  // QQ 子站（qq.chery.cn/vehicles/，奇瑞QQ 独立子站）
  "小蚂蚁": "https://qq.chery.cn/vehicles/xiaomayi/",
  "QQ冰淇淋": "https://qq.chery.cn/vehicles/bingqilin/",
  "QQ多米": "https://qq.chery.cn/vehicles/duomi/",
  "全新QQ3": "https://qq.chery.cn/vehicles/newqq3/",

  // 星途（exeedcars.com，注意不是 exeed.cn）
  "星途EX7": "https://www.exeedcars.com/xt/EX7/",
  "星途ET5": "https://www.exeedcars.com/xt/enjoyTime5/",
  "星纪元ET": "https://www.exeedcars.com/xjy/et_new/",
  "星纪元ES": "https://www.exeedcars.com/xjy/es_reev/",
  "星途揽月C-DM": "https://www.exeedcars.com/xt/lanyue_c_dm/",
  "星途揽月": "https://www.exeedcars.com/xt/lanyue/",
  "星途瑶光C-DM": "https://www.exeedcars.com/xt/yaoguang_c_dm/",
  "星途瑶光": "https://www.exeedcars.com/xt/yaoguang_new/",
  "星途凌云": "https://www.exeedcars.com/xt/lingyun/",
  "星途追风C-DM": "https://www.exeedcars.com/xt/zhuifeng_c_dm/",

  // 捷途（jetour.com.cn/vehicles/）
  "旅行者PLUS": "https://www.jetour.com.cn/vehicles/travelerPlus2026/",
  "旅行者CDM": "https://www.jetour.com.cn/vehicles/travelercdm/",
  "旅行者C-DM": "https://www.jetour.com.cn/vehicles/travelercdm/",
  "旅行者骏马": "https://www.jetour.com.cn/vehicles/travelerjunma/",
  "旅行者": "https://www.jetour.com.cn/vehicles/2026traveler/",
  "山海T1": "https://www.jetour.com.cn/vehicles/shanhaiT1siqu/",
  "山海T2": "https://www.jetour.com.cn/vehicles/shanhait2plus/",
  "山海L7超越": "https://www.jetour.com.cn/vehicles/shanhail7beyond/",
  "山海L7": "https://www.jetour.com.cn/vehicles/shanhail7plus/",
  "自由者7PLUS": "https://www.jetour.com.cn/vehicles/freedom7PLUS/",
  "自由者骏马": "https://www.jetour.com.cn/vehicles/freedomjunma/",
  "自由者": "https://www.jetour.com.cn/vehicles/Freedom/",
  "X70超越": "https://www.jetour.com.cn/vehicles/2026x70beyond/",
  "X70PLUS": "https://www.jetour.com.cn/vehicles/2026X70PLUS/",
  "X70L": "https://www.jetour.com.cn/vehicles/jietux70l/",
  "X70S": "https://www.jetour.com.cn/vehicles/new_x70s",
  "X70": "https://www.jetour.com.cn/vehicles/2026X70PLUS/",
  "X90PRO": "https://www.jetour.com.cn/vehicles/2026X90PRO/",
  "X90PLUS": "https://www.jetour.com.cn/vehicles/2025x90plus/",
  "X90": "https://www.jetour.com.cn/vehicles/2026X90PRO/",
  "大圣青春": "https://www.jetour.com.cn/vehicles/dashengqingchun2026/",
  "大圣": "https://www.jetour.com.cn/vehicles/2026xindasheng/",
  "诸葛": "https://www.jetour.com.cn/vehicles/zhuge/",

  // iCAR（icarglobal.com/zh/carview/）
  "iCAR03T": "https://www.icarglobal.com/zh/carview/iCAR03T",
  "iCAR 03T": "https://www.icarglobal.com/zh/carview/iCAR03T",
  "iCAR03": "https://www.icarglobal.com/zh/carview/icar03/index.html",
  "iCAR 03": "https://www.icarglobal.com/zh/carview/icar03/index.html",
  "iCARV23": "https://www.icarglobal.com/zh/carview/iCARV23/index.html",
  "iCAR V23": "https://www.icarglobal.com/zh/carview/iCARV23/index.html",
  "iCARV27": "https://www.icarglobal.com/zh/carview/iCARV27",
  "iCAR V27": "https://www.icarglobal.com/zh/carview/iCARV27",
  "超级V23S": "https://www.icarglobal.com/zh/carview/SUPERV23S",
  "超级V23赛博": "https://www.icarglobal.com/zh/carview/SUPERV23CYBER",
  "超级V23": "https://www.icarglobal.com/zh/carview/SUPERV23",

  // 凯翼（kaiyihome.com/model/，独立官网 kaiyi.com.cn 非官方）
  "昆仑iHD": "https://www.kaiyihome.com/model/ihd",
  "昆仑L8": "https://www.kaiyihome.com/model/kunlunl8",
  "昆仑C": "https://www.kaiyihome.com/model/kunlunc",
  "昆仑": "https://www.kaiyihome.com/model/kunlun",
  "炫界ProEV": "https://www.kaiyihome.com/model/showjetproev",
  "炫界Pro": "https://www.kaiyihome.com/model/showjetpro",
  "炫界": "https://www.kaiyihome.com/model/showjet2023",
  "拾月MAX": "https://www.kaiyihome.com/model/octmax",
  "拾月Mate": "https://www.kaiyihome.com/model/octmeta",
  "拾月": "https://www.kaiyihome.com/model/oct",
  "轩度EV": "https://www.kaiyihome.com/model/xuanduev",
  "轩度": "https://www.kaiyihome.com/model/xuandu",
  "江豚E5": "https://www.kaiyihome.com/model/jte5",
  "江豚E7": "https://www.kaiyihome.com/model/jte7",
  "凯翼E5": "https://www.kaiyihome.com/model/e5ev",
  "凯翼X3": "https://www.kaiyihome.com/model/X3",
  "凯翼V7": "https://www.kaiyihome.com/model/v7",

  // 红旗（hongqi.faw.cn/model/{seriesCode}；faw-hongqi.com.cn 是域名停放页勿用）
  // 中文 seriesCode 需 URL 编码；天工05/06/08 用裸键（官方已从 E001 改名）
  "红旗H5": "https://hongqi.faw.cn/model/newh5",
  "红旗H6": "https://hongqi.faw.cn/model/H6",
  "红旗H7": "https://hongqi.faw.cn/model/%E5%85%A8%E6%96%B0%E7%BA%A2%E6%97%97H7",
  "红旗H9": "https://hongqi.faw.cn/model/H9",
  "红旗HQ9": "https://hongqi.faw.cn/model/HQ9",
  "红旗E-QM5": "https://hongqi.faw.cn/model/E-QM5",
  "红旗EH7": "https://hongqi.faw.cn/model/EH7",
  "天工05": "https://hongqi.faw.cn/model/%E5%A4%A9%E5%B7%A505",
  "天工06": "https://hongqi.faw.cn/model/%E5%A4%A9%E5%B7%A506",
  "天工08": "https://hongqi.faw.cn/model/%E5%A4%A9%E5%B7%A508",
  "红旗HS3": "https://hongqi.faw.cn/model/HS3",
  "红旗HS5": "https://hongqi.faw.cn/model/HS5",
  "红旗HS6": "https://hongqi.faw.cn/model/HS6",
  "红旗HS7": "https://hongqi.faw.cn/model/HS7",
  "红旗国礼": "https://hongqi.faw.cn/model/%E7%BA%A2%E6%97%97%E5%9B%BD%E7%A4%BC",
  "红旗国雅": "https://hongqi.faw.cn/model/%E7%BA%A2%E6%97%97%E5%9B%BD%E9%9B%85",
  "红旗国耀": "https://hongqi.faw.cn/model/%E7%BA%A2%E6%97%97%E5%9B%BD%E8%80%80",
  "红旗国悦": "https://hongqi.faw.cn/model/%E7%BA%A2%E6%97%97%E5%9B%BD%E6%82%A6",

  // 东风风神（dfpv.com.cn/carlist.html?model_id=）
  "风神L8": "https://www.dfpv.com.cn/carlist.html?model_id=35",
  "风神L7": "https://www.dfpv.com.cn/carlist.html?model_id=32",
  "皓瀚": "https://www.dfpv.com.cn/carlist.html?model_id=29",
  "皓极": "https://www.dfpv.com.cn/carlist.html?model_id=30",
  "奕炫MAX": "https://www.dfpv.com.cn/carlist.html?model_id=17",
  "奕炫": "https://www.dfpv.com.cn/carlist.html?model_id=25",
  "EV01": "https://www.dfpv.com.cn/carlist.html?model_id=31",
  "E70": "https://www.dfpv.com.cn/carlist.html?model_id=24",
  "AX7": "https://www.dfpv.com.cn/carlist.html?model_id=27",

  // 东风奕派（yipai.com.cn）
  "eπ008六座": "https://www.yipai.com.cn/model0086",
  "奕派008六座": "https://www.yipai.com.cn/model0086",
  "eπ008": "https://www.yipai.com.cn/model008",
  "奕派008": "https://www.yipai.com.cn/model008",
  "eπ007": "https://www.yipai.com.cn/model007",
  "奕派007": "https://www.yipai.com.cn/model007",
  "奕派M8": "https://www.yipai.com.cn/m8",

  // 东风纳米（dna-nev.com.cn，与奕派共用前端）
  "纳米01": "https://www.dna-nev.com.cn/nami01",
  "纳米06": "https://www.dna-nev.com.cn/nami06",

  // 东风风行（fxauto.com.cn）
  "星海S7": "https://xinghai.fxauto.com.cn/S7",
  "星海V9": "https://xinghai.fxauto.com.cn/V9yx",
  "游艇": "https://cars.fxauto.com.cn/event/m4/index.html",
  "菱智PLUS": "https://www.fxauto.com.cn/index.php/car/info?cid=29",
  "菱智新能源": "https://www.fxauto.com.cn/index.php/car/info?cid=19",
  "菱智": "https://cars.fxauto.com.cn/event/m5/",
  "风行M7": "https://cars.fxauto.com.cn/event/m7/index.html",
  "风行雷霆": "https://www.fxauto.com.cn/cars/fxlt/index.html",
  "T5EVO": "https://www.fxauto.com.cn/cars/index.html",
  "T5 EVO": "https://www.fxauto.com.cn/cars/index.html",
  "T5盛世款": "https://www.fxauto.com.cn/index.php/car/info?cid=38",
  "S50EV": "https://www.fxauto.com.cn/index.php/car/info?cid=15",

  // 猛士（m-hero.com；mhero.com 无连字符是停靠域名勿用）
  "猛士917": "https://www.m-hero.com/m917",
  "猛士M817": "https://www.m-hero.com/m817",

  // 长安（changan.com.cn/car/）
  "CS75PLUS": "https://www.changan.com.cn/car/cs75plus-4nd-2026",
  "CS55PLUS": "https://www.changan.com.cn/car/cs55plus-4nd",
  "UNI-V": "https://www.changan.com.cn/car/UNI-V-3nd",
  "UNI-K": "https://www.changan.com.cn/car/UNI-K",
  "逸动": "https://www.changan.com.cn/car/eado-4nd",

  // 广汽传祺（gacmotor.com；trumpchi.gacmotor.com 已废弃）
  "影豹": "https://www.gacmotor.com/empow_2025/",
  "影酷": "https://www.gacmotor.com/emkoo/",
  "传祺GS3": "https://www.gacmotor.com/gs3/",
  "传祺GS4": "https://www.gacmotor.com/gs4/",
  "传祺GS8": "https://www.gacmotor.com/gs8_new/",
  "传祺M6": "https://www.gacmotor.com/m6/",
  "传祺M8": "https://www.gacmotor.com/m8/",
  "传祺E8": "https://www.gacmotor.com/e8/",
  "传祺E9": "https://www.gacmotor.com/e9/",

  // 广汽埃安（aion.com.cn；gacne.com.cn 301 跳转至此）
  // 车型名带空格/不带空格两种写法都收录（carName 不做归一化）
  "AIONV": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=AY5",
  "AION V": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=AY5",
  "AIONRT": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_rt",
  "AION RT": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_rt",
  "AIONUT": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_ut",
  "AION UT": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_ut",
  "AIONS": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_s_max",
  "AION S": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_s_max",
  "AIONY": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_y_plus",
  "AION Y": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_y_plus",
  "AIONN60": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_n60",
  "AION N60": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_n60",
  "AIONi60": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_i60",
  "AION i60": "https://www.aion.com.cn/vehicles/aion_car_introduce?alias=aion_i60",

  // 昊铂（hyptec.com；hyper.com.cn 301 跳转）
  "昊铂GT": "https://www.hyptec.com/vehicles/aion_car_introduce?alias=hyper_gt",
  "昊铂HT": "https://www.hyptec.com/vehicles/aion_car_introduce?alias=hyper_ht",
  "昊铂SSR": "https://www.hyptec.com/vehicles/aion_car_introduce?alias=hyper_ssr",
  "昊铂HL": "https://www.hyptec.com/vehicles/aion_car_introduce?alias=hyper_hl",
  "昊铂A800": "https://www.hyptec.com/vehicles/aion_car_introduce?alias=hyper_a8",
  "昊铂S600": "https://www.hyptec.com/vehicles/aion_car_introduce?alias=hyper_S600",

  // 荣威（roewe.com.cn/vehicles/）
  "荣威RX5": "https://www.roewe.com.cn/vehicles/roewerx5plusnew/",
  "荣威D5X": "https://www.roewe.com.cn/vehicles/d5x-dmh/",
  "荣威i5": "https://www.roewe.com.cn/vehicles/roewei5new/",
  "荣威D7": "https://www.roewe.com.cn/vehicles/d7-dmh/",
  "荣威iMAX8": "https://www.roewe.com.cn/vehicles/imax8dmh/",

  // 名爵（saicmg.com/vehicles/；mgmotor.com.cn 已失效）
  "MG7": "https://www.saicmg.com/vehicles/sedan/mg7.html",
  "MG5": "https://www.saicmg.com/vehicles/sedan/mg5mce.html",
  "MG6": "https://www.saicmg.com/vehicles/sedan/gen3mg6.html",
  "MG4X": "https://www.saicmg.com/vehicles/sedan/mg4x.html",
  "MG4": "https://www.saicmg.com/vehicles/sedan/mg4new.html",
  "MG07": "https://www.saicmg.com/vehicles/sedan/mg07.html",
  "Cyberster": "https://www.saicmg.com/vehicles/concept/cyberster/index.html",

  // 五菱 / 宝骏（wuling.com/carDetail?id=；宝骏无独立域名）
  "星光S": "https://www.wuling.com/carDetail?id=304",
  "星光": "https://www.wuling.com/carDetail?id=289",
  "缤果S": "https://www.wuling.com/carDetail?id=306",
  "缤果": "https://www.wuling.com/carDetail?id=286",
  "宏光MINIEV": "https://www.wuling.com/carDetail?id=321",
  "宏光MINI": "https://www.wuling.com/carDetail?id=321",
  "宝骏云海": "https://www.wuling.com/carDetail?id=267",
  "宝骏享境": "https://www.wuling.com/carDetail?id=280",
  "宝骏悦也Plus": "https://www.wuling.com/carDetail?id=292",
  "宝骏悦也": "https://www.wuling.com/carDetail?id=2",
  "宝骏E6": "https://www.wuling.com/carDetail?id=307",

  // 北京汽车（beijingauto.com.cn 子域名；baicmotor.com 是集团官网无实车图）
  "BJ40增程": "https://bj40zc.beijingauto.com.cn/",
  "BJ40燃油": "https://bj40fuel.beijingauto.com.cn/",
  "BJ40探险家": "https://bj40txj.beijingauto.com.cn/",
  "BJ40刀锋英雄": "https://bj40txj.beijingauto.com.cn/",
  "BJ40": "https://bj40new.beijingauto.com.cn/",
  "BJ60": "https://bj60.beijingauto.com.cn/",
  "BJ30": "https://bj30.beijingauto.com.cn/",
  "北京X7": "https://x7.beijingauto.com.cn/",
  "EU8": "https://eu8.beijingauto.com.cn/",
  "U5PLUS": "https://u5plus.beijingauto.com.cn/",
  "泰钽700": "https://taitan700.beijingauto.com.cn/",
  "泰坦700": "https://taitan700.beijingauto.com.cn/",

  // 领克（lynkco.com.cn/cars/）
  "领克10+": "https://www.lynkco.com.cn/cars/10jia",
  "领克10": "https://www.lynkco.com.cn/cars/10ev",
  "领克Z10": "https://www.lynkco.com.cn/cars/10ev",
  "领克Z20": "https://www.lynkco.com.cn/cars/z20",
  "领克900": "https://www.lynkco.com.cn/cars/900",
  "领克09": "https://www.lynkco.com.cn/cars/09mhev",
  "领克08": "https://www.lynkco.com.cn/cars/08",
  "领克07": "https://www.lynkco.com.cn/cars/07",
  "领克06": "https://www.lynkco.com.cn/cars/06remix",
  "领克05": "https://www.lynkco.com.cn/cars/05jia",
  "领克03": "https://www.lynkco.com.cn/cars/new03",
  "领克01": "https://www.lynkco.com.cn/cars/01",
};