import {
  AIM_MIN_ANGLE_DEG,
  ARENA_SIZE,
  MARBLE_RADIUS,
  PADDLE_THICKNESS,
  PADDLE_WIDTH,
  SIDE_ORDER,
} from '../core/config.ts';
import { aimDirection, pointAt } from '../core/geometry.ts';
import type { GameState, PlayerState, Side, Vec2 } from '../core/types.ts';

const SIDE_COLORS: Record<Side, string> = {
  bottom: '#4fd1ff',
  top: '#ff6bd6',
  left: '#9dff6b',
  right: '#ffd24f',
};

const MONSTER_COLOR = '#c26bff';

const BRICK_COLORS = ['#ff5c7a', '#ffa14f', '#ffe14f', '#7dffb0'];

function glow(ctx: CanvasRenderingContext2D, color: string, blur = 14) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
}

function paddleRect(p: PlayerState) {
  const half = PADDLE_WIDTH / 2;
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
    ctx.save();
    glow(ctx, MONSTER_COLOR, 18);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, monster.radius, 0, Math.PI * 2);
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(monster.hp), x, y);
    ctx.restore();

    // 血量條
    const barW = monster.radius * 2;
    const barY = y - monster.radius - 12;
    ctx.save();
    ctx.fillStyle = '#2a1636';
    ctx.fillRect(x - monster.radius, barY, barW, 5);
    glow(ctx, MONSTER_COLOR, 6);
    ctx.fillRect(x - monster.radius, barY, barW * (monster.hp / monster.maxHp), 5);
    ctx.restore();
  }

  for (const p of state.players) {
    ctx.save();
    glow(ctx, SIDE_COLORS[p.side], 16);
    const r = paddleRect(p);
    ctx.fillRect(r.x, r.y, r.w, r.h);
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
