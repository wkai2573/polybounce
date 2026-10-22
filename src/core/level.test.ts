import { describe, expect, test } from 'bun:test';
import { BRICK_REGION } from './config.ts';
import { generateLevel } from './level.ts';

describe('關卡生成', () => {
  test('第 1 關至少有一個磚塊，且全部落在中央區域內', () => {
    const bricks = generateLevel(1, 42);

    expect(bricks.length).toBeGreaterThan(0);
    for (const b of bricks) {
      expect(b.x).toBeGreaterThanOrEqual(BRICK_REGION.min);
      expect(b.y).toBeGreaterThanOrEqual(BRICK_REGION.min);
      expect(b.x + b.w).toBeLessThanOrEqual(BRICK_REGION.max);
      expect(b.y + b.h).toBeLessThanOrEqual(BRICK_REGION.max);
    }
  });

  test('相同種子與關卡產生相同的配置', () => {
    expect(generateLevel(3, 7)).toEqual(generateLevel(3, 7));
  });

  test('不同種子產生不同的配置', () => {
    const layouts = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      layouts.add(JSON.stringify(generateLevel(1, seed)));
    }

    expect(layouts.size).toBeGreaterThan(1);
  });

  test('第 1 關只有普通磚，後面的關卡會出現硬磚', () => {
    const hardCount = (level: number) => {
      let n = 0;
      for (let seed = 0; seed < 20; seed++) {
        n += generateLevel(level, seed).filter((b) => b.maxHp > 1).length;
      }
      return n;
    };

    expect(hardCount(1)).toBe(0);
    expect(hardCount(8)).toBeGreaterThan(0);
  });

  test('新生成的磚塊血量等於最大血量', () => {
    for (const b of generateLevel(8, 3)) {
      expect(b.hp).toBe(b.maxHp);
    }
  });

  test('關卡越後面磚塊越多', () => {
    const total = (level: number) => {
      let n = 0;
      for (let seed = 0; seed < 20; seed++) n += generateLevel(level, seed).length;
      return n;
    };

    expect(total(8)).toBeGreaterThan(total(1));
  });
});
