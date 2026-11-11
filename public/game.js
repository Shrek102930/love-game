/* 💕 双人游戏合集 v3.3 —— 前端逻辑（双环棋盘 / 岔路抄近道 / 头像 / 掷骰两步走 / 互动） */
(function () {
'use strict';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

/* ---------- 本地状态 ---------- */
const SKEY = 'love_monopoly_session_v3';
let S = { code: null, token: null, name: '' };
try { const j = JSON.parse(localStorage.getItem(SKEY) || '{}'); if (j && j.code) S = j; } catch (e) {}
const saveSession = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} };
const clearSession = () => { S = { code: null, token: null, name: '' }; try { localStorage.removeItem(SKEY); } catch (e) {} };

let sel = { gameKind: 'monopoly', theme: 'city', mode: 'classic', pace: 'standard', avatar: 'boy' };
let board = null;          // 静态棋盘定义
let st = null;             // 最新 state
let tileEls = [], pawnEls = [];
let boardBuilt = false;
let lastFxKey = '', lastMoveKey = '';
let animating = false;
let soundOn = true;
let audioCtx = null;
let rollTimeout = null;
let overlayTimer = null;
let unreadChat = 0;
let locTipEl = null;
/* v3.2 头像 / 掷骰两步 / 互动相关状态 */
let myAvatarData = null;                 // 自定义头像 dataURL（本地）
const avatarImages = {};                 // 房间内自定义头像缓存：playerIdx -> dataURL
let lastDiceKey = '', diceAnimating = false;
const AKEY = 'love_monopoly_avatar_v32';
const AVATAR_LIST = [
  { id: 'boy', name: '男生' }, { id: 'girl', name: '女生' },
  { id: 'cat', name: '奶猫' }, { id: 'bunny', name: '兔兔' },
  { id: 'bear', name: '小熊' }, { id: 'fox', name: '狐狸' },
  { id: 'panda', name: '熊猫' }, { id: 'penguin', name: '企鹅' },
  { id: 'frog', name: '青蛙' }, { id: 'unicorn', name: '独角兽' },
];

/* ---------- Socket ---------- */
const socket = io({
  auth: (cb) => cb(S.code ? { token: S.token, code: S.code } : {}),
  reconnection: true, reconnectionAttempts: Infinity,
  reconnectionDelay: 500, reconnectionDelayMax: 3000,
  transports: ['websocket', 'polling'],
});

function setNet(msg, off) {
  const b = $('netBar'); if (!b) return;
  if (!msg) { b.classList.add('hidden'); return; }
  b.textContent = msg; b.classList.toggle('off', !!off); b.classList.remove('hidden');
}
socket.on('connect', () => { setNet('✅ 已连接', false); setTimeout(() => setNet(''), 1800); });
socket.on('disconnect', () => setNet('⚠️ 连接断开，正在重连…', true));
socket.on('connect_error', () => setNet('⚠️ 连接失败，正在重试…', true));

/* ---------- 音效（Web Audio 合成，无外部资源） ---------- */
function beep(type) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = {
      dice: [[440, .08], [560, .08], [680, .12]],
      step: [[660, .045]],
      buy: [[523, .09], [659, .09], [784, .14]],
      coin: [[880, .07], [1100, .1]],
      win: [[523, .1], [659, .1], [784, .1], [1046, .22]],
      lose: [[392, .12], [294, .18]],
      heart: [[659, .08], [880, .08], [1046, .16]],
      click: [[600, .04]],
    }[type] || [[600, .05]];
    let t = audioCtx.currentTime;
    notes.forEach(([f, d]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.13, t + .01);
      g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + d + .02); t += d;
    });
  } catch (e) {}
}
function toggleSound() {
  soundOn = !soundOn;
  ['soundBtn', 'gdSoundBtn', 'c4SoundBtn'].forEach((id) => { const e = $(id); if (e) e.textContent = soundOn ? '🔊' : '🔇'; });
  const sv = $('setSoundVal'); if (sv) sv.textContent = soundOn ? '开' : '关';
  if (soundOn) beep('click');
}
$('soundBtn') && $('soundBtn').addEventListener('click', toggleSound);
$('gdSoundBtn') && $('gdSoundBtn').addEventListener('click', toggleSound);
$('c4SoundBtn') && $('c4SoundBtn').addEventListener('click', toggleSound);

/* ---------- v3.1 顶栏：悄悄话 / 设置 / 退出主菜单 ---------- */
function clearUnread() {
  unreadChat = 0;
  ['chatBadge', 'gdChatBadge', 'c4ChatBadge', 'chatUnread', 'gdChatUnread', 'c4ChatUnread'].forEach((id) => {
    const e = $(id); if (e) { e.classList.add('hidden'); e.textContent = '0'; }
  });
}
function openChat() {
  const gk = st && st.gameKind;
  const p = gk === 'garden' ? $('gdChatPanel') : (gk === 'connect4' ? $('c4ChatPanel') : $('chatPanel')); if (!p) return;
  p.open = true; clearUnread();
  p.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
$('chatBtn') && $('chatBtn').addEventListener('click', () => { beep('click'); openChat(); });
$('gdChatBtn') && $('gdChatBtn').addEventListener('click', () => { beep('click'); openChat(); });
$('c4ChatBtn') && $('c4ChatBtn').addEventListener('click', () => { beep('click'); openChat(); });
['chatPanel', 'gdChatPanel'].forEach((id) => {
  const e = $(id); if (e) e.addEventListener('toggle', () => { if (e.open) clearUnread(); });
});

let _monoHelp = null;
function openSettings() {
  $('setRoomInfo').textContent = '房间 ' + ((st && st.code) || S.code || '------');
  $('setSoundVal').textContent = soundOn ? '开' : '关';
  const gk = st && st.gameKind;
  const isG = gk === 'garden';
  const isC4 = gk === 'connect4';
  // 花园房 / 四子棋房：玩法速览换成本游戏说明、重开按钮文案同步
  const help = document.querySelector('.set-help');
  if (help) {
    if (_monoHelp === null) _monoHelp = help.innerHTML;
    help.innerHTML = isG
      ? '<b>花园玩法速览</b><br>选个道具点空地种花/摆装饰 · 点有苗的地浇水<br>两人一起浇水、合种树、送花、留言才会涨爱心 💗<br>🌰 种子会按真实时间发芽、开花，常回来看看～'
      : isC4
      ? '<b>四子棋玩法</b><br>7 列×6 行棋盘，两人各执一种颜色的爱心 💗粉 / 💙蓝<br>轮流选一列，爱心会掉到该列最底，先把 4 颗心连成一线（横/竖/斜）就赢～<br>谁先连成谁赢，棋盘填满则平局。'
      : _monoHelp;
  }
  const rr = $('setRestart');
  if (rr) {
    const label = isG ? '🔄 重置花园 ' : (isC4 ? '🔄 重开对局 ' : '🔄 重开本局 ');
    rr.firstChild.textContent = label;
    const sp = rr.querySelector('span'); if (sp) sp.textContent = isG ? '清空花园重新开始' : (isC4 ? '清空棋盘再来一局' : '双方回到等待页');
  }
  $('settings').classList.remove('hidden');
}
function closeSettings() { $('settings').classList.add('hidden'); }
function doLeave() {
  socket.emit('leaveRoom');
  clearSession(); st = null; board = null; boardBuilt = false; clearUnread();
  resetZoom(); resetGardenUI(); resetConnect4UI();
  $('over').classList.add('hidden'); $('settings').classList.add('hidden');
  show('lobby');
}
$('settingsBtn') && $('settingsBtn').addEventListener('click', () => { beep('click'); openSettings(); });
$('setClose') && $('setClose').addEventListener('click', closeSettings);
$('settings') && $('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });
$('setSound') && $('setSound').addEventListener('click', toggleSound);
$('setRestart') && $('setRestart').addEventListener('click', () => {
  const gk = st && st.gameKind;
  const isG = gk === 'garden';
  const isC4 = gk === 'connect4';
  const msg = isG ? '重置花园？所有植物、装饰和留言会清空，重新开始。'
    : isC4 ? '重开对局？当前棋盘会清空，双方一起回到等待页再来一局。'
    : '重开本局？当前进度会清空，双方一起回到等待页重新选择模式。';
  if (!window.confirm(msg)) return;
  closeSettings();
  if (isG) socket.emit('gardenAction', { action: 'reset' });
  else socket.emit('endSession');
});
$('setExit') && $('setExit').addEventListener('click', () => {
  if (!window.confirm('退出房间？会解散当前房间，对方也会回到大厅。')) return;
  closeSettings(); doLeave();
});
$('exitBtn') && $('exitBtn').addEventListener('click', () => {
  if (!window.confirm('返回主菜单？会解散当前房间，对方也会回到大厅。')) return;
  doLeave();
});

/* ---------- 屏幕切换 ---------- */
function show(which) {
  ['lobby', 'waiting', 'game', 'garden', 'connect4'].forEach((x) => $(x).classList.toggle('hidden', x !== which));
  window.scrollTo(0, 0);
}
function showOverlay(title, desc, btns) {
  const o = $('overlay'); $('overlayTitle').textContent = title; $('overlayDesc').textContent = desc;
  const box = $('overlayBtns'); box.innerHTML = '';
  if (btns && btns.length) {
    box.classList.remove('hidden');
    btns.forEach((b) => { const btn = el('button', b.primary ? 'primary' : 'ghost', b.text); btn.onclick = b.onClick; box.appendChild(btn); });
  } else box.classList.add('hidden');
  o.classList.remove('hidden');
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => { if (btns && btns.length) return; o.classList.add('hidden'); }, 8000);
}
const hideOverlay = () => { clearTimeout(overlayTimer); $('overlay').classList.add('hidden'); };

/* ---------- 大厅交互 ---------- */
function bindGroup(groupId, key, cls) {
  const g = $(groupId); if (!g) return;
  g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    g.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); sel[key] = b.dataset.v; beep('click');
  });
}
/* v4.3：显式映射。原先用 id.includes('Theme'/'Mode') 判 key，但大厅三组是小写
   themeBtns/modeBtns/paceBtns，全部误判成 'pace' —— 导致大厅选主题/模式/节奏完全不生效
   （点「心跳」实际只改了 sel.pace，sel.mode 永远 classic，游戏按 30 回合净资产突然结算）。 */
const GROUP_KEY = { themeBtns: 'theme', modeBtns: 'mode', paceBtns: 'pace', wThemeBtns: 'theme', wModeBtns: 'mode', wPaceBtns: 'pace' };
Object.keys(GROUP_KEY).forEach((id) => bindGroup(id, GROUP_KEY[id]));
// v4.0 游戏合集：情侣大富翁 + 共享小花园 两款可玩，其余 coming soon 占位
const gkBtns = $('gameKindBtns');
function syncGameKindUI() {
  const isMono = sel.gameKind === 'monopoly';
  const opts = $('monopolyOpts'); if (opts) opts.classList.toggle('hidden', !isMono);
  const cbtn = $('createBtn'); if (cbtn) cbtn.textContent = sel.gameKind === 'garden' ? '🌷 创建小花园' : '✨ 创建房间';
}
if (gkBtns) gkBtns.addEventListener('click', (e) => {
  const b = e.target.closest('.game-card:not(.soon)'); if (!b) return;
  gkBtns.querySelectorAll('.game-card').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); sel.gameKind = b.dataset.v || 'monopoly'; beep('click');
  syncGameKindUI();
});
syncGameKindUI();
function syncWaitBtns() {
  [['wThemeBtns', 'theme'], ['wModeBtns', 'mode'], ['wPaceBtns', 'pace']].forEach(([id, k]) => {
    const g = $(id); if (!g) return;
    g.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === sel[k]));
  });
}
$('createBtn').onclick = () => {
  const name = ($('nameInput').value || '').trim() || '玩家';
  S.name = name; beep('click');
  socket.emit('createRoom', { name, ...sel });   // sel.avatar 随建房下发
  $('lobbyMsg').textContent = '正在创建房间…';
};
$('joinBtn').onclick = () => {
  const code = ($('codeInput').value || '').trim().toUpperCase();
  if (code.length !== 6) { $('lobbyMsg').textContent = '请输入 6 位房间号'; return; }
  const name = ($('nameInput').value || '').trim() || '玩家';
  S.name = name; beep('click');
  socket.emit('joinRoom', { code, name, avatar: sel.avatar });
  $('lobbyMsg').textContent = '正在加入…';
};
$('copyCode').onclick = () => {
  const t = S.code || '';
  try { navigator.clipboard.writeText(t); } catch (e) {}
  $('copyCode').textContent = '✅ 已复制 ' + t; setTimeout(() => $('copyCode').textContent = '📋 复制房间号', 1600);
};
$('startBtn').onclick = () => { beep('click'); socket.emit('startGame', { ...sel }); };
$('backBtn').onclick = () => { if (S.code) socket.emit('leaveRoom'); clearSession(); st = null; board = null; boardBuilt = false; clearUnread(); resetGardenUI(); resetConnect4UI(); show('lobby'); };
$('againBtn').onclick = () => { beep('click'); $('over').classList.add('hidden'); socket.emit('restart'); };
$('homeBtn').onclick = () => { if (S.code) socket.emit('leaveRoom'); clearSession(); st = null; board = null; boardBuilt = false; clearUnread(); resetGardenUI(); resetConnect4UI(); $('over').classList.add('hidden'); show('lobby'); };
$('chatSend').onclick = () => {
  const v = ($('chatInput').value || '').trim(); if (!v) return;
  socket.emit('chat', { text: v }); $('chatInput').value = '';
};
$('chatInput') && $('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('chatSend').click(); });
$('c4ChatSend') && ($('c4ChatSend').onclick = () => {
  const v = ($('c4ChatInput').value || '').trim(); if (!v) return;
  socket.emit('chat', { text: v }); $('c4ChatInput').value = '';
});
$('c4ChatInput') && $('c4ChatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('c4ChatSend').click(); });

/* ---------- Socket 事件 ---------- */
socket.on('errorMsg', (m) => { $('lobbyMsg').textContent = m; toast('⚠️ ' + m); });
socket.on('created', ({ code }) => { S.code = code; saveSession(); $('roomCode').textContent = code; $('gCode').textContent = code; show('waiting'); syncWaitBtns();
  if (sel.avatar === 'custom' && myAvatarData) socket.emit('setAvatar', { avatar: 'custom', data: myAvatarData }); });
socket.on('joined', ({ code }) => { S.code = code; saveSession(); $('roomCode').textContent = code; $('gCode').textContent = code; show('waiting');
  if (sel.avatar === 'custom' && myAvatarData) socket.emit('setAvatar', { avatar: 'custom', data: myAvatarData }); });
socket.on('reconnected', ({ code }) => { S.code = code; hideOverlay(); });
socket.on('board', (b) => { board = b; tryRender(); });
socket.on('avatarImage', ({ idx, data }) => {
  if (data) avatarImages[idx] = data; else delete avatarImages[idx];
  tryRender();
});
socket.on('interactFx', (d) => {
  showInteractFx(d); toast(d.text || '互动一下');
  beep(d.kind === 'heart' ? 'heart' : 'coin');
});
socket.on('state', (s) => {
  st = s; st._recvAt = Date.now();   // v4.0： gardens 本地按真实时间重算植物阶段
  if (s.players) { const me = s.players.find((p) => p.isYou); if (me && me.token && !S.token) { S.token = me.token; S.code = s.code; saveSession(); } }
  tryRender();
});
/* v4.0 花园动作特效：飘个 emoji + 音效，state 随后到达负责重绘 */
socket.on('gardenFx', (d) => {
  if (!d || st.gameKind !== 'garden') return;
  const layer = $('interactFxLayer');
  if (layer) {
    for (let i = 0; i < 4; i++) {
      const s = el('div', 'i-fx', gdFxSvg(d.kind, 22 + Math.round(Math.random() * 12)));
      s.style.left = (20 + Math.random() * 60) + 'vw';
      s.style.animationDelay = (Math.random() * 0.4) + 's';
      layer.appendChild(s); setTimeout(() => s.remove(), 2600);
    }
  }
  beep(d.kind === 'water' ? 'coin' : 'heart');
});
socket.on('needResync', () => { setNet('🔄 正在重新同步…', true); socket.emit('requestSync'); setTimeout(() => setNet(''), 2500); });
socket.on('roomClosed', ({ by }) => {
  clearSession(); st = null; board = null; boardBuilt = false; clearUnread();
  resetGardenUI();
  $('over').classList.add('hidden'); $('settings').classList.add('hidden');
  show('lobby');
  showOverlay('对方已离开房间', (by || '对方') + ' 退出了，房间已解散，可以开一局新的～', [
    { text: '好的', primary: true, onClick: hideOverlay },
  ]);
  toast('💔 ' + (by || '对方') + ' 离开了房间');
});
socket.on('sessionEnded', ({ by }) => { toast('🔄 ' + (by || '对方') + ' 结束了本局，回到等待页'); beep('click'); });
socket.on('chat', ({ name, text, color }) => {
  // v4.0：同一条消息写入各视图各自的聊天框（大富翁 / 花园 / 四子棋）
  ['chatList', 'gdChatList', 'c4ChatList'].forEach((id) => {
    const c = $(id); if (!c) return;
    const d = el('div', 'chat-msg'); d.innerHTML = `<b style="color:${color}">${escapeHtml(name)}</b>：${escapeHtml(text)}`;
    c.appendChild(d); c.scrollTop = c.scrollHeight;
  });
  // 折叠时也能看到：未读角标 + 弹窗式气泡（按当前所在游戏挑对应面板）
  const gk = st && st.gameKind;
  const isG = gk === 'garden', isC4 = gk === 'connect4';
  const panel = isG ? $('gdChatPanel') : (isC4 ? $('c4ChatPanel') : $('chatPanel'));
  if (!panel || !panel.open) {
    unreadChat++;
    [isG ? 'gdChatBadge' : (isC4 ? 'c4ChatBadge' : 'chatBadge')].forEach((id) => {
      const b = $(id); if (b) { b.textContent = String(Math.min(99, unreadChat)); b.classList.remove('hidden'); }
    });
    [isG ? 'gdChatUnread' : (isC4 ? 'c4ChatUnread' : 'chatUnread')].forEach((id) => {
      const u = $(id); if (u) { u.textContent = String(unreadChat); u.classList.remove('hidden'); }
    });
  }
  chatToast(name, text, color);
  beep('coin');
});
function chatToast(name, text, color) {
  const old = document.querySelector('.chat-toast'); if (old) old.remove();
  const t = el('div', 'chat-toast');
  t.innerHTML = `<div class="ct-head"><span class="ct-ico">💬</span><b style="color:${color}">${escapeHtml(name)}</b><span class="ct-tag">悄悄话</span></div>
    <div class="ct-body">${escapeHtml(text)}</div><div class="ct-tap">点一下查看 💕</div>`;
  t.onclick = () => { t.remove(); openChat(); };
  document.body.appendChild(t);
  setTimeout(() => { if (t.isConnected) t.remove(); }, 4200);
}

function escapeHtml(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/* 断线重连询问（v2.2 保留，不再强制重连挡住输入） */
socket.on('connect', onFirstConnect);
let asked = false;
function onFirstConnect() {
  if (asked) return; asked = true;
  if (S.code && S.token) {
    showOverlay('要重连到上次房间吗？', '房间 ' + S.code + ' · 或开一局新的', [
      { text: '🔄 重连房间', primary: true, onClick: () => { socket.emit('reconnect', { code: S.code, token: S.token, name: S.name }); showOverlay('正在重连…', '恢复到之前的房间'); setTimeout(hideOverlay, 2500); } },
      { text: '不用了，开新游戏', onClick: () => { clearSession(); st = null; board = null; boardBuilt = false; hideOverlay(); show('lobby'); } },
    ]);
  }
}

/* ========== v3.2 头像系统 ========== */
function builtinAvatarSrc(id) {
  if (id === 'boy' || id === 'girl') return `/assets/avatar-${id}.png`;
  return `/assets/av-${id}.svg`;
}
function avatarSrc(p, idx) {
  const av = p && p.avatar;
  if (av === 'custom') return avatarImages[idx] || builtinAvatarSrc(idx === 1 ? 'girl' : 'boy');
  if (av === 'boy' || av === 'girl') return builtinAvatarSrc(av);
  if (av && AVATAR_LIST.some((a) => a.id === av)) return builtinAvatarSrc(av);
  return builtinAvatarSrc(idx === 1 ? 'girl' : 'boy');
}
function applyPawnAvatars() {
  if (!st || !pawnEls) return;
  st.players.forEach((p, i) => {
    if (pawnEls[i]) pawnEls[i].style.backgroundImage = `url("${avatarSrc(p, i)}")`;
  });
}
function loadAvatarLocal() {
  try { const j = JSON.parse(localStorage.getItem(AKEY) || '{}');
    if (j.avatar) { sel.avatar = j.avatar; myAvatarData = j.data || null; } } catch (e) {}
}
function saveAvatarLocal() {
  try { localStorage.setItem(AKEY, JSON.stringify({ avatar: sel.avatar, data: myAvatarData })); } catch (e) {}
}
function updateAvatarPreview() {
  const img = $('avatarPickImg'), nm = $('avatarPickName');
  if (img) img.src = sel.avatar === 'custom' ? (myAvatarData || builtinAvatarSrc('boy')) : builtinAvatarSrc(sel.avatar);
  const f = AVATAR_LIST.find((a) => a.id === sel.avatar);
  if (nm) nm.textContent = sel.avatar === 'custom' ? '自定义头像' : (f ? f.name : '男生');
}
function renderAvatarGrid() {
  const g = $('avatarGrid'); if (!g) return;
  g.innerHTML = '';
  AVATAR_LIST.forEach((a) => {
    const b = el('button', 'av-item' + (sel.avatar === a.id ? ' active' : ''),
      `<img src="${builtinAvatarSrc(a.id)}" alt=""><span>${a.name}</span>`);
    b.onclick = () => pickAvatar(a.id);
    g.appendChild(b);
  });
  if (sel.avatar === 'custom' && myAvatarData) {
    const b = el('button', 'av-item active',
      `<img src="${myAvatarData}" alt=""><span>我的照片</span>`);
    b.onclick = () => {};
    g.appendChild(b);
  }
}
function pickAvatar(id) {
  sel.avatar = id; myAvatarData = null;
  saveAvatarLocal(); updateAvatarPreview(); renderAvatarGrid();
  if (S.code) socket.emit('setAvatar', { avatar: id });
  beep('click');
}
function openAvatarModal() { renderAvatarGrid(); $('avatarModal').classList.remove('hidden'); }
function closeAvatarModal() { $('avatarModal').classList.add('hidden'); }
function compressImage(file, size, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const ctx = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ========== v3.2 双人互动飘动画（v4.0 图标改用 SVG，不依赖 emoji 字体） ========== */
function showInteractFx(d) {
  const layer = $('interactFxLayer'); if (!layer) return;
  for (let i = 0; i < 8; i++) {
    const s = el('div', 'i-fx', gdFxSvg(d.kind, 20 + Math.round(Math.random() * 16)));
    s.style.left = (8 + Math.random() * 84) + 'vw';
    s.style.animationDelay = (Math.random() * 0.5) + 's';
    layer.appendChild(s);
    setTimeout(() => s.remove(), 2600);
  }
  const big = el('div', 'i-fx-big',
    `<span class="ifb-emoji">${gdFxSvg(d.kind, 30)}</span><b>${escapeHtml(d.from || 'TA')}</b><small>${escapeHtml(d.text || '')}</small>`);
  layer.appendChild(big);
  setTimeout(() => big.remove(), 2300);
}

/* ---------- 渲染总入口（DOM 复用）· v4.0 按 gameKind 分流 ---------- */
function tryRender() {
  if (!st) return;
  if (st.gameKind === 'garden') {         // v4.0 共享小花园：完全独立的视图与渲染
    if (!st.started) { renderWaiting(); return; }
    hideOverlay(); show('garden'); renderGarden(); return;
  }
  if (st.gameKind === 'connect4') {       // v4.4 主题四子棋：完全独立的视图与渲染
    if (!st.started) { renderWaiting(); return; }
    hideOverlay(); show('connect4'); renderConnect4(); return;
  }
  if (!st.started) { renderWaiting(); return; }
  if (!board) return;                     // 等 board 到达
  if (board.boardVersion !== st.boardVersion) { socket.emit('requestSync'); return; }
  hideOverlay();
  show('game');
  paintGdIcons($('game'));        // v4.0：互动条等图标用 SVG，避免 emoji 豆腐块
  if (!boardBuilt) { buildBoard(); applyZoomPref(); }  // v4.2：进房自动恢复放大偏好
  renderTop();
  renderPlayers();
  renderBoardDyn();
  if (!animating) renderLocTip(st.game.current);
  renderCenter();
  renderControls();
  renderAssets();
  renderLog();
  renderModals();
  handleFx();
}

function renderWaiting() {
  show('waiting');
  const isG = st.gameKind === 'garden';
  const isMono = st.gameKind === 'monopoly';
  $('roomCode').textContent = st.code || S.code || '------';
  const box = $('waitPlayers'); box.innerHTML = '';
  st.players.forEach((p) => {
    const d = el('div', 'pbox', `<img class="pav" src="${avatarSrc(p, st.players.indexOf(p))}"><div class="pinfo"><div class="pname">${escapeHtml(p.name)}</div><div class="pmeta">${p.connected ? '✅ 已就位' : '⏳ 掉线'}</div></div>`);
    d.style.maxWidth = '190px'; box.appendChild(d);
  });
  const n = st.players.length, isHost = st.players[0] && st.players[0].isYou;
  $('waitHint').textContent = n >= 2
    ? (isG ? '两人都到齐啦，房主点「进入花园」一起布置～（2/2）' : '两人都到齐啦，房主点开始游戏～（2/2）')
    : '等待另一位玩家加入…（1/2）';
  // 花园房 / 四子棋房用不到主题/模式/节奏，隐藏设置；标题与按钮文案也切换
  $('waitSetup').classList.toggle('hidden', !isHost || !isMono);
  const sb = $('startBtn');
  sb.textContent = isG ? '🌷 进入花园' : (st.gameKind === 'connect4' ? '💗 开始四子棋' : '🎮 开始游戏');
  sb.classList.toggle('hidden', !(isHost && n >= 2));
  if (isMono) syncWaitBtns();
}

/* ==================================================================
 * v4.0 共享小花园（沙盒 · 2.5D 等距）前端
 * 服务器权威：只发 gardenAction，按广播回来的 state 重绘。
 * 植物按真实时间成长：本地用 plantedAt/growMs 定时重算阶段，无需轮询服务器。
 * ================================================================== */
/* 花园页 UI 图标（内联 SVG，避免手机 emoji 字体缺失显示豆腐块） */
const GD_UI = {
  coin: `<circle cx="12" cy="12" r="9.5" fill="#f7c948" stroke="#e0a92f" stroke-width="1.5"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff0b8" stroke-width="1.2"/><text x="12" y="16" font-size="11" font-weight="800" text-anchor="middle" fill="#a9701a">¥</text>`,
  love: `<path d="M12 21 C2 14 2 6 7 5 C9.6 4.3 12 6.6 12 6.6 C12 6.6 14.4 4.3 17 5 C22 6 22 14 12 21 Z" fill="#ff6b8f"/>`,
  basket: `<path d="M4 10 L20 10 L18 21 L6 21 Z" fill="#d9a066" stroke="#a9703a" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 10 Q12 3 16 10" fill="none" stroke="#a9703a" stroke-width="1.6"/><path d="M9 13 L11 19 M12 13 L12 19 M15 13 L13 19" stroke="#a9703a" stroke-width="1" opacity=".7"/>`,
  checkin: `<rect x="3" y="5" width="18" height="16" rx="2.5" fill="#fff" stroke="#e07a8f" stroke-width="1.8"/><rect x="3" y="5" width="18" height="5" rx="2.5" fill="#ff8fa8"/><rect x="7" y="2.5" width="2" height="5" rx="1" fill="#c04a72"/><rect x="15" y="2.5" width="2" height="5" rx="1" fill="#c04a72"/><path d="M7.5 15.5 L10 18 L16.5 12" fill="none" stroke="#4ec9a5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  bouquet: `<path d="M12 21 L12 12 M8 21 Q9 15 12 13 M16 21 Q15 15 12 13" stroke="#4faa63" stroke-width="1.6" fill="none"/><circle cx="8" cy="8" r="3" fill="#ff8fa8"/><circle cx="16" cy="8" r="3" fill="#ffd873"/><circle cx="12" cy="6" r="3.2" fill="#e8536f"/><circle cx="12" cy="10" r="2.4" fill="#a05ad8"/>`,
  tree: `<rect x="10.5" y="14" width="3" height="8" rx="1" fill="#a9703a"/><circle cx="12" cy="10" r="7" fill="#6ccb7d"/><circle cx="8.5" cy="12" r="4.2" fill="#57bb6c"/><circle cx="15.5" cy="12" r="4.2" fill="#4faa63"/>`,
  letter: `<rect x="2.5" y="6" width="19" height="13" rx="2.5" fill="#fff" stroke="#e07a8f" stroke-width="1.7"/><path d="M3 7.5 L12 14 L21 7.5" fill="none" stroke="#e07a8f" stroke-width="1.7"/><path d="M16 3 L19 3 L19 6" fill="none" stroke="#ff8fa8" stroke-width="1.4"/>`,
  reset: `<path d="M19 12 A7 7 0 1 1 12 5 A7 7 0 0 1 18.5 8.5" fill="none" stroke="#c98a3e" stroke-width="2.2" stroke-linecap="round"/><path d="M18.5 4 L18.5 9 L13.5 9 Z" fill="#c98a3e"/>`,
  heart: `<path d="M12 21 C2 14 2 6 7 5 C9.6 4.3 12 6.6 12 6.6 C12 6.6 14.4 4.3 17 5 C22 6 22 14 12 21 Z" fill="#ff6b8f"/>`,
  poke: `<path d="M4 12 L14 12 M11 8 L15 12 L11 16" fill="none" stroke="#5b8ff9" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="12" r="2.6" fill="#a98ae8"/>`,
  gift: `<rect x="3.5" y="9" width="17" height="12" rx="1.8" fill="#ff8fa8"/><rect x="3" y="7" width="18" height="4" rx="1.5" fill="#e8536f"/><rect x="10.5" y="7" width="3" height="14" fill="#fff0b8"/><path d="M12 7 Q7 7 7 4.5 Q7 2.5 9.5 3.5 Q11 4 12 7 Z" fill="#ffd873"/><path d="M12 7 Q17 7 17 4.5 Q17 2.5 14.5 3.5 Q13 4 12 7 Z" fill="#ffd873"/>`,
  rps: `<path d="M8 11 V6.5 a1.5 1.5 0 0 1 3 0 V10 M11 10 V5.5 a1.5 1.5 0 0 1 3 0 V10 M14 10 V7 a1.5 1.5 0 0 1 3 0 V13 c0 4 -2.6 7 -6.5 7 -3 0 -4.5 -1.6 -6 -4 L3 12.5 a1.6 1.6 0 0 1 2.6 -1.8 L8 13" fill="#ffd9a8" stroke="#d99a5a" stroke-width="1.2" stroke-linejoin="round"/>`,
};
function gdUiIcon(name, size) {
  return `<svg viewBox="0 0 24 24" width="${size || 20}" height="${size || 20}" xmlns="http://www.w3.org/2000/svg" style="display:inline-block;vertical-align:middle">${GD_UI[name] || ''}</svg>`;
}
/* 互动/花园动作 → 飘动画用的 SVG 图标名 */
const GD_FX_ICON = {
  heart: 'heart', poke: 'poke', gift: 'gift', rps: 'rps', money: 'coin',
  plant: 'bouquet', decor: 'basket', water: 'tree', cotree: 'tree',
  checkin: 'checkin', message: 'letter', reset: 'reset',
};
function gdFxSvg(kind, size) { return gdUiIcon(GD_FX_ICON[kind] || 'heart', size || 24); }
/* 把页面里所有 [data-ico] 占位填充为 SVG（含后续动态插入的节点） */
function paintGdIcons(root) {
  (root || document).querySelectorAll('[data-ico]:not([data-ico-done])').forEach((e) => {
    e.innerHTML = gdUiIcon(e.dataset.ico, Number(e.dataset.icoSize) || 20);
    e.setAttribute('data-ico-done', '1');
  });
}
const GD_PLANT = {
  rose: { n: '玫瑰', c: '#e8536f', c2: '#ff8fa8' }, tulip: { n: '郁金香', c: '#a05ad8', c2: '#d49af0' },
  sunflower: { n: '向日葵', c: '#f2b53c', c2: '#ffd873' }, star: { n: '星星花', c: '#5b8ff9', c2: '#9dc0ff' },
};
const GD_DECOR = {
  bench: { n: '长椅' }, lamp: { n: '路灯' }, fountain: { n: '喷泉' }, swing: { n: '秋千' },
};
/* v4.0 植物/装饰用内联 SVG 程序化绘制：不依赖 emoji 字体，任何手机都清晰一致。
 * viewBox 0 0 40 48，茎从底部长出，底部对齐格子中心。 */
function gdSvg(type, key, stage) {
  const wrap = (inner) => `<svg viewBox="0 0 40 48" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  if (type === 'decor') {
    const M = {
      bench: `<rect x="7" y="24" width="26" height="5" rx="2" fill="#b9763f"/><rect x="7" y="31" width="26" height="4" rx="2" fill="#cf8b52"/>
              <rect x="9" y="36" width="3" height="8" rx="1" fill="#8a5530"/><rect x="28" y="36" width="3" height="8" rx="1" fill="#8a5530"/>
              <rect x="6" y="17" width="28" height="6" rx="2" fill="#a9683a"/>`,
      lamp: `<rect x="18" y="20" width="4" height="24" rx="1.5" fill="#6b7280"/>
             <path d="M12 20 Q20 8 28 20 Z" fill="#ffe08a" stroke="#e0a92f" stroke-width="1.5"/>
             <rect x="14" y="12" width="12" height="9" rx="2" fill="#fff3b8" stroke="#e0a92f" stroke-width="1.5"/>
             <rect x="14" y="43" width="12" height="3" rx="1.5" fill="#6b7280"/>`,
      fountain: `<ellipse cx="20" cy="40" rx="16" ry="5" fill="#7fb8e8"/>
                 <path d="M6 38 Q20 30 34 38 L32 42 Q20 36 8 42 Z" fill="#a9d4f2"/>
                 <path d="M20 14 Q14 26 20 34 Q26 26 20 14 Z" fill="#8fd0f7"/>
                 <path d="M13 32 Q9 26 12 22" stroke="#bfe6ff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                 <path d="M27 32 Q31 26 28 22" stroke="#bfe6ff" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                 <circle cx="20" cy="12" r="3" fill="#dff2ff"/>`,
      swing: `<path d="M8 44 L14 12 L26 12 L32 44" stroke="#a06b3f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <path d="M12 14 L28 14" stroke="#c08a56" stroke-width="2.5" stroke-linecap="round"/>
              <line x1="17" y1="15" x2="17" y2="32" stroke="#8a5530" stroke-width="1.5"/>
              <line x1="23" y1="15" x2="23" y2="32" stroke="#8a5530" stroke-width="1.5"/>
              <rect x="14" y="31" width="12" height="3.5" rx="1.5" fill="#e07a8f"/>`,
    };
    return wrap(M[key] || M.bench);
  }
  // 植物三阶段
  const soil = `<ellipse cx="20" cy="44" rx="11" ry="3.4" fill="#8a6a4a" opacity=".55"/>`;
  if (stage === 'seed') {
    return wrap(`${soil}<ellipse cx="20" cy="40" rx="8" ry="4.5" fill="#a97c52"/>
                 <circle cx="20" cy="36" r="3.2" fill="#7a4b2a"/><circle cx="18.8" cy="35" r="1" fill="#c89a6a"/>`);
  }
  if (stage === 'sprout') {
    return wrap(`${soil}<ellipse cx="20" cy="42" rx="8" ry="3.4" fill="#a97c52"/>
                 <path d="M20 41 L20 27" stroke="#4faa63" stroke-width="2.6" stroke-linecap="round"/>
                 <path d="M20 32 Q11 33 11 26 Q18 25 20 32 Z" fill="#6ccb7d"/>
                 <path d="M20 30 Q29 31 29 24 Q22 23 20 30 Z" fill="#57bb6c"/>`);
  }
  const P = GD_PLANT[key] || GD_PLANT.rose;
  // 茎 + 叶（所有花共用）
  const stem = `<path d="M20 44 L20 22" stroke="#4faa63" stroke-width="2.8" stroke-linecap="round"/>
                <path d="M20 36 Q12 37 12 30 Q18 29 20 36 Z" fill="#68c47c"/>
                <path d="M20 32 Q28 33 28 26 Q22 25 20 32 Z" fill="#57bb6c"/>`;
  let flower = '';
  if (key === 'sunflower') {
    let petals = '';
    for (let i = 0; i < 10; i++) { const a = i * 36; petals += `<ellipse cx="20" cy="9" rx="3" ry="7" fill="${P.c}" transform="rotate(${a} 20 18)"/>`; }
    flower = `${petals}<circle cx="20" cy="18" r="6.5" fill="#8a5a2b"/><circle cx="20" cy="18" r="5" fill="#a9713a"/>`;
  } else if (key === 'tulip') {
    flower = `<path d="M12 20 Q11 9 15 9 Q17 12 20 12 Q23 12 25 9 Q29 9 28 20 Q20 25 12 20 Z" fill="${P.c}"/>
              <path d="M20 12 Q20 18 20 22" stroke="${P.c2}" stroke-width="1.6" fill="none"/>`;
  } else if (key === 'star') {
    flower = `<path d="M20 6 L23.4 14.2 L32 15 L25.6 21 L27.6 29.5 L20 25 L12.4 29.5 L14.4 21 L8 15 L16.6 14.2 Z" fill="${P.c}"/>
              <circle cx="20" cy="18" r="3.2" fill="${P.c2}"/>`;
  } else { // rose
    let petals = '';
    for (let i = 0; i < 6; i++) { const a = i * 60; petals += `<ellipse cx="20" cy="12" rx="4.2" ry="6.5" fill="${P.c}" opacity=".92" transform="rotate(${a} 20 18)"/>`; }
    flower = `${petals}<circle cx="20" cy="18" r="5" fill="${P.c2}"/><circle cx="20" cy="18" r="2.4" fill="#fff0f4"/>`;
  }
  return wrap(`${soil}${stem}${flower}`);
}
const GD_SEED = 120000, GD_SPROUT = 600000;   // 与服务端 GARDEN_STAGE_* 保持一致
let gdTool = { type: 'plant', value: 'rose' };// 当前手持道具
let gdPlotEls = [], gdBuilt = false, gdToolsKey = '', gdTimer = null;

function gdNow() {
  return st && st.now ? st.now + (Date.now() - (st._recvAt || Date.now())) : Date.now();
}
function gdStage(plot) {
  if (!plot || plot.t !== 'plant') return null;
  const eff = (gdNow() - (plot.pa || 0)) + (plot.gm || 0);
  return eff < GD_SEED ? 'seed' : eff < GD_SPROUT ? 'sprout' : 'flower';
}
function gdSprite(plot) {
  if (!plot) return '';
  if (plot.t === 'decor') return gdSvg('decor', plot.d || 'bench');
  if (plot.t !== 'plant') return '';
  return gdSvg('plant', plot.p || 'rose', gdStage(plot) || 'seed');
}
function renderGarden() {
  const size = (board && board.gameKind === 'garden' && board.size) || 6;
  const N = size * size;
  $('gdCode').textContent = st.code || S.code || '------';
  $('gdTurn').textContent = st.players.length >= 2 ? '你俩的小花园' : '等 TA 来～';
  $('gdCoins').textContent = st.coins || 0;
  $('gdLove').textContent = st.love || 0;
  // HUD 双人头像
  const duo = $('gdDuo'); duo.innerHTML = '';
  st.players.forEach((p, i) => {
    const im = el('img'); im.src = avatarSrc(p, i); im.title = p.name;
    if (!p.connected) im.className = 'off';
    duo.appendChild(im);
  });
  paintGdIcons($('garden'));      // 填充静态 UI 图标
  renderCoTree();
  buildGardenGrid(size, N);
  (st.plots || []).forEach((p, i) => paintPlot(i, p));
  renderCouple();
  renderGdLog();
  renderGdMessages();
  renderGdTools();
  // 真实时间成长：每 15s 本地重算阶段（不发请求、不依赖服务器推送）
  if (!gdTimer) gdTimer = setInterval(() => {
    if (st && st.gameKind === 'garden' && !document.hidden) (st.plots || []).forEach((p, i) => paintPlot(i, p));
  }, 15000);
}
function buildGardenGrid(size, N) {
  const grid = $('gdGrid');
  if (!gdBuilt) {
    grid.innerHTML = ''; gdPlotEls = [];
    grid.style.gridTemplateColumns = `repeat(${size},1fr)`;
    grid.style.gridTemplateRows = `repeat(${size},1fr)`;
    for (let i = 0; i < N; i++) {
      const d = el('div', 'gd-plot empty');
      d.dataset.idx = String(i);
      d.innerHTML = '<div class="gd-sprite"></div><div class="gd-by"></div>';
      d.addEventListener('click', () => gdPlotClick(i));
      grid.appendChild(d); gdPlotEls.push(d);
    }
    gdBuilt = true;
  }
}
function paintPlot(i, plot) {
  const d = gdPlotEls[i]; if (!d) return;
  const filled = plot && plot.t !== 'empty';
  d.classList.toggle('empty', !filled);
  d.classList.toggle('filled', !!filled);
  const sp = d.querySelector('.gd-sprite'), by = d.querySelector('.gd-by');
  if (!filled) { sp.innerHTML = ''; sp.className = 'gd-sprite'; by.textContent = ''; return; }
  const stage = plot.t === 'plant' ? gdStage(plot) : null;
  sp.innerHTML = gdSprite(plot);
  sp.className = 'gd-sprite' + (plot.t === 'decor' ? ' decor' : (stage && stage !== 'flower' ? ' ' + stage : ''));
  by.textContent = plot.t === 'plant'
    ? (stage === 'flower' ? (GD_PLANT[plot.p] ? GD_PLANT[plot.p].n : '') : stage === 'sprout' ? '发芽中' : '种子')
    : (GD_DECOR[plot.d] ? GD_DECOR[plot.d].n : '');
}
function gdPlotClick(i) {
  if (!st || st.gameKind !== 'garden') return;
  const plot = (st.plots || [])[i];
  if (plot && plot.t === 'plant') { socket.emit('gardenAction', { action: 'water', idx: i }); beep('coin'); return; }
  if (plot && plot.t === 'decor') { toast('这是你俩摆的小装饰～ 💕'); return; }
  socket.emit('gardenAction', { action: gdTool.type, idx: i, value: gdTool.value });
  beep('click');
}
function renderGdTools() {
  const box = $('gdTools'); if (!box) return;
  const plants = (board && board.gameKind === 'garden' && board.plants) || Object.keys(GD_PLANT);
  const decor = (board && board.gameKind === 'garden' && board.decor) || Object.keys(GD_DECOR);
  const key = plants.join(',') + '|' + decor.join(',');
  if (key === gdToolsKey && box.children.length) {
    box.querySelectorAll('.gd-tool').forEach((b) => b.classList.toggle('active', b.dataset.t === gdTool.type && b.dataset.v === gdTool.value));
    return;
  }
  gdToolsKey = key; box.innerHTML = '';
  const add = (t, k, d, cost) => {
    const icon = t === 'plant' ? gdSvg('plant', k, 'flower') : gdSvg('decor', k);
    const b = el('button', 'gd-tool' + (gdTool.type === t && gdTool.value === k ? ' active' : ''),
      `<i>${icon}</i><span>${d.n}</span><em>🪙${cost}</em>`);
    b.dataset.t = t; b.dataset.v = k;
    b.onclick = () => { gdTool = { type: t, value: k }; renderGdTools(); beep('click'); };
    box.appendChild(b);
  };
  plants.forEach((k) => add('plant', k, GD_PLANT[k] || { n: k }, 5));
  decor.forEach((k) => add('decor', k, GD_DECOR[k] || { n: k }, 20));
}
function renderCoTree() {
  const c = $('gdCotree'); const ct = st.coTree || { done: false, by: [false, false] };
  c.classList.toggle('done', !!ct.done);
  const bigTree = `<svg viewBox="0 0 40 40" width="30" height="30" xmlns="http://www.w3.org/2000/svg">
    <rect x="17.5" y="24" width="5" height="13" rx="2" fill="#a9703a"/>
    <circle cx="20" cy="16" r="11" fill="#5fbf72"/><circle cx="12" cy="20" r="7" fill="#57bb6c"/>
    <circle cx="28" cy="20" r="7" fill="#4faa63"/><circle cx="20" cy="10" r="6" fill="#6ccb7d"/>
    <circle cx="15" cy="14" r="1.6" fill="#ff8fa8"/><circle cx="26" cy="15" r="1.6" fill="#ffd873"/><circle cx="20" cy="21" r="1.6" fill="#fff0b8"/></svg>`;
  c.innerHTML = `<div class="ct-ico">${ct.done ? bigTree : gdUiIcon('tree', 26)}</div>
    <div class="ct-txt"><b>${ct.done ? '你俩的大树长成啦！' : '一起合种一棵树'}</b>
    <small>${ct.done ? '默契 +3、金币 +10 · 还可以继续布置花园' : '两个人都来添一铲土，小树就会长大'}</small></div>
    <div class="ct-dots">${(ct.by || [false, false]).map((x) => `<i class="${x ? 'on' : ''}">${x ? '✓' : '·'}</i>`).join('')}</div>`;
}
function renderCouple() {
  const box = $('gdCouple'); box.innerHTML = '';
  (st.players || []).forEach((p, i) => {
    box.appendChild(el('div', 'gd-ch p' + i + (p.connected ? '' : ' off'),
      `<img src="${avatarSrc(p, i)}" alt=""><span class="ch-name">${escapeHtml(p.name)}</span>`));
  });
}
function renderGdLog() {
  const box = $('gdLog'); if (!box) return;
  const lg = st.log || [];
  box.innerHTML = lg.length ? lg.map((l) => `<div>· ${escapeHtml(l.msg || '')}</div>`).join('')
    : '<div class="gd-empty">还没有动静，去种点什么吧～</div>';
}
function renderGdMessages() {
  const box = $('gdMsgs'); if (!box) return;
  const ms = st.messages || [];
  const cnt = $('gdMsgCount'); if (cnt) cnt.textContent = ms.length ? '(' + ms.length + ')' : '';
  box.innerHTML = ms.length ? ms.slice().reverse().map((m) => {
    const d = new Date(m.ts);
    const t = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `<div class="gd-msg"><b>${escapeHtml(m.name || 'TA')}</b>：${escapeHtml(m.text)}<time>${t}</time></div>`;
  }).join('') : '<div class="gd-empty">长椅还空着，留第一句话给 TA 吧 💌</div>';
}
function resetGardenUI() {
  gdBuilt = false; gdToolsKey = ''; gdPlotEls = [];
  boardBuilt = false;              // 从花园回大富翁时强制重建棋盘
  const grid = $('gdGrid'); if (grid) grid.innerHTML = '';
  if (gdTimer) { clearInterval(gdTimer); gdTimer = null; }
}

/* ==================================================================
 * v4.4 主题四子棋（爱心版 Connect Four · 7×6 竖屏）
 * 服务器权威：只发 connect4Action({col})，按广播回来的 state 重绘。
 * 棋盘数据在 st.board（二维数组，board[r][c] = 0/1/null），
 * who=0 → 粉心、who=1 → 蓝心，与 st.colors / st.players 下标一致。
 * ================================================================== */
let c4Built = false, c4CellEls = [], c4ColEls = [];
let c4LastDropKey = '', c4WinnerKey = '';
function resetConnect4UI() {
  c4Built = false; c4CellEls = []; c4ColEls = []; c4LastDropKey = ''; c4WinnerKey = '';
  ['c4Board', 'c4Cols', 'c4Players', 'c4Log', 'c4ChatList'].forEach((id) => { const e = $(id); if (e) e.innerHTML = ''; });
}
function c4Heart(color) {
  return `<svg class="c4-heart" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 21C3 14 2 7 7 5c3-1.2 5 1 5 1s2-2.2 5-1c5 2 4 9-5 16z" fill="${color}"/>
    <path d="M7.2 7.4c2.4-1 3.8.4 4.8 1.6" stroke="rgba(255,255,255,.55)" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`;
}
function buildConnect4Grid(c) {
  const colsWrap = $('c4Cols'); colsWrap.innerHTML = ''; c4ColEls = [];
  for (let col = 0; col < c.cols; col++) {
    const b = el('button', 'c4-col', '↓');
    b.dataset.col = String(col);
    b.onclick = () => { if (b.disabled) return; beep('click'); socket.emit('connect4Action', { col }); };
    colsWrap.appendChild(b); c4ColEls.push(b);
  }
  const boardEl = $('c4Board'); boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${c.cols},1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${c.rows},1fr)`;
  c4CellEls = [];
  for (let r = 0; r < c.rows; r++) {
    const row = [];
    for (let col = 0; col < c.cols; col++) {
      const cell = el('div', 'c4-cell empty');
      cell.dataset.col = String(col);
      cell.addEventListener('click', () => { if (cell.dataset.full) return; beep('click'); socket.emit('connect4Action', { col }); });
      boardEl.appendChild(cell); row.push(cell);
    }
    c4CellEls.push(row);
  }
  c4Built = true;
}
function renderConnect4() {
  const c = st;
  if (!c) return;
  $('c4Code').textContent = c.code || S.code || '------';
  const players = c.players || [];
  const myIdx = players.findIndex((p) => p.isYou);
  const turnWho = c.turn || 0;
  const ended = c.winner !== null || !!c.draw;

  // 顶栏回合文字
  let turnTxt = '准备中';
  if (c.winner !== null) { const w = players[c.winner]; turnTxt = '💞 ' + (w ? w.name : 'TA') + ' 赢啦！'; }
  else if (c.draw) { turnTxt = '🤝 平局～再来一局？'; }
  else if (players.length >= 2 && c.started) { const t = players[turnWho]; turnTxt = (t ? t.name : 'TA') + ' 的回合'; }
  $('c4Turn').textContent = turnTxt;

  // 双方玩家卡（颜色 + 当前回合高亮）
  const duo = $('c4Players'); duo.innerHTML = '';
  players.forEach((p, i) => {
    const color = (c.colors && c.colors[i]) || '#ccc';
    const d = el('div', 'pbox' + (turnWho === i && !ended ? ' active' : ''));
    d.innerHTML = `<img class="pav" src="${avatarSrc(p, i)}"><div class="pinfo">
      <div class="pname">${escapeHtml(p.name)}${p.isYou ? ' <span class="you-tag">你</span>' : ''}</div>
      <div class="pmeta"><span class="c4-dot" style="background:${color}"></span>${p.connected ? '已就位' : '掉线'}</div></div>`;
    duo.appendChild(d);
  });

  // 棋盘（只建一次）
  if (!c4Built) buildConnect4Grid(c);

  // 落子 + 四连高亮
  const winSet = new Set((c.winCells || []).map(([r, cc]) => r + ',' + cc));
  const board = c.board || [];
  for (let r = 0; r < c.rows; r++) {
    for (let col = 0; col < c.cols; col++) {
      const cell = c4CellEls[r][col];
      const v = board[r] ? board[r][col] : null;
      let cls = 'c4-cell';
      if (v === null) cls += ' empty';
      else cls += (v === 0 ? ' p0' : ' p1');
      if (winSet.has(r + ',' + col)) cls += ' win';
      cell.className = cls;
      cell.dataset.full = (v !== null) ? '1' : '';
      cell.innerHTML = v === null ? '' : c4Heart((c.colors && c.colors[v]) || '#999');
    }
  }

  // 列按钮：高亮可落子的列、禁用已满/非己回合
  const myTurn = !ended && players.length >= 2 && turnWho === myIdx;
  for (let col = 0; col < c.cols; col++) {
    const btn = c4ColEls[col]; if (!btn) continue;
    const full = board[0] ? board[0][col] !== null : false;
    const dis = !myTurn || full;
    btn.disabled = dis;
    btn.classList.toggle('active', myTurn && !full);
    btn.classList.toggle('full', full);
  }

  // 落子动画（仅在真正有新落子时触发）
  const dk = c.lastDrop ? (c.lastDrop.row + ',' + c.lastDrop.col + ',' + c.lastDrop.who + ',' + c.moves) : '';
  if (dk && dk !== c4LastDropKey && c4CellEls[c.lastDrop.row] && c4CellEls[c.lastDrop.row][c.lastDrop.col]) {
    c4LastDropKey = dk;
    const cell = c4CellEls[c.lastDrop.row][c.lastDrop.col];
    cell.classList.remove('drop'); void cell.offsetWidth; cell.classList.add('drop');
    beep(c.lastDrop.who === myIdx ? 'coin' : 'click');
  }

  // 胜利特效（仅触发一次）
  if (c.winner !== null) {
    const wk = c.winner + ',' + c.moves;
    if (wk !== c4WinnerKey) {
      c4WinnerKey = wk; beep('win'); confetti(90);
      toast('💞 ' + (players[c.winner] ? players[c.winner].name : 'TA') + ' 赢啦！');
    }
  }

  // 对局日志
  const lg = $('c4Log');
  if (lg) {
    const logs = c.log || [];
    lg.innerHTML = logs.length ? logs.map((l) => `<div>· ${escapeHtml(l.msg || '')}</div>`).join('')
      : '<div class="gd-empty">还没有动静，选一列开始吧～</div>';
  }

  paintGdIcons($('connect4'));      // 互动条 / 提示图标用 SVG
}

/* ---------- 环形棋盘：只建一次 ---------- */
const TILE_ICON = { go: '🏁', jail: '🔒', park: '🌳', gotojail: '🚔', chance: '❓', destiny: '⭐',
  tax: '💸', minigame: '🎮', station: '🚉', utility: '💡', bank: '🏦', life: '🎭', portal: '🌀' };
/* v3.1 地点/功能格改用真实图片素材，不再是纯 emoji */
const TILE_IMG = {
  go: 'ic-go.png', jail: 'ic-jail.png', park: 'ic-heart.png', gotojail: 'ic-jail.png',
  chance: 'ic-chance.png', destiny: 'ic-destiny.png', tax: 'ic-coin.png',
  minigame: 'ic-dice.png', station: 'ic-go.png', utility: 'ic-house.png',
  bank: 'ic-coin.png', life: 'ic-gift.png', portal: 'ic-heart.png', property: 'ic-house.png',
  forkgate: 'ic-heart.png', stock: 'ic-coin.png', wish: 'ic-gift.png', ferris: 'ic-heart.png',
  itemshop: 'ic-gift.png', chest: 'ic-gift.png', duo_task: 'ic-heart.png', lottery: 'ic-chance.png',
  casino: 'ic-dice.png', hospital: 'ic-heart.png', shield: 'ic-house.png', shortcut: 'ic-go.png',
};
function makeDieHtml() {
  return '<div class="cube">' + ['f-front', 'f-right', 'f-back', 'f-left', 'f-top', 'f-bottom']
    .map((c) => `<span class="face ${c}">${pipsHtml(1)}</span>`).join('') + '</div>';
}
function buildBoard() {
  const b = $('board');
  b.innerHTML = '';
  tileEls = [];
  const groups = board.groups || {};
  const outerN = board.outerN || 40;

  /* ---- 外环 40 格：grid 定位；内容分区排版（图标在上、名字独立行、价格/等级绝对定位）
   * 根治「图标盖住长地名」：不再把 6 层内容全部 flex 居中堆叠。 ---- */
  board.tiles.slice(0, outerN).forEach((t, i) => {
    const [r, c] = board.layout[i];
    const d = el('div', 'tile ' + t.type + (['go', 'jail', 'park', 'gotojail'].includes(t.type) ? ' corner' : '') + (t.fork ? ' fork' : ''));
    d.style.gridRow = String(r + 1); d.style.gridColumn = String(c + 1);
    d.dataset.idx = String(i);
    const img = TILE_IMG[t.type] || TILE_IMG.property;
    const bar = t.group && groups[t.group] ? `<div class="tbar" style="background:${groups[t.group].color}"></div>` : '';
    const price = t.price != null && ['property', 'station', 'utility'].includes(t.type) ? `<div class="tprice">${t.price}</div>` : '';
    // v4.2：改用完整地名（去掉 emoji 前缀），不再用被 shortName 截成 4 字的 short
    const nm = String(t.name).replace(/^[^\u4e00-\u9fa5a-zA-Z]+\s*/, '') || t.short || '';
    // v4.2：按完整地名长度精确分档，字号 shrink 到「严格不超过格宽」，保证单行完整且不横向溢出到相邻格
    const L = nm.length;
    const lenCls = L >= 6 ? ' len6' : L === 5 ? ' len5' : L === 4 ? ' len4' : L <= 2 ? ' len2' : '';
    d.title = t.name + (t.price != null ? ' · ' + t.price : '');
    d._fullName = t.name;
    d.innerHTML = `${bar}<div class="ti"><img src="/assets/${img}" alt="" loading="lazy"></div><div class="tn${lenCls}">${escapeHtml(nm)}</div>${price}<div class="towner"></div><div class="tlv"></div>${t.fork ? '<div class="tfork" title="岔路口">🛤️</div>' : ''}`;
    b.appendChild(d); tileEls.push(d);
  });

  /* ---- v3.3 岔路连线：4 条虚线，从外环四边中点连向内环 ---- */
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'fork-links'); svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  const LINKS = [[50, 95.45, 50, 77.27], [50, 4.55, 50, 22.73],
                 [4.55, 50, 22.73, 50], [95.45, 50, 77.27, 50]];
  LINKS.forEach(([x1, y1, x2, y2]) => {
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', x1); ln.setAttribute('y1', y1);
    ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
    svg.appendChild(ln);
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x1); dot.setAttribute('cy', y1); dot.setAttribute('r', '1.3');
    svg.appendChild(dot);
  });
  b.appendChild(svg);

  /* ---- v3.3 内环 12 大格：绝对定位，约外环 2 倍边长，图标/名字/说明全放得下 ---- */
  const ir = el('div', 'inner-ring'); ir.id = 'innerRing';
  const iw = board.innerW || 18.18, ih = board.innerH || 18.18;
  const iL = board.innerLayout || [], iStart = board.innerStart || 40;
  iL.forEach((p, j) => {
    const i = iStart + j, t = board.tiles[i]; if (!t) return;
    const d = el('div', 'inner-tile ' + t.type);
    d.style.left = p.l + '%'; d.style.top = p.t + '%';
    d.style.width = iw + '%'; d.style.height = ih + '%';
    d.dataset.idx = String(i);
    const img = t.icon || TILE_IMG[t.type] || TILE_IMG.property;
    const nm = String(t.name).replace(/^[^\u4e00-\u9fa5a-zA-Z]+\s*/, '');
    d.innerHTML = `<div class="it-ico"><img src="/assets/${img}" alt="" loading="lazy"></div><div class="it-name">${escapeHtml(nm)}</div><div class="it-desc">${escapeHtml(t.desc || '')}</div>`;
    ir.appendChild(d); tileEls[i] = d;
  });
  b.appendChild(ir);

  /* ---- 中央核心：缩到中间 2×2 逻辑格，放 3D 骰子 + 主题景观 ---- */
  const center = el('div', 'board-center');
  center.id = 'boardCenter';
  center.innerHTML = `<div class="center-heart">💗</div><div class="center-title" id="centerTitle">${escapeHtml(board.themeName)}</div>
    <div class="center-sub" id="centerSub">一起出发吧</div>
    <div class="dice-area" id="diceArea">
      <div class="die3d flat" id="die1" data-v="1">${makeDieHtml()}</div>
      <div class="die3d flat" id="die2" data-v="1">${makeDieHtml()}</div>
    </div>
    <div class="center-event" id="centerEvent"></div>`;
  center.style.cssText = 'position:absolute;left:31.82%;top:31.82%;width:36.36%;height:36.36%;z-index:4';
  b.appendChild(center);
  const pl = el('div', 'pawn-layer'); pl.id = 'pawnLayer';
  pawnEls = [el('div', 'pawn p0'), el('div', 'pawn p1')];
  pawnEls.forEach((p, i) => { p.dataset.pi = String(i); pl.appendChild(p); });
  locTipEl = el('div', 'loc-tip hidden'); locTipEl.id = 'locTip';
  pl.appendChild(locTipEl);
  b.appendChild(pl);
  // v4.0：点外环格子看完整地点名（长名字在格子里放不下时的兜底）
  if (!b._tileTapBound) {
    b._tileTapBound = true;
    b.addEventListener('click', (e) => {
      const t = e.target.closest('.tile'); if (!t || !t._fullName) return;
      const i = Number(t.dataset.idx);
      const full = board.tiles[i];
      const extra = full && full.price != null ? ` · 💰${full.price}` : '';
      toast('📍 ' + t._fullName + extra);
    });
  }
  boardBuilt = true;
  setDie($('die1'), 1); setDie($('die2'), 1);
  placePawns(st.players.map((p) => p.pos), true);
  applyPawnAvatars();
  renderLocTip(st.game.current, true);
}

/* 环形坐标 → 百分比 */
function posStyle(pos, idx) {
  const ox = idx === 0 ? -2.1 : 2.1;
  const oy = idx === 0 ? -2.1 : 2.1;
  // v3.3 内环格：用 innerLayout 的中心百分比
  if (pos >= (board.innerStart || 40) && board.innerLayout) {
    const p = board.innerLayout[pos - (board.innerStart || 40)];
    if (p) {
      const cx = p.l + (board.innerW || 18.18) / 2, cy = p.t + (board.innerH || 18.18) / 2;
      return { left: `calc(${cx}% + ${ox}%)`, top: `calc(${cy}% + ${oy}%)` };
    }
  }
  const [r, c] = board.layout[pos] || [10, 10];
  return { left: `calc(${(c + 0.5) * 100 / 11}% + ${ox}%)`, top: `calc(${(r + 0.5) * 100 / 11}% + ${oy}%)` };
}
function placePawns(positions, instant) {
  positions.forEach((pos, i) => {
    const p = pawnEls[i]; if (!p) return;
    const s = posStyle(pos, i);
    if (instant) p.style.transition = 'none';
    p.style.left = s.left; p.style.top = s.top;
    p.style.transform = 'translate(-50%,-50%)';
    if (instant) requestAnimationFrame(() => { p.style.transition = ''; });
  });
}
/* v3.1 位置气泡：跟随当前玩家，指出「你在这里」+ 地点名 */
function tipText(pos, idx) {
  const t = board.tiles[pos]; if (!t) return '';
  const nm = t.name.replace(/^[^\u4e00-\u9fa5a-zA-Z]+\s*/, '');
  const me = st.players.find((p) => p.isYou);
  const mine = me && st.players[idx] && st.players[idx].isYou;
  return `<span class="lt-pin">📍</span><b>${escapeHtml(nm)}</b><span class="lt-who">${mine ? '你在这里' : 'TA 在这'}</span>`;
}
function tipPosStyle(pos) {
  // v3.3 内环格：气泡落在内环格上方，避免跑到外环
  if (pos >= (board.innerStart || 40) && board.innerLayout) {
    const p = board.innerLayout[pos - (board.innerStart || 40)];
    if (p) {
      const cx = p.l + (board.innerW || 18.18) / 2, cy = p.t + (board.innerH || 18.18) / 2;
      return { left: `clamp(66px, ${cx}%, calc(100% - 66px))`, top: `clamp(13px, ${cy - 6}%, calc(100% - 13px))` };
    }
  }
  const [r, c] = board.layout[pos] || [10, 10];
  let dx = 0, dy = 0;
  if (r === 10) dy = -9;            // 底边 → 朝中央(上)
  else if (r === 0) dy = 9;         // 顶边 → 下
  else if (c === 0) dx = 9.5;       // 左边 → 右
  else if (c === 10) dx = -9.5;     // 右边 → 左
  const px = (c + 0.5) * 100 / 11 + dx;
  const py = (r + 0.5) * 100 / 11 + dy;
  // clamp 把气泡中心锁在棋盘内（半宽约 66px），避免四角撑出横向滚动
  return { left: `clamp(66px, ${px}%, calc(100% - 66px))`, top: `clamp(13px, ${py}%, calc(100% - 13px))` };
}
function renderLocTipAt(pos, idx) {
  if (!locTipEl || !board) return;
  locTipEl.innerHTML = tipText(pos, idx);
  const s = tipPosStyle(pos);
  locTipEl.style.left = s.left; locTipEl.style.top = s.top;
  locTipEl.classList.remove('hidden');
}
function renderLocTip(curIdx) {
  if (!locTipEl || !st || !st.players[curIdx]) return;
  renderLocTipAt(st.players[curIdx].pos, curIdx);
}

/* v3.2 掷骰动画（diceId 去重）：3D 立方体翻滚 ~950ms → 落定展平 2D 显示点数，人物不动 */
async function playDice(dice) {
  if (!dice || diceAnimating) return;
  diceAnimating = true; beep('dice');
  const die1 = $('die1'), die2 = $('die2');
  [die1, die2].forEach((node) => { if (node) { node.classList.remove('flat'); node.classList.add('tumbling'); } });
  await sleep(950);
  [die1, die2].forEach((node, i) => {
    if (!node) return;
    node.classList.remove('tumbling');
    setDie(node, dice[i]);         // 落定 2D（setDie 加回 .flat）
  });
  diceAnimating = false;
  renderControls(); renderCenter();   // 骰子停稳后才出现「前进」按钮
}
/* v3.2 逐格移动动画：点「前进」后才播放（不再翻骰子） */
async function playMove(steps) {
  if (!steps || !steps.length || animating) return;
  animating = true;
  for (let k = 0; k < steps.length; k++) {
    const pawn = pawnEls[lastMover];
    if (pawn) {
      const s = posStyle(steps[k], lastMover);
      pawn.style.left = s.left; pawn.style.top = s.top;
      pawn.classList.remove('bounce'); void pawn.offsetWidth; pawn.classList.add('bounce');
      beep('step');
    }
    renderLocTipAt(steps[k], lastMover);
    await sleep(200);
  }
  animating = false;
  renderLocTip(st.game.current);
  // 动画期间 state 可能已更新（买地/小游戏/回合结束），补渲染一次
  renderControls(); renderModals(); renderPlayers(); renderTop(); renderBoardDyn();
}
let lastMover = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// CSS 画骰子点数（不依赖 emoji 字体，任何手机都清晰）
const PIP_MAP = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function pipsHtml(v) {
  const on = PIP_MAP[Math.max(1, Math.min(6, v))] || PIP_MAP[1];
  return Array.from({ length: 9 }, (_, i) => `<span class="pip${on.includes(i) ? ' on' : ''}"></span>`).join('');
}
function setDie(node, n) {
  if (!node) return;
  const v = Math.max(1, Math.min(6, Number(n) || 1));
  node.dataset.v = String(v);
  const faces = node.querySelectorAll('.face');
  if (!faces.length) { node.innerHTML = pipsHtml(v); node.classList.add('flat'); return; }
  // 六面按标准骰子排布：正面 = 结果点数，其余面装饰（转动时才看得见）
  const rest = [1, 2, 3, 4, 5, 6].filter((x) => x !== v);
  faces.forEach((f, i) => { f.innerHTML = pipsHtml(i === 0 ? v : (rest[i - 1] || 1)); });
  node.classList.add('flat');        // 结果态：展平成 2D
}

/* ---------- 顶栏 / 玩家 ---------- */
function renderTop() {
  const g = st.game;
  let prog = g.modeName;
  if (g.mode === 'race') prog += ` · 圈数 ${st.players.map((p) => p.laps).join(':')} / ${g.targetLaps}`;
  else if (g.mode === 'coop') prog += ` · 合计 ${st.players.reduce((a, p) => a + p.net, 0)}/${g.coopTarget}`;
  else if (g.mode === 'heart') prog += ` · 默契 ${g.heart}/${g.heartTarget} 💗`;
  else if (g.maxRounds) prog += ` · 第 ${g.rounds}/${g.maxRounds} 回合`;
  $('gProgress').textContent = prog;
  const cur = st.players[g.current];
  $('gTurn').textContent = g.phase === 'ended' ? '游戏结束' :
    (cur && cur.isYou ? '🟢 轮到你了' : `⏳ 等 ${cur ? cur.name : ''}`);
  $('gCode').textContent = st.code;
}
function renderPlayers() {
  const box = $('gPlayers');
  if (box.children.length !== st.players.length) { box.innerHTML = ''; st.players.forEach(() => box.appendChild(el('div', 'pbox'))); }
  st.players.forEach((p, i) => {
    const d = box.children[i];
    d.className = 'pbox' + (i === st.game.current && st.game.phase !== 'ended' ? ' active' : '') + (p.bankrupt ? ' broke' : '');
    const tags = [];
    if (p.inJail) tags.push('🔒 监狱');
    if (!p.connected) tags.push('📴 掉线');
    if (p.items && p.items.freeRent) tags.push(`🛡️ 免租券×${p.items.freeRent}`);
    const props = Object.keys(p.props || {}).length;
    d.innerHTML = `<img class="pav" src="${avatarSrc(p, i)}">
      <div class="pinfo"><div class="pname">${escapeHtml(p.name)}</div>
      <div class="pmoney">${p.money}</div>
      <div class="pmeta">🏠${props} 地 · 净 ${p.net}${tags.length ? ' · ' + tags.join(' ') : ''}</div>
      <div class="passets">🏦${p.savings || 0} · 💳${p.loan || 0} · 🚗${p.cars || 0}${p.carBoost > 0 ? ' ⚡' + p.carBoost : ''}</div></div>
      ${p.isYou ? '<span class="you-tag">你</span>' : ''}`;
  });
  applyPawnAvatars();
}
function renderBoardDyn() {
  const dyn = st.game.tileDyn || [];
  dyn.forEach((v, i) => {
    const d = tileEls[i]; if (!d) return;
    const [owner, lv, mort] = v;
    const bar = d.querySelector('.towner');
    if (bar) bar.style.background = owner == null ? 'transparent' : (st.players[owner] ? st.players[owner].color : 'transparent');
    const l = d.querySelector('.tlv');
    if (l) l.textContent = owner != null && lv > 0 ? (lv >= 5 ? '🏨' : '🏠' + lv) : '';
    d.classList.toggle('mortgaged', !!mort);
  });
}
function renderCenter() {
  const g = st.game;
  const sub = $('centerSub'), ev = $('centerEvent');
  if (!sub) return;
  const fx = g.eventFx;
  sub.textContent = g.mode === 'heart' ? `默契值 ${g.heart}/${g.heartTarget} 💗` :
    (g.modeName || '') + ' · 52 格双环';
  if (ev) ev.textContent = fx && fx.text ? fx.text : (g.lastEvent && g.lastEvent.text ? g.lastEvent.text : '一起出发吧 💕');
  // v3.2：骰子点数由 diceId 动画（playDice）落定显示，此处不再覆盖 3D 翻滚
  const eb = $('eventBar');
  if (eb) eb.textContent = fx && fx.text ? fx.text : (g.lastEvent && g.lastEvent.text ? g.lastEvent.text : '🎲 开始新的一回合');
}

/* ---------- 控件 ---------- */
function renderControls() {
  const c = $('controls'), g = st.game;
  if (animating) return;                      // 动画期间不改控件
  c.innerHTML = '';
  if (g.phase === 'ended') {                       // v4.3：结束后仍可操作，随时重开结果面板
    c.appendChild(el('div', 'over-inline-tip', '🏁 本局已结束 · 可以自由回看棋盘、地产和日志'));
    const rb = el('button', 'primary big', '📋 查看本局结果');
    rb.onclick = () => { beep('click'); renderOver(); };
    c.appendChild(rb);
    return;
  }
  if (['await_mini', 'await_buy', 'auction', 'await_choice'].includes(g.phase)) {
    const txt = { await_mini: '🎮 小游戏进行中…', auction: '🔨 拍卖进行中…',
      await_buy: '🏠 等待购买决定…', await_choice: '🎭 等待人生选择…' }[g.phase];
    c.appendChild(el('div', 'ctrl-row', `<div style="flex:1;text-align:center;font-size:12.5px;color:#8a7186;padding:8px">${txt}</div>`));
    return;
  }
  // v3.2 掷骰两步走：await_move 阶段显示「前进 N 步」，点一下人物才走
  if (g.phase === 'await_move') {
    if (diceAnimating) { c.appendChild(el('div', 'ctrl-row', `<div class="roll-btn waiting" style="text-align:center">🎲 骰子落定中…</div>`)); return; }
    const mover = st.players[g.current];
    const n = g.pendingSteps || 0;
    if (mover && mover.isYou) {
      const canInner = !!g.canInner;
      const row = canInner ? el('div', 'ctrl-row') : c;
      const b = el('button', 'roll-btn advance-btn' + (canInner ? ' half' : ''), canInner ? `👣 外环 ${n} 步` : `👣 前进 ${n} 步`);
      b.id = 'advanceBtn';
      const label = b.textContent;
      const fire = (inner) => {
        if (animating) return;
        beep('click');
        row.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        b.textContent = '👣 出发中…';
        $('eventBar').textContent = inner ? '🛤️ 拐进内环抄近道！' : '👣 出发！';
        clearTimeout(rollTimeout);
        rollTimeout = setTimeout(() => { if (b.isConnected) { b.disabled = false; b.textContent = label; row.querySelectorAll('button').forEach((x) => { x.disabled = false; }); } }, 5000);
        socket.emit('confirmMove', inner ? { inner: true } : {});
      };
      b.onclick = () => fire(false);
      row.appendChild(b);
      if (canInner) {
        const ib = el('button', 'roll-btn inner-btn', '🛤️ 走内环');
        ib.id = 'innerBtn';
        ib.title = '从岔路口拐进内环，经过一路双人小站再抄近道回外环';
        ib.onclick = () => fire(true);
        row.appendChild(ib);
        c.appendChild(row);
      }
    } else {
      c.appendChild(el('div', 'ctrl-row', `<div class="roll-btn waiting" style="text-align:center">⏳ 等 ${escapeHtml(mover ? mover.name : '对方')} 点「前进」…</div>`));
    }
    return;
  }
  if (g.phase !== 'await_roll') return;
  const cur = st.players[g.current];
  if (!cur || !cur.isYou) {
    c.appendChild(el('div', 'ctrl-row', `<div class="roll-btn waiting" style="text-align:center">⏳ 等 ${escapeHtml(cur ? cur.name : '对方')} 投骰…</div>`));
    return;
  }
  if (cur.inJail) {
    const row = el('div', 'ctrl-row');
    const b1 = el('button', 'primary', '💰 交 50 出狱并投骰'); b1.onclick = () => socket.emit('jailAction', { pay: true });
    const b2 = el('button', 'ghost', '🔒 继续关押'); b2.onclick = () => socket.emit('jailAction', { pay: false });
    row.appendChild(b1); row.appendChild(b2); c.appendChild(row); return;
  }
  const b = el('button', 'roll-btn', '🎲 掷骰子');
  b.onclick = () => {
    if (animating) return;
    beep('click');
    b.textContent = '🎲 掷骰中…'; b.disabled = true;
    $('eventBar').textContent = '🎲 掷骰中…';
    clearTimeout(rollTimeout);
    rollTimeout = setTimeout(() => { // 卡住自愈：只有仍停在 await_roll 才恢复掷骰按钮
      if (b.isConnected && st && st.game && st.game.phase === 'await_roll') { b.textContent = '🎲 掷骰子'; b.disabled = false; }
    }, 6000);
    socket.emit('rollDice');
  };
  c.appendChild(b);
}

/* ---------- 资产面板 ---------- */
function renderAssets() {
  const me = st.players.find((p) => p.isYou); if (!me) return;
  const list = $('propList'), cnt = $('propCount');
  const idxs = Object.keys(me.props || {});
  cnt.textContent = `(${idxs.length})`;
  list.innerHTML = '';
  if (!idxs.length) { list.appendChild(el('div', '', '<span style="color:#a89cb0;font-size:11.5px">还没有地产，踩到空地就可以买下～</span>')); return; }
  const groups = board.groups || {};
  idxs.forEach((k) => {
    const i = Number(k), t = board.tiles[i], lv = me.props[i];
    const color = t.group && groups[t.group] ? groups[t.group].color : '#c9c2d0';
    const mono = t.group ? ownsGroup(me, t.group) : false;
    const row = el('div', 'prop-row');
    row.innerHTML = `<span class="pdot" style="background:${color}"></span>
      <span class="pnm">${escapeHtml(t.name.replace(/^[^\u4e00-\u9fa5a-zA-Z]+\s*/, ''))}${me.mortgaged[i] ? ' (抵押)' : ''}</span>
      <span class="plv">${lv >= 5 ? '🏨' : lv > 0 ? '🏠' + lv : (mono ? '整套' : '空地')}</span>`;
    const btns = el('div', 'ctrl-row'); btns.style.flex = 'none'; btns.style.gap = '4px';
    if (t.group && !me.mortgaged[i] && lv < 5) {
      const hb = el('button', 'hi', '🏠建');
      hb.title = `建房需集齐同色组并均匀建造，花费约 ${Math.round((groups[t.group] ? groups[t.group].houseCost : t.price * .4) * (board.scale || 1))}`;
      hb.onclick = () => { beep('click'); socket.emit('buildHouse', { tileIndex: i }); };
      btns.appendChild(hb);
    }
    if (lv === 0 && t.group) {
      const mb = el('button', '', me.mortgaged[i] ? '赎回' : '抵押');
      mb.onclick = () => { beep('click'); socket.emit('mortgage', { tileIndex: i, redeem: !!me.mortgaged[i] }); };
      btns.appendChild(mb);
    }
    row.appendChild(btns); list.appendChild(row);
  });
}
function ownsGroup(me, group) {
  const idxs = board.tiles.map((t, i) => t.group === group ? i : -1).filter((i) => i >= 0);
  return idxs.length > 0 && idxs.every((i) => me.props[i] !== undefined);
}

/* ---------- 日志 ---------- */
function renderLog() {
  const box = $('logList'); if (!box || !st.game.log) return;
  box.innerHTML = st.game.log.map((l) => `<div>${escapeHtml(l.msg)}</div>`).join('');
}

/* ---------- 弹窗：买地 / 拍卖 / 小游戏 / 结束 ---------- */
let lastModalKey = '';
/* v4.3：结束屏可复盘 —— 关掉后不再被每次 state 广播重弹，撒花只放一次 */
let overShownKey = '', overDismissed = false;
function renderModals() {
  const g = st.game, m = $('modal'), mc = $('modalCard');
  if (g.phase !== 'ended' && overShownKey) { overShownKey = ''; overDismissed = false; }  // v4.3：新一局自动复位
  // v3.1：3D 骰子 + 逐格移动播放期间先不弹窗，等落定后再弹（否则会盖住动画）
  if (g.moveId && g.moveSteps && g.moveSteps.length && lastMoveKey !== 'mv' + g.moveId) { m.classList.add('hidden'); return; }
  if (animating) { m.classList.add('hidden'); return; }
  const key = g.phase + '|' + (g.mini ? g.mini.kind + (g.mini.resolved ? 'R' : '') + (g.mini.mine ?? 'x') : '') + '|' + (g.auction ? JSON.stringify(g.auction.bids) : '') + '|' + (g.choice ? g.choice.kind + g.choice.byIdx : '');
  if (g.phase === 'ended') {
    m.classList.add('hidden');
    if (!overDismissed && overShownKey !== key) { renderOver(); overShownKey = key; }  // v4.3：只弹一次，关掉不重弹
    lastModalKey = key; return;
  }
  if (!['await_buy', 'auction', 'await_mini', 'await_choice'].includes(g.phase)) { m.classList.add('hidden'); lastModalKey = key; return; }
  if (key === lastModalKey && !m.classList.contains('hidden')) return; // 避免重建打断点击
  lastModalKey = key;
  m.classList.remove('hidden');
  if (g.phase === 'await_buy') renderBuyModal(mc, g);
  else if (g.phase === 'auction') renderAuctionModal(mc, g);
  else if (g.phase === 'await_choice') renderChoiceModal(mc, g);
  else renderMiniModal(mc, g);
}
function renderBuyModal(mc, g) {
  const i = g.buyTile, t = board.tiles[i];
  const me = st.players.find((p) => p.isYou);
  const isTurn = me && st.players[g.current] && st.players[g.current].isYou;
  const can = me && me.money >= g.buyPrice;
  mc.innerHTML = `<div class="mini-tag">🏠 空地</div><h1 style="margin:10px 0 2px">${escapeHtml(t.name)}</h1>
    <div class="buy-price">💰 ${g.buyPrice}</div>
    <p class="m-sub">${t.group ? '集齐同色组可建房、租金翻倍' : '车站 / 公用事业按持有数量计租'}<br>你的余额 ${me ? me.money : 0}</p>
    <div class="m-btns">
      <button class="ghost" id="buyNo">不买（拍卖）</button>
      <button class="primary" id="buyYes" ${!can || !isTurn ? 'disabled' : ''}>${can ? '买下它' : '钱不够'}</button>
    </div>
    ${!isTurn ? '<p class="m-sub">等待对方决定…</p>' : ''}`;
  const yes = $('buyYes'), no = $('buyNo');
  if (yes) yes.onclick = () => { beep('buy'); socket.emit('buyDecision', { buy: true }); };
  if (no) no.onclick = () => { beep('click'); socket.emit('buyDecision', { buy: false }); };
  if (!isTurn) { if (yes) yes.disabled = true; if (no) no.disabled = true; }
}
function renderAuctionModal(mc, g) {
  const a = g.auction, me = st.players.find((p) => p.isYou);
  const myBid = me ? a.bids[me.id] : undefined;
  const maxBid = Math.max(a.base, ...Object.values(a.bids).map(Number));
  mc.innerHTML = `<div class="mini-tag">🔨 拍卖</div><h1 style="margin:10px 0 2px">${escapeHtml(a.name)}</h1>
    <div class="auction-bid">当前最高 ${maxBid}</div>
    <p class="m-sub">起拍 ${a.base} · ${myBid !== undefined ? '你已出价 ' + (myBid || '放弃') : '出价高于对方即可买下'}<br>双方各出一次价，价高者得</p>
    <div class="m-btns">
      <button class="ghost" id="auPass">放弃</button>
      <button class="primary" id="auBid">＋50 加价（${maxBid + 50}）</button>
    </div>`;
  $('auPass').onclick = () => { beep('click'); socket.emit('auctionBid', { amount: 0 }); };
  $('auBid').onclick = () => { beep('click'); socket.emit('auctionBid', { amount: maxBid + 50 }); };
  if (myBid !== undefined) { $('auPass').disabled = true; $('auBid').disabled = true; }
}
/* v3.1 人生选择弹窗（银行 / 人生驿站共用） */
function renderChoiceModal(mc, g) {
  const c = g.choice; if (!c) return;
  const me = st.players.find((p) => p.isYou);
  const isMine = me && st.players[c.byIdx] && st.players[c.byIdx].isYou;
  const CTAG = { bank: '🏦 爱心银行', life: '🎭 人生驿站', fork: '🛤️ 岔路口' }[c.kind] || '🎭 人生驿站';
  mc.innerHTML = `<div class="mini-tag">${CTAG}</div>
    <h1 style="margin:10px 0 2px">${escapeHtml(c.title)}</h1>
    ${c.lifeQ ? `<div class="mini-q">${escapeHtml(c.lifeQ)}</div>` : ''}
    <p class="m-sub">${c.desc}</p>
    <div class="choice-list" id="choiceOpts">
      ${c.options.map((o) => `<button data-v="${escapeHtml(o.value)}">${escapeHtml(o.label)}</button>`).join('')}
    </div>
    ${isMine ? '' : `<p class="m-sub">等 ${escapeHtml(c.byName)} 做选择…</p>`}`;
  const box = $('choiceOpts'); if (!box) return;
  if (!isMine) { box.querySelectorAll('button').forEach((b) => b.disabled = true); return; }
  box.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    beep('coin');
    box.querySelectorAll('button').forEach((x) => x.disabled = true);
    b.classList.add('picked');
    socket.emit('choicePick', { value: b.dataset.v });
  };
}
const MINI_TAG = { rps: '✊ 石头剪刀布', quiz: '🧠 答题挑战', wheel: '🎡 幸运转盘', bond: '💞 默契问答', coop: '🤝 双人任务', dare: '💌 默契大冒险', story: '💞 共同决定' };
function renderMiniModal(mc, g) {
  const m = g.mini; if (!m) return;
  const mcTag = MINI_TAG[m.kind] || '🎮 小游戏';
  let body = '';
  if (m.resolved) {
    body = `<div class="mini-result">${escapeHtml(m.result ? m.result.text : '完成！')}</div>`;
    beep(m.result && /赢|答对|灵犀|\+/.test(m.result.text) ? 'win' : 'lose');
  } else if (m.mode === 'solo' && m.kind === 'wheel') {
    body = `<p class="m-sub">点一下转动转盘，看看手气 🎡</p><div class="m-btns"><button class="primary" id="mWheel">🎡 转！</button></div>`;
  } else if (m.mode === 'solo') {
    body = `<div class="opt-grid" id="mOpts">${(m.options || []).map((o, i) => `<button data-i="${i}">${escapeHtml(o)}</button>`).join('')}</div>
      ${m.isAnswerer ? '' : '<p class="m-sub">等对方作答…</p>'}`;
  } else {
    const done = m.mine !== null && m.mine !== undefined;
    body = `<div class="opt-grid" id="mOpts">${(m.options || []).map((o, i) => `<button data-i="${i}" class="${done && m.mine === i ? 'picked' : ''}">${escapeHtml(o)}</button>`).join('')}</div>
      <p class="m-sub">${done ? '✅ 已提交，等 TA…（' + m.picked + '/' + m.need + '）' : '选一个吧，双方都提交后揭晓'}</p>`;
  }
  mc.innerHTML = `<div class="mini-tag">${mcTag}</div><div class="mini-q">${escapeHtml(m.q || '')}</div>${body}`;
  const w = $('mWheel');
  if (w) w.onclick = () => { beep('dice'); socket.emit('miniPick', { value: 0 }); w.disabled = true; w.textContent = '🎡 转动中…'; };
  const opts = $('mOpts');
  if (opts) opts.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (m.mode === 'solo' && !m.isAnswerer) return;
    beep('click');
    opts.querySelectorAll('button').forEach((x) => x.classList.remove('picked'));
    b.classList.add('picked');
    socket.emit('miniPick', { value: Number(b.dataset.i) });
  };
}
/* v4.3：旧存档 / 服务端未下发 endReason 时，从现有字段兜底推导，绝不空白 */
function deriveEndReason(g, ps) {
  if (g.endReason) return g.endReason;
  if (g.coop === true) return g.mode === 'heart' ? '默契值攒满，共同获胜' : '两人一起达成目标，共同获胜';
  if (g.coop === false) return '有人资金告罄破产，合作失败';
  const broke = ps.find((p) => p.bankrupt);
  if (broke) return `${broke.name} 资金告罄，破产出局`;
  if (g.mode === 'race') return '率先跑完全程，赢得竞速';
  if (g.maxRounds && g.rounds >= g.maxRounds) return `第 ${g.maxRounds} 回合结束，按净资产结算`;
  return '本局结束';
}
function deriveEndDetail(g, ps) {
  if (g.endDetail) return g.endDetail;
  return `终局净资产 ${ps.map((p) => `${p.name} ${p.net}`).join(' : ')}`;
}
function renderOver() {
  const g = st.game, o = $('over'), ps = st.players;
  // v4.3：结束瞬间清掉会盖住说明的互动大弹窗（最后一次比心/礼物的飘字），让胜因立刻可见
  const fxLayer = $('interactFxLayer');
  if (fxLayer) fxLayer.querySelectorAll('.i-fx-big').forEach((n) => n.remove());
  const w = ps.find((p) => p.id === g.winner);
  let title, emoji, sub;
  if (g.coop === true) { title = g.mode === 'heart' ? '💗 默契满格！' : '🎉 合作成功！'; emoji = '💕'; sub = '两个人一起赢，才最好玩'; }
  else if (g.coop === false) { title = '💔 这次没通关'; emoji = '🥺'; sub = '再来一局，这次一定行'; }
  else { title = w ? `🎉 ${w.name} 获胜！` : '游戏结束'; emoji = g.mode === 'race' ? '🏁' : '🏆'; sub = '本局结束 · 下面说清楚为什么赢'; }
  $('overEmoji').textContent = emoji; $('winText').textContent = title; $('overSub').textContent = sub;

  // 为什么赢：原因 + 关键数据
  $('overReason').textContent = deriveEndReason(g, ps);
  $('overDetail').textContent = deriveEndDetail(g, ps);

  // 双方终局资产对比
  $('overAssets').innerHTML = ps.map((p, i) => {
    const isW = !!(g.winner && p.id === g.winner);
    return `<div class="oa-row${p.bankrupt ? ' broke' : ''}${isW ? ' win' : ''}">
      <img class="oa-av" src="${avatarSrc(p, i)}" alt="">
      <span class="oa-name">${escapeHtml(p.name)}${p.isYou ? '（你）' : ''}</span>
      <span class="oa-tag">${p.bankrupt ? '破产出局' : (isW ? '🏆 获胜' : '')}</span>
      <b class="oa-net">${p.net}</b></div>`;
  }).join('');

  // 终局回顾：最近几手日志（服务端 log 最新在前）
  const lg = (g.log || []).slice(0, 6);
  $('overLogList').innerHTML = lg.length
    ? lg.map((l) => `<div class="ol-item">${escapeHtml(l.msg || '')}</div>`).join('')
    : '<div class="ol-item">本局没有更多记录</div>';

  // 复盘：关掉弹窗回终局棋盘，不再被广播重弹
  $('reviewBtn').onclick = () => {
    beep('click'); overDismissed = true; o.classList.add('hidden');
    const f = $('boardFrame'); if (f && f.scrollIntoView) f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  o.classList.remove('hidden'); beep(g.coop === false ? 'lose' : 'win'); confetti();
}

/* ---------- 特效 ---------- */
function handleFx() {
  const g = st.game;
  // v3.2 掷骰动画：diceId 去重，翻骰子显示点数（人物不动）
  if (g.diceId && g.dice && g.dice[0]) {
    const dk = 'dice' + g.diceId;
    if (dk !== lastDiceKey) { lastDiceKey = dk; playDice(g.dice); }
  }
  // 逐格移动（moveId 去重，点「前进」后才有 moveSteps）
  if (g.moveSteps && g.moveSteps.length && g.moveId) {
    const mk = 'mv' + g.moveId;
    if (mk !== lastMoveKey) {
      lastMoveKey = mk;
      lastMover = g.mover || 0;
      // v3.3：服务端下发 moveFrom 作为动画起点（内环序列首格不再是 from+1，
      // 旧版 (first-1+N)%N 在 52 格与跨环跳转时会算错起点）
      const prev = (g.moveFrom != null) ? g.moveFrom : st.players[lastMover].pos;
      // 把移动方棋子先放回起点，再逐格播放；其他人直接就位
      placePawns(st.players.map((p, i) => i === lastMover ? prev : p.pos), true);
      setTimeout(() => playMove(g.moveSteps), 30);
    }
  }
  // 事件特效
  const fx = g.eventFx;
  if (fx && fx.kind && g.fxId) {
    const fk = 'fx' + g.fxId;
    if (fk !== lastFxKey) {
      lastFxKey = fk;
      if (['bought', 'house', 'hotel', 'win'].includes(fx.kind)) beep(fx.kind === 'win' ? 'win' : 'buy');
      else if (['rent', 'tax'].includes(fx.kind)) beep('coin');
      else if (fx.kind === 'heart') beep('heart');
      if (['bought', 'house', 'hotel', 'win', 'heart'].includes(fx.kind)) confetti(14);
      if (fx.kind === 'win') confetti(40);
      // 高亮落点格
      const mover = st.players[lastMover];
      if (mover && tileEls[mover.pos]) {
        const d = tileEls[mover.pos]; d.classList.remove('pulse'); void d.offsetWidth; d.classList.add('pulse');
      }
    }
  }
}
function confetti(n) {
  n = n || 24;
  let layer = document.querySelector('.fx-layer');
  if (!layer) { layer = el('div', 'fx-layer'); document.body.appendChild(layer); }
  const colors = ['#ff6b8f', '#ffd23f', '#5b8ff9', '#4ec9a5', '#a98ae8', '#fff'];
  for (let i = 0; i < n; i++) {
    const c = el('div', 'confetti');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.top = '-20px';
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = (Math.random() * .5) + 's';
    c.style.animationDuration = (1.4 + Math.random()) + 's';
    layer.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }
}
function toast(msg) {
  const t = el('div', 'center-event', escapeHtml(msg));
  t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:90;background:#fff;color:#d9436a;padding:8px 14px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.15);font-size:13px;font-weight:700';
  document.body.appendChild(t); setTimeout(() => t.remove(), 2400);
}
/* ========== v3.2 初始化与交互绑定 ========== */
loadAvatarLocal(); updateAvatarPreview();
$('avatarPickBtn') && $('avatarPickBtn').addEventListener('click', () => { beep('click'); openAvatarModal(); });
$('setAvatar') && $('setAvatar').addEventListener('click', () => { beep('click'); closeSettings(); openAvatarModal(); });
$('avatarClose') && $('avatarClose').addEventListener('click', closeAvatarModal);
$('avatarModal') && $('avatarModal').addEventListener('click', (e) => { if (e.target.id === 'avatarModal') closeAvatarModal(); });
$('avatarFile') && $('avatarFile').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  compressImage(file, 128, (dataUrl) => {
    myAvatarData = dataUrl; sel.avatar = 'custom';
    saveAvatarLocal(); updateAvatarPreview(); renderAvatarGrid();
    if (S.code) socket.emit('setAvatar', { avatar: 'custom', data: dataUrl });
    toast('✅ 头像换好啦'); beep('coin');
  });
  e.target.value = '';
});
$('interactBtns') && $('interactBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.dataset.k; beep('click');
  if (k === 'money') { $('moneySheet').classList.remove('hidden'); return; }
  socket.emit('interact', { kind: k });
});
$('c4InteractBtns') && $('c4InteractBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  beep('click'); socket.emit('interact', { kind: b.dataset.k });
});
$('moneyOpts') && $('moneyOpts').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  socket.emit('interact', { kind: 'money', amount: Number(b.dataset.v) });
  $('moneySheet').classList.add('hidden'); beep('coin');
});
$('moneyCancel') && $('moneyCancel').addEventListener('click', () => $('moneySheet').classList.add('hidden'));
$('moneySheet') && $('moneySheet').addEventListener('click', (e) => { if (e.target.id === 'moneySheet') $('moneySheet').classList.add('hidden'); });

/* v4.2 放大棋盘：等比放大到可滚动，格子与地名一起变大，按百分比定位零错位。
 * 选择记到 localStorage，之后进房自动应用，不用每次手动点。 */
const ZOOM_KEY = 'love_board_zoom_v42';
function applyZoomPref() {
  let on = false;
  try { on = localStorage.getItem(ZOOM_KEY) === '1'; } catch (e) {}
  const f = $('boardFrame'), z = $('zoomBtn');
  if (!f) return;
  f.classList.toggle('zoomed', on);
  if (z) { z.classList.toggle('on', on); z.textContent = on ? '还原棋盘' : '放大棋盘 · 看清地名'; }
}
$('zoomBtn') && $('zoomBtn').addEventListener('click', () => {
  const f = $('boardFrame'); const z = f.classList.toggle('zoomed');
  try { localStorage.setItem(ZOOM_KEY, z ? '1' : '0'); } catch (e) {}
  $('zoomBtn').classList.toggle('on', z);
  $('zoomBtn').textContent = z ? '还原棋盘' : '放大棋盘 · 看清地名';
  beep('click');
});
function resetZoom() {
  const f = $('boardFrame'); if (f) f.classList.remove('zoomed');
  const z = $('zoomBtn'); if (z) { z.classList.remove('on'); z.textContent = '放大棋盘 · 看清地名'; }
}

/* ========== v4.0 共享小花园：交互绑定 ========== */
$('gdSettingsBtn') && $('gdSettingsBtn').addEventListener('click', () => { beep('click'); openSettings(); });
$('gdExitBtn') && $('gdExitBtn').addEventListener('click', () => {
  if (!window.confirm('返回主菜单？会解散当前房间，对方也会回到大厅。')) return;
  doLeave();
});
$('c4SettingsBtn') && $('c4SettingsBtn').addEventListener('click', () => { beep('click'); openSettings(); });
$('c4ExitBtn') && $('c4ExitBtn').addEventListener('click', () => {
  if (!window.confirm('返回主菜单？会解散当前房间，对方也会回到大厅。')) return;
  doLeave();
});
// 常驻动作：签到 / 送花 / 合种树 / 留言 / 重置
$('gdActions') && $('gdActions').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act; beep('click');
  if (a === 'message') {
    const row = $('gdMsgRow'); row.classList.toggle('hidden');
    if (!row.classList.contains('hidden')) $('gdMsgInput').focus();
    return;
  }
  if (a === 'reset' && !window.confirm('重置花园？所有植物、装饰和留言会清空，重新开始。')) return;
  socket.emit('gardenAction', { action: a });
});
function sendGdMsg() {
  const v = ($('gdMsgInput').value || '').trim(); if (!v) return;
  socket.emit('gardenAction', { action: 'message', value: v });
  $('gdMsgInput').value = ''; $('gdMsgRow').classList.add('hidden'); beep('coin');
}
$('gdMsgSend') && $('gdMsgSend').addEventListener('click', sendGdMsg);
$('gdMsgInput') && $('gdMsgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendGdMsg(); });
// 花园互动条：复用 interact 事件（比心在花园里也会涨爱心）
$('gdInteractBtns') && $('gdInteractBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  beep('click'); socket.emit('interact', { kind: b.dataset.k });
});
// 花园悄悄话
$('gdChatSend') && $('gdChatSend').addEventListener('click', () => {
  const v = ($('gdChatInput').value || '').trim(); if (!v) return;
  socket.emit('chat', { text: v }); $('gdChatInput').value = '';
});
$('gdChatInput') && $('gdChatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('gdChatSend').click(); });

/* ==================================================================
 * v4.1 全站 emoji → 内联 SVG（豆腐块兜底）
 * 真机有彩色 emoji 字体，但无头浏览器 / 部分安卓机缺字体会显示空心方框。
 * 这里只在「渲染层」把文本节点里的 emoji 换成 1em 彩色内联 SVG：
 *  - 首次全量扫描 body：覆盖大厅 / 等待 / 顶栏 / 面板 / 设置 / 弹窗 / 结束屏
 *  - MutationObserver + rAF 批量：覆盖 toast / 日志 / 弹窗 / state 重绘等动态插入
 *  - 只处理文本节点，中文文案、HTML 结构、业务逻辑、测试断言全部原样保留
 *  - 未收录的 emoji 统一兜底成小星星；© / ← / · / ¥ 等普通符号不在范围内，不误伤
 * ================================================================== */
const EMOJI_ICONS = {
  heart:       '<path d="M12 21C3 14 2 7 7 5c3-1.2 5 1 5 1s2-2.2 5-1c5 2 4 9-5 16z" fill="#ff6b8f"/>',
  heartbroken: '<path d="M12 21C3 14 2 7 7 5c3-1.2 5 1 5 1s2-2.2 5-1c5 2 4 9-5 16z" fill="#c9a3b4"/><path d="M12 7l-2 4h3l-2.5 5" stroke="#fff" stroke-width="1.5" fill="none" stroke-linejoin="round"/>',
  star:        '<path d="M12 2l3 6.5 7 .9-5 4.8 1.3 7L12 18l-6.3 3.2L7 14.2l-5-4.8 7-.9z" fill="#ffd35e"/>',
  sparkle:     '<path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="#ffd35e"/><circle cx="19" cy="18.5" r="2" fill="#ffb0c8"/>',
  dice:        '<rect x="3" y="3" width="18" height="18" rx="4" fill="#fff" stroke="#e07a8f" stroke-width="1.6"/><g fill="#e8536f"><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/></g>',
  gamepad:     '<rect x="2" y="7" width="20" height="11" rx="5" fill="#a98ae8"/><path d="M7 10.5v4M5 12.5h4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="11.5" r="1.3" fill="#fff"/><circle cx="18.5" cy="14" r="1.3" fill="#fff"/>',
  flag:        '<path d="M5 3v18" stroke="#8a7186" stroke-width="2" stroke-linecap="round"/><path d="M6 4h12v8H6z" fill="#f6dce8"/><path d="M6 4h4v4H6zM14 8h4v4h-4z" fill="#e8536f"/>',
  city:        '<rect x="3" y="9" width="6" height="12" rx="1" fill="#8fb8e8"/><rect x="10" y="3" width="7" height="18" rx="1" fill="#5b8ff9"/><rect x="18" y="11" width="4" height="10" rx="1" fill="#a9c8f0"/><g fill="#fff" opacity=".85"><rect x="11.5" y="6" width="1.6" height="1.6"/><rect x="14.5" y="6" width="1.6" height="1.6"/><rect x="11.5" y="10" width="1.6" height="1.6"/><rect x="14.5" y="10" width="1.6" height="1.6"/><rect x="4.5" y="12" width="1.6" height="1.6"/></g>',
  bag:         '<rect x="5" y="7" width="14" height="14" rx="4" fill="#ffb36b"/><path d="M9 7V5a3 3 0 016 0v2" fill="none" stroke="#d9832f" stroke-width="2"/><rect x="9" y="13" width="6" height="5" rx="1.5" fill="#fff3d6"/>',
  swords:      '<path d="M4 3l13 13M20 3L7 16" stroke="#9aa7bd" stroke-width="2.4" stroke-linecap="round"/><path d="M3 8l5-5M21 8l-5-5" stroke="#c04a72" stroke-width="2" stroke-linecap="round"/><circle cx="17.5" cy="18" r="1.8" fill="#ffd35e"/>',
  handshake:   '<path d="M2 12l5-4 4 3 2-2 4 3 5-4-2 9H4z" fill="#ffd0a8" stroke="#e09a63" stroke-width="1.2" stroke-linejoin="round"/>',
  turtle:      '<ellipse cx="11" cy="13" rx="8" ry="6" fill="#6ccb7d"/><circle cx="20" cy="11" r="3" fill="#8fe0a0"/><circle cx="20.7" cy="10.4" r=".7" fill="#3d7a4d"/><path d="M6 18v2M16 18v2" stroke="#4f9e5f" stroke-width="2" stroke-linecap="round"/>',
  balance:     '<path d="M12 3v17M6 20h12M4 7h16" stroke="#a98ae8" stroke-width="1.8" stroke-linecap="round"/><path d="M4 7l-3 6h6zM20 7l-3 6h6z" fill="#c9b3f0"/><circle cx="12" cy="4" r="1.8" fill="#8a6fd0"/>',
  bolt:        '<path d="M13 2L5 13h6l-1 9 9-12h-6z" fill="#ffc93c"/>',
  balloon:     '<ellipse cx="12" cy="9" rx="6.5" ry="7.5" fill="#ff8fa8"/><path d="M12 16.5v2M10 21l2-2 2 2" stroke="#c04a72" stroke-width="1.3" fill="none"/>',
  clipboard:   '<rect x="4" y="4" width="16" height="17" rx="2.5" fill="#fff" stroke="#a98ae8" stroke-width="1.6"/><rect x="8" y="2" width="8" height="4" rx="1.5" fill="#a98ae8"/><path d="M8 11h8M8 15h8" stroke="#c9b3f0" stroke-width="1.6" stroke-linecap="round"/>',
  chat:        '<rect x="3" y="4" width="18" height="12" rx="4" fill="#8fb8e8"/><path d="M8 16l-1 4 5-4z" fill="#8fb8e8"/>',
  sound:       '<path d="M4 9h4l5-4v14l-5-4H4z" fill="#5b8ff9"/><path d="M16 8a6 6 0 010 8M19 5a10 10 0 010 14" stroke="#5b8ff9" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  mute:        '<path d="M4 9h4l5-4v14l-5-4H4z" fill="#9aa7bd"/><path d="M17 9l5 6M22 9l-5 6" stroke="#e8536f" stroke-width="2" stroke-linecap="round"/>',
  gear:        '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="#9aa7bd" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="4.5" fill="#c9d2df"/>',
  home:        '<path d="M3 11l9-8 9 8" fill="none" stroke="#e07a8f" stroke-width="2" stroke-linecap="round"/><path d="M5 10v11h14V10z" fill="#ffc2d2"/><rect x="10" y="14" width="4" height="7" fill="#fff"/>',
  hotel:       '<rect x="4" y="3" width="16" height="18" rx="2" fill="#ffb36b"/><text x="12" y="12.5" font-size="9" font-weight="800" text-anchor="middle" fill="#fff">H</text><rect x="9" y="15" width="6" height="6" fill="#fff3d6"/>',
  scroll:      '<rect x="5" y="3" width="14" height="18" rx="2" fill="#fff6e0" stroke="#d9a066" stroke-width="1.5"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#d9a066" stroke-width="1.3" stroke-linecap="round"/>',
  letter:      '<rect x="2.5" y="6" width="19" height="13" rx="2.5" fill="#fff" stroke="#e07a8f" stroke-width="1.7"/><path d="M3 7.5L12 14l9-6.5" fill="none" stroke="#e07a8f" stroke-width="1.7"/>',
  picture:     '<rect x="3" y="4" width="18" height="16" rx="2" fill="#fff" stroke="#a98ae8" stroke-width="1.6"/><circle cx="8" cy="9" r="2" fill="#ffd35e"/><path d="M4 18l6-6 4 4 3-3 4 5z" fill="#8fd0a8"/>',
  reset:       '<path d="M19 12A7 7 0 1112 5a7 7 0 016.5 4.5" fill="none" stroke="#c98a3e" stroke-width="2.2" stroke-linecap="round"/><path d="M18.5 4v5h-5z" fill="#c98a3e"/>',
  swirl:       '<path d="M12 4a8 8 0 108 8 6 6 0 01-6-6 4 4 0 00-4 4" fill="none" stroke="#a05ad8" stroke-width="2" stroke-linecap="round"/>',
  rail:        '<path d="M7 3l-2 18M17 3l2 18" stroke="#a98ae8" stroke-width="2"/><path d="M4 8h16M3.5 13h17M3 18h18" stroke="#c9b3f0" stroke-width="2"/>',
  bank:        '<path d="M2 9l10-6 10 6z" fill="#f0b26b"/><rect x="4" y="10" width="16" height="2" fill="#d99a4a"/><path d="M5 13v7M10 13v7M14 13v7M19 13v7" stroke="#d99a4a" stroke-width="2"/><rect x="3" y="20" width="18" height="2" rx="1" fill="#d99a4a"/>',
  card:        '<rect x="2" y="5" width="20" height="14" rx="2.5" fill="#8fb8e8"/><rect x="2" y="8" width="20" height="3" fill="#5b8ff9"/><rect x="5" y="14" width="6" height="2" rx="1" fill="#fff"/>',
  car:         '<path d="M3 14l2-6h14l2 6v4H3z" fill="#ff8fa8"/><path d="M6 9l1.5-3h9L18 9z" fill="#c9e4f5"/><circle cx="7" cy="18" r="2" fill="#5a5a6e"/><circle cx="17" cy="18" r="2" fill="#5a5a6e"/>',
  theater:     '<path d="M4 5h16v7a8 8 0 01-16 0z" fill="#a98ae8"/><circle cx="9" cy="10" r="1.4" fill="#fff"/><circle cx="15" cy="10" r="1.4" fill="#fff"/><path d="M9 15q3 2 6 0" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
  party:       '<path d="M4 20L14 6l4 4L6 21z" fill="#ffb36b"/><path d="M15 3l1 2 2-1-1 2 2 1M19 10l1 2M10 3l1 2" stroke="#ff6b8f" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  camera:      '<rect x="2" y="7" width="20" height="13" rx="2.5" fill="#a98ae8"/><circle cx="12" cy="13.5" r="4" fill="#fff"/><circle cx="12" cy="13.5" r="2.3" fill="#8fb8e8"/><rect x="8" y="4.5" width="5" height="3" rx="1" fill="#a98ae8"/>',
  coin:        '<circle cx="12" cy="12" r="9.5" fill="#f7c948" stroke="#e0a92f" stroke-width="1.5"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff0b8" stroke-width="1.2"/><text x="12" y="16" font-size="11" font-weight="800" text-anchor="middle" fill="#a9701a">¥</text>',
  check:       '<circle cx="12" cy="12" r="9" fill="#4ec9a5"/><path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  warn:        '<path d="M12 3l10 18H2z" fill="#ffc93c" stroke="#e0a92f" stroke-width="1"/><path d="M12 9v6M12 17.5v1.5" stroke="#8a5a12" stroke-width="2" stroke-linecap="round"/>',
  seed:        '<ellipse cx="12" cy="15" rx="6" ry="5" fill="#a97c52"/><path d="M9 12q3-4 6 0" fill="#c99a6a"/>',
  sprout:      '<path d="M12 21v-8" stroke="#4faa63" stroke-width="2"/><path d="M12 15c-4 0-5-5-2-6 1 2 2 2 2 2M12 14c4 0 5-4 2-5-1 2-2 2-2 2" fill="#6ccb7d"/>',
  flower:      '<path d="M12 21v-8" stroke="#4faa63" stroke-width="2"/><path d="M12 13c-4 0-5-6-2-7 1 2 2 3 2 3s1-1 2-3c3 1 2 7-2 7" fill="#ff8fa8"/>',
  bouquet:     '<path d="M12 21v-9M8 21q1-6 4-8M16 21q-1-6-4-8" stroke="#4faa63" stroke-width="1.6" fill="none"/><circle cx="8" cy="8" r="3" fill="#ff8fa8"/><circle cx="16" cy="8" r="3" fill="#ffd873"/><circle cx="12" cy="5.5" r="3.2" fill="#e8536f"/>',
  tree:        '<rect x="10.5" y="14" width="3" height="8" rx="1" fill="#a9703a"/><circle cx="12" cy="10" r="7" fill="#6ccb7d"/><circle cx="8.5" cy="12" r="4.2" fill="#57bb6c"/><circle cx="15.5" cy="12" r="4.2" fill="#4faa63"/>',
  pin:         '<path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z" fill="#e8536f"/><circle cx="12" cy="9" r="2.5" fill="#fff"/>',
  lock:        '<rect x="5" y="10" width="14" height="11" rx="2.5" fill="#a98ae8"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="#7a5fb0" stroke-width="2"/>',
  question:    '<circle cx="12" cy="12" r="9" fill="#a98ae8"/><path d="M9.5 9a2.5 2.5 0 115 0c0 2-2.5 2.5-2.5 4.5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.2" fill="#fff"/>',
  station:     '<rect x="4" y="4" width="16" height="13" rx="3" fill="#8fb8e8"/><rect x="7" y="8" width="10" height="5" rx="1" fill="#fff"/><circle cx="8" cy="18" r="1.6" fill="#5a5a6e"/><circle cx="16" cy="18" r="1.6" fill="#5a5a6e"/>',
  bulb:        '<circle cx="12" cy="9" r="6" fill="#ffd35e"/><rect x="9" y="15" width="6" height="3" rx="1" fill="#c9d2df"/><path d="M10 20h4" stroke="#c9d2df" stroke-width="2" stroke-linecap="round"/>',
  shield:      '<path d="M12 2l8 3v7c0 5-4 8-8 10-4-2-8-5-8-10V5z" fill="#8fb8e8"/><path d="M8 12l2.5 2.5L16 9" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
  offline:     '<rect x="7" y="2" width="10" height="18" rx="2.5" fill="#c9d2df"/><path d="M4 4l16 16" stroke="#e8536f" stroke-width="2" stroke-linecap="round"/>',
  dot:         '<circle cx="12" cy="12" r="8" fill="#4ec9a5"/>',
  hourglass:   '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" fill="none" stroke="#d9a066" stroke-width="1.8" stroke-linecap="round"/>',
  foot:        '<ellipse cx="9" cy="9" rx="3" ry="4.5" fill="#ffb0c8"/><ellipse cx="16" cy="15" rx="3" ry="4.5" fill="#ffb0c8"/><circle cx="7" cy="4" r="1.2" fill="#ffb0c8"/><circle cx="10" cy="3.5" r="1.2" fill="#ffb0c8"/>',
  hammer:      '<path d="M3 21l9-9" stroke="#a9703a" stroke-width="3" stroke-linecap="round"/><path d="M11 4l9 9-4 4-9-9z" fill="#9aa7bd"/>',
  brain:       '<circle cx="12" cy="11" r="8" fill="#ffb0c8"/><path d="M12 3v16M5 9c3 1 4 3 4 5M19 9c-3 1-4 3-4 5" stroke="#e8536f" stroke-width="1.5" fill="none"/>',
  wheel:       '<circle cx="12" cy="11" r="8" fill="none" stroke="#a98ae8" stroke-width="1.6"/><path d="M12 3v16M4 11h16M6 5l12 12M18 5L6 17" stroke="#c9b3f0" stroke-width="1.2"/><circle cx="12" cy="11" r="1.8" fill="#e8536f"/><circle cx="12" cy="3.5" r="1.6" fill="#ffd35e"/><circle cx="4" cy="11" r="1.6" fill="#8fb8e8"/>',
  trophy:      '<path d="M7 3h10v6a5 5 0 01-10 0z" fill="#ffd35e"/><path d="M7 5H4v2a4 4 0 004 4M17 5h3v2a4 4 0 01-4 4" fill="none" stroke="#e0a92f" stroke-width="1.8"/><path d="M12 14v4M8 20h8" stroke="#e0a92f" stroke-width="2" stroke-linecap="round"/>',
  sad:         '<circle cx="12" cy="12" r="9" fill="#ffd35e"/><circle cx="9" cy="10" r="1.5" fill="#8a5a12"/><circle cx="15" cy="10" r="1.5" fill="#8a5a12"/><path d="M9 16q3-2 6 0" stroke="#8a5a12" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  fist:        '<path d="M8 11V6.5a1.5 1.5 0 013 0V10m0 0V5.5a1.5 1.5 0 013 0V10m0 0V7a1.5 1.5 0 013 0v6c0 4-2.6 7-6.5 7-3 0-4.5-1.6-6-4L3 12.5a1.6 1.6 0 012.6-1.8L8 13" fill="#ffd9a8" stroke="#d99a5a" stroke-width="1.2" stroke-linejoin="round"/>',
  poke:        '<path d="M4 12h10M11 8l4 4-4 4" fill="none" stroke="#5b8ff9" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19" cy="12" r="2.6" fill="#a98ae8"/>',
  gift:        '<rect x="3.5" y="9" width="17" height="12" rx="1.8" fill="#ff8fa8"/><rect x="3" y="7" width="18" height="4" rx="1.5" fill="#e8536f"/><rect x="10.5" y="7" width="3" height="14" fill="#fff0b8"/><path d="M12 7Q7 7 7 4.5 7 2.5 9.5 3.5 11 4 12 7Z" fill="#ffd873"/><path d="M12 7q5 0 5-2.5 0-2-2.5-1-1.5.5-2.5 3.5Z" fill="#ffd873"/>',
  calendar:    '<rect x="3" y="5" width="18" height="16" rx="2.5" fill="#fff" stroke="#e07a8f" stroke-width="1.8"/><rect x="3" y="5" width="18" height="5" rx="2.5" fill="#ff8fa8"/><rect x="7" y="2.5" width="2" height="5" rx="1" fill="#c04a72"/><rect x="15" y="2.5" width="2" height="5" rx="1" fill="#c04a72"/><path d="M7.5 15.5L10 18l6.5-6" fill="none" stroke="#4ec9a5" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  drop:        '<path d="M12 2C8 8 6 11 6 14a6 6 0 0012 0c0-3-2-6-6-12z" fill="#8fd0f7"/>',
  bench:       '<rect x="4" y="12" width="16" height="3.5" rx="1.5" fill="#b9763f"/><rect x="4" y="16" width="16" height="3" rx="1.5" fill="#cf8b52"/><rect x="6" y="19" width="2" height="3" fill="#8a5530"/><rect x="16" y="19" width="2" height="3" fill="#8a5530"/><rect x="3" y="7" width="18" height="3.5" rx="1.5" fill="#a9683a"/>',
};
/* emoji(去变体选择符后) → 图标名；未列出的统一用 star 兜底 */
const EMOJI_MAP = {
  '💕':'heart','💗':'heart','💞':'heart','💔':'heartbroken','❤':'heart','💖':'heart','💘':'heart','💝':'heart',
  '🎮':'gamepad','🎲':'dice','🎯':'gamepad','🕹':'gamepad',
  '🏙':'city','🏫':'bag','🎒':'bag','🏢':'city','🌆':'city',
  '⚔':'swords','🏁':'flag','🤝':'handshake','🐢':'turtle','⚖':'balance','⚡':'bolt','✨':'sparkle',
  '🎈':'balloon','📋':'clipboard','💬':'chat','💭':'chat','🔊':'sound','🔇':'mute','🔉':'sound','📢':'sound',
  '⚙':'gear','🏠':'home','🏨':'hotel','🏡':'home','📜':'scroll','💌':'letter','✉':'letter','📨':'letter',
  '🖼':'picture','🖼️':'picture','🖼':'picture','📷':'camera','📸':'camera',
  '🔄':'reset','🔃':'reset','🔁':'reset','🌀':'swirl','🛤':'rail','🚧':'rail',
  '🏦':'bank','💳':'card','💰':'coin','🪙':'coin','💸':'coin','💵':'coin','💴':'coin',
  '🚗':'car','🚔':'car','🚙':'car','🚕':'car','🚌':'station',
  '🎭':'theater','🎉':'party','🎊':'party','🥳':'party','🏆':'trophy','🥇':'trophy',
  '✅':'check','✔':'check','☑':'check','❌':'warn','❎':'warn',
  '⚠':'warn','❓':'question','❔':'question','⭐':'star','🌟':'star','💫':'star',
  '🌰':'seed','🌱':'sprout','🌿':'sprout','🌷':'flower','🌸':'flower','🌹':'flower','🌻':'flower','💐':'bouquet','🌳':'tree','🌲':'tree','🪴':'sprout',
  '📍':'pin','🔒':'lock','🔓':'lock','🗝':'lock','🚉':'station','🚂':'station','💡':'bulb',
  '🛡':'shield','📴':'offline','🟢':'dot','🔴':'dot','⏳':'hourglass','⌛':'hourglass',
  '👣':'foot','🔨':'hammer','🧠':'brain','🎡':'wheel','✊':'fist','🤛':'fist','🤜':'fist','👉':'poke','👈':'poke',
  '🥺':'sad','😢':'sad','😭':'sad','😍':'heart','😘':'heart','🥰':'heart',
  '📅':'calendar','🗓':'calendar','💧':'drop','🚿':'drop','💦':'drop','🪑':'bench','🛋':'bench',
  '🏁':'flag','🚩':'flag','🎁':'gift','🎀':'gift','💳':'card','🧺':'bench',
};
/* 码点范围匹配（避开 © ® ™ ← → · ¥ 等普通符号），可选变体选择符。
 * test 用不带 g 的独立对象，exec 用带 g 的对象，避免共享 lastIndex 造成漏替换。 */
const EMOJI_SRC = '[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]\uFE0F?';
const EMOJI_RE = new RegExp(EMOJI_SRC, 'gu');
const EMOJI_TEST = new RegExp('(?:' + EMOJI_SRC + ')', 'u');
const EM_SKIP = { SCRIPT:1, STYLE:1, TEXTAREA:1, INPUT:1, SELECT:1, OPTION:1, SVG:1, NOSCRIPT:1, IFRAME:1 };
function emIconName(ch) {
  const k = ch.replace(/\uFE0F/g, '');
  return EMOJI_MAP[k] || EMOJI_MAP[ch] || 'star';
}
function emReplaceText(node) {
  const t = node.nodeValue;
  if (!t || !EMOJI_TEST.test(t)) return;
  EMOJI_RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0, m;
  while ((m = EMOJI_RE.exec(t))) {
    if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
    const span = document.createElement('span');
    span.className = 'eico';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${EMOJI_ICONS[emIconName(m[0])]}</svg>`;
    frag.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
  if (node.parentNode) node.parentNode.replaceChild(frag, node);
}
function emScan(root) {
  if (!root) return;
  if (root.nodeType === 3) { emReplaceText(root); return; }
  if (root.nodeType !== 1) return;
  if (root.classList && root.classList.contains('eico')) return;   // 自己生成的，跳过
  if (EM_SKIP[root.nodeName.toUpperCase()]) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      let p = n.parentNode;
      while (p) { if (EM_SKIP[p.nodeName.toUpperCase()]) return NodeFilter.FILTER_REJECT; p = p.parentNode; }
      if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
      return EMOJI_TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const list = [];
  while (w.nextNode()) list.push(w.currentNode);
  for (let i = 0; i < list.length; i++) emReplaceText(list[i]);
}
/* 动态内容：MutationObserver 回调内「同步」处理。
 * 不用 rAF/定时器批量——后台标签页会被节流暂停，导致动态文本漏替换（等待页实测踩到）。
 * 用 disconnect → 同步替换 → observe 包裹，避免自己的 replaceChild 再次触发形成循环。 */
try {
  emScan(document.body);                       // 首次：静态 DOM 全量
  const EM_OPTS = { childList: true, subtree: true, characterData: true };
  const emMo = new MutationObserver((muts) => {
    emMo.disconnect();                         // 防止下方 DOM 改动自触发
    try {
      for (let i = 0; i < muts.length; i++) {
        const m = muts[i];
        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const n = m.addedNodes[j];
            if (n.nodeType === 1 || n.nodeType === 3) emScan(n);
          }
        } else if (m.type === 'characterData') emScan(m.target);
      }
    } finally { emMo.observe(document.body, EM_OPTS); }
  });
  emMo.observe(document.body, EM_OPTS);
} catch (e) { console.warn('[emoji] init skipped', e.message); }

window.addEventListener('error', (e) => { console.warn('[game] error', e.message); });
})();
