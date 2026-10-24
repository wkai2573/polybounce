import { describe, expect, test } from 'bun:test';
import { createRng } from '../core/rng.ts';
import { generateRoomCode, normalizeRoomCode, peerIdForRoom } from './room-code.ts';

describe('房間碼', () => {
  test('產生 5 碼，只含不易混淆的大寫字母與數字', () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode(rng)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  test('輸入時不分大小寫，也容許前後空白與中間的空格、連字號', () => {
    expect(normalizeRoomCode(' ab3k9 ')).toBe('AB3K9');
    expect(normalizeRoomCode('ab3-k9')).toBe('AB3K9');
    expect(normalizeRoomCode('AB 3K9')).toBe('AB3K9');
  });

  test('長度不對或含有不存在的字元就視為無效', () => {
    expect(normalizeRoomCode('')).toBeNull();
    expect(normalizeRoomCode('ABCD')).toBeNull();
    expect(normalizeRoomCode('ABCDEF')).toBeNull();
    expect(normalizeRoomCode('ABCD0')).toBeNull();
    expect(normalizeRoomCode('ABCDI')).toBeNull();
  });

  test('連線用的代號帶有專案前綴，避免撞到公共配對伺服器上別人的代號', () => {
    expect(peerIdForRoom('AB3K9')).toBe('polybounce-AB3K9');
  });
});
