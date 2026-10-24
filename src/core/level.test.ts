import { describe, expect, test } from 'bun:test';
import { BRICK_REGION } from './config.ts';
import { generateLevel, generateMonsters, isBossLevel } from './level.ts';

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

describe('怪物生成', () => {
  test('第 1、2 關沒有怪物，第 3 關起每關一隻', () => {
    expect(generateMonsters(1, 42)).toHaveLength(0);
    expect(generateMonsters(2, 42)).toHaveLength(0);
    for (const level of [3, 4, 7, 12]) {
      expect(generateMonsters(level, 42)).toHaveLength(1);
    }
  });

  test('怪物整隻落在中央區域內，血量是滿的', () => {
    for (let seed = 0; seed < 20; seed++) {
      const m = generateMonsters(3, seed)[0]!;
      expect(m.pos.x - m.radius).toBeGreaterThanOrEqual(BRICK_REGION.min);
      expect(m.pos.y - m.radius).toBeGreaterThanOrEqual(BRICK_REGION.min);
      expect(m.pos.x + m.radius).toBeLessThanOrEqual(BRICK_REGION.max);
      expect(m.pos.y + m.radius).toBeLessThanOrEqual(BRICK_REGION.max);
      expect(m.hp).toBe(m.maxHp);
    }
  });

  test('關卡越後面怪物血量越多', () => {
    expect(generateMonsters(6, 1)[0]!.maxHp).toBeGreaterThan(generateMonsters(3, 1)[0]!.maxHp);
  });

  test('相同種子與關卡產生相同的怪物', () => {
    expect(generateMonsters(5, 7)).toEqual(generateMonsters(5, 7));
  });
});

describe('BOSS 關', () => {
  test('每 5 的倍數關是 BOSS 關，其他關卡不是', () => {
    for (const level of [5, 10, 15, 20]) expect(isBossLevel(level)).toBe(true);
    for (const level of [1, 2, 3, 4, 6, 9, 11]) expect(isBossLevel(level)).toBe(false);
  });

  test('BOSS 關中央是一隻 BOSS，其他關卡的怪物不是 BOSS', () => {
    expect(generateMonsters(5, 1)[0]!.boss).toBe(true);
    expect(generateMonsters(10, 1)).toHaveLength(1);
    for (const level of [3, 4, 6, 9]) expect(generateMonsters(level, 1)[0]!.boss).toBe(false);
  });

  test('BOSS 的血量明顯高於同一關的一般怪物', () => {
    const boss = generateMonsters(5, 1)[0]!;
    // 同一關的一般怪物血量：第 3 關 5 點，每關再加 2 點，所以第 5 關是 9 點。
    expect(boss.maxHp).toBeGreaterThanOrEqual(9 * 2);
    expect(boss.hp).toBe(boss.maxHp);
  });

  test('BOSS 比一般怪物大', () => {
    expect(generateMonsters(5, 1)[0]!.radius).toBeGreaterThan(generateMonsters(4, 1)[0]!.radius);
  });

  test('BOSS 整隻落在中央區域內', () => {
    for (let seed = 0; seed < 20; seed++) {
      const m = generateMonsters(5, seed)[0]!;
      expect(m.pos.x - m.radius).toBeGreaterThanOrEqual(BRICK_REGION.min);
      expect(m.pos.x + m.radius).toBeLessThanOrEqual(BRICK_REGION.max);
      expect(m.pos.y - m.radius).toBeGreaterThanOrEqual(BRICK_REGION.min);
      expect(m.pos.y + m.radius).toBeLessThanOrEqual(BRICK_REGION.max);
    }
  });
});
