/* 💕 双人游戏合集 v3.2 —— 前端逻辑（头像自选 / 掷骰两步走 / 双人实时互动） */
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
$('soundBtn') && $('soundBtn').addEventListener('click', () => {
  soundOn = !soundOn; $('soundBtn').textContent = soundOn ? '🔊' : '🔇';
  if (soundOn) beep('click');
});

/* ---------- v3.1 顶栏：悄悄话 / 设置 / 退出主菜单 ---------- */
function clearUnread() {
  unreadChat = 0;
  const b = $('chatBadge'), u = $('chatUnread');
  if (b) { b.classList.add('hidden'); b.textContent = '0'; }
  if (u) { u.classList.add('hidden'); u.textContent = '0'; }
}
function openChat() {
  const p = $('chatPanel'); if (!p) return;
  p.open = true; clearUnread();
  p.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
$('chatBtn') && $('chatBtn').addEventListener('click', () => { beep('click'); openChat(); });
$('chatPanel') && $('chatPanel').addEventListener('toggle', () => { if ($('chatPanel').open) clearUnread(); });

function openSettings() {
  $('setRoomInfo').textContent = '房间 ' + ((st && st.code) || S.code || '------');
  $('setSoundVal').textContent = soundOn ? '开' : '关';
  $('settings').classList.remove('hidden');
}
function closeSettings() { $('settings').classList.add('hidden'); }
function doLeave() {
  socket.emit('leaveRoom');
  clearSession(); st = null; board = null; boardBuilt = false; clearUnread();
  $('over').classList.add('hidden'); $('settings').classList.add('hidden');
  show('lobby');
}
$('settingsBtn') && $('settingsBtn').addEventListener('click', () => { beep('click'); openSettings(); });
$('setClose') && $('setClose').addEventListener('click', closeSettings);
$('settings') && $('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });
$('setSound') && $('setSound').addEventListener('click', () => {
  soundOn = !soundOn;
  $('soundBtn').textContent = soundOn ? '🔊' : '🔇';
  $('setSoundVal').textContent = soundOn ? '开' : '关';
  if (soundOn) beep('click');
});
$('setRestart') && $('setRestart').addEventListener('click', () => {
  if (!window.confirm('重开本局？当前进度会清空，双方一起回到等待页重新选择模式。')) return;
  closeSettings(); socket.emit('endSession');
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
  ['lobby', 'waiting', 'game'].forEach((x) => $(x).classList.toggle('hidden', x !== which));
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
['themeBtns', 'modeBtns', 'paceBtns', 'wThemeBtns', 'wModeBtns', 'wPaceBtns'].forEach((id) => {
  const key = id.includes('Theme') ? 'theme' : id.includes('Mode') ? 'mode' : 'pace';
  bindGroup(id, key);
});
// 游戏合集：目前只有 monopoly 可玩，其余为 coming soon 占位
const gkBtns = $('gameKindBtns');
if (gkBtns) gkBtns.addEventListener('click', (e) => {
  const b = e.target.closest('.game-card:not(.soon)'); if (!b) return;
  gkBtns.querySelectorAll('.game-card').forEach((x) => x.classList.remove('active'));
  b.classList.add('active'); sel.gameKind = b.dataset.v || 'monopoly'; beep('click');
});
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
$('backBtn').onclick = () => { if (S.code) socket.emit('leaveRoom'); clearSession(); st = null; board = null; boardBuilt = false; clearUnread(); show('lobby'); };
$('againBtn').onclick = () => { beep('click'); $('over').classList.add('hidden'); socket.emit('restart'); };
$('homeBtn').onclick = () => { if (S.code) socket.emit('leaveRoom'); clearSession(); st = null; board = null; boardBuilt = false; clearUnread(); $('over').classList.add('hidden'); show('lobby'); };
$('chatSend').onclick = () => {
  const v = ($('chatInput').value || '').trim(); if (!v) return;
  socket.emit('chat', { text: v }); $('chatInput').value = '';
};
$('chatInput') && $('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('chatSend').click(); });

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
  showInteractFx(d); toast((d.emoji || '💕') + ' ' + (d.text || ''));
  beep(d.kind === 'heart' ? 'heart' : 'coin');
});
socket.on('state', (s) => {
  st = s;
  if (s.players) { const me = s.players.find((p) => p.isYou); if (me && me.token && !S.token) { S.token = me.token; S.code = s.code; saveSession(); } }
  tryRender();
});
socket.on('needResync', () => { setNet('🔄 正在重新同步…', true); socket.emit('requestSync'); setTimeout(() => setNet(''), 2500); });
socket.on('roomClosed', ({ by }) => {
  clearSession(); st = null; board = null; boardBuilt = false; clearUnread();
  $('over').classList.add('hidden'); $('settings').classList.add('hidden');
  show('lobby');
  showOverlay('对方已离开房间', (by || '对方') + ' 退出了，房间已解散，可以开一局新的～', [
    { text: '好的', primary: true, onClick: hideOverlay },
  ]);
  toast('💔 ' + (by || '对方') + ' 离开了房间');
});
socket.on('sessionEnded', ({ by }) => { toast('🔄 ' + (by || '对方') + ' 结束了本局，回到等待页'); beep('click'); });
socket.on('chat', ({ name, text, color }) => {
  const c = $('chatList'); if (!c) return;
  const d = el('div', 'chat-msg'); d.innerHTML = `<b style="color:${color}">${escapeHtml(name)}</b>：${escapeHtml(text)}`;
  c.appendChild(d); c.scrollTop = c.scrollHeight;
  // 折叠时也能看到：未读角标 + 弹窗式气泡
  const panel = $('chatPanel');
  if (!panel || !panel.open) {
    unreadChat++;
    const b = $('chatBadge'), u = $('chatUnread');
    if (b) { b.textContent = String(Math.min(99, unreadChat)); b.classList.remove('hidden'); }
    if (u) { u.textContent = String(unreadChat); u.classList.remove('hidden'); }
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

/* ========== v3.2 双人互动飘动画 ========== */
function showInteractFx(d) {
  const layer = $('interactFxLayer'); if (!layer) return;
  for (let i = 0; i < 8; i++) {
    const s = el('div', 'i-fx', d.emoji || '💕');
    s.style.left = (8 + Math.random() * 84) + 'vw';
    s.style.fontSize = (20 + Math.random() * 24) + 'px';
    s.style.animationDelay = (Math.random() * 0.5) + 's';
    layer.appendChild(s);
    setTimeout(() => s.remove(), 2600);
  }
  const big = el('div', 'i-fx-big',
    `<span class="ifb-emoji">${d.emoji || '💕'}</span><b>${escapeHtml(d.from || 'TA')}</b><small>${escapeHtml(d.text || '')}</small>`);
  layer.appendChild(big);
  setTimeout(() => big.remove(), 2300);
}

/* ---------- 渲染总入口（DOM 复用） ---------- */
function tryRender() {
  if (!st) return;
  if (!st.started) { renderWaiting(); return; }
  if (!board) return;                     // 等 board 到达
  if (board.boardVersion !== st.boardVersion) { socket.emit('requestSync'); return; }
  hideOverlay();
  show('game');
  if (!boardBuilt) buildBoard();
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
  $('roomCode').textContent = st.code || S.code || '------';
  const box = $('waitPlayers'); box.innerHTML = '';
  st.players.forEach((p) => {
    const d = el('div', 'pbox', `<img class="pav" src="${avatarSrc(p, st.players.indexOf(p))}"><div class="pinfo"><div class="pname">${escapeHtml(p.name)}</div><div class="pmeta">${p.connected ? '✅ 已就位' : '⏳ 掉线'}</div></div>`);
    d.style.maxWidth = '190px'; box.appendChild(d);
  });
  const n = st.players.length, isHost = st.players[0] && st.players[0].isYou;
  $('waitHint').textContent = n >= 2 ? '两人都到齐啦，房主点开始游戏～（2/2）' : '等待另一位玩家加入…（1/2）';
  $('waitSetup').classList.toggle('hidden', !isHost);
  $('startBtn').classList.toggle('hidden', !(isHost && n >= 2));
  syncWaitBtns();
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
  board.tiles.forEach((t, i) => {
    const [r, c] = board.layout[i];
    const d = el('div', 'tile ' + t.type + (['go', 'jail', 'park', 'gotojail'].includes(t.type) ? ' corner' : ''));
    d.style.gridRow = String(r + 1); d.style.gridColumn = String(c + 1);
    d.dataset.idx = String(i);
    const img = TILE_IMG[t.type] || TILE_IMG.property;
    const bar = t.group && groups[t.group] ? `<div class="tbar" style="background:${groups[t.group].color}"></div>` : '';
    const price = t.price != null && ['property', 'station', 'utility'].includes(t.type) ? `<div class="tprice">${t.price}</div>` : '';
    d.innerHTML = `${bar}<div class="ti"><img src="/assets/${img}" alt="" loading="lazy"></div><div class="tn">${escapeHtml(t.name.replace(/^[^\u4e00-\u9fa5a-zA-Z]+\s*/, ''))}</div>${price}<div class="towner"></div><div class="tlv"></div>`;
    b.appendChild(d); tileEls.push(d);
  });
  const center = el('div', 'board-center');
  center.id = 'boardCenter';
  center.innerHTML = `<div class="center-heart">💗</div><div class="center-title" id="centerTitle">${escapeHtml(board.themeName)}</div>
    <div class="center-sub" id="centerSub">一起出发吧</div>
    <div class="dice-area" id="diceArea">
      <div class="die3d flat" id="die1" data-v="1">${makeDieHtml()}</div>
      <div class="die3d flat" id="die2" data-v="1">${makeDieHtml()}</div>
    </div>
    <div class="center-event" id="centerEvent"></div>`;
  center.style.gridRow = '2 / 11'; center.style.gridColumn = '2 / 11';
  b.appendChild(center);
  const pl = el('div', 'pawn-layer'); pl.id = 'pawnLayer';
  pawnEls = [el('div', 'pawn p0'), el('div', 'pawn p1')];
  pawnEls.forEach((p, i) => { p.dataset.pi = String(i); pl.appendChild(p); });
  locTipEl = el('div', 'loc-tip hidden'); locTipEl.id = 'locTip';
  pl.appendChild(locTipEl);
  b.appendChild(pl);
  boardBuilt = true;
  setDie($('die1'), 1); setDie($('die2'), 1);
  placePawns(st.players.map((p) => p.pos), true);
  applyPawnAvatars();
  renderLocTip(st.game.current, true);
}

/* 环形坐标 → 百分比 */
function posStyle(pos, idx) {
  const [r, c] = board.layout[pos] || [10, 10];
  const ox = idx === 0 ? -2.1 : 2.1;
  const oy = idx === 0 ? -2.1 : 2.1;
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
    (g.modeName || '') + ' · 40 格环游';
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
  if (g.phase === 'ended') return;
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
      const b = el('button', 'roll-btn advance-btn', `👣 前进 ${n} 步`);
      b.id = 'advanceBtn';
      b.onclick = () => {
        if (animating) return;
        beep('click');
        b.textContent = '👣 出发中…'; b.disabled = true;
        $('eventBar').textContent = '👣 出发！';
        clearTimeout(rollTimeout);
        rollTimeout = setTimeout(() => { if (b.isConnected) { b.disabled = false; b.textContent = `👣 前进 ${n} 步`; } }, 5000);
        socket.emit('confirmMove');
      };
      c.appendChild(b);
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
function renderModals() {
  const g = st.game, m = $('modal'), mc = $('modalCard');
  // v3.1：3D 骰子 + 逐格移动播放期间先不弹窗，等落定后再弹（否则会盖住动画）
  if (g.moveId && g.moveSteps && g.moveSteps.length && lastMoveKey !== 'mv' + g.moveId) { m.classList.add('hidden'); return; }
  if (animating) { m.classList.add('hidden'); return; }
  const key = g.phase + '|' + (g.mini ? g.mini.kind + (g.mini.resolved ? 'R' : '') + (g.mini.mine ?? 'x') : '') + '|' + (g.auction ? JSON.stringify(g.auction.bids) : '') + '|' + (g.choice ? g.choice.kind + g.choice.byIdx : '');
  if (g.phase === 'ended') { m.classList.add('hidden'); renderOver(); lastModalKey = key; return; }
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
function renderOver() {
  const g = st.game, o = $('over');
  const w = st.players.find((p) => p.id === g.winner);
  let title, emoji, sub;
  if (g.coop === true) { title = g.mode === 'heart' ? '💗 默契满格！' : '🎉 合作成功！'; emoji = '💕'; sub = g.mode === 'heart' ? '你们心有灵犀，一起通关啦' : '两个人一起赢，才最好玩'; }
  else if (g.coop === false) { title = '💔 这次没通关'; emoji = '🥺'; sub = '再来一局，这次一定行'; }
  else { title = w ? `🎉 ${w.name} 获胜！` : '游戏结束'; emoji = g.mode === 'race' ? '🏁' : '🏆'; sub = g.mode === 'race' ? '率先跑完全程！' : `净资产 ${w ? w.net : 0}`; }
  $('overEmoji').textContent = emoji; $('winText').textContent = title; $('overSub').textContent = sub;
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
      const first = g.moveSteps[0];
      const prev = (first - 1 + board.tiles.length) % board.tiles.length;
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
$('moneyOpts') && $('moneyOpts').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  socket.emit('interact', { kind: 'money', amount: Number(b.dataset.v) });
  $('moneySheet').classList.add('hidden'); beep('coin');
});
$('moneyCancel') && $('moneyCancel').addEventListener('click', () => $('moneySheet').classList.add('hidden'));
$('moneySheet') && $('moneySheet').addEventListener('click', (e) => { if (e.target.id === 'moneySheet') $('moneySheet').classList.add('hidden'); });

window.addEventListener('error', (e) => { console.warn('[game] error', e.message); });
})();
