import {
  AIM_MIN_ANGLE_DEG,
  ARENA_SIZE,
  BULLET_RADIUS,
  FREEZE_DURATION,
  MARBLE_RADIUS,
  PADDLE_THICKNESS,
  POWERUP_RADIUS,
  SIDE_ORDER,
  WIDEN_DURATION,
} from '../core/config.ts';
import { aimDirection, pointAt } from '../core/geometry.ts';
import { paddleWidth } from '../core/paddle.ts';
import type { GameState, PlayerState, PowerUpKind, Side, Vec2 } from '../core/types.ts';

const SIDE_COLORS: Record<Side, string> = {
  bottom: '#4fd1ff',
  top: '#ff6bd6',
  left: '#9dff6b',
  right: '#ffd24f',
};

const MONSTER_COLOR = '#c26bff';
const BOSS_COLOR = '#ff8a3d';
const POWERUP_STYLE: Record<PowerUpKind, { color: string; label: string }> = {
  supply: { color: '#7dffb0', label: '+5' },
  widen: { color: '#4fd1ff', label: '↔' },
  multiball: { color: '#ffe14f', label: '×3' },
};
const BULLET_COLOR = '#ff4f4f';
const FROZEN_COLOR = '#bfe9ff';

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

export function draw(ctx: CanvasRenderingContext2D, state: GameState, pointer: Vec2) {
  ctx.clearRect(0, 0, ARENA_SIZE, ARENA_SIZE);
  ctx.fillStyle = '#05060f';
  ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);

  const occupied = new Set(state.players.map((p) => p.side));
  ctx.save();
  glow(ctx, '#6a7bff', 10);
  ctx.lineWidth = 4;
  for (const side of SIDE_ORDER) {
    if (occupied.has(side)) continue;
    const a = pointAt(side, 0, 2);
    const b = pointAt(side, ARENA_SIZE, 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();

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
    ctx.save();
    const frozen = p.frozen > 0;
    glow(ctx, frozen ? FROZEN_COLOR : SIDE_COLORS[p.side], 16);
    const r = paddleRect(p);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (frozen) {
      // 擋板內側的細條會隨凍結剩餘時間縮短，讓玩家看得出還要凍多久。
      const width = paddleWidth(p);
      const a = pointAt(p.side, p.paddle - width / 2, PADDLE_THICKNESS + 8);
      const b = pointAt(p.side, p.paddle - width / 2 + width * (p.frozen / FREEZE_DURATION), PADDLE_THICKNESS + 11);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
    if (p.widen > 0) {
      // 擋板內側的細條會隨加寬剩餘時間縮短，排在凍結細條的更內側。
      const width = paddleWidth(p);
      const a = pointAt(p.side, p.paddle - width / 2, PADDLE_THICKNESS + 14);
      const b = pointAt(p.side, p.paddle - width / 2 + width * (p.widen / WIDEN_DURATION), PADDLE_THICKNESS + 17);
      glow(ctx, POWERUP_STYLE.widen.color, 8);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
    ctx.restore();

    if (p.aiming) {
      const from = pointAt(p.side, p.paddle, PADDLE_THICKNESS + MARBLE_RADIUS + 1);
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
    const { color, label } = POWERUP_STYLE[pu.kind];
    ctx.save();
    glow(ctx, color, 14);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pu.pos.x, pu.pos.y, POWERUP_RADIUS, 0, Math.PI * 2);
    ctx.globalAlpha = 0.3;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pu.pos.x, pu.pos.y + 1);
    ctx.restore();
  }

  ctx.save();
  glow(ctx, BULLET_COLOR, 12);
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  glow(ctx, '#ffffff', 16);
  for (const m of state.marbles) {
    ctx.beginPath();
    ctx.arc(m.pos.x, m.pos.y, MARBLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = '#cfe8ff';
  ctx.font = '20px system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`第 ${state.level} 關`, 24, 20);
  ctx.textAlign = 'center';
  ctx.fillText(`分數 ${state.score}`, ARENA_SIZE / 2, 20);
  ctx.textAlign = 'right';
  ctx.fillText(`彈珠 ${state.pool}`, ARENA_SIZE - 24, 20);
  ctx.restore();
}
