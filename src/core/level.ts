import {
  BOSS_HP_MULTIPLIER,
  BOSS_LEVEL_INTERVAL,
  BOSS_RADIUS,
  BRICK_COLS,
  BRICK_H,
  BRICK_REGION,
  BRICK_W,
  MONSTER_BASE_HP,
  MONSTER_FIRST_LEVEL,
  MONSTER_HP_PER_LEVEL,
  MONSTER_RADIUS,
} from './config.ts';
import { createRng } from './rng.ts';
import type { Brick, Monster } from './types.ts';

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

export const isBossLevel = (level: number) => level % BOSS_LEVEL_INTERVAL === 0;

/** 第 3 關起每關一隻怪物，每 5 關是 BOSS；從中央區域內的隨機位置出發，血量只看關卡。 */
export function generateMonsters(level: number, seed: number): Monster[] {
  if (level < MONSTER_FIRST_LEVEL) return [];
  const rng = createRng(seed * 7919 + level);
  const boss = isBossLevel(level);
  const radius = boss ? BOSS_RADIUS : MONSTER_RADIUS;
  const lo = BRICK_REGION.min + radius;
  const hi = BRICK_REGION.max - radius;
  const baseHp = MONSTER_BASE_HP + MONSTER_HP_PER_LEVEL * (level - MONSTER_FIRST_LEVEL);
  const hp = boss ? baseHp * BOSS_HP_MULTIPLIER : baseHp;
  return [
    {
      id: 0,
      pos: { x: lo + rng() * (hi - lo), y: lo + rng() * (hi - lo) },
      radius,
      hp,
      maxHp: hp,
      boss,
    },
  ];
}
