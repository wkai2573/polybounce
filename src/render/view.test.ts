import { describe, expect, test } from 'bun:test';
import { pointAt } from '../core/geometry.ts';
import type { Side, Vec2 } from '../core/types.ts';
import { arenaDeltaToView, arenaToView, viewAngle, viewDeltaToArena, viewToArena } from './view.ts';

const SIDES: Side[] = ['bottom', 'top', 'left', 'right'];

describe('視角轉換', () => {
  test('下方玩家是恆等轉換', () => {
    expect(arenaToView('bottom', { x: 123, y: 456 })).toEqual({ x: 123, y: 456 });
    expect(viewToArena('bottom', { x: 123, y: 456 })).toEqual({ x: 123, y: 456 });
    expect(arenaDeltaToView('bottom', { x: 3, y: -4 })).toEqual({ x: 3, y: -4 });
    expect(viewAngle('bottom')).toBe(0);
  });

  test('任何方位，自己那一邊的邊緣在畫面上都是下緣', () => {
    for (const side of SIDES) {
      const edge = pointAt(side, 300, 0);
      expect(arenaToView(side, edge).y).toBe(800);
    }
  });

  test('自己那一邊往場內走，在畫面上都是往上', () => {
    for (const side of SIDES) {
      const edge = arenaToView(side, pointAt(side, 300, 0));
      const inner = arenaToView(side, pointAt(side, 300, 100));
      expect(inner.x).toBe(edge.x);
      expect(inner.y).toBe(edge.y - 100);
    }
  });

  test('是旋轉不是鏡像：沿邊方向與往場內方向的叉積符號不變', () => {
    const cross = (u: Vec2, v: Vec2) => u.x * v.y - u.y * v.x;
    const before = cross({ x: 1, y: 0 }, { x: 0, y: -1 });
    for (const side of SIDES) {
      const u = arenaDeltaToView(side, { x: 1, y: 0 });
      const v = arenaDeltaToView(side, { x: 0, y: -1 });
      expect(cross(u, v)).toBe(before);
    }
  });

  test('場地中心不動', () => {
    for (const side of SIDES) expect(arenaToView(side, { x: 400, y: 400 })).toEqual({ x: 400, y: 400 });
  });

  test('四個角在旋轉後仍落在場地的四個角', () => {
    for (const side of SIDES) {
      const corners = [
        { x: 0, y: 0 },
        { x: 800, y: 0 },
        { x: 0, y: 800 },
        { x: 800, y: 800 },
      ].map((c) => arenaToView(side, c));
      for (const c of corners) {
        expect([0, 800]).toContain(c.x);
        expect([0, 800]).toContain(c.y);
      }
    }
  });

  test('點與位移的轉換和反轉換互為反函數', () => {
    for (const side of SIDES) {
      const p = { x: 123.5, y: 678.25 };
      expect(viewToArena(side, arenaToView(side, p))).toEqual(p);
      expect(arenaToView(side, viewToArena(side, p))).toEqual(p);
      const d = { x: -17, y: 42 };
      expect(viewDeltaToArena(side, arenaDeltaToView(side, d))).toEqual(d);
    }
  });

  test('滑鼠在畫面上往右移，擋板沿自己那一邊移動：左方玩家往下、右方玩家往上、上方玩家往左', () => {
    expect(viewDeltaToArena('bottom', { x: 10, y: 0 })).toEqual({ x: 10, y: 0 });
    expect(viewDeltaToArena('top', { x: 10, y: 0 })).toEqual({ x: -10, y: 0 });
    expect(viewDeltaToArena('left', { x: 10, y: 0 })).toEqual({ x: 0, y: 10 });
    expect(viewDeltaToArena('right', { x: 10, y: 0 })).toEqual({ x: 0, y: -10 });
  });

  test('畫面上往上移，永遠是往自己那一邊的內側（深度增加）', () => {
    for (const side of SIDES) {
      const up = viewDeltaToArena(side, { x: 0, y: -10 });
      const inward = { bottom: { x: 0, y: -1 }, top: { x: 0, y: 1 }, left: { x: 1, y: 0 }, right: { x: -1, y: 0 } }[side];
      expect(up.x).toBe(inward.x * 10 + 0);
      expect(up.y).toBe(inward.y * 10 + 0);
    }
  });
});
