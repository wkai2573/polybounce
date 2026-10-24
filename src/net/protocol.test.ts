import { describe, expect, test } from 'bun:test';
import { createGame } from '../core/game.ts';
import { roundForWire } from './protocol.ts';

describe('roundForWire', () => {
  test('數字只留一位小數，其餘結構與整數不變', () => {
    const message = { type: 'state', n: 3, pos: { x: 400.123456789, y: -12.96 }, list: [1.04, 2] };

    expect(roundForWire(message)).toEqual({ type: 'state', n: 3, pos: { x: 400.1, y: -13 }, list: [1, 2] });
  });

  test('壓縮後的狀態明顯變小', () => {
    const game = createGame({ playerCount: 1, seed: 1, startLevel: 10 });
    for (let i = 0; i < 100; i++) {
      game.state.marbles.push({ id: i, pos: { x: 400.123456789, y: 400.987654321 }, vel: { x: 123.456789012, y: -222.123456789 }, power: 1 });
    }

    const raw = JSON.stringify(game.state).length;
    const compact = JSON.stringify(roundForWire(game.state)).length;

    expect(compact).toBeLessThan(raw * 0.85);
  });
});
