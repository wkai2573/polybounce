import { BRICK_REGION, MONSTER_SCORE_PER_HP, MONSTER_SPEED } from '../config.ts';
import { MONSTER_DROP_THRESHOLDS } from '../drop-config.ts';
import { isPiercing, marbleRadius } from '../effects.ts';
import type { GameState, Marble, Monster, Vec2 } from '../types.ts';
import type { MarbleCollider } from './marbles.ts';
import type { Dropper } from './powerups.ts';

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

/**
 * 怪物碰撞：一般彈珠沿圓心連線的法線反彈，怪物扣血；整場貫通期間彈珠穿過去，每次進入扣血，每次扣的血量都等於彈珠的攻擊力，
 * 離開後再進入才會再扣。血量歸零時移除並得分。血量每降到一個門檻以下就掉落一次道具，每個門檻只掉一次。
 */
export function createMonsterCollider(state: GameState, dropper: Dropper): MarbleCollider {
  // 已經掉落過的門檻只是怪物的過程，不屬於遊戲狀態，所以不放進快照。
  const dropped = new WeakMap<Monster, Set<number>>();

  function dropForThresholds(monster: Monster) {
    const done = dropped.get(monster) ?? new Set<number>();
    dropped.set(monster, done);
    const crossed = MONSTER_DROP_THRESHOLDS.filter((t) => !done.has(t) && monster.hp <= monster.maxHp * t);
    if (crossed.length === 0) return;
    for (const t of crossed) done.add(t);
    dropper.dropForMonster(monster.pos);
  }

  // 貫通的彈珠目前正與哪些怪物重疊，同樣只是過程，不放進快照。
  const overlapping = new WeakMap<Marble, Set<Monster>>();

  function damage(monster: Monster, power: number) {
    monster.hp -= power;
    dropForThresholds(monster);
    if (monster.hp <= 0) {
      state.score += monster.maxHp * MONSTER_SCORE_PER_HP;
      state.monsters = state.monsters.filter((x) => x !== monster);
    }
  }

  const reachOf = (monster: Monster, radius: number) => radius + monster.radius;

  function pierceThrough(m: Marble, radius: number) {
    const before = overlapping.get(m);
    const now = new Set<Monster>();
    for (const monster of state.monsters.slice()) {
      if (Math.hypot(m.pos.x - monster.pos.x, m.pos.y - monster.pos.y) >= reachOf(monster, radius)) continue;
      now.add(monster);
      if (!before?.has(monster)) damage(monster, m.power);
    }
    overlapping.set(m, now);
  }

  function bounce(m: Marble, radius: number) {
    for (const monster of state.monsters) {
      const dx = m.pos.x - monster.pos.x;
      const dy = m.pos.y - monster.pos.y;
      const dist = Math.hypot(dx, dy);
      const reach = reachOf(monster, radius);
      if (dist >= reach || dist === 0) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const into = m.vel.x * nx + m.vel.y * ny;
      if (into >= 0) continue;
      m.vel.x -= 2 * into * nx;
      m.vel.y -= 2 * into * ny;
      m.pos.x = monster.pos.x + nx * reach;
      m.pos.y = monster.pos.y + ny * reach;

      damage(monster, m.power);
      return;
    }
  }

  return (m) => {
    const radius = marbleRadius(m);
    if (isPiercing(state)) {
      pierceThrough(m, radius);
    } else {
      overlapping.delete(m);
      bounce(m, radius);
    }
  };
}
