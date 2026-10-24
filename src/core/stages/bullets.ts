import {
  BOSS_BULLET_RADIUS,
  BOSS_FREEZE_DURATION,
  BOSS_INVINCIBLE_DURATION,
  BULLET_CAP,
  BULLET_RADIUS,
  BULLET_SPEED,
  FREEZE_DURATION,
  MONSTER_FIRE_INTERVAL,
  PADDLE_THICKNESS,
  SIDE_ORDER,
} from '../config.ts';
import { along, depth, isOccupied, pointAt } from '../geometry.ts';
import { paddleWidth } from '../paddle.ts';
import type { Bullet, BulletSource, GameState, Monster, PlayerState, Vec2 } from '../types.ts';
import { createBarrageStage } from './barrage.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const bulletRadius = (source: BulletSource) => (source === 'boss' ? BOSS_BULLET_RADIUS : BULLET_RADIUS);

/**
 * 子彈階段：凍結與無敵倒數、一般怪物定時朝隨機一位玩家發射、BOSS 施放彈幕、子彈直線飛行。
 * 子彈不會被磚塊擋住；碰到牆、越過有玩家的那一邊就消失，打到擋板時依來源決定凍結規則。
 */
export function createBulletStage(state: GameState, rng: () => number) {
  // 發射倒數只是怪物的過程，不屬於遊戲狀態，所以不放進快照。
  const timers = new WeakMap<Monster, number>();
  let nextBulletId = 0;

  /** 場上子彈已達上限時不再發射。 */
  function spawn(source: BulletSource, pos: Vec2, vel: Vec2) {
    if (state.bullets.length >= BULLET_CAP) return;
    state.bullets.push({ id: nextBulletId++, pos, vel, source });
  }

  const advanceBarrage = createBarrageStage(state, rng, (pos, vel) => spawn('boss', pos, vel));

  function fire(monster: Monster) {
    const target = state.players[Math.floor(rng() * state.players.length)];
    if (!target) return;
    const goal = pointAt(target.side, target.paddle, PADDLE_THICKNESS / 2);
    const dx = goal.x - monster.pos.x;
    const dy = goal.y - monster.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    spawn('monster', { x: monster.pos.x, y: monster.pos.y }, { x: (dx / dist) * BULLET_SPEED, y: (dy / dist) * BULLET_SPEED });
  }

  /**
   * 子彈碰到某位玩家的擋板時的處理，回傳這發子彈是否消失。
   * 一般怪物的子彈：凍結 1 秒，凍結期間再被打到重新計時。
   * BOSS 的子彈：無敵期間穿過擋板；已凍結時不重新計時，子彈直接消失；其餘凍結 0.5 秒。
   */
  function hitPlayer(b: Bullet, player: PlayerState) {
    if (b.source === 'monster') {
      player.frozen = FREEZE_DURATION;
      return true;
    }
    if (player.invincible > 0) return false;
    if (player.frozen === 0) player.frozen = BOSS_FREEZE_DURATION;
    return true;
  }

  /** 打到擋板就依來源處理，並回傳這發子彈是否消失。 */
  function hitsPaddle(b: Bullet) {
    const radius = bulletRadius(b.source);
    for (const player of state.players) {
      const a = along(player.side, b.pos);
      const d = depth(player.side, b.pos);
      const half = paddleWidth(player) / 2;
      const nearA = clamp(a, player.paddle - half, player.paddle + half);
      const nearD = clamp(d, 0, PADDLE_THICKNESS);
      if (Math.hypot(a - nearA, d - nearD) >= radius) continue;
      if (hitPlayer(b, player)) return true;
    }
    return false;
  }

  /** 碰到牆，或整顆越過有玩家的那一邊（沒接到）。 */
  function isOutside(b: Bullet) {
    const radius = bulletRadius(b.source);
    return SIDE_ORDER.some((side) => depth(side, b.pos) < (isOccupied(state.players, side) ? -radius : radius));
  }

  /** 移動一顆子彈，回傳它是否在這一步消失。 */
  function moveBullet(b: Bullet, dt: number) {
    const radius = bulletRadius(b.source);
    // 切成小段移動，避免大的時間步長穿過擋板。
    const slices = Math.max(1, Math.ceil((Math.hypot(b.vel.x, b.vel.y) * dt) / radius));
    const h = dt / slices;
    for (let i = 0; i < slices; i++) {
      b.pos.x += b.vel.x * h;
      b.pos.y += b.vel.y * h;
      if (hitsPaddle(b) || isOutside(b)) return true;
    }
    return false;
  }

  /** 凍結結束的那一刻起算無敵；其餘時間無敵只倒數。 */
  function tickPlayers(dt: number) {
    for (const player of state.players) {
      const wasFrozen = player.frozen > 0;
      player.frozen = Math.max(0, player.frozen - dt);
      if (wasFrozen && player.frozen === 0) player.invincible = BOSS_INVINCIBLE_DURATION;
      else player.invincible = Math.max(0, player.invincible - dt);
    }
  }

  return function advanceBullets(dt: number) {
    tickPlayers(dt);

    for (const monster of state.monsters) {
      if (monster.boss) {
        advanceBarrage(monster, dt);
        continue;
      }
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
