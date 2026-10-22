import { BRICK_COLS, BRICK_H, BRICK_REGION, BRICK_W } from './config.ts';
import { createRng } from './rng.ts';
import type { Brick } from './types.ts';

const FILL_CHANCE = 0.85;

export function generateLevel(level: number, seed: number): Brick[] {
  const rng = createRng(seed * 1000 + level);
  const rows = Math.min(3 + level, 10);
  const hardChance = Math.min(0.1 * (level - 1), 0.5);
  const hardHp = level >= 6 ? 3 : 2;
  const centerY = (BRICK_REGION.min + BRICK_REGION.max) / 2;
  const top = centerY - (rows * BRICK_H) / 2;
  const bricks: Brick[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      if (rng() >= FILL_CHANCE) continue;
      const hp = rng() < hardChance ? hardHp : 1;
      bricks.push({
        id: bricks.length,
        x: BRICK_REGION.min + c * BRICK_W,
        y: top + r * BRICK_H,
        w: BRICK_W,
        h: BRICK_H,
        hp,
        maxHp: hp,
      });
    }
  }
  return bricks;
}
