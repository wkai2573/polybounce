import { MARBLE_RADIUS, MARBLE_RADIUS_GROWTH, MARBLE_RADIUS_MAX_FACTOR } from './config.ts';
import type { GameState, Marble } from './types.ts';

/** 攻擊力對應的彈珠半徑：隨攻擊力線性成長，到上限倍數就不再變大。半徑只影響碰撞與畫面，不影響扣血。 */
export function radiusForPower(power: number): number {
  return MARBLE_RADIUS * Math.min(1 + MARBLE_RADIUS_GROWTH * (power - 1), MARBLE_RADIUS_MAX_FACTOR);
}

/** 一顆彈珠目前的半徑：碰撞、漏接判定與繪製都用它，每顆彈珠各自計算。 */
export const marbleRadius = (marble: Marble): number => radiusForPower(marble.power);

/** 新發射的彈珠的半徑：攻擊力一。 */
export const launchRadius = (): number => radiusForPower(1);

/** 貫通中的彈珠穿過磚塊與怪物而不反彈。 */
export const isPiercing = (state: GameState): boolean => state.effects.pierce > 0;
