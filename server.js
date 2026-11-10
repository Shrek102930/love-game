/**
 * 💕 双人游戏合集 v3.1 —— 服务器（权威节点）
 * 40 格环形棋盘 / 色组垄断·建房酒店 / 拍卖·抵押 / 6 种小游戏 /
 * 4 种模式 / 默契值 / 逐格移动序列 / 瘦身同步+版本号 / 断线重连+存档
 * v3.1: 模拟人生(存钱取息/借贷/转赠/买车/人生事件) / 传送门捷径 /
 *       通用人生选择弹窗 / 悄悄话未读 / 退出·设置·重开 / 位置气泡 / 3D 骰子 /
 *       gameKind 游戏合集分派 / BOARD_VERSION=4
 *
 * 架构：多文件。前端在 public/（express.static 托管），图片可缓存。
 * 运行：node server.js  (PORT 环境变量覆盖，默认 3000)
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ['websocket', 'polling'] });
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const SAVE_DIR = path.join(__dirname, 'saves');
if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });
const BOARD_VERSION = 4; // v3.1：新增 bank/life/portal 格与 choice/资产字段，旧存档自动作废

/* 灰度开关（默认全开；出问题把对应项设 0 即可回退某项能力） */
const F = {
  animation: process.env.FEATURE_ANIM !== '0',
  extraRules: process.env.FEATURE_EXTRA_RULES !== '0',
  deltaSync: process.env.FEATURE_DELTA_SYNC !== '0',
};

// 首页禁用缓存；静态资源允许缓存（带版本号查询串由前端控制）
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '7d' }));
app.use(express.static(PUBLIC_DIR, {
  setHeaders(res, fp) {
    if (fp.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  },
}));
app.get('/favicon.ico', (req, res) =>
  res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="88">💕</text></svg>'));

/* =========================================================
 *  1. 棋盘数据：40 格环形模板 + 两套主题
 *  tile: go/jail/park/gotojail/chance/destiny/tax/minigame/
 *        property(街区,group)/station/utility
 * ======================================================= */
const GROUPS = {
  brown:  { name: '暖棕', color: '#b98a6a', houseCost: 50 },
  sky:    { name: '天蓝', color: '#7ec8e3', houseCost: 50 },
  pink:   { name: '蜜桃', color: '#f48fb1', houseCost: 100 },
  orange: { name: '蜜橙', color: '#f6a96b', houseCost: 100 },
  red:    { name: '珊瑚', color: '#ef6f6c', houseCost: 150 },
  yellow: { name: '鹅黄', color: '#f2c94c', houseCost: 150 },
  green:  { name: '薄荷', color: '#6cc79a', houseCost: 200 },
  navy:   { name: '星蓝', color: '#5b7fd4', houseCost: 200 },
};
const STATION_RENT = [50, 100, 200, 400];

// 40 格结构模板（下标 = 格子索引 = 环形路径顺序）
// p = 价格/税额；g = 色组；k = 小游戏候选 kinds
const LAYOUT = [
  { t: 'go' },
  { t: 'property', g: 'brown',  p: 60 },
  { t: 'chance' },
  { t: 'property', g: 'brown',  p: 60 },
  { t: 'bank' },                                  // v3.1 爱心银行
  { t: 'station', p: 200 },
  { t: 'property', g: 'sky',    p: 100 },
  { t: 'portal', pair: 36 },                     // v3.1 传送门 A
  { t: 'property', g: 'sky',    p: 100 },
  { t: 'property', g: 'sky',    p: 120 },
  { t: 'jail' },                                   // 角
  { t: 'property', g: 'pink',   p: 140 },
  { t: 'utility', p: 150 },
  { t: 'property', g: 'pink',   p: 140 },
  { t: 'property', g: 'pink',   p: 160 },
  { t: 'station', p: 200 },
  { t: 'property', g: 'orange', p: 180 },
  { t: 'life' },                                  // v3.1 人生驿站
  { t: 'property', g: 'orange', p: 180 },
  { t: 'property', g: 'orange', p: 200 },
  { t: 'park' },                                   // 角
  { t: 'property', g: 'red',    p: 220 },
  { t: 'minigame', k: ['bond', 'coop'] },
  { t: 'property', g: 'red',    p: 220 },
  { t: 'property', g: 'red',    p: 240 },
  { t: 'station', p: 200 },
  { t: 'property', g: 'yellow', p: 260 },
  { t: 'destiny' },
  { t: 'property', g: 'yellow', p: 260 },
  { t: 'property', g: 'yellow', p: 280 },
  { t: 'gotojail' },                              // 角
  { t: 'property', g: 'green',  p: 300 },
  { t: 'utility', p: 150 },
  { t: 'property', g: 'green',  p: 300 },
  { t: 'property', g: 'green',  p: 320 },
  { t: 'station', p: 200 },
  { t: 'portal', pair: 7 },                      // v3.1 传送门 B
  { t: 'property', g: 'navy',   p: 350 },
  { t: 'tax', p: 100 },
  { t: 'property', g: 'navy',   p: 400 },
];

function buildTheme(key, name, names, scale) {
  const tiles = LAYOUT.map((cell, i) => {
    const t = { type: cell.t, name: names[i] || `格子${i}` };
    if (cell.p != null) t.price = Math.round(cell.p * scale);
    if (cell.g) t.group = cell.g;
    if (cell.k) t.kinds = cell.k;
    if (cell.pair != null) t.pair = cell.pair;   // v3.1 传送门配对
    return t;
  });
  return {
    key, name, scale, tiles,
    salary: Math.round(250 * scale),
    startMoney: Math.round(2000 * scale),
    houseRate: 0.4,
  };
}

const CITY_NAMES = [
  '💕 约会出发', '老街糖果铺', '❓ 机会', '巷口花店', '🏦 爱心银行', '中央车站',
  '海边小屋', '🌀 星空传送门', '绘本咖啡', '猫咪咖啡', '🔒 探监', '甜品屋',
  '供电所', '花艺教室', '手作小店', '南站', '电影院', '🎭 人生驿站', '电玩城', 'KTV',
  '🌳 免费停车', '观景台', '💞 默契屋', '摩天轮', '旋转木马', '机场',
  '书店街', '命运', '餐厅街', '画廊街', '🚔 进监狱', '艺术馆',
  '自来水厂', '音乐厅', '大剧院', '高铁站', '🌀 月光传送门', '城堡酒店', '奢侈税', '星空塔',
];
const CAMPUS_NAMES = [
  '🎒 开学啦', '旧书摊', '❓ 社团招新', '校门花店', '🏦 校园银行', '校车站',
  '湖边小屋', '🌀 星空传送门', '自习咖啡', '猫咖', '🔒 教导处', '甜品社',
  '供电室', '花艺社', '手作社', '南门站', '露天影院', '🎭 人生驿站', '电玩社', '唱吧',
  '🌳 大草坪', '天台', '💞 默契屋', '摩天轮', '旋转木马', '机场线',
  '书店街', '命运', '食堂街', '画室街', '🚔 校长室', '美术馆',
  '开水房', '音乐厅', '大礼堂', '东站', '🌀 月光传送门', '城堡酒店', '补考费', '钟楼',
];
const THEMES = {
  city: buildTheme('city', '城市冒险', CITY_NAMES, 1),
  campus: buildTheme('campus', '校园时光', CAMPUS_NAMES, 0.8),
};

/* 环形坐标：40 格映射到 11×11 网格外圈（顺时针闭环） */
function tileRC(i) {
  if (i <= 10) return [10, 10 - i];      // 底边：右下→左下
  if (i <= 20) return [20 - i, 0];       // 左边：下→上
  if (i <= 30) return [0, i - 20];       // 顶边：左→右
  return [i - 30, 10];                   // 右边：上→下
}
const findTile = (tiles, type) => tiles.findIndex((t) => t.type === type);
const GO_INDEX = 0;

/* =========================================================
 *  2. 模式 / 卡池 / 题库
 * ======================================================= */
/* 游戏合集注册表：一个链接里可挑选多款双人小游戏。
 * 目前仅 monopoly 可玩；后续新增游戏在 RULES 门面补一个分支即可，
 * 房间/连接/同步/存档这套共享底座无需复制。 */
const GAME_KINDS = {
  monopoly: { name: '情侣大富翁', icon: '🎲', tag: '40 格环形 · 买地建房', ready: true },
};
const MODES = {
  classic: { name: '经典对战', maxRounds: 30, targetLaps: 0, coopTarget: 0, heartTarget: 0,
             desc: '对手破产，或回合结束净资产多者胜' },
  race:    { name: '竞速模式', maxRounds: 0, targetLaps: 2, coopTarget: 0, heartTarget: 0,
             desc: '最先绕棋盘 2 圈者获胜' },
  coop:    { name: '合作通关', maxRounds: 40, targetLaps: 0, coopTarget: 5200, heartTarget: 0,
             desc: '两人合计净资产达 5200 共同获胜，一方破产则失败' },
  heart:   { name: '心跳模式', maxRounds: 30, targetLaps: 0, coopTarget: 0, heartTarget: 5,
             desc: '一起攒满 5 点默契值，共同获胜 💗' },
};
const PACES = { relaxed: { name: '悠闲', mul: 1.4 }, standard: { name: '标准', mul: 1 }, fast: { name: '快节奏', mul: 0.65 } };

const CARD_POOLS = {
  chance: [
    { text: '路上捡到钱，+150', e: { type: 'money', v: 150 } },
    { text: '报销一笔开销，+120', e: { type: 'money', v: 120 } },
    { text: '发工资啦，+250', e: { type: 'money', v: 250 } },
    { text: '请客吃饭，-120', e: { type: 'money', v: -120 } },
    { text: '修车花了钱，-80', e: { type: 'money', v: -80 } },
    { text: '交罚款，-100', e: { type: 'money', v: -100 } },
    { text: '好运眷顾，回到起点领工资', e: { type: 'goto', pos: GO_INDEX } },
    { text: '调皮被抓，直接进监狱', e: { type: 'jail' } },
    { text: '获得一张「免租券」', e: { type: 'item', item: 'freeRent' } },
    { text: '给对方一个爱心红包 -100', e: { type: 'gift', v: 100 } },
    { text: '双人下午茶，两人各 +100', e: { type: 'both', v: 100 } },
    { text: '搭顺风车，前进 3 格', e: { type: 'step', v: 3 } },
    { text: '迷路了，后退 2 格', e: { type: 'step', v: -2 } },
    { text: '抽中小游戏：来一局！', e: { type: 'mini' } },
    { text: '房产税，每块地 -30', e: { type: 'perProp', v: -30 } },
    { text: '银行分红，按地产数每块 +40', e: { type: 'perProp', v: 40 } },
    { text: '把零钱存进银行，慢慢生息', e: { type: 'deposit', v: 200 } },
    { text: '急用钱，取回全部存款', e: { type: 'withdraw' } },
    { text: '手头紧，先借 300 周转', e: { type: 'loan', v: 300 } },
    { text: '发红包给 TA -120（默契 +1）', e: { type: 'transfer', v: 120, heart: 1 } },
    { text: '入手一辆小车，下 2 次多走 2 格', e: { type: 'buycar', v: 2 } },
    { text: '人生小考：请做出一个选择', e: { type: 'life' } },
  ],
  destiny: [
    { text: '投资获利，+180', e: { type: 'money', v: 180 } },
    { text: '中彩票了，+220', e: { type: 'money', v: 220 } },
    { text: '意外支出，-150', e: { type: 'money', v: -150 } },
    { text: '请朋友帮忙，-90', e: { type: 'money', v: -90 } },
    { text: '命运转盘，回起点领工资', e: { type: 'goto', pos: GO_INDEX } },
    { text: '人生低谷，直接进监狱', e: { type: 'jail' } },
    { text: '获得一张「免租券」', e: { type: 'item', item: 'freeRent' } },
    { text: '送给对方一个小礼物 -80', e: { type: 'gift', v: 80 } },
    { text: '默契值 +1 💗', e: { type: 'heart', v: 1 } },
    { text: '合作愉快，两人各 +120', e: { type: 'both', v: 120 } },
    { text: '跳到最近的车站', e: { type: 'gotoType', type2: 'station' } },
    { text: '房东免单，下次过路费减半', e: { type: 'item', item: 'freeRent' } },
    { text: '抽中小游戏：来一局！', e: { type: 'mini' } },
    { text: '散步，前进 2 格', e: { type: 'step', v: 2 } },
    { text: '被叫回去，后退 3 格', e: { type: 'step', v: -3 } },
    { text: '全城分红，两人各 +150', e: { type: 'both', v: 150 } },
    { text: '定期到期，连本带息取回', e: { type: 'withdraw' } },
    { text: '创业贷款 500，慢慢还', e: { type: 'loan', v: 500 } },
    { text: '给 TA 买礼物 -150（默契 +2）', e: { type: 'transfer', v: 150, heart: 2 } },
    { text: '搭上顺风车，下 3 次多走 2 格', e: { type: 'buycar', v: 3 } },
    { text: '命运的岔路口，做个选择吧', e: { type: 'life' } },
    { text: '误入传送漩涡，瞬移到对面！', e: { type: 'teleport' } },
  ],
};
/* v3.1 模拟人生：人生驿站 / 命运卡触发的双选情境 */
const LIFE_EVENTS = [
  { q: '🎓 收到进修邀请，学费不便宜…', o: [
      { label: '贷款 500 去充电', e: { loan: 500, heart: 1 } },
      { label: '先踏实攒钱 +150', e: { money: 150 } } ] },
  { q: '🚗 橱窗里那辆小车，正好够两个人兜风', o: [
      { label: '买下 -400（下 3 次多走 2 格）', e: { car: 400, boost: 3 } },
      { label: '再等等，存 200 进银行', e: { deposit: 200 } } ] },
  { q: '💌 TA 的生日快到了', o: [
      { label: '准备惊喜 -200（默契 +2）', e: { gift: 200, heart: 2 } },
      { label: '亲手做顿饭（默契 +1）', e: { heart: 1, money: -50 } } ] },
  { q: '🏦 银行客户经理推荐一款稳健理财', o: [
      { label: '存 400 慢慢生息', e: { deposit: 400 } },
      { label: '现金为王，不存', e: { money: 60 } } ] },
  { q: '💼 有个加班项目，报酬可观', o: [
      { label: '接下，累一点 +400', e: { money: 400 } },
      { label: '陪 TA 更重要（默契 +2）', e: { heart: 2 } } ] },
  { q: '🏥 意外扭伤，医药费要自理', o: [
      { label: '自费治疗 -180', e: { money: -180 } },
      { label: '先借 200 应急', e: { loan: 200 } } ] },
  { q: '🎁 路上捡到一个许愿硬币', o: [
      { label: '许愿两个人一直在一起（默契 +2）', e: { heart: 2 } },
      { label: '换成 +120 现金', e: { money: 120 } } ] },
  { q: '🏡 房东问要不要续租一起住', o: [
      { label: '签下我们的小家 -300', e: { money: -300, heart: 2 } },
      { label: '再攒攒，存 150', e: { deposit: 150 } } ] },
];
const QUIZ_POOL = [
  { q: '蜜蜂采集什么来酿蜜？', o: ['花蜜', '树叶', '雨水', '泥土'], a: 0 },
  { q: '一年中有几个月有 31 天？', o: ['6 个', '7 个', '8 个', '5 个'], a: 1 },
  { q: '情人节是每年的哪一天？', o: ['2 月 14 日', '3 月 14 日', '2 月 7 日', '7 月 7 日'], a: 0 },
  { q: '彩虹通常有几种颜色？', o: ['5 种', '6 种', '7 种', '8 种'], a: 2 },
  { q: '下面哪个不是编程语言？', o: ['Python', 'Java', 'HTML', 'Photoshop'], a: 3 },
  { q: '地球上最大的洋是？', o: ['大西洋', '印度洋', '太平洋', '北冰洋'], a: 2 },
  { q: '♥ 在扑克牌里代表什么花色？', o: ['黑桃', '红桃', '梅花', '方块'], a: 1 },
  { q: '一天有多少个小时？', o: ['12', '24', '36', '48'], a: 1 },
  { q: '猫通常有几条腿？', o: ['2', '4', '6', '8'], a: 1 },
  { q: '元旦是几月几日？', o: ['1 月 1 日', '1 月 15 日', '2 月 1 日', '12 月 31 日'], a: 0 },
  { q: '一打鸡蛋有多少个？', o: ['6', '10', '12', '20'], a: 2 },
  { q: '太阳从哪边升起？', o: ['东', '南', '西', '北'], a: 0 },
  { q: '水在多少摄氏度结冰？', o: ['0', '10', '50', '100'], a: 0 },
  { q: '一周有几天？', o: ['5', '6', '7', '8'], a: 2 },
  { q: '熊猫最爱吃什么？', o: ['竹子', '鱼', '蜂蜜', '胡萝卜'], a: 0 },
  { q: '下面哪个是水果？', o: ['土豆', '番茄', '草莓', '白菜'], a: 2 },
  { q: '月亮本身会发光吗？', o: ['会', '不会'], a: 1 },
  { q: '一个三角形有几条边？', o: ['2', '3', '4', '5'], a: 1 },
  { q: '下面哪个季节最热？', o: ['春', '夏', '秋', '冬'], a: 1 },
  { q: '1 小时等于多少分钟？', o: ['30', '60', '90', '100'], a: 1 },
];
// 默契问答：两人各自猜「对方会选哪个」，选到一样就加分
const BOND_POOL = [
  { q: '如果现在能一起去一个地方，TA 会选？', o: ['海边', '山里', '游乐园', '宅家里'] },
  { q: 'TA 最可能点哪种外卖？', o: ['麻辣烫', '奶茶甜品', '炸鸡汉堡', '家常炒菜'] },
  { q: '周末 TA 更想怎么过？', o: ['出门逛街', '看电影', '睡到自然醒', '一起打游戏'] },
  { q: 'TA 会先被哪种小礼物戳中？', o: ['一束花', '手写卡片', '小蛋糕', '毛绒玩偶'] },
  { q: '吵架后 TA 更希望？', o: ['先抱一下', '冷静一会儿', '好好讲道理', '吃顿好的'] },
  { q: 'TA 最不能拒绝的食物是？', o: ['火锅', '烧烤', '甜品', '面食'] },
  { q: '如果养宠物，TA 会选？', o: ['猫', '狗', '兔子', '不养'] },
  { q: 'TA 更喜欢的天气是？', o: ['大晴天', '下雨天', '下雪天', '阴天凉凉'] },
  { q: '一起看电影，TA 会选？', o: ['爱情片', '喜剧片', '悬疑片', '动画片'] },
  { q: 'TA 最想要的惊喜是？', o: ['突然出现', '精心准备的礼物', '一顿亲手做的饭', '一场旅行'] },
  { q: 'TA 手机里最常打开的是？', o: ['聊天软件', '短视频', '音乐', '相机'] },
  { q: '凌晨饿了，TA 会？', o: ['忍着', '点夜宵', '泡面', '拉你一起吃'] },
];
const DARE_POOL = [
  '给对方发一句真诚的夸奖 💌', '一起对着屏幕比个心 🫶', '说出第一次心动的瞬间 💗',
  '互相模仿对方的一个小习惯 😄', '约定下次见面要一起做的一件事 📅', '给对方取一个只有你们知道的外号 🥰',
  '同时说出对方今天穿的衣服颜色 👀', '一起数 3 秒然后同时说「想你」💕',
];
const COOP_POOL = [
  { q: '一起完成任务：两人同时点「好」，就各得奖励～', o: ['好', '好呀', 'OK', '成交'] },
  { q: '双人任务：一起为这局加个油吧！', o: ['加油', '冲鸭', '必胜', '💪'] },
  { q: '同步挑战：数到三一起点下去 ✨', o: ['1', '2', '3', '点！'] },
];
const WHEEL_PRIZES = [-100, -50, 60, 100, 150, 200, 0, 120];

const RPS_PRIZE = 60, QUIZ_REWARD = 80, QUIZ_PENALTY = 40;
const BOND_REWARD = 100, COOP_REWARD = 80, DARE_REWARD = 70;

/* =========================================================
 *  3. 房间状态
 * ======================================================= */
const rooms = new Map();
const tokens = new Map();

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
function genCode() {
  let c; do { c = Math.random().toString(36).slice(2, 8).toUpperCase(); }
  while (rooms.has(c) || fs.existsSync(path.join(SAVE_DIR, c + '.json')));
  return c;
}
const genToken = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

function makePlayer(id, name, color, token) {
  return { id, name: name || '玩家', color, token, connected: true,
    pos: 0, money: 0, props: {}, mortgaged: {}, items: { freeRent: 0 }, avatar: null,
    inJail: false, jailTurns: 0, bankrupt: false, laps: 0,
    savings: 0, loan: 0, cars: 0, carBoost: 0 };   // v3.1 模拟人生
}

function buildGame(room) {
  const theme = THEMES[room.theme];
  const m = MODES[room.mode] || MODES.classic;
  const pace = PACES[room.pace] || PACES.standard;
  const maxRounds = m.maxRounds ? Math.max(8, Math.round(m.maxRounds * pace.mul)) : 0;
  room.game = {
    theme: room.theme, mode: room.mode, modeName: m.name, pace: room.pace,
    salary: theme.salary, startMoney: theme.startMoney, houseRate: theme.houseRate,
    current: 0, maxRounds, rounds: 0,
    targetLaps: m.targetLaps, coopTarget: m.coopTarget, heartTarget: m.heartTarget,
    heart: 0, phase: 'await_roll', dice: [0, 0], doublesCount: 0,
    mini: null, auction: null, lastEvent: null, eventFx: null, buyTile: null, buyPrice: 0,
    log: [], winner: null, coop: null, moveSteps: [], passedGo: false,
    moveId: 0, fxId: 0,
  };
  room.players.forEach((p, i) => {
    p.pos = GO_INDEX; p.money = theme.startMoney; p.props = {}; p.mortgaged = {};
    p.items = { freeRent: 0 }; p.inJail = false; p.jailTurns = 0;
    p.bankrupt = false; p.laps = 0; p.avatar = i === 0 ? 'boy' : 'girl';
    p.savings = 0; p.loan = 0; p.cars = 0; p.carBoost = 0;
  });
  pushLog(room, `游戏开始！${theme.name} · ${m.name} · ${pace.name}节奏（${m.desc}）`);
  pushLog(room, `每人初始资金 ${theme.startMoney}，40 格环形棋盘，出发！`);
}
function pushLog(room, msg) {
  if (!room.game) return;
  room.game.log.unshift({ t: Date.now(), msg });
  if (room.game.log.length > 40) room.game.log.pop();
}

/* 静态棋盘定义：只在连接/开局/重连时单独下发一次 */
function boardState(room) {
  return {
    boardVersion: BOARD_VERSION, gameKind: room.gameKind || 'monopoly',
    theme: room.theme, themeName: THEMES[room.theme].name,
    tiles: THEMES[room.theme].tiles, groups: GROUPS, layout: LAYOUT.map((_, i) => tileRC(i)),
    salary: THEMES[room.theme].salary, startMoney: THEMES[room.theme].startMoney,
    scale: THEMES[room.theme].scale,
  };
}

/* 瘦身状态：tiles 只发动态摘要 [ownerIdx|null, level, mortgaged] */
function publicState(room, forId) {
  const g = room.game;
  const tiles = THEMES[room.theme].tiles;
  const td = tiles.map((_, i) => {
    const owner = room.players.findIndex((p) => p.props[i] !== undefined);
    return [owner < 0 ? null : owner, owner < 0 ? 0 : room.players[owner].props[i],
            owner < 0 ? 0 : (room.players[owner].mortgaged[i] ? 1 : 0)];
  });
  return {
    code: room.code, theme: room.theme, gameKind: room.gameKind || 'monopoly',
    ver: room.ver || 0, boardVersion: BOARD_VERSION,
    players: room.players.map((p) => {
      const b = { id: p.id, name: p.name, color: p.color, pos: p.pos, money: p.money,
        props: p.props, mortgaged: p.mortgaged, items: p.items, avatar: p.avatar,
        inJail: p.inJail, jailTurns: p.jailTurns, bankrupt: p.bankrupt, laps: p.laps,
        connected: p.connected, net: g ? netWorth(room, p) : p.money, isYou: p.id === forId,
        savings: p.savings || 0, loan: p.loan || 0, cars: p.cars || 0, carBoost: p.carBoost || 0 };
      if (p.id === forId) b.token = p.token;
      return b;
    }),
    started: !!g,
    game: g ? {
      mode: g.mode, modeName: g.modeName, pace: g.pace,
      current: g.current, phase: g.phase, dice: g.dice,
      lastEvent: g.lastEvent, eventFx: g.eventFx, log: g.log.slice(0, 10),
      winner: g.winner, coop: g.coop, salary: g.salary, heart: g.heart,
      rounds: g.rounds, maxRounds: g.maxRounds, targetLaps: g.targetLaps,
      coopTarget: g.coopTarget, heartTarget: g.heartTarget,
      tileDyn: td, moveSteps: g.moveSteps, passedGo: g.passedGo,
      moveId: g.moveId || 0, fxId: g.fxId || 0, mover: g.mover || 0,
      buyTile: g.buyTile, buyPrice: g.buyPrice, choice: g.choice || null,
      mini: g.mini ? miniView(room, forId) : null,
      auction: g.auction ? { ...g.auction } : null,
    } : null,
  };
}
function miniView(room, forId) {
  const m = room.game.mini;
  return { kind: m.kind, mode: m.mode, tile: m.tile, q: m.q, options: m.options,
    answererName: m.answererName, isAnswerer: m.answerer === forId,
    mine: m.picks[forId] ?? null, picked: Object.keys(m.picks).length,
    need: m.mode === 'solo' ? 1 : 2, resolved: m.resolved, result: m.resolved ? m.result : null };
}

function broadcast(room, { full = false } = {}) {
  room.ver = (room.ver || 0) + 1;
  room.players.forEach((p) => {
    if (p.id) io.to(p.id).emit('state', publicState(room, p.id));
  });
  schedulePersist(room);
}
function sendBoard(room) {
  room.players.forEach((p) => { if (p.id) io.to(p.id).emit('board', boardState(room)); });
}
function step(room) { checkEnd(room); broadcast(room); }

/* =========================================================
 *  4. 经济规则
 * ======================================================= */
function netWorth(room, p) {
  const tiles = THEMES[room.theme].tiles;
  let n = p.money + (p.savings || 0) - (p.loan || 0) + (p.cars || 0) * 200;
  for (const i in p.props) {
    const t = tiles[i];
    n += p.mortgaged[i] ? Math.round(t.price / 2) : t.price;
    if (t.group) n += Math.round(GROUPS[t.group].houseCost * p.props[i]);
  }
  return n;
}
function ownsGroup(room, player, group) {
  const idxs = THEMES[room.theme].tiles.map((t, i) => t.group === group ? i : -1).filter((i) => i >= 0);
  return idxs.length > 0 && idxs.every((i) => player.props[i] !== undefined);
}
function countType(room, player, type) {
  const tiles = THEMES[room.theme].tiles;
  return Object.keys(player.props).filter((i) => tiles[i].type === type).length;
}
function rentOf(room, tile, level, owner) {
  if (tile.type === 'station') return STATION_RENT[Math.max(0, countType(room, owner, 'station') - 1)];
  if (tile.type === 'utility') {
    const n = countType(room, owner, 'utility');
    return (room.game.dice[0] + room.game.dice[1]) * (n >= 2 ? 10 : 4);
  }
  const base = Math.round(tile.price * 0.12);
  if (level === 0) return ownsGroup(room, owner, tile.group) ? base * 2 : base;
  return Math.round(base * [0, 5, 14, 40, 55, 70][level]);
}
const houseCost = (room, tile) =>
  Math.round((GROUPS[tile.group] ? GROUPS[tile.group].houseCost : Math.round(tile.price * 0.4)) * THEMES[room.theme].scale);

function checkBankrupt(room, player) {
  if (player.money < 0 && (player.savings || 0) > 0) {   // v3.1 自动取存款补现金
    const take = Math.min(player.savings, -player.money);
    player.savings -= take; player.money += take;
    pushLog(room, `🏦 ${player.name} 从银行取出 ${take} 补足现金。`);
  }
  if (player.money < 0) {
    player.money = 0; player.bankrupt = true;
    for (const i in player.props) { delete player.props[i]; delete player.mortgaged[i]; }
    pushLog(room, `${player.name} 资金告罄，破产出局！`);
  }
}

/* =========================================================
 *  5. 回合与移动
 * ======================================================= */
function advanceTurn(room, samePlayer) {
  const g = room.game;
  if (!samePlayer) {
    g.current = (g.current + 1) % room.players.length;
    g.doublesCount = 0;
    if (g.current === 0 && g.maxRounds > 0) {
      g.rounds++;
      if (g.rounds >= g.maxRounds) { endByRounds(room); return; }
    }
  }
  g.phase = 'await_roll';
  let guard = 0;
  while (room.players[g.current].bankrupt && guard < room.players.length) {
    g.current = (g.current + 1) % room.players.length; guard++;
  }
}
function setFx(room, fx, text) {
  room.game.fxId = (room.game.fxId || 0) + 1;
  room.game.eventFx = { kind: fx, text: text || '' };
  room.game.lastEvent = { type: 'info', text: text || '' };
}
function setMove(room, seq, player) {
  const g = room.game;
  g.moveId = (g.moveId || 0) + 1;
  g.moveSteps = seq;
  g.mover = player ? room.players.indexOf(player) : (g.mover || 0);
}
function goToPos(room, player, target, collectSalary) {
  const g = room.game, N = THEMES[room.theme].tiles.length;
  const from = player.pos;
  const steps = (target - from + N * 2) % N;
  const seq = [];
  for (let k = 1; k <= Math.max(steps, 0); k++) seq.push((from + k) % N);
  if (steps === 0) seq.push(target);
  player.pos = target;
  setMove(room, seq, player);
  g.passedGo = collectSalary && seq.some((x) => x === GO_INDEX);
  return g.passedGo;
}

function rollDice(room, player) {
  const g = room.game, N = THEMES[room.theme].tiles.length;
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  let bonus = 0;
  if (g.pace === 'fast' && Math.random() < 0.35) bonus = 1 + Math.floor(Math.random() * 3); // 快骰
  g.dice = [d1, d2]; g.diceBonus = bonus;
  const isDouble = d1 === d2;

  if (player.inJail) {
    if (isDouble) {
      player.inJail = false; player.jailTurns = 0;
      pushLog(room, `${player.name} 掷出双数(${d1},${d2})，成功出狱！`);
      setFx(room, 'jailOut', `${player.name} 出狱啦`);
    } else {
      player.jailTurns++;
      if (player.jailTurns >= 3) {
        player.inJail = false; player.jailTurns = 0; player.money -= 50;
        pushLog(room, `${player.name} 关满 3 回合，交保释金 50 出狱。`);
        setFx(room, 'jailOut', '交保释金出狱');
      } else {
        pushLog(room, `${player.name} 在监狱掷出 ${d1},${d2}，继续关押(${player.jailTurns}/3)。`);
        setFx(room, 'jail', '仍在监狱');
        advanceTurn(room, false);
        return;
      }
    }
  }

  let carAdd = 0;
  if ((player.carBoost || 0) > 0 && F.extraRules) {
    carAdd = 2; player.carBoost--;
    pushLog(room, `🚗 ${player.name} 开车兜风，本次多走 2 格（剩余 ${player.carBoost} 次）。`);
  }
  const steps = d1 + d2 + bonus + carAdd;
  const from = player.pos;
  const seq = [];
  for (let k = 1; k <= steps; k++) seq.push((from + k) % N);
  player.pos = seq[seq.length - 1];
  setMove(room, seq, player);
  g.passedGo = seq.includes(GO_INDEX);
  if (g.passedGo) {
    player.laps++; player.money += g.salary;
    pushLog(room, `${player.name} 绕完第 ${player.laps} 圈，经过起点 +${g.salary}。`);
    if (F.extraRules && (player.savings || 0) > 0) {          // 存款 +8% 利息
      const interest = Math.max(1, Math.round(player.savings * 0.08));
      player.savings += interest;
      pushLog(room, `🏦 ${player.name} 存款生息 +${interest}（共存 ${player.savings}）。`);
    }
    if (F.extraRules && (player.loan || 0) > 0) {             // 每圈自动还 100
      const pay = Math.min(player.loan, 100);
      player.loan -= pay; player.money -= pay;
      pushLog(room, `💳 ${player.name} 自动还贷 -${pay}（剩余 ${player.loan}）。`);
      checkBankrupt(room, player);
    }
  }
  const tile = THEMES[room.theme].tiles[player.pos];
  pushLog(room, `${player.name} 掷出 ${d1}+${d2}${bonus ? '+' + bonus + '(快骰)' : ''}${carAdd ? '+2(小车)' : ''}=${steps}，到【${tile.name}】。`);
  // 情侣彩蛋：两人落在同一格 → 默契 +1（心跳模式主要来源）
  const other0 = room.players.find((x) => x !== player);
  if (other0 && !other0.bankrupt && other0.pos === player.pos && player.pos !== GO_INDEX) {
    g.heart++;
    pushLog(room, `💗 ${player.name} 和 ${other0.name} 在【${tile.name}】相遇，默契值 +1！`);
    setFx(room, 'heart', '心有灵犀，相遇啦 💗');
  }
  resolveTile(room, player);

  if (g.phase === 'await_roll') {
    if (isDouble) {
      g.doublesCount++;
      if (g.doublesCount >= 3) {
        sendJail(room, player, '连续 3 次双数');
      } else {
        pushLog(room, `${player.name} 掷出双数，再来一次！`);
        setFx(room, 'double', '双数！再来一次 🎲');
        return; // 同一玩家继续
      }
    } else advanceTurn(room, false);
  }
}

function sendJail(room, player, why) {
  const g = room.game;
  const j = findTile(THEMES[room.theme].tiles, 'jail');
  player.inJail = true; player.jailTurns = 0; player.pos = j;
  g.doublesCount = 0;
  pushLog(room, `${player.name} ${why}，被送进监狱！`);
  setFx(room, 'toJail', '被送进监狱 😵');
  advanceTurn(room, false);
  setMove(room, [j], player);
}

function resolveTile(room, player) {
  const g = room.game, tiles = THEMES[room.theme].tiles;
  const idx = player.pos, tile = tiles[idx];

  if (tile.type === 'property' || tile.type === 'station' || tile.type === 'utility') {
    const owner = room.players.find((p) => p.props[idx] !== undefined) || null;
    if (!owner) {
      g.phase = 'await_buy';
      g.buyTile = idx;
      g.buyPrice = tile.price;
      setFx(room, 'buy', `可以买下【${tile.name}】`);
      return;
    }
    if (owner.id === player.id) { setFx(room, 'home', '回到自己的地盘 🏠'); return; }
    if (owner.mortgaged[idx]) { setFx(room, 'info', '这块地已抵押，免收租'); return; }
    if (player.items.freeRent > 0 && F.extraRules) {
      player.items.freeRent--;
      pushLog(room, `${player.name} 使用「免租券」，免除【${tile.name}】过路费～`);
      setFx(room, 'shield', '免租券生效 🛡️');
      return;
    }
    const rent = rentOf(room, tile, owner.props[idx], owner);
    player.money -= rent; owner.money += rent;
    pushLog(room, `${player.name} 踩到 ${owner.name} 的【${tile.name}】，付过路费 ${rent}。`);
    setFx(room, 'rent', `过路费 -${rent} → ${owner.name}`);
    checkBankrupt(room, player);
  } else if (tile.type === 'chance' || tile.type === 'destiny') {
    const card = rand(CARD_POOLS[tile.type]);
    applyCard(room, player, card);
  } else if (tile.type === 'minigame') {
    startMini(room, player, idx, rand(tile.kinds));
  } else if (tile.type === 'bank' || tile.type === 'life') {
    if (F.extraRules) startChoice(room, player, tile.type);
    else setFx(room, 'info', '休息一下～');
  } else if (tile.type === 'portal') {
    // 捷径：瞬移到配对格，序列末尾追加一跳（前端逐格播放时表现为斜飞传送），
    // 落地不再 resolveTile，避免两个传送门互相递归。
    const dest = tile.pair;
    if (dest != null && dest !== idx) {
      g.moveSteps = (g.moveSteps || []).concat([dest]);
      player.pos = dest;
      pushLog(room, `🌀 ${player.name} 踩中传送门，瞬间到达【${tiles[dest].name}】！`);
      setFx(room, 'portal', `🌀 传送到【${tiles[dest].name}】`);
    } else setFx(room, 'info', '传送门正在充能～');
  } else if (tile.type === 'gotojail') {
    sendJail(room, player, '踩到进监狱格');
  } else if (tile.type === 'tax') {
    player.money -= tile.price;
    pushLog(room, `${player.name} 缴纳 ${tile.name} -${tile.price}。`);
    setFx(room, 'tax', `${tile.name} -${tile.price}`);
    checkBankrupt(room, player);
  } else if (tile.type === 'park') setFx(room, 'info', '免费停车，休息一下 🌳');
  else if (tile.type === 'jail') setFx(room, 'info', '只是探监，没事～');
  else if (tile.type === 'go') setFx(room, 'info', '回到起点 💕');
}

function applyCard(room, player, card) {
  const g = room.game, e = card.e, tiles = THEMES[room.theme].tiles;
  const other = room.players.find((p) => p.id !== player.id);
  pushLog(room, `${player.name} 抽卡：${card.text}`);
  setFx(room, 'card', card.text);
  switch (e.type) {
    case 'money': player.money += e.v; checkBankrupt(room, player); break;
    case 'both': room.players.forEach((p) => p.money += e.v); break;
    case 'gift':
      player.money -= e.v; if (other) other.money += e.v;
      checkBankrupt(room, player); break;
    case 'goto': goToPos(room, player, e.pos, true); player.money += g.salary; break;
    case 'jail': sendJail(room, player, '抽到惩罚卡'); break;
    case 'step': {
      const N = tiles.length;
      if (e.v > 0) { goToPos(room, player, (player.pos + e.v) % N, false); resolveTile(room, player); }
      else { player.pos = (player.pos + e.v + N) % N; setMove(room, [player.pos], player); }
      break;
    }
    case 'item': player.items[e.item] = (player.items[e.item] || 0) + 1; break;
    case 'heart': g.heart += e.v; break;
    case 'perProp': {
      const n = Object.keys(player.props).length;
      player.money += e.v * n; checkBankrupt(room, player); break;
    }
    case 'gotoType': {
      const N = tiles.length;
      let j = player.pos;
      for (let k = 1; k <= N; k++) { const x = (player.pos + k) % N; if (tiles[x].type === e.type2) { j = x; break; } }
      goToPos(room, player, j, true); resolveTile(room, player); break;
    }
    case 'mini': startMini(room, player, player.pos, rand(['rps', 'quiz', 'wheel', 'bond', 'coop', 'dare'])); break;
    case 'deposit': {
      const v = Math.min(e.v, Math.max(0, player.money));
      player.money -= v; player.savings = (player.savings || 0) + v;
      pushLog(room, `🏦 ${player.name} 往银行存入 ${v}。`); break;
    }
    case 'withdraw': {
      const v = player.savings || 0; player.savings = 0; player.money += v;
      pushLog(room, `🏦 ${player.name} 取回全部存款 ${v}。`); break;
    }
    case 'loan': player.money += e.v; player.loan = (player.loan || 0) + e.v;
      pushLog(room, `💳 ${player.name} 借款 ${e.v}（每圈自动还 100）。`); break;
    case 'transfer': player.money -= e.v; if (other) other.money += e.v;
      if (e.heart) g.heart += e.heart;
      pushLog(room, `💌 ${player.name} 送给对方 ${e.v} 的红包，默契 +${e.heart || 0}。`);
      checkBankrupt(room, player); break;
    case 'buycar': player.cars = (player.cars || 0) + 1; player.carBoost = (player.carBoost || 0) + e.v;
      pushLog(room, `🚗 ${player.name} 入手小车，接下来 ${e.v} 次多走 2 格！`); break;
    case 'life': if (F.extraRules) startChoice(room, player, 'life'); break;
    case 'teleport': {
      const portals = tiles.map((t, i) => t.type === 'portal' ? i : -1).filter((i) => i >= 0);
      if (portals.length) {
        const dest = portals.find((i) => i !== player.pos) ?? portals[0];
        g.moveSteps = (g.moveSteps || []).concat([dest]);
        player.pos = dest;
        pushLog(room, `🌀 ${player.name} 被传送到【${tiles[dest].name}】！`);
        setFx(room, 'portal', '🌀 传送！');
      }
      break;
    }
  }
}

/* ---------- v3.1 模拟人生：通用「人生选择」弹窗框架 ----------
 * bank(存/取/借) 与 life(双选情境) 共用同一套 phase / choice / choicePick，
 * 与 await_buy 同构：等玩家决定后才 advanceTurn，绝不提前推进回合。 */
function startChoice(room, player, kind) {
  const g = room.game;
  let title, desc, options, lifeQ = '';
  if (kind === 'bank') {
    title = '🏦 爱心银行';
    desc = `现金 ${player.money} · 存款 ${player.savings || 0} · 负债 ${player.loan || 0}<br>每绕一圈存款 +8% 利息，贷款每圈自动还 100`;
    options = [
      { label: '💰 存 300 生息', value: 'deposit300' },
      { label: '🏧 取回全部存款', value: 'withdraw' },
      { label: '💳 借 300 周转', value: 'loan300' },
      { label: '➡️ 什么也不做', value: 'skip' },
    ];
  } else {
    const ev = rand(LIFE_EVENTS);
    title = '🎭 人生驿站'; lifeQ = ev.q;
    desc = '两个人的人生，由每一次选择写成';
    options = ev.o.map((o, i) => ({ label: o.label, value: String(i) }));
    g._lifeEv = ev;
  }
  g.choice = { kind, title, desc, lifeQ, options, byIdx: room.players.indexOf(player), byName: player.name };
  g.phase = 'await_choice';
  pushLog(room, `${player.name} 来到【${title}】，需要做个选择。`);
  setFx(room, 'choice', `${player.name} 正在做人生选择…`);
  clearTimeout(room._choiceTimer);
  room._choiceTimer = setTimeout(() => {
    if (room.game && room.game.phase === 'await_choice') resolveChoice(room, -1);
  }, 30000);
}
function resolveChoice(room, value) {
  const g = room.game, c = g.choice;
  if (!c || g.phase !== 'await_choice') return;
  clearTimeout(room._choiceTimer);
  const player = room.players[c.byIdx];
  if (!player) { g.choice = null; g._lifeEv = null; advanceTurn(room, false); step(room); return; }
  const e = {}; let label = '超时跳过';
  if (c.kind === 'bank') {
    if (value === 'deposit300') {
      const v = Math.min(300, Math.max(0, player.money));
      player.money -= v; player.savings = (player.savings || 0) + v; label = `存入 ${v}`;
    } else if (value === 'withdraw') {
      const v = player.savings || 0; player.savings = 0; player.money += v; label = `取回 ${v}`;
    } else if (value === 'loan300') {
      player.money += 300; player.loan = (player.loan || 0) + 300; label = '借款 300';
    } else label = value === 'skip' ? '什么也没做' : '超时跳过';
  } else {
    const ev = g._lifeEv, pick = ev && ev.o[Number(value)];
    if (pick) { Object.assign(e, pick.e); label = pick.label; }
  }
  applyLifeEffect(room, player, e);
  pushLog(room, `${player.name} 选择「${label}」。`);
  setFx(room, 'life', `${player.name}：${label}`);
  g.choice = null; g._lifeEv = null;
  advanceTurn(room, false);
  step(room);
}
function applyLifeEffect(room, player, e) {
  const g = room.game, other = room.players.find((p) => p !== player);
  if (e.money) player.money += e.money;
  if (e.deposit) { const v = Math.min(e.deposit, Math.max(0, player.money)); player.money -= v; player.savings = (player.savings || 0) + v; }
  if (e.loan) { player.money += e.loan; player.loan = (player.loan || 0) + e.loan; }
  if (e.gift) { player.money -= e.gift; if (other) other.money += e.gift; }
  if (e.car) { player.money -= e.car; player.cars = (player.cars || 0) + 1; player.carBoost = (player.carBoost || 0) + (e.boost || 2); }
  else if (e.boost) player.carBoost = (player.carBoost || 0) + e.boost;
  if (e.heart) g.heart += e.heart;
  checkBankrupt(room, player);
}

/* =========================================================
 *  6. 买地 / 拍卖 / 建房 / 抵押 / 送礼
 * ======================================================= */
function finalizeBuy(room, buyer, idx, price) {
  buyer.money -= price; buyer.props[idx] = 0;
  pushLog(room, `${buyer.name} 以 ${price} 买下【${THEMES[room.theme].tiles[idx].name}】。`);
  setFx(room, 'bought', `${buyer.name} 买下啦 🏠`);
  checkBankrupt(room, buyer);
}
function buyProperty(room, player, idx, doBuy) {
  const g = room.game, tile = THEMES[room.theme].tiles[idx];
  if (doBuy && player.money >= tile.price) {
    finalizeBuy(room, player, idx, tile.price);
    advanceTurn(room, false);
  } else if (doBuy) {
    setFx(room, 'info', '钱不够，进入拍卖');
    startAuction(room, idx);
  } else if (F.extraRules) {
    pushLog(room, `${player.name} 放弃【${tile.name}】，进入拍卖！`);
    startAuction(room, idx);
  } else {
    pushLog(room, `${player.name} 放弃【${tile.name}】。`);
    advanceTurn(room, false);
  }
}
function startAuction(room, idx) {
  const g = room.game;
  g.phase = 'auction';
  g.auction = { tile: idx, name: THEMES[room.theme].tiles[idx].name,
    base: Math.round(THEMES[room.theme].tiles[idx].price * 0.5), bids: {}, done: false };
  setFx(room, 'auction', `${g.auction.name} 开始拍卖，起拍 ${g.auction.base}`);
  clearTimeout(room._auctionTimer);
  room._auctionTimer = setTimeout(() => { if (room.game && room.game.phase === 'auction') resolveAuction(room); }, 25000);
}
function auctionBid(room, socketId, amount) {
  const g = room.game, a = g.auction;
  if (!a || a.done) return;
  const p = room.players.find((x) => x.id === socketId);
  if (!p) return;
  const bid = amount === 0 ? 0 : Math.max(a.base, Number(amount) || a.base);
  a.bids[socketId] = bid;
  if (Object.keys(a.bids).length >= room.players.filter((x) => !x.bankrupt).length) resolveAuction(room);
}
function resolveAuction(room) {
  const g = room.game, a = g.auction;
  if (!a || a.done) return;
  a.done = true; clearTimeout(room._auctionTimer);
  const entries = room.players.filter((p) => !p.bankrupt).map((p) => ({ p, bid: a.bids[p.id] || 0 }));
  entries.sort((x, y) => y.bid - x.bid);
  const win = entries[0];
  if (win && win.bid > 0 && win.p.money >= win.bid) {
    finalizeBuy(room, win.p, a.tile, win.bid);
  } else {
    pushLog(room, `【${a.name}】流拍，无人购得。`);
    setFx(room, 'info', '流拍～');
  }
  g.auction = null; advanceTurn(room, false); step(room);
}
function buildHouse(room, player, idx) {
  const g = room.game, tile = THEMES[room.theme].tiles[idx];
  if (!tile.group) return { ok: false, msg: '车站/公用事业不能建房' };
  if (player.props[idx] === undefined) return { ok: false, msg: '这不是你的地' };
  if (!ownsGroup(room, player, tile.group)) return { ok: false, msg: '需集齐同色组所有地块' };
  const lv = player.props[idx];
  if (lv >= 5) return { ok: false, msg: '已是酒店' };
  const idxs = THEMES[room.theme].tiles.map((t, i) => t.group === tile.group ? i : -1).filter((i) => i >= 0);
  if (idxs.some((i) => player.props[i] < lv)) return { ok: false, msg: '需均匀建造：先给同组其他地也建一级' };
  const cost = houseCost(room, tile);
  if (player.money < cost) return { ok: false, msg: `钱不够（需 ${cost}）` };
  player.money -= cost; player.props[idx] = lv + 1;
  pushLog(room, `${player.name} 给【${tile.name}】${lv + 1 === 5 ? '建成酒店' : '建到第 ' + (lv + 1) + ' 级'}，花费 ${cost}。`);
  setFx(room, lv + 1 === 5 ? 'hotel' : 'house', lv + 1 === 5 ? '酒店落成 🏨' : '建房成功 🏠');
  return { ok: true };
}
function mortgage(room, player, idx, redeem) {
  const tile = THEMES[room.theme].tiles[idx];
  if (player.props[idx] === undefined) return { ok: false, msg: '这不是你的地' };
  if (redeem) {
    const cost = Math.round(tile.price * 0.55);
    if (!player.mortgaged[idx]) return { ok: false, msg: '这块地未抵押' };
    if (player.money < cost) return { ok: false, msg: `赎回需 ${cost}` };
    player.money -= cost; delete player.mortgaged[idx];
    pushLog(room, `${player.name} 赎回【${tile.name}】-${cost}。`);
  } else {
    if (player.mortgaged[idx]) return { ok: false, msg: '已抵押' };
    if (player.props[idx] > 0) return { ok: false, msg: '请先卖掉地上建筑' };
    const get = Math.round(tile.price * 0.5);
    player.money += get; player.mortgaged[idx] = true;
    pushLog(room, `${player.name} 抵押【${tile.name}】+${get}（抵押期间不收租）。`);
  }
  setFx(room, 'info', redeem ? '赎回成功' : '抵押成功');
  return { ok: true };
}

/* =========================================================
 *  7. 小游戏统一框架（solo / duo / auto）
 * ======================================================= */
function startMini(room, player, tileIdx, kind) {
  const g = room.game;
  let mode = 'duo', q = null, options = null, answerer = null, answererName = '';
  const actorIdx = room.players.indexOf(player);
  if (kind === 'quiz') {
    mode = 'solo'; const item = rand(QUIZ_POOL);
    const order = item.o.map((t, i) => ({ t, i }));
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    q = item.q; options = order.map((o) => o.t);
    answerer = player.id; answererName = player.name;
    g.mini = { kind, mode, tile: tileIdx, q, options, answerer, answererName, actorIdx,
      correct: order.findIndex((o) => o.i === item.a), picks: {}, resolved: false, result: null };
  } else if (kind === 'bond' || kind === 'coop' || kind === 'dare') {
    const item = kind === 'bond' ? rand(BOND_POOL) : kind === 'coop' ? rand(COOP_POOL) : null;
    q = kind === 'dare' ? rand(DARE_POOL) : item.q;
    options = kind === 'dare' ? ['完成啦 ✅', '也完成啦 💕'] : item.o;
    g.mini = { kind, mode: 'duo', tile: tileIdx, q, options, answerer: null, answererName: '', actorIdx,
      picks: {}, resolved: false, result: null };
  } else if (kind === 'wheel') {
    g.mini = { kind, mode: 'solo', tile: tileIdx, q: '转动幸运转盘 🎡', options: ['转！'],
      answerer: player.id, answererName: player.name, actorIdx, picks: {}, resolved: false, result: null };
  } else { // rps
    g.mini = { kind, mode: 'duo', tile: tileIdx, q: '石头剪刀布！同时出拳 ✊✋✌️',
      options: ['✊ 石头', '✋ 布', '✌️ 剪刀'], answerer: null, answererName: '', actorIdx,
      picks: {}, resolved: false, result: null };
  }
  g.phase = 'await_mini';
  pushLog(room, `${player.name} 触发小游戏【${miniName(kind)}】！`);
  setFx(room, 'mini', miniName(kind));
  clearTimeout(room._miniTimer);
  room._miniTimer = setTimeout(() => { if (room.game && room.game.mini && !room.game.mini.resolved) resolveMini(room, true); }, 30000);
}
function miniName(k) {
  return { rps: '石头剪刀布', quiz: '答题挑战', wheel: '幸运转盘', bond: '默契问答', coop: '双人任务', dare: '默契大冒险' }[k] || k;
}
function miniPick(room, socketId, value) {
  const g = room.game, m = g.mini;
  if (!m || m.resolved || g.phase !== 'await_mini') return;
  if (m.mode === 'solo' && m.answerer !== socketId) return;
  m.picks[socketId] = value;
  const alive = room.players.filter((p) => !p.bankrupt && p.connected);
  if (m.mode === 'solo' || Object.keys(m.picks).length >= Math.min(2, alive.length)) resolveMini(room);
  else broadcast(room);
}
function resolveMini(room, timedOut = false) {
  const g = room.game, m = g.mini;
  if (!m || m.resolved) return;
  m.resolved = true; clearTimeout(room._miniTimer);
  const [p0, p1] = room.players;
  const actor = room.players[m.actorIdx != null ? m.actorIdx : g.current] || room.players[g.current];
  let text = '', fx = 'mini';
  if (!actor || !p0 || !p1) { // 极端兜底：数据不完整就直接推进，绝不让服务器崩
    g.mini = null; advanceTurn(room, false); step(room); return;
  }
  // 超时/掉线场景：不奖励也不扣钱，只做展示后推进
  if (timedOut) {
    text = '小游戏已跳过，继续出发～'; fx = 'info';
  } else if (m.kind === 'quiz') {
    const v = m.picks[m.answerer];
    if (!timedOut && v === m.correct) {
      actor.money += QUIZ_REWARD; text = `答对啦！+${QUIZ_REWARD}`; fx = 'win';
    } else { actor.money -= QUIZ_PENALTY; text = `答错啦 -${QUIZ_PENALTY}`; fx = 'lose'; checkBankrupt(room, actor); }
    pushLog(room, `${actor.name} 答题：${text}`);
  } else if (m.kind === 'wheel') {
    const v = rand(WHEEL_PRIZES);
    actor.money += v; text = v >= 0 ? `转盘 +${v}！` : `转盘 ${v}…`;
    fx = v >= 0 ? 'win' : 'lose'; checkBankrupt(room, actor);
    pushLog(room, `${actor.name} 转动幸运转盘：${text}`);
  } else if (m.kind === 'rps') {
    const a = m.picks[p0.id] != null ? String(m.picks[p0.id]) : undefined;
    const b = m.picks[p1.id] != null ? String(m.picks[p1.id]) : undefined;
    const win = (x, y) => ({ '0': '2', '1': '0', '2': '1' })[x] === y;
    let winner = null;
    if (a === undefined || b === undefined) { text = timedOut ? '超时，本轮平局' : '等待出拳…'; }
    else if (a === b) text = '平局！再来一局～';
    else { winner = win(a, b) ? p0 : p1; winner.money += RPS_PRIZE; const loser = winner === p0 ? p1 : p0; loser.money -= RPS_PRIZE; checkBankrupt(room, loser);
      text = `${winner.name} 赢！+${RPS_PRIZE}`; fx = 'win'; }
    pushLog(room, `石头剪刀布：${text}`);
  } else { // bond / coop / dare —— 两人选项一致即成功
    const a = m.picks[p0.id], b = m.picks[p1.id];
    const ok = !timedOut && a !== undefined && b !== undefined && a === b;
    const reward = m.kind === 'bond' ? BOND_REWARD : m.kind === 'coop' ? COOP_REWARD : DARE_REWARD;
    if (ok) {
      p0.money += reward; p1.money += reward;
      if (m.kind === 'bond' || m.kind === 'coop' || m.kind === 'dare') g.heart += m.kind === 'bond' ? 2 : 1;
      text = `心有灵犀！两人各 +${reward}，默契值 +${m.kind === 'bond' ? 2 : 1} 💗`; fx = 'heart';
    } else text = timedOut ? '超时啦，下次再默契一次～' : '这次没对上，下次再来 💕';
    pushLog(room, `${miniName(m.kind)}：${text}`);
  }
  m.result = { text };
  setFx(room, fx, text);
  // 展示结果 1.6s 后推进（前端也有结果态）
  setTimeout(() => {
    if (!room.game || room.game.mini !== m) return;
    g.mini = null; advanceTurn(room, false); step(room);
  }, 1600);
  step(room);
}
function skipPendingMini(room) {
  const g = room.game;
  if (g && g.phase === 'await_mini' && g.mini && !g.mini.resolved) {
    // 掉线时不结算金额，直接取消小游戏并推进回合（由 disconnect 统一广播）
    clearTimeout(room._miniTimer);
    g.mini.resolved = true; g.mini = null;
    pushLog(room, '对方掉线，小游戏取消，继续游戏。');
    advanceTurn(room, false);
  }
}

/* =========================================================
 *  8. 胜负
 * ======================================================= */
function checkEnd(room) {
  const g = room.game;
  if (!g || g.phase === 'ended') return;
  const alive = room.players.filter((p) => !p.bankrupt);
  if (g.mode === 'heart') {
    if (alive.length < room.players.length) return endCoop(room, false);
    if (g.heart >= g.heartTarget) return endCoop(room, true, 'heart');
    return;
  }
  if (g.mode === 'race') {
    const leader = room.players.find((p) => !p.bankrupt && p.laps >= g.targetLaps);
    if (leader) return endRace(room, leader);
    if (alive.length === 1) return endRace(room, alive[0]);
    return;
  }
  if (g.mode === 'coop') {
    if (alive.length < room.players.length) return endCoop(room, false);
    if (alive.reduce((s, p) => s + netWorth(room, p), 0) >= g.coopTarget) return endCoop(room, true);
    return;
  }
  if (alive.length === 1) {
    g.phase = 'ended'; g.winner = alive[0].id;
    pushLog(room, `🎉 ${alive[0].name} 获胜！`);
    setFx(room, 'win', `${alive[0].name} 获胜！`);
  }
}
function endRace(room, w) {
  const g = room.game; g.phase = 'ended'; g.winner = w.id;
  pushLog(room, `🏁 ${w.name} 率先跑满 ${g.targetLaps} 圈，赢得竞速！`);
  setFx(room, 'win', `${w.name} 竞速获胜！`);
}
function endCoop(room, ok, why) {
  const g = room.game; g.phase = 'ended'; g.coop = ok; g.winner = ok ? room.players[0].id : null;
  pushLog(room, ok ? (why === 'heart' ? '💗 默契值满格，心跳模式共同获胜！' : '🎉 合作成功，共同获胜！') : '💔 合作失败，有人破产了…');
  setFx(room, ok ? 'win' : 'lose', ok ? (why === 'heart' ? '默契满格 💗' : '合作成功 💕') : '合作失败 💔');
}
function endByRounds(room) {
  const g = room.game; g.phase = 'ended';
  if (g.mode === 'heart' || g.mode === 'coop') {
    const alive = room.players.filter((p) => !p.bankrupt);
    return endCoop(room, alive.length === room.players.length && (g.mode === 'heart' ? g.heart >= g.heartTarget : alive.reduce((s, p) => s + netWorth(room, p), 0) >= g.coopTarget), g.mode === 'heart' ? 'heart' : '');
  }
  if (g.mode === 'race') {
    const sorted = [...room.players].sort((a, b) => b.laps - a.laps || netWorth(room, b) - netWorth(room, a));
    return endRace(room, sorted[0]);
  }
  const best = [...room.players].sort((a, b) => netWorth(room, b) - netWorth(room, a))[0];
  g.winner = best.id;
  pushLog(room, `🏁 ${g.maxRounds} 回合结束，按净资产结算：${best.name} 获胜！`);
  setFx(room, 'win', `${best.name} 获胜`);
}

/* =========================================================
 *  9. 存档（写盘防抖 + 版本校验）
 * ======================================================= */
const persistTimers = new Map();
function schedulePersist(room) {
  if (persistTimers.has(room.code)) return;
  const t = setTimeout(() => { persistTimers.delete(room.code); persistRoom(room); }, 400);
  persistTimers.set(room.code, t);
}
function persistRoom(room) {
  const data = {
    boardVersion: BOARD_VERSION, code: room.code, gameKind: room.gameKind || 'monopoly', theme: room.theme, mode: room.mode,
    pace: room.pace, ver: room.ver || 0,
    players: room.players.map((p) => ({
      name: p.name, color: p.color, token: p.token, avatar: p.avatar,
      pos: p.pos, money: p.money, props: p.props, mortgaged: p.mortgaged, items: p.items,
      inJail: p.inJail, jailTurns: p.jailTurns, bankrupt: p.bankrupt, laps: p.laps,
      savings: p.savings || 0, loan: p.loan || 0, cars: p.cars || 0, carBoost: p.carBoost || 0,
    })),
    game: room.game ? { ...room.game, tileDyn: undefined, moveSteps: [], eventFx: null, mini: null } : null,
  };
  try { fs.writeFile(path.join(SAVE_DIR, room.code + '.json'), JSON.stringify(data), () => {}); } catch (e) {}
}
function deleteSave(code) {
  const f = path.join(SAVE_DIR, code + '.json');
  if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (e) {} }
}
function loadSaves() {
  let files = [];
  try { files = fs.readdirSync(SAVE_DIR).filter((f) => f.endsWith('.json')); } catch (e) { return; }
  let ok = 0;
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, f), 'utf8'));
      if (data.boardVersion !== BOARD_VERSION) { fs.unlinkSync(path.join(SAVE_DIR, f)); continue; } // 旧版存档作废
      const room = { code: data.code, gameKind: data.gameKind || 'monopoly',
        theme: data.theme, mode: data.mode, pace: data.pace || 'standard',
        ver: data.ver || 0, players: data.players.map((p) => ({ ...p, id: null, connected: false })),
        game: data.game };
      if (room.game) { room.game.mini = null; room.game.auction = null; room.game.choice = null;
        room.game._lifeEv = null; room.game.phase = 'await_roll'; }
      rooms.set(room.code, room);
      room.players.forEach((p) => tokens.set(p.token, { code: room.code, playerId: null }));
      pushLog(room, '（已从存档恢复，等待玩家重连…）');
      ok++;
    } catch (e) { /* 损坏存档忽略 */ }
  }
  if (ok) console.log(`📦 已恢复 ${ok} 个 v3 存档房间`);
}

/* =========================================================
 *  10. Socket 事件
 * ======================================================= */
io.on('connection', (socket) => {
  // v2.2 保留：断线自动重连按 token 重绑身份
  const ha = socket.handshake.auth || {};
  if (ha.token && ha.code) {
    const r0 = rooms.get(String(ha.code).toUpperCase());
    if (r0) {
      const p0 = r0.players.find((x) => x.token === ha.token);
      if (p0) { p0.id = socket.id; p0.connected = true; socket.join(r0.code); sendBoard(r0); broadcast(r0); }
    }
  }

  socket.on('createRoom', ({ name, theme, mode, pace, gameKind }) => {
    const code = genCode();
    const room = { code,
      gameKind: GAME_KINDS[gameKind] && GAME_KINDS[gameKind].ready ? gameKind : 'monopoly',
      theme: THEMES[theme] ? theme : 'city',
      mode: MODES[mode] ? mode : 'classic', pace: PACES[pace] ? pace : 'standard',
      ver: 0, players: [makePlayer(socket.id, name, '#ff5e7e', genToken())], game: null };
    room.players[0].avatar = 'boy';
    rooms.set(code, room);
    tokens.set(room.players[0].token, { code, playerId: socket.id });
    socket.join(code);
    socket.emit('created', { code });
    sendBoard(room);
    broadcast(room);
  });

  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return socket.emit('errorMsg', '房间不存在');
    if (room.players.length >= 2) return socket.emit('errorMsg', '房间已满');
    if (room.game) return socket.emit('errorMsg', '游戏已开始，无法加入');
    const p = makePlayer(socket.id, name, '#5b8ff9', genToken());
    p.avatar = 'girl';
    room.players.push(p);
    tokens.set(p.token, { code: room.code, playerId: socket.id });
    socket.join(room.code);
    socket.emit('joined', { code: room.code });
    sendBoard(room);
    broadcast(room);
  });

  socket.on('reconnect', ({ code, token, name }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return socket.emit('errorMsg', '房间不存在或已过期');
    const p = room.players.find((x) => x.token === token);
    if (!p) return socket.emit('errorMsg', '身份校验失败，请重新加入');
    p.id = socket.id; p.connected = true;
    if (name && !room.game) p.name = name;
    socket.join(room.code);
    socket.emit('reconnected', { code: room.code });
    sendBoard(room); broadcast(room);
  });

  socket.on('requestSync', () => {
    const room = findRoomBySocket(socket.id);
    if (room) { sendBoard(room); socket.emit('state', publicState(room, socket.id)); }
  });

  socket.on('startGame', ({ mode, pace, theme } = {}) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return socket.emit('needResync');
    if (room.players.length < 2) return;
    if (room.game && room.game.phase === 'ended') room.game = null;
    if (room.game) return;
    if (mode && MODES[mode]) room.mode = mode;
    if (pace && PACES[pace]) room.pace = pace;
    if (theme && THEMES[theme]) room.theme = theme;
    buildGame(room);
    sendBoard(room);
    broadcast(room);
  });

  socket.on('rollDice', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('needResync');
    const g = room.game;
    if (g.phase !== 'await_roll') return;
    const player = room.players[g.current];
    if (player.id !== socket.id) return;
    g.eventFx = null;
    rollDice(room, player);
    step(room);
  });

  socket.on('buyDecision', ({ buy }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('needResync');
    const g = room.game;
    if (g.phase !== 'await_buy') return;
    if (room.players[g.current].id !== socket.id) return;
    buyProperty(room, room.players[g.current], g.buyTile, !!buy);
    step(room);
  });

  socket.on('auctionBid', ({ amount }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game || room.game.phase !== 'auction') return;
    auctionBid(room, socket.id, amount);
    if (room.game.phase === 'auction') broadcast(room);
  });

  socket.on('buildHouse', ({ tileIndex }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('needResync');
    const p = room.players.find((x) => x.id === socket.id);
    const r = F.extraRules ? buildHouse(room, p, tileIndex) : { ok: false, msg: '该玩法未开启' };
    if (r.ok) step(room); else socket.emit('errorMsg', r.msg);
  });

  socket.on('mortgage', ({ tileIndex, redeem }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('needResync');
    const p = room.players.find((x) => x.id === socket.id);
    const r = F.extraRules ? mortgage(room, p, tileIndex, !!redeem) : { ok: false, msg: '该玩法未开启' };
    if (r.ok) step(room); else socket.emit('errorMsg', r.msg);
  });

  socket.on('miniPick', ({ value }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('needResync');
    miniPick(room, socket.id, value);
  });

  socket.on('choicePick', ({ value }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('needResync');
    const g = room.game;
    if (g.phase !== 'await_choice' || !g.choice) return;
    const p = room.players[g.choice.byIdx];
    if (!p || p.id !== socket.id) return;         // 只有当事人能决定
    resolveChoice(room, value);
  });

  socket.on('jailAction', ({ pay }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('needResync');
    const g = room.game;
    if (g.phase !== 'await_roll') return;
    const player = room.players[g.current];
    if (player.id !== socket.id || !player.inJail) return;
    if (pay) {
      if (player.money < 50) return socket.emit('errorMsg', '钱不够交保释金');
      player.money -= 50; player.inJail = false; player.jailTurns = 0;
      pushLog(room, `${player.name} 交保释金 50，立即出狱并掷骰。`);
      rollDice(room, player);
    } else {
      player.jailTurns++;
      if (player.jailTurns >= 3) {
        player.inJail = false; player.jailTurns = 0; player.money -= 50;
        pushLog(room, `${player.name} 关满 3 回合，交保释金 50 出狱。`);
        setFx(room, 'jailOut', '出狱');
      } else { setFx(room, 'jail', '继续关押'); advanceTurn(room, false); }
    }
    step(room);
  });

  socket.on('restart', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return socket.emit('needResync');
    room.game = null; deleteSave(room.code); broadcast(room);
  });

  /* v3.1 主动退出：两人房一人离开即解散，明确广播给对方，避免对方卡在原地 */
  socket.on('leaveRoom', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const p = room.players.find((x) => x.id === socket.id);
    socket.leave(room.code);
    io.to(room.code).emit('roomClosed', { by: p ? p.name : '对方' });
    room.players.forEach((x) => tokens.delete(x.token));
    clearTimeout(cleanupTimers[room.code]); delete cleanupTimers[room.code];
    ['_auctionTimer', '_miniTimer', '_choiceTimer'].forEach((k) => clearTimeout(room[k]));
    rooms.delete(room.code); deleteSave(room.code);
    console.log(`🚪 房间 ${room.code} 已解散（${p ? p.name : '?'} 退出）`);
  });

  /* v3.1 重开本局：清掉对局但保留房间与两人，双方一起回等待页重新配置 */
  socket.on('endSession', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.game) return socket.emit('needResync');
    const p = room.players.find((x) => x.id === socket.id);
    ['_auctionTimer', '_miniTimer', '_choiceTimer'].forEach((k) => clearTimeout(room[k]));
    room.game = null; deleteSave(room.code);
    io.to(room.code).emit('sessionEnded', { by: p ? p.name : '对方' });
    broadcast(room);
  });

  socket.on('chat', ({ text }) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const p = room.players.find((x) => x.id === socket.id);
    io.to(room.code).emit('chat', { name: p ? p.name : '?', text, color: p ? p.color : '#888' });
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      const p = room.players.find((x) => x.id === socket.id);
      if (p) {
        p.connected = false; p.id = null;
        pushLog(room, `${p.name} 暂时掉线（可重连）。`);
        skipPendingMini(room);
        if (room.game && room.game.phase === 'await_choice' && room.game.choice) {
          clearTimeout(room._choiceTimer);
          room.game.choice = null; room.game._lifeEv = null;
          pushLog(room, '对方掉线，人生选择跳过，继续游戏。');
          advanceTurn(room, false);
        }
        broadcast(room);
        if (room.players.every((x) => !x.connected)) scheduleCleanup(code);
      }
    }
  });
});

let cleanupTimers = {};
function scheduleCleanup(code) {
  if (cleanupTimers[code]) return;
  cleanupTimers[code] = setTimeout(() => {
    const room = rooms.get(code);
    if (room && room.players.every((x) => !x.connected)) {
      rooms.delete(code); delete cleanupTimers[code]; deleteSave(code);
      console.log(`🧹 清理长期离线房间 ${code}`);
    }
  }, 30 * 60 * 1000);
}
function findRoomBySocket(id) {
  for (const room of rooms.values()) if (room.players.some((p) => p.id === id)) return room;
  return null;
}

loadSaves();
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`⚠️ 端口 ${PORT} 已被占用（可能已有实例在运行），本实例退出。`);
  else console.error('服务器错误:', e);
});
server.listen(PORT, () => console.log(`💕 双人游戏合集 v3.1 已启动: http://localhost:${PORT}`));
