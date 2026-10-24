import { MARBLE_RADIUS, SCORE_PER_HP } from '../config.ts';
import type { GameState } from '../types.ts';
import type { MarbleCollider } from './marbles.ts';
import type { Dropper } from './powerups.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 磚塊碰撞：每一小段最多撞一塊磚，沿著穿透比較淺的那個軸反彈，並在磚塊碎裂時得分與機率掉落道具。 */
export function createBrickCollider(state: GameState, dropper: Dropper): MarbleCollider {
  return (m) => {
    for (const brick of state.bricks) {
      const cx = clamp(m.pos.x, brick.x, brick.x + brick.w);
      const cy = clamp(m.pos.y, brick.y, brick.y + brick.h);
      const dx = m.pos.x - cx;
      const dy = m.pos.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist >= MARBLE_RADIUS) continue;

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
        m.pos.x = cx + nx * MARBLE_RADIUS;
        m.pos.y = cy + ny * MARBLE_RADIUS;
      }

      brick.hp -= 1;
      if (brick.hp <= 0) {
        state.score += brick.maxHp * SCORE_PER_HP;
        state.bricks = state.bricks.filter((b) => b !== brick);
        dropper.maybeDrop({ x: brick.x + brick.w / 2, y: brick.y + brick.h / 2 });
      }
      return;
    }
  };
}
