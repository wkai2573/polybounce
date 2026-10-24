import { describe, expect, test } from 'bun:test';
import { marbleColor } from './palette.ts';

describe('彈珠顏色', () => {
  test('攻擊力一是白色', () => {
    expect(marbleColor(1)).toBe('rgb(255, 255, 255)');
  });

  test('攻擊力越高顏色越遠離白色，中段偏金黃，攻擊力九以上固定為亮紫', () => {
    expect(marbleColor(5)).toBe('rgb(255, 210, 79)');
    expect(marbleColor(9)).toBe('rgb(176, 107, 255)');
    expect(marbleColor(50)).toBe(marbleColor(9));
  });

  test('顏色隨攻擊力連續漸變，相鄰兩級不同', () => {
    for (let p = 1; p < 9; p++) expect(marbleColor(p)).not.toBe(marbleColor(p + 1));
  });
});
