import { ENLARGE_FACTOR, MARBLE_RADIUS, SHRINK_FACTOR } from './config.ts';
import type { GameState } from './types.ts';

/** 彈珠目前的半徑：整場的大小效果對場上所有彈珠一視同仁，所以半徑只看狀態。 */
export function marbleRadius(state: GameState): number {
  switch (state.effects.marbleSize?.kind) {
    case 'enlarge':
      return MARBLE_RADIUS * ENLARGE_FACTOR;
    case 'shrink':
      return MARBLE_RADIUS * SHRINK_FACTOR;
    default:
      return MARBLE_RADIUS;
  }
}

/** 貫通中的彈珠穿過磚塊與怪物而不反彈。 */
export const isPiercing = (state: GameState): boolean => state.effects.pierce > 0;
