import { BRICK_REGION, MARBLE_RADIUS, MONSTER_SCORE_PER_HP, MONSTER_SPEED } from '../config.ts';
import type { GameState, Monster, Vec2 } from '../types.ts';
import type { MarbleCollider } from './marbles.ts';

/** 怪物階段：每隻怪物朝一個隨機目標緩慢前進，到了就換下一個目標，所以永遠待在中央區域內。 */
export function createMonsterStage(state: GameState, rng: () => number) {
  // 目標只是遊走的過程，不屬於遊戲狀態，所以不放進快照。
  const targets = new WeakMap<Monster, Vec2>();

  function pickTarget(monster: Monster): Vec2 {
    const lo = BRICK_REGION.min + monster.radius;
    const hi = BRICK_REGION.max - monster.radius;
    return { x: lo + rng() * (hi - lo), y: lo + rng() * (hi - lo) };
  }

  return function advanceMonsters(dt: number) {
    for (const monster of state.monsters) {
      const target = targets.get(monster) ?? pickTarget(monster);
      const dx = target.x - monster.pos.x;
      const dy = target.y - monster.pos.y;
      const dist = Math.hypot(dx, dy);
      const reach = MONSTER_SPEED * dt;
      if (dist <= reach) {
        monster.pos.x = target.x;
        monster.pos.y = target.y;
        targets.set(monster, pickTarget(monster));
      } else {
        monster.pos.x += (dx / dist) * reach;
        monster.pos.y += (dy / dist) * reach;
        targets.set(monster, target);
      }
    }
  };
}

/** 怪物碰撞：彈珠沿圓心連線的法線反彈，怪物扣一點血，血量歸零時移除並得分。 */
export function createMonsterCollider(state: GameState): MarbleCollider {
  return (m) => {
    for (const monster of state.monsters) {
      const dx = m.pos.x - monster.pos.x;
      const dy = m.pos.y - monster.pos.y;
      const dist = Math.hypot(dx, dy);
      const reach = MARBLE_RADIUS + monster.radius;
      if (dist >= reach || dist === 0) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const into = m.vel.x * nx + m.vel.y * ny;
      if (into >= 0) continue;
      m.vel.x -= 2 * into * nx;
      m.vel.y -= 2 * into * ny;
      m.pos.x = monster.pos.x + nx * reach;
      m.pos.y = monster.pos.y + ny * reach;

      monster.hp -= 1;
      if (monster.hp <= 0) {
        state.score += monster.maxHp * MONSTER_SCORE_PER_HP;
        state.monsters = state.monsters.filter((x) => x !== monster);
      }
      return;
    }
  };
}
