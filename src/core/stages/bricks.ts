import { SCORE_PER_HP } from '../config.ts';
import { isPiercing, marbleRadius } from '../effects.ts';
import type { Brick, GameState, Marble } from '../types.ts';
import type { MarbleCollider } from './marbles.ts';
import type { Dropper } from './powerups.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const distanceTo = (m: Marble, brick: Brick) => {
  const cx = clamp(m.pos.x, brick.x, brick.x + brick.w);
  const cy = clamp(m.pos.y, brick.y, brick.y + brick.h);
  return Math.hypot(m.pos.x - cx, m.pos.y - cy);
};

/**
 * 磚塊碰撞：一般彈珠每一小段最多撞一塊磚，沿著穿透比較淺的那個軸反彈；
 * 整場貫通期間，彈珠穿過磚塊不反彈，每進入一塊磚扣一點血。磚塊碎裂時得分與機率掉落道具。
 */
export function createBrickCollider(state: GameState, dropper: Dropper): MarbleCollider {
  // 貫通的彈珠目前正與哪些磚塊重疊，只是碰撞的過程，不屬於遊戲狀態，所以不放進快照。
  const overlapping = new WeakMap<Marble, Set<Brick>>();

  function damage(brick: Brick) {
    brick.hp -= 1;
    if (brick.hp <= 0) {
      state.score += brick.maxHp * SCORE_PER_HP;
      state.bricks = state.bricks.filter((b) => b !== brick);
      dropper.maybeDrop({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2 });
    }
  }

  function pierceThrough(m: Marble, radius: number) {
    const before = overlapping.get(m);
    const now = new Set<Brick>();
    // 磚塊碎裂會改動 state.bricks，所以先複製一份再走訪。
    for (const brick of state.bricks.slice()) {
      if (distanceTo(m, brick) >= radius) continue;
      now.add(brick);
      if (!before?.has(brick)) damage(brick);
    }
    overlapping.set(m, now);
  }

  function bounce(m: Marble, radius: number) {
    for (const brick of state.bricks) {
      const cx = clamp(m.pos.x, brick.x, brick.x + brick.w);
      const cy = clamp(m.pos.y, brick.y, brick.y + brick.h);
      const dx = m.pos.x - cx;
      const dy = m.pos.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist >= radius) continue;

      if (dist === 0) {
        // 中心已陷進磚塊內，沒有可用的法線，只能掉頭。
        m.vel.y = -m.vel.y;
      } else {
        // 沿著彈珠與磚塊最近點的法線反彈，所以擦過角落也會被彈開。
        const nx = dx / dist;
        const ny = dy / dist;
        const into = m.vel.x * nx + m.vel.y * ny;
        if (into >= 0) continue;
        m.vel.x -= 2 * into * nx;
        m.vel.y -= 2 * into * ny;
        m.pos.x = cx + nx * radius;
        m.pos.y = cy + ny * radius;
      }

      damage(brick);
      return;
    }
  }

  return (m) => {
    const radius = marbleRadius(state);
    if (isPiercing(state)) {
      pierceThrough(m, radius);
    } else {
      overlapping.delete(m);
      bounce(m, radius);
    }
  };
}
