import { ARENA_SIZE, MARBLES_PER_PLAYER, SIDE_ORDER } from './config.ts';
import { generateLevel, generateMonsters } from './level.ts';
import { createRng } from './rng.ts';
import { createBrickCollider } from './stages/bricks.ts';
import { createBulletStage } from './stages/bullets.ts';
import { createInputStage } from './stages/input.ts';
import { createMarbleStage } from './stages/marbles.ts';
import { createMonsterCollider, createMonsterStage } from './stages/monsters.ts';
import { createOutcomeStage } from './stages/outcome.ts';
import type { Game, GameOptions, GameState } from './types.ts';

export function createGame(options: GameOptions): Game {
  const layout = options.layout ?? ((level: number) => generateLevel(level, options.seed));
  const monsters = options.monsters ?? ((level: number) => generateMonsters(level, options.seed));
  const state: GameState = {
    status: 'playing',
    level: 1,
    score: 0,
    pool: MARBLES_PER_PLAYER * options.playerCount,
    marbles: [],
    bricks: layout(1),
    monsters: monsters(1),
    bullets: [],
    players: SIDE_ORDER.slice(0, options.playerCount).map((side) => ({
      side,
      paddle: ARENA_SIZE / 2,
      aiming: false,
      frozen: 0,
    })),
  };

  const applyInputs = createInputStage(state);
  const rng = createRng(options.seed);
  const advanceMonsters = createMonsterStage(state, rng);
  const advanceBullets = createBulletStage(state, rng);
  const advanceMarbles = createMarbleStage(state, [createBrickCollider(state), createMonsterCollider(state)]);
  const resolveOutcome = createOutcomeStage(state, layout, monsters);

  return {
    state,
    step(dt, inputs) {
      applyInputs(inputs);
      advanceMonsters(dt);
      advanceBullets(dt);
      advanceMarbles(dt);
      resolveOutcome();
    },
  };
}
