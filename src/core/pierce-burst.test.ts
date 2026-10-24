import { describe, expect, test } from 'bun:test';
import { createGame } from './game.ts';
import type { Brick, Game, GameOptions, Marble, Monster, PlayerInput, PowerUp, PowerUpKind, Side } from './types.ts';

const at = (x: number): PlayerInput => ({ pointer: { x, y: 0 }, primary: false, secondary: false });
const rightClick = (x: number): PlayerInput => ({ ...at(x), secondary: true });
const DT = 1 / 60;

const brickAt = (x: number, y: number, hp = 1): Brick => ({ id: 0, x, y, w: 48, h: 24, hp, maxHp: hp });
/** 躲在角落、不會擋到中線彈珠的磚塊，讓關卡不會一開始就算清空。 */
const cornerBrick = () => ({ ...brickAt(160, 160, 100000), id: 99 });
/** 擋在垂直射出路徑上的磚塊，中心是 (400, 312)。 */
const pathBrick = (hp: number) => ({ ...brickAt(376, 300, hp), id: 1 });

const monsterAt = (x: number, y: number, hp: number): Monster => ({
  id: 0,
  pos: { x, y },
  radius: 36,
  hp,
  maxHp: hp,
  boss: false,
});

function newGame(opts: Partial<GameOptions> = {}) {
  return createGame({ playerCount: 1, seed: 1, layout: () => [cornerBrick()], dropChance: 0, ...opts });
}

/** 所有玩家的指標都停在 x，只有第一位玩家額外帶著 first 的按鍵。 */
function inputs(game: Game, x: number, first: PlayerInput = at(x)): PlayerInput[] {
  return game.state.players.map((_, i) => (i === 0 ? first : at(x)));
}

function step(game: Game, x = 400, first?: PlayerInput) {
  game.step(DT, inputs(game, x, first));
}

function runUntil(game: Game, done: () => boolean, maxSeconds = 20) {
  for (let t = 0; t < maxSeconds && !done(); t += DT) step(game);
}

/** 從下方垂直射出一顆彈珠並回傳它。 */
function launch(game: Game): Marble {
  const before = game.state.marbles.length;
  step(game, 400, rightClick(400));
  return game.state.marbles[before]!;
}

/** 直接把道具放在某位玩家的擋板上，下一步就會被拾取。 */
function placeOnPaddle(game: Game, side: Side, kind: PowerUpKind, batch = 99, id = 900): PowerUp {
  const player = game.state.players.find((p) => p.side === side)!;
  const pos =
    side === 'bottom'
      ? { x: player.paddle, y: 790 }
      : side === 'top'
        ? { x: player.paddle, y: 10 }
        : side === 'left'
          ? { x: 10, y: player.paddle }
          : { x: 790, y: player.paddle };
  const powerUp: PowerUp = { id, batch, kind, side, pos };
  game.state.powerUps.push(powerUp);
  return powerUp;
}

const directionDeg = (m: Marble) => (((Math.atan2(m.vel.y, m.vel.x) * 180) / Math.PI) % 360 + 360) % 360;
const speedOf = (m: Marble) => Math.hypot(m.vel.x, m.vel.y);

describe('貫通', () => {
  test('接到貫通時，場上所有彈珠的貫通剩餘秒數設為 6；之後才發射的彈珠沒有貫通', () => {
    const game = newGame();
    launch(game);
    launch(game);
    expect(game.state.marbles.every((m) => m.pierce === 0)).toBe(true);

    placeOnPaddle(game, 'bottom', 'pierce');
    step(game);

    expect(game.state.marbles).toHaveLength(2);
    expect(game.state.marbles.map((m) => m.pierce)).toEqual([6, 6]);

    const later = launch(game);
    expect(later.pierce).toBe(0);
  });

  test('貫通中的彈珠隨時間倒數', () => {
    const game = newGame();
    const marble = launch(game);
    marble.pierce = 6;

    for (let i = 0; i < 60; i++) step(game);

    expect(marble.pierce).toBeCloseTo(5, 1);
  });

  test('貫通的彈珠穿過磚塊不反彈，硬磚只扣 1 血', () => {
    const game = newGame({ layout: () => [pathBrick(3), cornerBrick()] });
    const marble = launch(game);
    marble.pierce = 6;

    runUntil(game, () => marble.pos.y < 270);

    const brick = game.state.bricks.find((b) => b.id === 1)!;
    expect(brick.hp).toBe(2);
    expect(marble.vel.y).toBeLessThan(0);
    expect(marble.vel.x).toBe(0);
  });

  test('貫通的彈珠打穿 1 血的磚塊：照常得分並移除', () => {
    const game = newGame({ layout: () => [pathBrick(1), cornerBrick()] });
    const marble = launch(game);
    marble.pierce = 6;

    runUntil(game, () => marble.pos.y < 270);

    expect(game.state.bricks.map((b) => b.id)).toEqual([99]);
    expect(game.state.score).toBe(10);
    expect(marble.vel.y).toBeLessThan(0);
  });

  test('貫通的彈珠一次打穿疊在路徑上的好幾塊磚', () => {
    const column = [0, 1, 2].map((r) => ({ ...brickAt(376, 300 - r * 24, 1), id: r + 1 }));
    const game = newGame({ layout: () => [...column, cornerBrick()] });
    const marble = launch(game);
    marble.pierce = 6;

    runUntil(game, () => marble.pos.y < 200);

    expect(game.state.bricks.map((b) => b.id)).toEqual([99]);
    expect(game.state.score).toBe(30);
    expect(marble.vel.y).toBeLessThan(0);
  });

  test('貫通倒數歸零後，彈珠恢復碰到磚塊就反彈', () => {
    const game = newGame({ layout: () => [pathBrick(3), cornerBrick()] });
    const marble = launch(game);
    marble.pierce = 0.01;

    runUntil(game, () => marble.vel.y > 0);

    expect(marble.vel.y).toBeGreaterThan(0);
    expect(game.state.bricks.find((b) => b.id === 1)!.hp).toBe(2);
  });

  test('貫通的彈珠穿過怪物，每次進入只扣 1 血，離開後再進入才再扣', () => {
    const monster = monsterAt(400, 400, 10);
    const game = newGame({ monsters: () => [monster] });
    const marble = launch(game);
    marble.pierce = 6;
    const pinned = () => {
      // 怪物會緩慢遊走，固定在彈珠的路徑上才能檢查扣血次數。
      monster.pos.x = 400;
      monster.pos.y = 400;
    };
    const advance = () => {
      pinned();
      step(game);
    };

    for (let t = 0; t < 5 && marble.pos.y > 340; t += DT) advance();
    expect(monster.hp).toBe(9);
    expect(marble.vel.y).toBeLessThan(0);

    // 碰到上方的牆反彈後，再次穿過怪物。
    for (let t = 0; t < 5 && marble.vel.y < 0; t += DT) advance();
    for (let t = 0; t < 5 && marble.pos.y < 460; t += DT) advance();
    expect(monster.hp).toBe(8);
  });

  test('留在怪物內部不會每個小步長都扣血', () => {
    const monster = monsterAt(400, 400, 2);
    const game = newGame({ monsters: () => [monster] });
    const marble = launch(game);
    marble.pierce = 6;
    const pin = () => {
      monster.pos.x = 400;
      monster.pos.y = 400;
    };

    // 彈珠穿過怪物要花 0.17 秒以上，若每個小步長都扣血，2 血的怪物會在第一次穿過時就倒下。
    for (let t = 0; t < 5 && marble.pos.y > 340; t += DT) {
      pin();
      step(game);
    }
    expect(game.state.monsters).toHaveLength(1);
    expect(monster.hp).toBe(1);
  });

  test('貫通的彈珠仍然被牆與擋板反彈', () => {
    const game = newGame();
    const marble = launch(game);
    marble.pierce = 6;

    runUntil(game, () => marble.vel.y > 0);
    expect(marble.pos.y).toBeLessThan(20);

    runUntil(game, () => marble.vel.y < 0);
    expect(game.state.marbles).toHaveLength(1);
    expect(marble.pierce).toBeGreaterThan(0);
  });

  test('再接到貫通時重新計時，不疊加', () => {
    const game = newGame();
    const marble = launch(game);
    marble.pierce = 2;

    placeOnPaddle(game, 'bottom', 'pierce');
    step(game);

    expect(marble.pierce).toBe(6);
  });

  test('同一批貫通只有第一個被接到的生效，其他玩家方位的同批道具消失', () => {
    const game = newGame({ playerCount: 2 });
    launch(game);
    placeOnPaddle(game, 'bottom', 'pierce', 7, 900);
    placeOnPaddle(game, 'top', 'pierce', 7, 901);

    step(game);

    expect(game.state.marbles.every((m) => m.pierce === 6)).toBe(true);
    expect(game.state.powerUps).toHaveLength(0);
  });

  test('多球分裂出的彈珠繼承原彈珠的貫通剩餘時間', () => {
    const game = newGame();
    const marble = launch(game);
    marble.pierce = 4;

    placeOnPaddle(game, 'bottom', 'multiball');
    step(game);

    expect(game.state.marbles).toHaveLength(3);
    for (const m of game.state.marbles) expect(m.pierce).toBeGreaterThan(3.9);
  });

  test('沒有貫通的彈珠分裂出的彈珠也沒有貫通', () => {
    const game = newGame();
    launch(game);

    placeOnPaddle(game, 'bottom', 'multiball');
    step(game);

    expect(game.state.marbles.every((m) => m.pierce === 0)).toBe(true);
  });
});

describe('環爆', () => {
  test('場上一顆彈珠分裂成 10 顆，速度大小不變，方向間隔 36 度', () => {
    const game = newGame();
    const original = launch(game);
    const speed = speedOf(original);

    placeOnPaddle(game, 'bottom', 'burst');
    step(game);

    const marbles = game.state.marbles;
    expect(marbles).toHaveLength(10);
    for (const m of marbles) expect(speedOf(m)).toBeCloseTo(speed, 6);

    const angles = marbles.map(directionDeg).sort((a, b) => a - b);
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? angles[i + 1]! : angles[0]! + 360;
      expect(next - angles[i]!).toBeCloseTo(36, 6);
    }
  });

  test('原本那顆彈珠保留，繼續朝原來的方向飛', () => {
    const game = newGame();
    const original = launch(game);

    placeOnPaddle(game, 'bottom', 'burst');
    step(game);

    expect(game.state.marbles[0]).toBe(original);
    expect(original.vel.x).toBeCloseTo(0, 6);
    expect(original.vel.y).toBeLessThan(0);
  });

  test('場上每顆彈珠都分裂', () => {
    const game = newGame();
    launch(game);
    launch(game);

    placeOnPaddle(game, 'bottom', 'burst');
    step(game);

    expect(game.state.marbles).toHaveLength(20);
  });

  test('分裂後場上彈珠總數不超過 100 顆，超過的不產生', () => {
    const game = newGame();
    for (let i = 0; i < 15; i++) {
      game.state.marbles.push({ id: 500 + i, pos: { x: 300 + i * 10, y: 500 }, vel: { x: 0, y: -100 }, pierce: 0 });
    }

    placeOnPaddle(game, 'bottom', 'burst');
    step(game);

    expect(game.state.marbles).toHaveLength(100);
  });

  test('場上沒有彈珠時什麼都不會發生，也不影響彈珠池', () => {
    const game = newGame();
    const pool = game.state.pool;

    placeOnPaddle(game, 'bottom', 'burst');
    step(game);

    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.pool).toBe(pool);
    expect(game.state.powerUps).toHaveLength(0);
  });

  test('分裂出的彈珠繼承原彈珠的貫通剩餘時間', () => {
    const game = newGame();
    const marble = launch(game);
    marble.pierce = 3;

    placeOnPaddle(game, 'bottom', 'burst');
    step(game);

    expect(game.state.marbles).toHaveLength(10);
    for (const m of game.state.marbles) expect(m.pierce).toBeGreaterThan(2.9);
  });

  test('同一批環爆只有第一個被接到的生效', () => {
    const game = newGame({ playerCount: 2 });
    launch(game);
    placeOnPaddle(game, 'bottom', 'burst', 7, 900);
    placeOnPaddle(game, 'top', 'burst', 7, 901);

    step(game);

    expect(game.state.marbles).toHaveLength(10);
    expect(game.state.powerUps).toHaveLength(0);
  });
});

describe('道具權重', () => {
  /** 每個種子擊碎一塊磚並一定掉落，回傳掉出的道具種類。 */
  function dropKinds(seeds: number, opts: Partial<GameOptions> = {}): PowerUpKind[] {
    const kinds: PowerUpKind[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const game = createGame({
        playerCount: 1,
        seed,
        layout: () => [pathBrick(1), cornerBrick()],
        dropChance: 1,
        ...opts,
      });
      launch(game);
      runUntil(game, () => game.state.powerUps.length > 0, 3);
      if (game.state.powerUps[0]) kinds.push(game.state.powerUps[0].kind);
    }
    return kinds;
  }

  const share = (kinds: PowerUpKind[], kind: PowerUpKind) => kinds.filter((k) => k === kind).length / kinds.length;

  test('大量抽選時，各種道具的比例落在權重預期的範圍內', () => {
    const kinds = dropKinds(1000);

    expect(kinds).toHaveLength(1000);
    expect(share(kinds, 'multiball')).toBeGreaterThan(0.24);
    expect(share(kinds, 'multiball')).toBeLessThan(0.36);
    expect(share(kinds, 'supply')).toBeGreaterThan(0.19);
    expect(share(kinds, 'supply')).toBeLessThan(0.31);
    expect(share(kinds, 'widen')).toBeGreaterThan(0.19);
    expect(share(kinds, 'widen')).toBeLessThan(0.31);
    expect(share(kinds, 'pierce')).toBeGreaterThan(0.1);
    expect(share(kinds, 'pierce')).toBeLessThan(0.2);
    expect(share(kinds, 'burst')).toBeGreaterThan(0.02);
    expect(share(kinds, 'burst')).toBeLessThan(0.09);
  });

  test('多球是最常出現的道具，環爆是最少的', () => {
    const kinds = dropKinds(600);
    const counts = (['multiball', 'supply', 'widen', 'pierce', 'burst'] as const).map((k) => share(kinds, k));

    expect(counts[0]).toBe(Math.max(...counts));
    expect(counts[4]).toBe(Math.min(...counts));
  });

  test('限定可掉落的種類時，只在限定的種類中抽選', () => {
    const kinds = dropKinds(200, { powerUpKinds: ['pierce', 'burst'] });

    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((k) => k === 'pierce' || k === 'burst')).toBe(true);
    expect(kinds.some((k) => k === 'pierce')).toBe(true);
    expect(kinds.some((k) => k === 'burst')).toBe(true);
  });

  test('怪物血量門檻的必掉也依權重抽，種類多樣', () => {
    const kinds = new Set<PowerUpKind>();
    for (let seed = 1; seed <= 120; seed++) {
      const monster: Monster = { ...monsterAt(400, 560, 2), maxHp: 3 };
      const game = createGame({
        playerCount: 1,
        seed,
        layout: () => [cornerBrick()],
        monsters: () => [monster],
        dropChance: 0,
      });
      launch(game);
      runUntil(game, () => game.state.powerUps.length > 0, 3);
      if (game.state.powerUps[0]) kinds.add(game.state.powerUps[0].kind);
    }

    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });
});
