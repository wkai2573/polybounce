import { MARBLES_PER_PLAYER } from '../config.ts';
import type { Brick, GameState, Monster } from '../types.ts';

/** 結果階段：判定過關與失敗。過關時換上下一關的配置並補滿彈珠池。 */
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
    state.pool = MARBLES_PER_PLAYER * state.players.length;
    state.marbles = [];
  }

  return function resolveOutcome() {
    if (state.bricks.length === 0 && state.monsters.length === 0) startNextLevel();
    if (state.pool === 0 && state.marbles.length === 0) state.status = 'defeated';
  };
}
