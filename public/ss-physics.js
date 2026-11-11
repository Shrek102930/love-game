/* =====================================================================
 *  双人弹射对战 · 共享物理内核  v1
 *  ---------------------------------------------------------------
 *  服务端（server.js require）与客户端（<script src> 后用 window.SSPhysics）
 *  跑的是同一份代码 —— 这样「拉弓时的虚线预测」和真正飞出去的弹道
 *  一模一样，不会出现「看着能中却打不中」的欺骗感。
 *  纯函数、无副作用，可在任意环境执行。
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SSPhysics = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* 世界坐标：宽 100 / 高 62 / 地面 y=50（y 向下为正） */
  var SS_W = 100, SS_H = 62, SS_GROUND = 50;
  var SS_G = 100;                       // 重力加速度
  var SS_VMIN = 52, SS_VMAX = 118;      // 力度 0→1 映射到的初速度
  var SS_R = 1.1;                       // 弹丸半径
  var SS_HP = 100, SS_DMG = 34, SS_SELF_DMG = 15;
  /* 弹弓架在塔楼上（y=37 高于自家小人头顶），否则平射出手就会先撞到自家小人 */
  var SS_SLING = [{ x: 9, y: 37 }, { x: 91, y: 37 }];      // 双方弹弓出手点
  var SS_SAFE_D = 7;                                       // 出手保护距离（飞出这么远才开始判定碰撞）
  var SS_MAN = [{ x: 19, y: 45.8 }, { x: 81, y: 45.8 }];   // 双方小人圆心（脚踩地面）
  var SS_MAN_R = 4.2;
  var SS_BLOCK_X = [28, 70.2];          // 掩体墙左边缘（各 1.8 宽，左右对称）
  var SS_BLOCK_W = 1.8;
  var SS_BLOCK_Y = [43.6, 46.8];        // 两块方块的顶边（各 3.2 高，下块贴地）
  var SS_BLOCK_H = 3.2;
  var SS_BLOCK_HP = 1;                  // 每块挨 1 发即碎

  function ssR1(n) { return Math.round(n * 10) / 10; }

  function ssCircleHitsRect(cx, cy, r, rx, ry, rw, rh) {
    var nx = Math.max(rx, Math.min(cx, rx + rw));
    var ny = Math.max(ry, Math.min(cy, ry + rh));
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= r * r;
  }

  /* 固定步长积分，返回扁平轨迹 [x,y,x,y,...] 与首次碰撞
   * opts: { dt, maxSteps } —— 预览时用粗步长省算力，正式结算用细步长保证一致 */
  function ssSimulate(by, angleDeg, power, blocks, opts) {
    opts = opts || {};
    var dir = by === 0 ? 1 : -1;
    var deg = Math.max(-85, Math.min(85, angleDeg));
    var pw = Math.max(0, Math.min(1, power));
    var a = deg * Math.PI / 180;
    var v = SS_VMIN + pw * (SS_VMAX - SS_VMIN);
    var x = SS_SLING[by].x, y = SS_SLING[by].y;
    var vx = dir * v * Math.cos(a), vy = -v * Math.sin(a);
    var dt = opts.dt || 1 / 120;
    var maxSteps = opts.maxSteps || 1800;
    var path = [ssR1(x), ssR1(y)];
    var px = x, py = y, hit = null, block = null, launched = false;
    for (var i = 0; i < maxSteps; i++) {
      vy += SS_G * dt;
      x += vx * dt; y += vy * dt;
      if (Math.abs(x - px) >= 0.7 || Math.abs(y - py) >= 0.7) {
        path.push(ssR1(x), ssR1(y)); px = x; py = y;
      }
      if (!launched) {                                  // 刚出手时不做碰撞判定，避免擦到自家塔
        var ex = x - SS_SLING[by].x, ey = y - SS_SLING[by].y;
        if (ex * ex + ey * ey >= SS_SAFE_D * SS_SAFE_D) launched = true;
      }
      if (!launched) continue;
      for (var s = 0; s < 2; s++) {                     // 先判小人（贴地前一定判得到）
        var m = SS_MAN[s];
        if (Math.hypot(x - m.x, y - m.y) <= SS_MAN_R + SS_R) {
          hit = { type: 'man', side: s, x: ssR1(x), y: ssR1(y) }; break;
        }
      }
      if (!hit && blocks) {                             // 再判掩体墙
        for (var b = 0; b < blocks.length; b++) {
          var bk = blocks[b];
          if (bk.hp <= 0) continue;
          if (ssCircleHitsRect(x, y, SS_R, bk.x, bk.y, bk.w, bk.h)) {
            hit = { type: 'block', id: bk.id, x: ssR1(x), y: ssR1(y) }; block = bk; break;
          }
        }
      }
      if (!hit && y >= SS_GROUND - SS_R) {
        y = SS_GROUND - SS_R;
        hit = { type: 'ground', x: ssR1(x), y: ssR1(y) };
      }
      if (!hit && (x < -8 || x > SS_W + 8 || y > SS_H + 12)) {
        hit = { type: 'out', x: ssR1(x), y: ssR1(y) };
      }
      if (hit) { path.push(ssR1(x), ssR1(y)); break; }
    }
    return { path: path, hit: hit, block: block };
  }

  function makeBlocks() {
    var out = [];
    for (var s = 0; s < 2; s++) {
      for (var i = 0; i < SS_BLOCK_Y.length; i++) {
        out.push({ id: s + '-' + i, side: s, x: SS_BLOCK_X[s], y: SS_BLOCK_Y[i],
          w: SS_BLOCK_W, h: SS_BLOCK_H, hp: SS_BLOCK_HP });
      }
    }
    return out;
  }

  return {
    SS_W: SS_W, SS_H: SS_H, SS_GROUND: SS_GROUND, SS_G: SS_G,
    SS_VMIN: SS_VMIN, SS_VMAX: SS_VMAX, SS_R: SS_R,
    SS_HP: SS_HP, SS_DMG: SS_DMG, SS_SELF_DMG: SS_SELF_DMG,
    SS_SLING: SS_SLING, SS_MAN: SS_MAN, SS_MAN_R: SS_MAN_R,
    SS_BLOCK_X: SS_BLOCK_X, SS_BLOCK_W: SS_BLOCK_W,
    SS_BLOCK_Y: SS_BLOCK_Y, SS_BLOCK_H: SS_BLOCK_H, SS_BLOCK_HP: SS_BLOCK_HP,
    ssR1: ssR1, ssCircleHitsRect: ssCircleHitsRect,
    ssSimulate: ssSimulate, makeBlocks: makeBlocks
  };
}));
