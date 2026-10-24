import { CHARGE_REGEN_PER_SECOND, MAX_CHARGE } from '../config.ts';
import type { GameState } from '../types.ts';

/** 發射量階段：活著的玩家每秒恢復一顆，不超過上限；死亡期間凍結，復活後從原值繼續。 */
export function createChargeStage(state: GameState) {
  return function advanceCharge(dt: number) {
    for (const player of state.players) {
      if (player.dead) continue;
      player.charge = Math.min(MAX_CHARGE, player.charge + CHARGE_REGEN_PER_SECOND * dt);
    }
  };
}
