import {
  AIM_MIN_ANGLE_DEG,
  ARENA_SIZE,
  BOSS_BULLET_RADIUS,
  BULLET_RADIUS,
  CORE_SIZE,
  MARBLE_SIZE_DURATION,
  PADDLE_THICKNESS,
  PIERCE_DURATION,
  POWERUP_RADIUS,
  REVIVE_HITS,
  SHORTEN_DURATION,
  SIDE_ORDER,
  WIDEN_DURATION,
} from '../core/config.ts';
import { marbleRadius } from '../core/effects.ts';
import { aimDirection, isWall, pointAt } from '../core/geometry.ts';
import { paddleWidth } from '../core/paddle.ts';
import type { GameState, PlayerState, PowerUpKind, Side, Vec2 } from '../core/types.ts';

export const SIDE_COLORS: Record<Side, string> = {
  bottom: '#4fd1ff',
  top: '#ff6bd6',
  left: '#9dff6b',
  right: '#ffd24f',
};

const MONSTER_COLOR = '#c26bff';
const BOSS_COLOR = '#ff8a3d';
const POWERUP_STYLE: Record<PowerUpKind, { color: string; label: string; nerf?: true }> = {
  supply: { color: '#7dffb0', label: '+5' },
  widen: { color: '#4fd1ff', label: '↔' },
  multiball: { color: '#ffe14f', label: '×3' },
  pierce: { color: '#ff9d4f', label: '貫' },
  // 環爆很稀有，所以顏色獨特、標籤和光暈都比其他道具稍大。
  burst: { color: '#ff4fe0', label: '環爆' },
  heal: { color: '#ff7a93', label: '♥' },
  enlarge: { color: '#6bffea', label: '大' },
  // nerf 共用警示色與虛線外框，和增益一眼分得出來。
  shorten: { color: '#ff6b6b', label: '短', nerf: true },
  shrink: { color: '#ff6b6b', label: '小', nerf: true },
};
const RARE_POWERUP_SCALE = 1.25;
const BULLET_COLOR = '#ff4f4f';
const BOSS_BULLET_COLOR = '#ffb347';
const PIERCE_MARBLE_COLOR = '#ff9d4f';
const CORPSE_COLOR = '#8a93a6';

const BRICK_COLORS = ['#ff5c7a', '#ffa14f', '#ffe14f', '#7dffb0'];

function glow(ctx: CanvasRenderingContext2D, color: string, blur = 14) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
}

function paddleRect(p: PlayerState) {
  const half = paddleWidth(p) / 2;
  const a = pointAt(p.side, p.paddle - half, 0);
  const b = pointAt(p.side, p.paddle + half, PADDLE_THICKNESS);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** 沿著自己那一邊畫一段矩形：a0 到 a1 是沿邊座標的範圍，d0 到 d1 是離邊的深度範圍。 */
function fillBand(ctx: CanvasRenderingContext2D, side: Side, a0: number, a1: number, d0: number, d1: number) {
  const p = pointAt(side, a0, d0);
  const q = pointAt(side, a1, d1);
  ctx.fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(p.x - q.x), Math.abs(p.y - q.y));
}

const EFFECT_DURATION = { widen: WIDEN_DURATION, shorten: SHORTEN_DURATION } as const;

/** 活著的擋板：本體、擋板寬度效果的剩餘時間條、中央的核心與核心內側的生命圓點。 */
function drawPaddle(ctx: CanvasRenderingContext2D, p: PlayerState) {
  const color = SIDE_COLORS[p.side];
  ctx.save();
  glow(ctx, color, 16);
  const r = paddleRect(p);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (p.paddleEffect) {
    // 擋板內側的細條會隨效果剩餘時間縮短；縮短用 nerf 的警示色。
    const { kind, left } = p.paddleEffect;
    const width = paddleWidth(p);
    glow(ctx, POWERUP_STYLE[kind].color, 8);
    const start = p.paddle - width / 2;
    fillBand(ctx, p.side, start, start + width * (left / EFFECT_DURATION[kind]), PADDLE_THICKNESS + 14, PADDLE_THICKNESS + 17);
  }
  ctx.restore();

  // 核心：大小固定，無敵時閃爍。
  const half = CORE_SIZE / 2;
  const mid = PADDLE_THICKNESS / 2;
  ctx.save();
  if (p.invincible > 0 && Math.floor(p.invincible * 10) % 2 === 0) ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#05060f';
  fillBand(ctx, p.side, p.paddle - half, p.paddle + half, mid - half, mid + half);
  glow(ctx, color, 10);
  fillBand(ctx, p.side, p.paddle - half + 2, p.paddle + half - 2, mid - half + 2, mid + half - 2);
  ctx.restore();

  // 生命圓點排在核心內側。
  ctx.save();
  glow(ctx, color, 6);
  for (let i = 0; i < p.lives; i++) {
    const c = pointAt(p.side, p.paddle + (i - (p.lives - 1) / 2) * 8, mid + half + 6);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 屍體：停在原位的灰色半透明擋板，旁邊標示復活進度。 */
function drawCorpse(ctx: CanvasRenderingContext2D, p: PlayerState) {
  ctx.save();
  ctx.globalAlpha = 0.45;
  glow(ctx, CORPSE_COLOR, 6);
  const r = paddleRect(p);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();

  const label = pointAt(p.side, p.paddle, PADDLE_THICKNESS + 16);
  ctx.save();
  ctx.fillStyle = '#cfd6e6';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${p.revive}/${REVIVE_HITS}`, label.x, label.y);
  ctx.restore();
}

/** 畫面上方的整場效果：標籤加倒數條，貫通與彈珠大小各一格。 */
function drawEffectTags(ctx: CanvasRenderingContext2D, state: GameState) {
  const tags: { label: string; color: string; ratio: number }[] = [];
  if (state.effects.pierce > 0) {
    tags.push({ label: '貫通', color: POWERUP_STYLE.pierce.color, ratio: state.effects.pierce / PIERCE_DURATION });
  }
  const size = state.effects.marbleSize;
  if (size) {
    const enlarge = size.kind === 'enlarge';
    tags.push({
      label: enlarge ? '放大彈珠' : '縮小彈珠',
      color: POWERUP_STYLE[size.kind].color,
      ratio: size.left / MARBLE_SIZE_DURATION,
    });
  }
  const w = 120;
  const h = 22;
  const gap = 10;
  const total = tags.length * w + (tags.length - 1) * gap;
  const y = PADDLE_THICKNESS + 40;
  tags.forEach((tag, i) => {
    const x = (ARENA_SIZE - total) / 2 + i * (w + gap);
    ctx.save();
    ctx.fillStyle = '#10142a';
    ctx.fillRect(x, y, w, h);
    glow(ctx, tag.color, 6);
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, tag.ratio)), h);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag.label, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  });
}

/**
 * pointer 是本機玩家的指標，localSide 是本機玩家的方位。瞄準線只畫本機玩家的，
 * 因為其他人的瞄準方向只有他們自己的指標知道。
 */
export function draw(ctx: CanvasRenderingContext2D, state: GameState, pointer: Vec2, localSide: Side | null) {
  ctx.clearRect(0, 0, ARENA_SIZE, ARENA_SIZE);
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);

  ctx.save();
  glow(ctx, '#6a7bff', 10);
  ctx.lineWidth = 4;
  for (const side of SIDE_ORDER) {
    if (!isWall(state.players, side)) continue;
    const a = pointAt(side, 0, 2);
    const b = pointAt(side, ARENA_SIZE, 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

  // 資訊列先畫，擋板、彈珠與瞄準線都疊在它上面，所以任何方位的擋板都不會被它遮住；
  // 文字也排在擋板厚度之外，不與上方玩家的擋板重疊。
  const hudY = PADDLE_THICKNESS + 8;
  ctx.save();
  ctx.fillStyle = '#cfe8ff';
  ctx.font = '20px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`第 ${state.level} 關`, 24, hudY);
  ctx.textAlign = 'center';
  ctx.fillText(`分數 ${state.score}`, ARENA_SIZE / 2, hudY);
  ctx.textAlign = 'right';
  ctx.fillText(`彈珠 ${state.pool}`, ARENA_SIZE - 24, hudY);
  ctx.restore();
  drawEffectTags(ctx, state);

  for (const brick of state.bricks) {
    ctx.save();
    const color = BRICK_COLORS[Math.min(brick.hp, BRICK_COLORS.length) - 1] ?? BRICK_COLORS[0]!;
    glow(ctx, color, 8);
    ctx.fillRect(brick.x + 1, brick.y + 1, brick.w - 2, brick.h - 2);
    ctx.restore();
  }

  for (const monster of state.monsters) {
    const { x, y } = monster.pos;
    const color = monster.boss ? BOSS_COLOR : MONSTER_COLOR;
    ctx.save();
    glow(ctx, color, monster.boss ? 28 : 18);
    ctx.lineWidth = monster.boss ? 5 : 3;
    ctx.beginPath();
    ctx.arc(x, y, monster.radius, 0, Math.PI * 2);
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    if (monster.boss) {
      // BOSS 多一圈外框，一眼就和一般怪物分得出來。
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, monster.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${monster.boss ? 28 : 20}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(monster.hp), x, y);
    ctx.restore();

    // 血量條
    const barW = monster.radius * 2;
    const barY = y - monster.radius - (monster.boss ? 22 : 12);
    ctx.save();
    ctx.fillStyle = '#2a1636';
    ctx.fillRect(x - monster.radius, barY, barW, monster.boss ? 8 : 5);
    glow(ctx, color, 6);
    ctx.fillRect(x - monster.radius, barY, barW * (monster.hp / monster.maxHp), monster.boss ? 8 : 5);
    if (monster.boss) {
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('BOSS', x, barY - 3);
    }
    ctx.restore();
  }

  for (const p of state.players) {
    if (p.dead) drawCorpse(ctx, p);
    else drawPaddle(ctx, p);

    if (p.aiming && p.side === localSide) {
      const from = pointAt(p.side, p.paddle, PADDLE_THICKNESS + marbleRadius(state) + 1);
      const dir = aimDirection(p.side, from, pointer, AIM_MIN_ANGLE_DEG);
      ctx.save();
      glow(ctx, SIDE_COLORS[p.side], 6);
      ctx.setLineDash([8, 10]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(from.x + dir.x * 260, from.y + dir.y * 260);
      ctx.stroke();
      ctx.restore();
    }
  }

  for (const pu of state.powerUps) {
    const { color, label, nerf } = POWERUP_STYLE[pu.kind];
    const scale = pu.kind === 'burst' ? RARE_POWERUP_SCALE : 1;
    ctx.save();
    glow(ctx, color, pu.kind === 'burst' ? 22 : 14);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pu.pos.x, pu.pos.y, POWERUP_RADIUS * scale, 0, Math.PI * 2);
    ctx.globalAlpha = nerf ? 0.12 : 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (nerf) ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.font = `bold ${pu.kind === 'burst' ? 13 : 12}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pu.pos.x, pu.pos.y + 1);
    ctx.restore();
  }

  // BOSS 的子彈比一般怪物的小、顏色不同；同一種顏色一起畫，省去反覆切換光暈。
  for (const source of ['monster', 'boss'] as const) {
    ctx.save();
    glow(ctx, source === 'boss' ? BOSS_BULLET_COLOR : BULLET_COLOR, source === 'boss' ? 8 : 12);
    const radius = source === 'boss' ? BOSS_BULLET_RADIUS : BULLET_RADIUS;
    for (const b of state.bullets) {
      if (b.source !== source) continue;
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 彈珠是白色；整場貫通期間全部彈珠改色並帶更大的光暈，一眼分得出來。半徑由整場的大小效果決定。
  const pierced = state.effects.pierce > 0;
  const radius = marbleRadius(state);
  ctx.save();
  glow(ctx, pierced ? PIERCE_MARBLE_COLOR : '#ffffff', pierced ? 26 : 16);
  for (const m of state.marbles) {
    ctx.beginPath();
    ctx.arc(m.pos.x, m.pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  drawCrosshair(ctx, pointer);
}

/**
 * 準星：只畫本機玩家自己的。中空的圓環加上四個短刻度，中心留白，
 * 所以不會遮住它所指的位置，也不會蓋住從擋板延伸過來的瞄準虛線。
 */
function drawCrosshair(ctx: CanvasRenderingContext2D, pointer: Vec2) {
  const { x, y } = pointer;
  ctx.save();
  ctx.strokeStyle = '#f4fbff';
  ctx.shadowColor = '#05060f';
  ctx.shadowBlur = 3;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    ctx.moveTo(x + dx * 11, y + dy * 11);
    ctx.lineTo(x + dx * 16, y + dy * 16);
  }
  ctx.stroke();
  ctx.restore();
}
