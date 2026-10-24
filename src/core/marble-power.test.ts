import { describe, expect, test } from 'bun:test';
import { createGame } from './game.ts';
import { at } from './test-input.ts';
import type { Brick, Game, GameOptions, Marble, Monster, PlayerInput } from './types.ts';

const DT = 1 / 60;
const fireAt = (x: number): PlayerInput => ({ ...at(x), fire: true });

const brickAt = (x: number, y: number, hp = 1): Brick => ({ id: 0, x, y, w: 48, h: 24, hp, maxHp: hp });
/** 躲在角落、不會擋到中線彈珠的磚塊，讓關卡不會一開始就算清空。 */
const cornerBrick = (): Brick => ({ ...brickAt(160, 160, 100000), id: 99 });
/** 擋在垂直射出路徑上的磚塊，中心是 (400, 312)。 */
const pathBrick = (hp: number): Brick => ({ ...brickAt(376, 300, hp), id: 1 });
const monsterAt = (x: number, y: number, hp: number): Monster => ({ id: 0, pos: { x, y }, radius: 36, hp, maxHp: hp, boss: false, fire: 99 });

function newGame(opts: Partial<GameOptions> = {}) {
  return createGame({ playerCount: 1, seed: 1, layout: () => [cornerBrick()], dropChance: 0, ...opts });
}

function inputs(game: Game, first?: PlayerInput): PlayerInput[] {
  return game.state.players.map((p, i) => (i === 0 && first ? first : at(400, p.side)));
}

function run(game: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += DT) game.step(DT, inputs(game));
}

const addMarble = (game: Game, marble: Omit<Marble, 'id' | 'power'> & { power?: number }): Marble => {
  const m: Marble = { id: 7000 + game.state.marbles.length, power: 1, ...marble };
  game.state.marbles.push(m);
  return m;
};

describe('攻擊力累積', () => {
  test('新發射的彈珠攻擊力是一', () => {
    const game = newGame();

    game.step(DT, inputs(game, fireAt(400)));

    expect(game.state.marbles[0]!.power).toBe(1);
  });

  test('被擋板彈回一次攻擊力加一', () => {
    const game = newGame();
    const m = addMarble(game, { pos: { x: 400, y: 740 }, vel: { x: 0, y: 420 } });

    run(game, 0.3);

    expect(m.vel.y).toBeLessThan(0);
    expect(m.power).toBe(2);
  });

  test('連續被彈回，攻擊力持續累加', () => {
    const game = newGame();
    const m = addMarble(game, { pos: { x: 400, y: 740 }, vel: { x: 0, y: 420 }, power: 4 });

    run(game, 0.3);

    expect(m.power).toBe(5);
  });

  test('隊友的擋板彈回也算，不限於發射它的人', () => {
    const game = newGame({ playerCount: 2 });
    const m = addMarble(game, { pos: { x: 400, y: 60 }, vel: { x: 0, y: -420 } });

    run(game, 0.3);

    expect(m.vel.y).toBeGreaterThan(0);
    expect(m.power).toBe(2);
  });

  test('撞牆不增加攻擊力', () => {
    const game = newGame();
    const m = addMarble(game, { pos: { x: 400, y: 60 }, vel: { x: 0, y: -420 } });

    run(game, 0.3);

    expect(m.vel.y).toBeGreaterThan(0);
    expect(m.power).toBe(1);
  });

  test('撞到屍體所在的牆不增加攻擊力', () => {
    const game = newGame({ playerCount: 2 });
    const top = game.state.players[1]!;
    top.dead = true;
    top.lives = 0;
    const m = addMarble(game, { pos: { x: 400, y: 60 }, vel: { x: 0, y: -420 } });

    run(game, 0.3);

    expect(m.vel.y).toBeGreaterThan(0);
    expect(m.power).toBe(1);
  });

  test('撞磚塊與怪物不增加攻擊力', () => {
    const game = newGame({ layout: () => [pathBrick(100), cornerBrick()], monsters: () => [monsterAt(600, 400, 100)] });
    const a = addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -420 } });
    const b = addMarble(game, { pos: { x: 600, y: 500 }, vel: { x: 0, y: -420 } });

    run(game, 0.6);

    expect(a.vel.y).toBeGreaterThan(0);
    expect(b.vel.y).toBeGreaterThan(0);
    expect(a.power).toBe(1);
    expect(b.power).toBe(1);
  });

  test('攻擊力沒有上限', () => {
    const game = newGame();
    const m = addMarble(game, { pos: { x: 400, y: 740 }, vel: { x: 0, y: 420 }, power: 999 });

    run(game, 0.3);

    expect(m.power).toBe(1000);
  });
});

describe('攻擊力扣血', () => {
  test('磚塊被打到扣的血量等於攻擊力', () => {
    const game = newGame({ layout: () => [pathBrick(10), cornerBrick()] });
    addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -420 }, power: 3 });

    run(game, 0.6);

    expect(game.state.bricks.find((b) => b.id === 1)!.hp).toBe(7);
  });

  test('攻擊力超過剩餘血量仍正常碎裂，得分仍以最大血量計', () => {
    const game = newGame({ layout: () => [pathBrick(2), cornerBrick()] });
    addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -420 }, power: 10 });

    run(game, 0.6);

    expect(game.state.bricks.some((b) => b.id === 1)).toBe(false);
    expect(game.state.score).toBe(2 * 10);
  });

  test('攻擊力一時每次撞擊仍只扣一點，和以前一樣', () => {
    const game = newGame({ layout: () => [pathBrick(5), cornerBrick()] });
    addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -420 } });

    run(game, 0.6);

    expect(game.state.bricks.find((b) => b.id === 1)!.hp).toBe(4);
  });

  test('怪物被打到扣的血量等於攻擊力', () => {
    const game = newGame({ monsters: () => [monsterAt(400, 400, 10)] });
    addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -420 }, power: 3 });

    run(game, 0.6);

    expect(game.state.monsters[0]!.hp).toBe(7);
  });

  test('BOSS 同樣依攻擊力扣血', () => {
    const boss: Monster = { ...monsterAt(400, 400, 30), radius: 52, boss: true, fire: 0 };
    const game = newGame({ monsters: () => [boss] });
    addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -420 }, power: 4 });

    run(game, 0.6);

    expect(game.state.monsters[0]!.hp).toBe(26);
  });

  test('貫通期間，彈珠每進入一塊磚扣的血量等於攻擊力', () => {
    const game = newGame({ layout: () => [pathBrick(10), cornerBrick()] });
    game.state.effects.pierce = 3;
    addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -420 }, power: 4 });

    run(game, 0.7);

    expect(game.state.bricks.find((b) => b.id === 1)!.hp).toBe(6);
  });

  test('貫通期間，彈珠每進入一隻怪物扣的血量等於攻擊力', () => {
    const game = newGame({ monsters: () => [monsterAt(400, 400, 20)] });
    game.state.effects.pierce = 3;
    addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -420 }, power: 5 });

    run(game, 0.6);

    expect(game.state.monsters[0]!.hp).toBe(15);
  });

  test('怪物血量一次降過兩個掉落門檻，只掉落一次道具', () => {
    const game = newGame({ monsters: () => [monsterAt(400, 400, 10)], monsterDropKinds: ['widen'] });
    addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -420 }, power: 8 });

    run(game, 0.6);

    expect(game.state.monsters[0]!.hp).toBe(2);
    expect(game.state.powerUps).toHaveLength(1);
  });
});

describe('分裂的彈珠', () => {
  test('多球分出的新彈珠攻擊力從一開始，原彈珠不受影響', () => {
    const game = newGame();
    const m = addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -100 }, power: 6 });
    game.state.powerUps.push({ id: 1, batch: 1, kind: 'multiball', side: 'bottom', pos: { x: 400, y: 795 } });

    game.step(DT, inputs(game));

    expect(game.state.marbles).toHaveLength(3);
    expect(m.power).toBe(6);
    expect(game.state.marbles.filter((x) => x !== m).map((x) => x.power)).toEqual([1, 1]);
  });

  test('環爆分出的新彈珠攻擊力從一開始', () => {
    const game = newGame();
    const m = addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: -100 }, power: 6 });
    game.state.powerUps.push({ id: 1, batch: 1, kind: 'burst', side: 'bottom', pos: { x: 400, y: 795 } });

    game.step(DT, inputs(game));

    expect(game.state.marbles).toHaveLength(10);
    expect(m.power).toBe(6);
    expect(game.state.marbles.filter((x) => x !== m).every((x) => x.power === 1)).toBe(true);
  });
});
