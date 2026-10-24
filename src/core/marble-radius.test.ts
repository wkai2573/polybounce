import { describe, expect, test } from 'bun:test';
import { MARBLE_RADIUS } from './config.ts';
import { marbleRadius, radiusForPower } from './effects.ts';
import { createGame } from './game.ts';
import { at } from './test-input.ts';
import type { Brick, Game, GameOptions, Marble, PlayerInput } from './types.ts';

const DT = 1 / 60;
const brickAt = (x: number, y: number, hp = 1): Brick => ({ id: 0, x, y, w: 48, h: 24, hp, maxHp: hp });
const cornerBrick = (): Brick => ({ ...brickAt(160, 160, 100000), id: 99 });

function newGame(opts: Partial<GameOptions> = {}) {
  return createGame({ playerCount: 1, seed: 1, layout: () => [cornerBrick()], dropChance: 0, ...opts });
}

function inputs(game: Game): PlayerInput[] {
  return game.state.players.map((p) => at(400, p.side));
}

const addMarble = (game: Game, marble: Omit<Marble, 'id' | 'power'> & { power?: number }): Marble => {
  const m: Marble = { id: 7000 + game.state.marbles.length, power: 1, ...marble };
  game.state.marbles.push(m);
  return m;
};

describe('攻擊力與彈珠半徑', () => {
  test('攻擊力一是基礎半徑', () => {
    expect(radiusForPower(1)).toBe(MARBLE_RADIUS);
  });

  test('隨攻擊力線性成長：每多一點，多基礎半徑的 12%', () => {
    expect(radiusForPower(2)).toBeCloseTo(MARBLE_RADIUS * 1.12);
    expect(radiusForPower(5)).toBeCloseTo(MARBLE_RADIUS * 1.48);
    expect(radiusForPower(5) - radiusForPower(4)).toBeCloseTo(radiusForPower(3) - radiusForPower(2));
  });

  test('成長到兩倍就停：攻擊力九還差一點，十以上固定為兩倍', () => {
    expect(radiusForPower(9)).toBeCloseTo(MARBLE_RADIUS * 1.96);
    expect(radiusForPower(10)).toBeCloseTo(MARBLE_RADIUS * 2);
    expect(radiusForPower(11)).toBeCloseTo(MARBLE_RADIUS * 2);
    expect(radiusForPower(500)).toBeCloseTo(MARBLE_RADIUS * 2);
  });

  test('一顆彈珠的半徑由它自己的攻擊力決定', () => {
    const game = newGame();
    const small = addMarble(game, { pos: { x: 100, y: 400 }, vel: { x: 0, y: 0 } });
    const big = addMarble(game, { pos: { x: 200, y: 400 }, vel: { x: 0, y: 0 }, power: 9 });

    expect(marbleRadius(small)).toBe(MARBLE_RADIUS);
    expect(marbleRadius(big)).toBeCloseTo(MARBLE_RADIUS * 1.96);
  });

  test('場上不同攻擊力的彈珠，各自用自己的半徑碰撞：大彈珠碰得到而小彈珠碰不到的距離', () => {
    // 磚塊的左緣在 x=376；彈珠圓心在 x=366 往上飛。半徑 6 碰不到，半徑 12 碰得到。
    const game = newGame({ layout: () => [{ ...brickAt(376, 300, 100), id: 1 }, cornerBrick()] });
    const small = addMarble(game, { pos: { x: 366, y: 500 }, vel: { x: 0, y: -420 } });
    const big = addMarble(game, { pos: { x: 366, y: 500 }, vel: { x: 0, y: -420 }, power: 9 });

    for (let t = 0; t < 0.6; t += DT) game.step(DT, inputs(game));

    // 小彈珠沒碰到磚塊，速度不變；大彈珠擦到磚塊左緣，被往左彈開。
    expect(small.vel.x).toBe(0);
    expect(big.vel.x).toBeLessThan(0);
    // 只有大彈珠打到磚塊，扣的血量等於它的攻擊力九。
    expect(game.state.bricks.find((b) => b.id === 1)!.hp).toBe(91);
  });

  test('大彈珠被擋板彈回時用它自己的半徑，不會穿過擋板', () => {
    const game = newGame();
    const big = addMarble(game, { pos: { x: 400, y: 700 }, vel: { x: 0, y: 420 }, power: 9 });

    for (let t = 0; t < 0.5; t += DT) game.step(DT, inputs(game));

    expect(big.vel.y).toBeLessThan(0);
    expect(game.state.marbles).toContain(big);
  });

  test('大彈珠整顆越過邊緣才算漏接：圓心剛過邊緣時還在場上', () => {
    const game = newGame();
    const big = addMarble(game, { pos: { x: 700, y: 805 }, vel: { x: 0, y: 1 }, power: 9 });
    const small = addMarble(game, { pos: { x: 650, y: 805 }, vel: { x: 0, y: 1 } });

    game.step(DT, inputs(game));

    // 圓心在邊緣外 5：半徑 6 的小彈珠整顆還沒出去前就算漏了嗎？小彈珠 5 < 6 還在，大彈珠 5 < 12 也還在。
    expect(game.state.marbles).toContain(big);
    expect(game.state.marbles).toContain(small);

    big.pos.y = 800 + 10;
    small.pos.y = 800 + 10;
    game.step(DT, inputs(game));

    // 圓心在邊緣外 10：半徑 6 的小彈珠已整顆出去，半徑約 11.8 的大彈珠還沒。
    expect(game.state.marbles).not.toContain(small);
    expect(game.state.marbles).toContain(big);
  });
});
