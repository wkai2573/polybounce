import { PADDLE_WIDTH, WIDEN_FACTOR } from './config.ts';
import type { PlayerState } from './types.ts';

/** 擋板目前的寬度：加寬期間是固定倍數，不疊加。 */
export const paddleWidth = (player: PlayerState) => (player.widen > 0 ? PADDLE_WIDTH * WIDEN_FACTOR : PADDLE_WIDTH);
