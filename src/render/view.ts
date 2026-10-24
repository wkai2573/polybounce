import { ARENA_SIZE } from '../core/config.ts';
import type { Side, Vec2 } from '../core/types.ts';

/**
 * 視角：每位玩家的畫面都旋轉成自己的方位在下方。旋轉的是場地，不是鏡像，所以方位的順序與左右手性不變。
 * 場地座標是遊戲核心使用的座標，畫面座標是旋轉後畫在畫布上、滑鼠實際指到的座標。
 * 這裡只做座標轉換，遊戲核心與連線同步都不需要知道視角。
 */

/** 旋轉角度的正餘弦：用精確的整數表示，避免三角函數在直角上留下浮點誤差。 */
const ROTATION: Record<Side, { cos: number; sin: number }> = {
  bottom: { cos: 1, sin: 0 },
  top: { cos: -1, sin: 0 },
  left: { cos: 0, sin: -1 },
  right: { cos: 0, sin: 1 },
};

/** 畫布旋轉的弧度：把這個方位轉到畫面下方。 */
export function viewAngle(side: Side): number {
  return Math.atan2(ROTATION[side].sin, ROTATION[side].cos);
}

const CENTER = ARENA_SIZE / 2;

/** 位移（向量）從場地座標轉到畫面座標。加零是為了把負零變成零。 */
export function arenaDeltaToView(side: Side, d: Vec2): Vec2 {
  const { cos, sin } = ROTATION[side];
  return { x: d.x * cos - d.y * sin + 0, y: d.x * sin + d.y * cos + 0 };
}

/** 位移（向量）從畫面座標轉回場地座標。 */
export function viewDeltaToArena(side: Side, d: Vec2): Vec2 {
  const { cos, sin } = ROTATION[side];
  return { x: d.x * cos + d.y * sin + 0, y: -d.x * sin + d.y * cos + 0 };
}

/** 場地上的點轉到畫面上的點：以場地中心為軸旋轉。 */
export function arenaToView(side: Side, p: Vec2): Vec2 {
  const d = arenaDeltaToView(side, { x: p.x - CENTER, y: p.y - CENTER });
  return { x: CENTER + d.x, y: CENTER + d.y };
}

/** 畫面上的點轉回場地上的點。 */
export function viewToArena(side: Side, p: Vec2): Vec2 {
  const d = viewDeltaToArena(side, { x: p.x - CENTER, y: p.y - CENTER });
  return { x: CENTER + d.x, y: CENTER + d.y };
}
