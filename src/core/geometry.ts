import { ARENA_SIZE } from './config.ts';
import type { Side, Vec2 } from './types.ts';

/** normal 指向場地內側，tangent 是沿著該邊增加的方向。 */
export const FRAMES: Record<Side, { normal: Vec2; tangent: Vec2 }> = {
  bottom: { normal: { x: 0, y: -1 }, tangent: { x: 1, y: 0 } },
  top: { normal: { x: 0, y: 1 }, tangent: { x: 1, y: 0 } },
  left: { normal: { x: 1, y: 0 }, tangent: { x: 0, y: 1 } },
  right: { normal: { x: -1, y: 0 }, tangent: { x: 0, y: 1 } },
};

/** 這個方位現在是不是牆：沒有玩家佔據，或佔據的玩家已死亡（擋板停著變成屍體）。 */
export const isWall = (players: readonly { side: Side; dead: boolean }[], side: Side) =>
  !players.some((p) => p.side === side && !p.dead);

/** 點沿著某一邊的座標：上下兩邊看 x，左右兩邊看 y。 */
export function along(side: Side, p: Vec2): number {
  return side === 'bottom' || side === 'top' ? p.x : p.y;
}

/** 點離某一邊的距離，往場地內側為正。 */
export function depth(side: Side, p: Vec2): number {
  switch (side) {
    case 'bottom':
      return ARENA_SIZE - p.y;
    case 'top':
      return p.y;
    case 'left':
      return p.x;
    case 'right':
      return ARENA_SIZE - p.x;
  }
}

/** along 與 depth 的反運算。 */
export function pointAt(side: Side, a: number, d: number): Vec2 {
  switch (side) {
    case 'bottom':
      return { x: a, y: ARENA_SIZE - d };
    case 'top':
      return { x: a, y: d };
    case 'left':
      return { x: d, y: a };
    case 'right':
      return { x: ARENA_SIZE - d, y: a };
  }
}
