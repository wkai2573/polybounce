import { ARENA_SIZE, MARBLES_PER_PLAYER, SIDE_ORDER } from './config.ts';
import { generateLevel } from './level.ts';
import { createBrickCollider } from './stages/bricks.ts';
import { createInputStage } from './stages/input.ts';
import { createMarbleStage } from './stages/marbles.ts';
import { createOutcomeStage } from './stages/outcome.ts';
import type { Game, GameOptions, GameState } from './types.ts';

export function createGame(options: GameOptions): Game {
  const layout = options.layout ?? ((level: number) => generateLevel(level, options.seed));
  const state: GameState = {
    status: 'playing',
    level: 1,
    score: 0,
    pool: MARBLES_PER_PLAYER * options.playerCount,
    marbles: [],
    bricks: layout(1),
    players: SIDE_ORDER.slice(0, options.playerCount).map((side) => ({
      side,
      paddle: ARENA_SIZE / 2,
      aiming: false,
    })),
  };

  const applyInputs = createInputStage(state);
  const advanceMarbles = createMarbleStage(state, [createBrickCollider(state)]);
  const resolveOutcome = createOutcomeStage(state, layout);

  return {
    state,
    step(dt, inputs) {
      applyInputs(inputs);
      advanceMarbles(dt);
      resolveOutcome();
    },
  };
}
