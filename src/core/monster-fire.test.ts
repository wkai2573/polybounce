import { describe, expect, test } from 'bun:test';
import { BULLET_CAP, BULLET_SPEED, MONSTER_FIRE_INTERVAL, MONSTER_FIRE_INTERVAL_MIN } from './config.ts';
import { createGame } from './game.ts';
import { generateMonsters, monsterFireInterval } from './level.ts';
import { at, atDepth } from './test-input.ts';
import type { Brick, Game, GameOptions, Monster, PlayerInput, Side } from './types.ts';

const DT = 1 / 60;

const cornerBrick = (): Brick => ({ id: 99, x: 160, y: 160, w: 48, h: 24, hp: 100000, maxHp: 100000 });

const monsterAt = (id: number, x: number, y: number, fire: number): Monster => ({
  id,
  pos: { x, y },
  radius: 36,
  hp: 1000,
  maxHp: 1000,
  boss: false,
  fire,
});

function newGame(monsters: Monster[], opts: Partial<GameOptions> = {}) {
  return createGame({ playerCount: 1, seed: 1, startLevel: 3, layout: () => [cornerBrick()], monsters: () => monsters, dropChance: 0, ...opts });
}

function run(game: Game, seconds: number, overrides: Partial<Record<Side, PlayerInput>> = {}) {
  for (let t = 0; t < seconds; t += DT) game.step(DT, game.state.players.map((p) => overrides[p.side] ?? at(400, p.side)));
}

describe('發射間隔隨關卡縮短', () => {
  test('第三關到第七關三秒', () => {
    for (const level of [3, 4, 6, 7]) expect(monsterFireInterval(level)).toBe(3);
  });

  test('之後每過五關縮短半秒', () => {
    expect(monsterFireInterval(8)).toBe(2.5);
    expect(monsterFireInterval(12)).toBe(2.5);
    expect(monsterFireInterval(13)).toBe(2);
    expect(monsterFireInterval(17)).toBe(2);
  });

  test('第十八關起固定一點五秒，不會再縮短', () => {
    for (const level of [18, 19, 30, 99]) expect(monsterFireInterval(level)).toBe(MONSTER_FIRE_INTERVAL_MIN);
    expect(MONSTER_FIRE_INTERVAL_MIN).toBe(1.5);
  });

  test('起始間隔是三秒', () => {
    expect(MONSTER_FIRE_INTERVAL).toBe(3);
  });

  test('實際發射的間隔就是該關卡的間隔', () => {
    const at8 = newGame([monsterAt(0, 400, 400, 2.5)], { startLevel: 8 });
    const times: number[] = [];
    let seen = 0;
    for (let t = 0; t < 8 && times.length < 3; t += DT) {
      at8.step(DT, [at(400)]);
      if (at8.state.bullets.length > seen) times.push(t);
      seen = at8.state.bullets.length;
    }

    expect(times).toHaveLength(3);
    expect(times[1]! - times[0]!).toBeCloseTo(2.5, 1);
    expect(times[2]! - times[1]!).toBeCloseTo(2.5, 1);
  });
});

describe('每隻怪物各自計時', () => {
  test('倒數會隨時間減少，歸零時發射一發並重新倒數一個間隔', () => {
    const game = newGame([monsterAt(0, 400, 400, 1)]);

    run(game, 0.5);
    expect(game.state.monsters[0]!.fire).toBeCloseTo(0.5, 1);
    expect(game.state.bullets).toHaveLength(0);

    run(game, 0.6);
    expect(game.state.bullets).toHaveLength(1);
    // 還剩 3 - 0.1 秒左右。
    expect(game.state.monsters[0]!.fire).toBeGreaterThan(2.7);
    expect(game.state.monsters[0]!.fire).toBeLessThanOrEqual(3);
  });

  test('多隻怪物各自在自己的時間發射，不是全部一起', () => {
    const game = newGame([monsterAt(0, 300, 300, 1), monsterAt(1, 500, 300, 2)]);

    run(game, 1.2);
    expect(game.state.bullets).toHaveLength(1);

    run(game, 1);
    expect(game.state.bullets).toHaveLength(2);
  });

  test('一隻怪物被打倒，其餘怪物的倒數不受影響', () => {
    const game = newGame([monsterAt(0, 300, 300, 1), monsterAt(1, 500, 300, 2)]);

    game.state.monsters = game.state.monsters.filter((m) => m.id !== 0);
    run(game, 1.2);
    expect(game.state.bullets).toHaveLength(0);

    run(game, 1);
    expect(game.state.bullets).toHaveLength(1);
  });

  test('場上子彈已達上限時所有怪物都不再發射，倒數照常重來', () => {
    const game = newGame([monsterAt(0, 300, 300, 0.1), monsterAt(1, 500, 300, 0.1)]);
    for (let i = 0; i < BULLET_CAP; i++) {
      game.state.bullets.push({ id: 9000 + i, pos: { x: 400, y: 200 }, vel: { x: 0, y: 0 }, source: 'monster' });
    }

    run(game, 0.3);

    expect(game.state.bullets).toHaveLength(BULLET_CAP);
    for (const m of game.state.monsters) expect(m.fire).toBeGreaterThan(2.5);
  });
});

describe('初始倒數錯開', () => {
  test('同一關多隻怪物的初始倒數互不相同', () => {
    for (const level of [3, 6, 9]) {
      const fires = generateMonsters(level, 5).map((m) => m.fire);
      expect(new Set(fires).size).toBe(fires.length);
    }
  });

  test('初始倒數在一個間隔內均勻錯開，沒有任何一隻一開局就發射', () => {
    const monsters = generateMonsters(9, 5);
    const interval = monsterFireInterval(9);

    const fires = monsters.map((m) => m.fire).sort((a, b) => a - b);
    expect(fires).toEqual([0.25, 0.5, 0.75, 1].map((r) => r * interval));
  });

  test('BOSS 用彈幕，不使用發射倒數', () => {
    expect(generateMonsters(5, 1)[0]!.fire).toBe(0);
  });

  test('開局後第一秒內不會有任何一隻同時齊射', () => {
    const game = createGame({ playerCount: 1, seed: 3, startLevel: 9, layout: () => [cornerBrick()], dropChance: 0 });
    const firstShots = new Set<number>();
    let seen = 0;

    for (let i = 0; i < 4 * 60; i++) {
      game.step(DT, [at(400)]);
      if (game.state.bullets.length > seen) firstShots.add(i);
      seen = game.state.bullets.length;
    }

    // 四隻怪物的第一發落在四個不同的畫面。
    expect(firstShots.size).toBeGreaterThanOrEqual(4);
  });
});

describe('目標只選活著的玩家', () => {
  test('死亡玩家不會被瞄準，子彈全部飛向活著的玩家的核心', () => {
    const game = newGame([monsterAt(0, 400, 400, 0.01)], { playerCount: 2, startLevel: 3 });
    const top = game.state.players.find((p) => p.side === 'top')!;
    top.lives = 0;
    top.dead = true;

    for (let shot = 0; shot < 30; shot++) {
      game.state.monsters[0]!.fire = 0.001;
      game.state.bullets = [];
      run(game, DT * 1.5);
      const b = game.state.bullets[0]!;
      // 活著的是下方玩家，子彈應該往下飛。
      expect(b.vel.y).toBeGreaterThan(0);
    }
  });

  test('子彈的速度固定，朝核心的方向', () => {
    const game = newGame([monsterAt(0, 400, 400, 0.01)]);

    game.step(DT, [at(400)]);

    const b = game.state.bullets[0]!;
    const m = game.state.monsters[0]!;
    // 核心在 (400, 794)；子彈從怪物目前的位置出發，朝它直線飛。
    const len = Math.hypot(400 - m.pos.x, 794 - m.pos.y);
    expect(Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(BULLET_SPEED, 5);
    expect(b.vel.x).toBeCloseTo(((400 - m.pos.x) / len) * BULLET_SPEED, 5);
    expect(b.vel.y).toBeCloseTo(((794 - m.pos.y) / len) * BULLET_SPEED, 5);
  });

  test('多位活著的玩家時，各隻怪物會挑到不同的玩家', () => {
    const targets = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const game = newGame([monsterAt(0, 400, 400, 0.01)], { playerCount: 2, seed });
      run(game, DT * 2);
      targets.add(game.state.bullets[0]!.vel.y > 0 ? 'bottom' : 'top');
    }

    expect(targets).toEqual(new Set(['bottom', 'top']));
  });

  test('瞄準目標是核心的實際位置，擋板往內移動後子彈仍瞄得到', () => {
    const game = newGame([monsterAt(0, 400, 400, 0.01)]);
    game.step(DT, [atDepth(400, 100)]);

    const b = game.state.bullets[0]!;
    const m = game.state.monsters[0]!;
    // 核心在 (400, 694)，不是貼邊的 (400, 794)。
    const len = Math.hypot(400 - m.pos.x, 694 - m.pos.y);
    expect(b.vel.x).toBeCloseTo(((400 - m.pos.x) / len) * BULLET_SPEED, 5);
    expect(b.vel.y).toBeCloseTo(((694 - m.pos.y) / len) * BULLET_SPEED, 5);
  });
});
