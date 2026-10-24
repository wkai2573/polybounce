import { MARBLES_PER_PLAYER } from '../config.ts';
import { resetForNewLevel } from '../paddle.ts';
import type { Brick, GameState, Monster } from '../types.ts';

/**
 * 結果階段：判定過關與失敗。過關時換上下一關的配置、補滿彈珠池，所有玩家復活並補滿生命。
 * 全部玩家都死亡，或彈珠池為空且場上沒有彈珠，就是失敗；失敗後不再過關。
 */
export function createOutcomeStage(
  state: GameState,
  layout: (level: number) => Brick[],
  monsters: (level: number) => Monster[],
) {
  function startNextLevel() {
    state.level += 1;
    state.bricks = layout(state.level);
    state.monsters = monsters(state.level);
    state.bullets = [];
    state.powerUps = [];
    // 彈珠池依有座位的玩家數計算，包含死亡的人。
    state.pool = MARBLES_PER_PLAYER * state.players.length;
    state.marbles = [];
    for (const player of state.players) resetForNewLevel(player);
  }

  return function resolveOutcome() {
    if (state.status === 'defeated') return;
    // 全員死亡先判定：同一步清空關卡也不能靠過關的復活蓋掉死亡。
    if (state.players.length > 0 && state.players.every((p) => p.dead)) {
      state.status = 'defeated';
      return;
    }
    if (state.bricks.length === 0 && state.monsters.length === 0) startNextLevel();
    if (state.pool === 0 && state.marbles.length === 0) state.status = 'defeated';
  };
}
