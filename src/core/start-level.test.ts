import { describe, expect, test } from 'bun:test';
import { MARBLE_BASE_SPEED } from './config.ts';
import { createGame } from './game.ts';
import { generateLevel, generateMonsters, isBossLevel } from './level.ts';
import type { PlayerInput } from './types.ts';
import { at } from './test-input.ts';

const fireAt = (x: number): PlayerInput => ({ ...at(x), fire: true });

describe('起始關卡', () => {
  test('預設從第 1 關開始，狀態記錄這一局的起點是第 1 關', () => {
    const { state } = createGame({ playerCount: 1, seed: 1 });

    expect(state.level).toBe(1);
    expect(state.startLevel).toBe(1);
  });

  test('從第 N 關開始：關卡、狀態中的起點與一路打到第 N 關時的配置一致', () => {
    const { state } = createGame({ playerCount: 2, seed: 7, startLevel: 8 });

    expect(state.level).toBe(8);
    expect(state.startLevel).toBe(8);
    expect(state.bricks).toEqual(generateLevel(8, 7));
    expect(state.monsters).toEqual(generateMonsters(8, 7));
    expect(state.monsters).toHaveLength(3);
  });

  test('從 BOSS 關開始，一開始就是 BOSS', () => {
    const { state } = createGame({ playerCount: 1, seed: 3, startLevel: 10 });

    expect(isBossLevel(10)).toBe(true);
    expect(state.monsters).toHaveLength(1);
    expect(state.monsters[0]!.boss).toBe(true);
  });

  test('所有玩家的發射量是滿的，場上沒有彈珠，分數從 0 開始', () => {
    const { state } = createGame({ playerCount: 3, seed: 1, startLevel: 20 });

    expect(state.players.map((p) => p.charge)).toEqual([5, 5, 5]);
    expect(state.marbles).toHaveLength(0);
    expect(state.score).toBe(0);
    expect(state.status).toBe('playing');
  });

  test('彈珠速度依起始關卡計算', () => {
    const game = createGame({ playerCount: 1, seed: 1, startLevel: 11 });

    game.step(1 / 60, [fireAt(400)]);

    const v = game.state.marbles[0]!.vel;
    // 第 11 關比第 1 關快 10 × 3% = 30%。
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(MARBLE_BASE_SPEED * 1.3);
  });

  test('起始關卡之前的關卡不會被生成', () => {
    const asked: number[] = [];
    createGame({
      playerCount: 1,
      seed: 1,
      startLevel: 6,
      layout: (level) => {
        asked.push(level);
        return generateLevel(level, 1);
      },
      monsters: (level) => {
        asked.push(level);
        return [];
      },
    });

    expect(asked).toEqual([6, 6]);
  });

  test('過關後進入下一關，這一局的起點不變', () => {
    const game = createGame({
      playerCount: 1,
      seed: 1,
      startLevel: 4,
      layout: (level) => (level === 4 ? [{ id: 0, x: 376, y: 300, w: 48, h: 24, hp: 1, maxHp: 1 }] : [{ id: 0, x: 160, y: 160, w: 48, h: 24, hp: 1000, maxHp: 1000 }]),
      monsters: () => [],
    });
    game.step(1 / 60, [fireAt(400)]);
    for (let t = 0; t < 5 && game.state.level === 4; t += 1 / 60) game.step(1 / 60, [at(400)]);

    expect(game.state.level).toBe(5);
    expect(game.state.startLevel).toBe(4);
  });

  test('這一局的起點可以和開始的關卡不同，用來表示接關', () => {
    const { state } = createGame({ playerCount: 1, seed: 1, startLevel: 7, runStartLevel: 1 });

    expect(state.level).toBe(7);
    expect(state.startLevel).toBe(1);
  });

  test('超出 1 到 99 的起始關卡會被限制在範圍內', () => {
    expect(createGame({ playerCount: 1, seed: 1, startLevel: 0 }).state.level).toBe(1);
    expect(createGame({ playerCount: 1, seed: 1, startLevel: -5 }).state.level).toBe(1);
    expect(createGame({ playerCount: 1, seed: 1, startLevel: 150 }).state.level).toBe(99);
  });
});
