import {
  BULLET_RADIUS,
  BULLET_SPEED,
  FREEZE_DURATION,
  MONSTER_FIRE_INTERVAL,
  PADDLE_THICKNESS,
  PADDLE_WIDTH,
  SIDE_ORDER,
} from '../config.ts';
import { along, depth, pointAt } from '../geometry.ts';
import type { Bullet, GameState, Monster, Side } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 子彈階段：凍結倒數、怪物定時朝隨機一位玩家發射、子彈直線飛行。
 * 子彈打到磚塊、擋板或離開場地就消失，打到擋板時凍結該玩家。
 */
export function createBulletStage(state: GameState, rng: () => number) {
  // 發射倒數只是怪物的過程，不屬於遊戲狀態，所以不放進快照。
  const timers = new WeakMap<Monster, number>();
  const occupied = new Set<Side>(state.players.map((p) => p.side));
  let nextBulletId = 0;

  function fire(monster: Monster) {
    const target = state.players[Math.floor(rng() * state.players.length)];
    if (!target) return;
    const goal = pointAt(target.side, target.paddle, PADDLE_THICKNESS / 2);
    const dx = goal.x - monster.pos.x;
    const dy = goal.y - monster.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    state.bullets.push({
      id: nextBulletId++,
      pos: { x: monster.pos.x, y: monster.pos.y },
      vel: { x: (dx / dist) * BULLET_SPEED, y: (dy / dist) * BULLET_SPEED },
    });
  }

  function hitsBrick(b: Bullet) {
    return state.bricks.some((brick) => {
      const cx = clamp(b.pos.x, brick.x, brick.x + brick.w);
      const cy = clamp(b.pos.y, brick.y, brick.y + brick.h);
      return Math.hypot(b.pos.x - cx, b.pos.y - cy) < BULLET_RADIUS;
    });
  }

  /** 打到擋板就凍結該玩家並回傳 true。 */
  function hitsPaddle(b: Bullet) {
    for (const player of state.players) {
      const a = along(player.side, b.pos);
      const d = depth(player.side, b.pos);
      const nearA = clamp(a, player.paddle - PADDLE_WIDTH / 2, player.paddle + PADDLE_WIDTH / 2);
      const nearD = clamp(d, 0, PADDLE_THICKNESS);
      if (Math.hypot(a - nearA, d - nearD) >= BULLET_RADIUS) continue;
      player.frozen = FREEZE_DURATION;
      return true;
    }
    return false;
  }

  /** 碰到牆，或整顆越過有玩家的那一邊（沒接到）。 */
  function isOutside(b: Bullet) {
    return SIDE_ORDER.some((side) => depth(side, b.pos) < (occupied.has(side) ? -BULLET_RADIUS : BULLET_RADIUS));
  }

  /** 移動一顆子彈，回傳它是否在這一步消失。 */
  function moveBullet(b: Bullet, dt: number) {
    // 切成小段移動，避免大的時間步長穿過擋板。
    const slices = Math.max(1, Math.ceil((BULLET_SPEED * dt) / BULLET_RADIUS));
    const h = dt / slices;
    for (let i = 0; i < slices; i++) {
      b.pos.x += b.vel.x * h;
      b.pos.y += b.vel.y * h;
      if (hitsBrick(b) || hitsPaddle(b) || isOutside(b)) return true;
    }
    return false;
  }

  return function advanceBullets(dt: number) {
    for (const player of state.players) player.frozen = Math.max(0, player.frozen - dt);

    for (const monster of state.monsters) {
      const elapsed = (timers.get(monster) ?? 0) + dt;
      if (elapsed >= MONSTER_FIRE_INTERVAL) {
        fire(monster);
        timers.set(monster, elapsed - MONSTER_FIRE_INTERVAL);
      } else {
        timers.set(monster, elapsed);
      }
    }

    state.bullets = state.bullets.filter((b) => !moveBullet(b, dt));
  };
}
