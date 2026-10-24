import {
  BOSS_BULLET_RADIUS,
  BULLET_CAP,
  BULLET_RADIUS,
  BULLET_SPEED,
  CORE_SIZE,
  HIT_INVINCIBLE_DURATION,
  SIDE_ORDER,
} from '../config.ts';
import { along, depth, isWall } from '../geometry.ts';
import { monsterFireInterval } from '../level.ts';
import { alivePlayers, coreCenter, killPlayer } from '../paddle.ts';
import type { Bullet, BulletSource, GameState, Monster, PlayerState, Vec2 } from '../types.ts';
import { createBarrageStage } from './barrage.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const bulletRadius = (source: BulletSource) => (source === 'boss' ? BOSS_BULLET_RADIUS : BULLET_RADIUS);

const CORE_HALF = CORE_SIZE / 2;

/**
 * 子彈階段：無敵倒數、每隻一般怪物各自倒數並朝隨機一位活著的玩家核心發射、BOSS 施放彈幕、子彈直線飛行。
 * 子彈不會被磚塊擋住，也穿過擋板本身；只有打到核心的實際位置才使該玩家扣一點生命並消失，
 * 受傷後的無敵期間子彈穿過核心。碰到牆、越過有玩家的那一邊就消失。
 */
export function createBulletStage(state: GameState, rng: () => number) {
  let nextBulletId = 0;

  /** 場上子彈已達上限時不再發射。 */
  function spawn(source: BulletSource, pos: Vec2, vel: Vec2) {
    if (state.bullets.length >= BULLET_CAP) return;
    state.bullets.push({ id: nextBulletId++, pos, vel, source });
  }

  const advanceBarrage = createBarrageStage(state, rng, (pos, vel) => spawn('boss', pos, vel));

  function fire(monster: Monster) {
    const candidates = alivePlayers(state);
    const target = candidates[Math.floor(rng() * candidates.length)];
    if (!target) return;
    const goal = coreCenter(target);
    const dx = goal.x - monster.pos.x;
    const dy = goal.y - monster.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    spawn('monster', { x: monster.pos.x, y: monster.pos.y }, { x: (dx / dist) * BULLET_SPEED, y: (dy / dist) * BULLET_SPEED });
  }

  function touchesCore(b: Bullet, player: PlayerState) {
    const radius = bulletRadius(b.source);
    const a = along(player.side, b.pos);
    const d = depth(player.side, b.pos);
    const nearA = clamp(a, player.paddle - CORE_HALF, player.paddle + CORE_HALF);
    const centerD = depth(player.side, coreCenter(player));
    const nearD = clamp(d, centerD - CORE_HALF, centerD + CORE_HALF);
    return Math.hypot(a - nearA, d - nearD) < radius;
  }

  /** 打到某位玩家的核心：無敵期間穿過；否則扣一點生命、啟動無敵，子彈消失。回傳這發子彈是否消失。 */
  function hitPlayer(player: PlayerState) {
    if (player.invincible > 0) return false;
    player.lives -= 1;
    player.invincible = HIT_INVINCIBLE_DURATION;
    if (player.lives <= 0) killPlayer(player);
    return true;
  }

  /** 打到核心就扣血，並回傳這發子彈是否消失。死亡的玩家沒有核心。 */
  function hitsCore(b: Bullet) {
    for (const player of state.players) {
      if (player.dead || !touchesCore(b, player)) continue;
      if (hitPlayer(player)) return true;
    }
    return false;
  }

  /** 碰到牆（含死亡玩家的方位），或整顆越過有活著的玩家的那一邊（沒接到）。 */
  function isOutside(b: Bullet) {
    const radius = bulletRadius(b.source);
    return SIDE_ORDER.some((side) => depth(side, b.pos) < (isWall(state.players, side) ? radius : -radius));
  }

  /** 移動一顆子彈，回傳它是否在這一步消失。 */
  function moveBullet(b: Bullet, dt: number) {
    const radius = bulletRadius(b.source);
    // 切成小段移動，避免大的時間步長穿過核心。
    const slices = Math.max(1, Math.ceil((Math.hypot(b.vel.x, b.vel.y) * dt) / radius));
    const h = dt / slices;
    for (let i = 0; i < slices; i++) {
      b.pos.x += b.vel.x * h;
      b.pos.y += b.vel.y * h;
      if (hitsCore(b) || isOutside(b)) return true;
    }
    return false;
  }

  function tickInvincibility(dt: number) {
    for (const player of state.players) player.invincible = Math.max(0, player.invincible - dt);
  }

  return function advanceBullets(dt: number) {
    tickInvincibility(dt);

    for (const monster of state.monsters) {
      if (monster.boss) {
        advanceBarrage(monster, dt);
        continue;
      }
      // 倒數隨狀態同步；達到子彈上限時 spawn 會略過這一發，倒數照常重來。
      monster.fire -= dt;
      while (monster.fire <= 0) {
        fire(monster);
        monster.fire += monsterFireInterval(state.level);
      }
    }

    state.bullets = state.bullets.filter((b) => !moveBullet(b, dt));
  };
}
