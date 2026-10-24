import { pointAt } from './geometry.ts';
import type { PlayerInput, Side } from './types.ts';

/**
 * 測試用的輸入：指標放在某一邊的邊緣，沿邊座標是 along。深度由指標離邊的距離決定，
 * 所以指標的另一軸必須在自己那一邊的邊緣，否則擋板會被夾到最深處、所有位置都偏移。
 * 預設是下方的玩家。
 */
export function at(along: number, side: Side = 'bottom'): PlayerInput {
  return { pointer: pointAt(side, along, 0), primary: false, secondary: false };
}

/** 指標離自己那一邊 depth 遠，用來讓擋板往內移動。 */
export function atDepth(along: number, depth: number, side: Side = 'bottom'): PlayerInput {
  return { pointer: pointAt(side, along, depth), primary: false, secondary: false };
}
