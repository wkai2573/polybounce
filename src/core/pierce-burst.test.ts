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

/** 整場貫通：直接把倒數設到 3 秒，等同剛接到貫通。 */
const startPierce = (game: Game) => {
  game.state.effects.pierce = 3;
};

describe('貫通（整場效果）', () => {
  test('接到貫通時，整場貫通倒數設為 3 秒', () => {
    const game = newGame();
    launch(game);
    expect(game.state.effects.pierce).toBe(0);

    placeOnPaddle(game, 'bottom', 'pierce');
    step(game);

    expect(game.state.effects.pierce).toBe(3);
  });

  test('整場貫通期間新發射的彈珠也貫通：穿過磚塊不反彈', () => {
    const game = newGame({ layout: () => [pathBrick(3), cornerBrick()] });
    startPierce(game);
    const later = launch(game);

    runUntil(game, () => later.pos.y < 270);

    expect(game.state.bricks.find((b) => b.id === 1)!.hp).toBe(2);
    expect(later.vel.y).toBeLessThan(0);
    expect(later.vel.x).toBe(0);
  });

  test('倒數隨時間減少，狀態裡只有一個倒數，彈珠沒有各自的貫通欄位', () => {
    const game = newGame();
    const marble = launch(game);
    startPierce(game);

    for (let i = 0; i < 60; i++) step(game);

    expect(game.state.effects.pierce).toBeCloseTo(2, 1);
    expect('pierce' in marble).toBe(false);
  });

  test('貫通的彈珠穿過磚塊不反彈，硬磚只扣 1 血', () => {
    const game = newGame({ layout: () => [pathBrick(3), cornerBrick()] });
    const marble = launch(game);
    startPierce(game);

    runUntil(game, () => marble.pos.y < 270);

    const brick = game.state.bricks.find((b) => b.id === 1)!;
    expect(brick.hp).toBe(2);
    expect(marble.vel.y).toBeLessThan(0);
    expect(marble.vel.x).toBe(0);
  });

  test('貫通的彈珠打穿 1 血的磚塊：照常得分並移除', () => {
    const game = newGame({ layout: () => [pathBrick(1), cornerBrick()] });
    const marble = launch(game);
    startPierce(game);

    runUntil(game, () => marble.pos.y < 270);

    expect(game.state.bricks.map((b) => b.id)).toEqual([99]);
    expect(game.state.score).toBe(10);
    expect(marble.vel.y).toBeLessThan(0);
  });

  test('貫通的彈珠一次打穿疊在路徑上的好幾塊磚', () => {
    const column = [0, 1, 2].map((r) => ({ ...brickAt(376, 300 - r * 24, 1), id: r + 1 }));
    const game = newGame({ layout: () => [...column, cornerBrick()] });
    const marble = launch(game);
    startPierce(game);

    runUntil(game, () => marble.pos.y < 200);

    expect(game.state.bricks.map((b) => b.id)).toEqual([99]);
    expect(game.state.score).toBe(30);
    expect(marble.vel.y).toBeLessThan(0);
  });

  test('貫通倒數歸零後，彈珠恢復碰到磚塊就反彈', () => {
    const game = newGame({ layout: () => [pathBrick(3), cornerBrick()] });
    const marble = launch(game);
    game.state.effects.pierce = 0.01;

    runUntil(game, () => marble.vel.y > 0);

    expect(marble.vel.y).toBeGreaterThan(0);
    expect(game.state.bricks.find((b) => b.id === 1)!.hp).toBe(2);
  });

  test('貫通的彈珠穿過怪物，每次進入只扣 1 血，離開後再進入才再扣', () => {
    const monster = monsterAt(400, 400, 10);
    const game = newGame({ monsters: () => [monster] });
    const marble = launch(game);
    game.state.effects.pierce = 20;
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
    startPierce(game);
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
    game.state.effects.pierce = 20;

    runUntil(game, () => marble.vel.y > 0);
    expect(marble.pos.y).toBeLessThan(20);

    runUntil(game, () => marble.vel.y < 0);
    expect(game.state.marbles).toHaveLength(1);
    expect(game.state.effects.pierce).toBeGreaterThan(0);
  });

  test('再接到貫通時重新計時，不疊加', () => {
    const game = newGame();
    launch(game);
    game.state.effects.pierce = 1;

    placeOnPaddle(game, 'bottom', 'pierce');
    step(game);

    expect(game.state.effects.pierce).toBe(3);
  });

  test('同一批貫通只有第一個被接到的生效，其他玩家方位的同批道具消失', () => {
    const game = newGame({ playerCount: 2 });
    launch(game);
    placeOnPaddle(game, 'bottom', 'pierce', 7, 900);
    placeOnPaddle(game, 'top', 'pierce', 7, 901);

    step(game);

    expect(game.state.effects.pierce).toBe(3);
    expect(game.state.powerUps).toHaveLength(0);
  });

  test('多球與環爆分裂出的彈珠在貫通期間同樣貫通，不需要繼承', () => {
    const game = newGame({ layout: () => [pathBrick(9), cornerBrick()] });
    launch(game);
    startPierce(game);

    placeOnPaddle(game, 'bottom', 'multiball');
    step(game);

    expect(game.state.marbles).toHaveLength(3);
    // 三顆彈珠都在同一個整場倒數之下。
    expect(game.state.effects.pierce).toBeGreaterThan(2.9);
    for (const m of game.state.marbles) expect('pierce' in m).toBe(false);
  });

  test('貫通期間才分裂出的彈珠一起穿過整排磚塊，不被反彈', () => {
    const row = Array.from({ length: 10 }, (_, c) => ({ ...brickAt(160 + c * 48, 300, 9), id: c + 1 }));
    const game = newGame({ layout: () => [...row, cornerBrick()] });
    launch(game);
    startPierce(game);
    placeOnPaddle(game, 'bottom', 'multiball');
    step(game);
    expect(game.state.marbles).toHaveLength(3);

    runUntil(game, () => game.state.marbles.every((m) => m.pos.y < 250), 3);

    expect(game.state.marbles.every((m) => m.pos.y < 250 && m.vel.y < 0)).toBe(true);
    expect(row.some((b) => game.state.bricks.find((x) => x.id === b.id)!.hp < 9)).toBe(true);
  });

  test('倒數結束後新發射的彈珠恢復碰到磚塊就反彈', () => {
    const game = newGame({ layout: () => [pathBrick(9), cornerBrick()] });
    game.state.effects.pierce = 0.05;
    for (let i = 0; i < 10; i++) step(game);
    expect(game.state.effects.pierce).toBe(0);

    const later = launch(game);
    runUntil(game, () => later.vel.y > 0);

    expect(later.vel.y).toBeGreaterThan(0);
    expect(game.state.bricks.find((b) => b.id === 1)!.hp).toBe(8);
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
      game.state.marbles.push({ id: 500 + i, pos: { x: 300 + i * 10, y: 500 }, vel: { x: 0, y: -100 } });
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
  const ALL_KINDS: PowerUpKind[] = ['multiball', 'supply', 'widen', 'pierce', 'burst', 'enlarge', 'heal', 'shorten', 'shrink'];

  test('大量抽選時，各種道具的比例落在權重預期的範圍內', () => {
    const kinds = dropKinds(1000);

    expect(kinds).toHaveLength(1000);
    // 權重合計 130：多球 30、補給 25、加寬 25、貫通 15、放大 12、補血 8、環爆 5、縮短 5、縮小 5。
    const within = (kind: PowerUpKind, lo: number, hi: number) => {
      expect(share(kinds, kind)).toBeGreaterThan(lo);
      expect(share(kinds, kind)).toBeLessThan(hi);
    };
    within('multiball', 0.18, 0.28);
    within('supply', 0.14, 0.25);
    within('widen', 0.14, 0.25);
    within('pierce', 0.07, 0.16);
    within('enlarge', 0.05, 0.14);
    within('heal', 0.03, 0.1);
    within('burst', 0.01, 0.07);
    within('shorten', 0.01, 0.07);
    within('shrink', 0.01, 0.07);
  });

  test('nerf 約佔磚塊掉落的 8%', () => {
    const kinds = dropKinds(1000);
    const nerfs = share(kinds, 'shorten') + share(kinds, 'shrink');

    expect(nerfs).toBeGreaterThan(0.04);
    expect(nerfs).toBeLessThan(0.13);
  });

  test('多球是最常出現的道具，環爆與兩個 nerf 是最少的', () => {
    const kinds = dropKinds(1000);
    const rare = (['burst', 'shorten', 'shrink'] as const).map((k) => share(kinds, k));
    const common = (['supply', 'widen', 'pierce'] as const).map((k) => share(kinds, k));

    expect(share(kinds, 'multiball')).toBe(Math.max(...ALL_KINDS.map((k) => share(kinds, k))));
    expect(Math.max(...rare)).toBeLessThan(Math.min(...common));
  });

  test('限定可掉落的種類時，只在限定的種類中抽選', () => {
    const kinds = dropKinds(200, { powerUpKinds: ['pierce', 'burst'] });

    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((k) => k === 'pierce' || k === 'burst')).toBe(true);
    expect(kinds.some((k) => k === 'pierce')).toBe(true);
    expect(kinds.some((k) => k === 'burst')).toBe(true);
  });

  /** 怪物血量從 2 降到 1（跨過 66% 的門檻）的瞬間必掉一次，回傳每個種子掉出的種類。 */
  function monsterDropKinds(seeds: number, opts: Partial<GameOptions> = {}): PowerUpKind[] {
    const kinds: PowerUpKind[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const monster: Monster = { ...monsterAt(400, 560, 2), maxHp: 3 };
      const game = createGame({
        playerCount: 1,
        seed,
        layout: () => [cornerBrick()],
        monsters: () => [monster],
        dropChance: 0,
        ...opts,
      });
      launch(game);
      runUntil(game, () => game.state.powerUps.length > 0, 3);
      if (game.state.powerUps[0]) kinds.push(game.state.powerUps[0].kind);
    }
    return kinds;
  }

  test('怪物血量門檻的必掉也依權重抽，種類多樣', () => {
    const kinds = new Set(monsterDropKinds(120));

    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  test('怪物必掉不包含 nerf：縮短擋板與縮小彈珠不會從怪物掉出', () => {
    const kinds = monsterDropKinds(300);

    expect(kinds.length).toBe(300);
    expect(kinds.some((k) => k === 'shorten' || k === 'shrink')).toBe(false);
    expect(kinds.some((k) => k === 'heal')).toBe(true);
  });

  test('怪物必掉只會抽到必掉清單內的種類（縮小的清單）', () => {
    const kinds = monsterDropKinds(100, { monsterDropKinds: ['supply', 'burst'] });

    expect(kinds.length).toBe(100);
    expect(kinds.every((k) => k === 'supply' || k === 'burst')).toBe(true);
    expect(kinds.some((k) => k === 'supply')).toBe(true);
    expect(kinds.some((k) => k === 'burst')).toBe(true);
  });

  test('磚塊掉落與怪物必掉各用各的清單：限定磚塊清單不影響怪物，反之亦然', () => {
    const brickOnly = dropKinds(100, { powerUpKinds: ['shrink'], monsterDropKinds: ['supply'] });
    const monsterOnly = monsterDropKinds(100, { powerUpKinds: ['shrink'], monsterDropKinds: ['supply'] });

    expect(brickOnly.every((k) => k === 'shrink')).toBe(true);
    expect(monsterOnly.every((k) => k === 'supply')).toBe(true);
  });
});
