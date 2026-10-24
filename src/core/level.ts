import {
  BOSS_HP_MULTIPLIER,
  BOSS_LEVEL_INTERVAL,
  BOSS_RADIUS,
  BRICK_COLS,
  BRICK_H,
  BRICK_REGION,
  BRICK_W,
  MONSTER_BASE_COUNT,
  MONSTER_BASE_HP,
  MONSTER_COUNT_LEVEL_STEP,
  MONSTER_FIRE_INTERVAL,
  MONSTER_FIRE_INTERVAL_MIN,
  MONSTER_FIRE_INTERVAL_STEP,
  MONSTER_FIRE_LEVEL_STEP,
  MONSTER_FIRST_LEVEL,
  MONSTER_HP_PER_LEVEL,
  MONSTER_MAX_COUNT,
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

/** 這一關有幾隻怪物：BOSS 關只有 BOSS；一般關卡第 3 關起兩隻，之後每三關多一隻，上限四隻，與玩家人數無關。 */
export function monsterCount(level: number): number {
  if (level < MONSTER_FIRST_LEVEL) return 0;
  if (isBossLevel(level)) return 1;
  const extra = Math.floor((level - MONSTER_FIRST_LEVEL) / MONSTER_COUNT_LEVEL_STEP);
  return Math.min(MONSTER_MAX_COUNT, MONSTER_BASE_COUNT + extra);
}

/** 一般怪物的發射間隔（秒）：關卡越後面越短，有下限。 */
export function monsterFireInterval(level: number): number {
  const steps = Math.floor(Math.max(0, level - MONSTER_FIRST_LEVEL) / MONSTER_FIRE_LEVEL_STEP);
  return Math.max(MONSTER_FIRE_INTERVAL_MIN, MONSTER_FIRE_INTERVAL - MONSTER_FIRE_INTERVAL_STEP * steps);
}

/** 找不到不重疊的位置時放棄重抽的次數，讓生成一定會結束。 */
const PLACE_ATTEMPTS = 200;

/**
 * 第 3 關起每關有數隻怪物（數量見 monsterCount），每 5 關是 BOSS；都從中央區域內的隨機位置出發，
 * 多隻時圓心距離至少兩個半徑，生成時不互相重疊。血量只看關卡。
 * 一般怪物的初始發射倒數在一個間隔內均勻錯開，開局不會同時齊射。
 */
export function generateMonsters(level: number, seed: number): Monster[] {
  const count = monsterCount(level);
  if (count === 0) return [];
  const rng = createRng(seed * 7919 + level);
  const boss = isBossLevel(level);
  const radius = boss ? BOSS_RADIUS : MONSTER_RADIUS;
  const lo = BRICK_REGION.min + radius;
  const hi = BRICK_REGION.max - radius;
  const baseHp = MONSTER_BASE_HP + MONSTER_HP_PER_LEVEL * (level - MONSTER_FIRST_LEVEL);
  const hp = boss ? baseHp * BOSS_HP_MULTIPLIER : baseHp;
  const interval = monsterFireInterval(level);
  const monsters: Monster[] = [];
  for (let id = 0; id < count; id++) {
    let pos = { x: lo + rng() * (hi - lo), y: lo + rng() * (hi - lo) };
    for (let attempt = 1; attempt < PLACE_ATTEMPTS && monsters.some((m) => Math.hypot(m.pos.x - pos.x, m.pos.y - pos.y) < radius * 2); attempt++) {
      pos = { x: lo + rng() * (hi - lo), y: lo + rng() * (hi - lo) };
    }
    monsters.push({ id, pos, radius, hp, maxHp: hp, boss, fire: boss ? 0 : (interval * (id + 1)) / count });
  }
  return monsters;
}
