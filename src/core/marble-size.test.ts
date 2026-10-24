import { describe, expect, test } from 'bun:test';
import { createGame } from './game.ts';
import type { Brick, Game, GameOptions, Marble, Monster, PlayerInput, PowerUp, PowerUpKind, Side } from './types.ts';
import { at } from './test-input.ts';

const DT = 1 / 60;
const rightClick = (x: number): PlayerInput => ({ ...at(x), secondary: true });

const brickAt = (x: number, y: number, hp = 1): Brick => ({ id: 0, x, y, w: 48, h: 24, hp, maxHp: hp });
const cornerBrick = (): Brick => ({ ...brickAt(160, 160, 100000), id: 99 });
/** 擋在垂直射出路徑上的磚塊：x 從 376 到 424、y 從 300 到 324。 */
const pathBrick = (hp: number): Brick => ({ ...brickAt(376, 300, hp), id: 1 });

const monsterAt = (x: number, y: number, hp: number): Monster => ({ id: 0, pos: { x, y }, radius: 36, hp, maxHp: hp, boss: false, fire: 5 });

function newGame(opts: Partial<GameOptions> = {}) {
  return createGame({ playerCount: 1, seed: 1, layout: () => [cornerBrick()], dropChance: 0, ...opts });
}

function inputs(game: Game, x: number, first: PlayerInput = at(x)): PlayerInput[] {
  return game.state.players.map((p, i) => (i === 0 ? first : at(x, p.side)));
}

function step(game: Game, x = 400, first?: PlayerInput) {
  game.step(DT, inputs(game, x, first));
}

/** 量測用的細步長：一步只移動約 0.2 像素，所以反彈那一刻的位置誤差遠小於各種半徑的差距。 */
const FINE = 1 / 2000;
function stepFine(game: Game, x = 400) {
  game.step(FINE, inputs(game, x));
}

function launch(game: Game, x = 400): Marble {
  const before = game.state.marbles.length;
  step(game, x, rightClick(x));
  return game.state.marbles[before]!;
}

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

/** 接到放大或縮小道具，之後場上的彈珠與新發射的彈珠都用新的半徑。 */
function catchSize(game: Game, kind: 'enlarge' | 'shrink', batch = 99, id = 900, x = 400) {
  placeOnPaddle(game, 'bottom', kind, batch, id);
  step(game, x);
}

type Size = 'plain' | 'enlarge' | 'shrink';
const RADIUS: Record<Size, number> = { plain: 6, enlarge: 6 * 1.7, shrink: 6 * 0.6 };

/** 先射出一顆彈珠，再讓它在目前的大小效果下運行到 done 成立。 */
function sized(size: Size, opts: Partial<GameOptions> = {}) {
  const game = newGame(opts);
  if (size !== 'plain') catchSize(game, size);
  return game;
}

/** 推進到彈珠的垂直速度從向上變成向下（也就是剛反彈），回傳那一刻的位置。 */
function untilBounceDown(game: Game, marble: Marble, x = 400): { x: number; y: number } {
  for (let i = 0; i < 20000 && marble.vel.y <= 0; i++) stepFine(game, x);
  return { ...marble.pos };
}

describe('放大與縮小彈珠', () => {
  test('接到放大：整場效果記下放大與 6 秒；接到縮小：記下縮小與 6 秒', () => {
    const big = newGame();
    catchSize(big, 'enlarge');
    expect(big.state.effects.marbleSize).toEqual({ kind: 'enlarge', left: 6 });

    const small = newGame();
    catchSize(small, 'shrink');
    expect(small.state.effects.marbleSize).toEqual({ kind: 'shrink', left: 6 });
  });

  test('效果持續 6 秒，之後恢復原本的大小', () => {
    const game = newGame();
    catchSize(game, 'enlarge');

    for (let t = 0; t < 5.5; t += DT) step(game);
    expect(game.state.effects.marbleSize).not.toBeNull();
    for (let t = 0; t < 1; t += DT) step(game);

    expect(game.state.effects.marbleSize).toBeNull();
  });

  test('撞牆時彈珠的半徑：原本 6、放大 1.7 倍、縮小 0.6 倍', () => {
    for (const size of ['plain', 'enlarge', 'shrink'] as const) {
      const game = sized(size);
      const marble = launch(game);

      const hit = untilBounceDown(game, marble);

      expect(hit.y).toBeCloseTo(RADIUS[size], 0);
    }
  });

  test('大小變化立即作用在場上全部彈珠', () => {
    const game = newGame();
    const first = launch(game, 300);
    const second = launch(game, 500);
    expect(game.state.marbles).toHaveLength(2);

    catchSize(game, 'enlarge', 99, 900, 500);

    // 兩顆彈珠都還在途中，碰到上方的牆時都用放大後的半徑。
    expect(untilBounceDown(game, first, 400).y).toBeCloseTo(RADIUS.enlarge, 0);
    expect(untilBounceDown(game, second, 400).y).toBeCloseTo(RADIUS.enlarge, 0);
  });

  test('效果期間新發射的彈珠也使用目前的半徑', () => {
    const game = newGame();
    catchSize(game, 'shrink');
    const later = launch(game);

    expect(untilBounceDown(game, later).y).toBeCloseTo(RADIUS.shrink, 0);
  });

  test('多球分裂出的彈珠使用同一個半徑', () => {
    const game = newGame();
    catchSize(game, 'enlarge');
    const original = launch(game);
    placeOnPaddle(game, 'bottom', 'multiball');
    step(game);
    expect(game.state.marbles).toHaveLength(3);

    for (let t = 0; t < 3 && game.state.marbles.some((m) => m.vel.y < 0); t += DT) step(game);

    // 上牆反彈後每顆彈珠的中心至少離牆一個放大後的半徑。
    for (const m of game.state.marbles) expect(m.pos.y).toBeGreaterThanOrEqual(RADIUS.enlarge - 1e-6);
    expect(original.pos.y).toBeGreaterThanOrEqual(RADIUS.enlarge - 1e-6);
  });

  test('放大與縮小是同一個維度：後接到的覆蓋前一個並重新計時', () => {
    const game = newGame();
    catchSize(game, 'enlarge', 1, 1);
    for (let t = 0; t < 3; t += DT) step(game);
    expect(game.state.effects.marbleSize!.left).toBeLessThan(3.1);

    catchSize(game, 'shrink', 2, 2);
    expect(game.state.effects.marbleSize).toEqual({ kind: 'shrink', left: 6 });

    catchSize(game, 'enlarge', 3, 3);
    expect(game.state.effects.marbleSize).toEqual({ kind: 'enlarge', left: 6 });
  });

  test('同一批只有第一個被接到的生效，其他玩家方位的同批道具消失', () => {
    const game = newGame({ playerCount: 2 });
    placeOnPaddle(game, 'bottom', 'enlarge', 7, 1);
    const far = placeOnPaddle(game, 'top', 'enlarge', 7, 2);
    far.pos.y = 300;

    step(game);

    expect(game.state.effects.marbleSize).toEqual({ kind: 'enlarge', left: 6 });
    expect(game.state.powerUps).toHaveLength(0);
  });

  test('磚塊碰撞使用目前的半徑：反彈時彈珠中心離磚塊下緣一個半徑', () => {
    for (const size of ['plain', 'enlarge', 'shrink'] as const) {
      const game = sized(size, { layout: () => [pathBrick(9), cornerBrick()] });
      const marble = launch(game);

      const hit = untilBounceDown(game, marble);

      expect(hit.y).toBeCloseTo(324 + RADIUS[size], 0);
    }
  });

  test('怪物碰撞使用目前的半徑：反彈時彈珠中心離怪物一個怪物半徑加彈珠半徑', () => {
    for (const size of ['plain', 'enlarge', 'shrink'] as const) {
      const monster = monsterAt(400, 400, 99);
      const game = sized(size, { monsters: () => [monster] });
      const marble = launch(game);
      const pin = () => {
        monster.pos.x = 400;
        monster.pos.y = 400;
      };
      for (let i = 0; i < 10000 && marble.vel.y <= 0; i++) {
        pin();
        stepFine(game);
      }

      expect(Math.hypot(marble.pos.x - 400, marble.pos.y - 400)).toBeCloseTo(36 + RADIUS[size], 0);
    }
  });

  test('漏接判定使用目前的半徑：放大的彈珠要飛得更遠才算離開', () => {
    const farthest = (size: Size) => {
      const game = sized(size);
      const marble = launch(game);
      let farthestY = 0;
      for (let i = 0; i < 40000 && game.state.marbles.includes(marble); i++) {
        stepFine(game, 700);
        if (game.state.marbles.includes(marble)) farthestY = Math.max(farthestY, marble.pos.y);
      }
      expect(game.state.marbles).not.toContain(marble);
      return farthestY;
    };

    // 整顆越過下緣才算離開：中心飛到 800 加上半徑之外。
    expect(farthest('plain')).toBeCloseTo(800 + RADIUS.plain, 0);
    expect(farthest('enlarge')).toBeCloseTo(800 + RADIUS.enlarge, 0);
    expect(farthest('shrink')).toBeCloseTo(800 + RADIUS.shrink, 0);
  });

  test('擋板接球使用目前的半徑：放大的彈珠在更高的位置就被擋板接住', () => {
    const catchHeight = (size: Size) => {
      const game = sized(size);
      const marble = launch(game);
      // 先等它碰牆折返，再看它被擋板接住（向上）的瞬間。
      for (let i = 0; i < 20000 && marble.vel.y <= 0; i++) stepFine(game);
      for (let i = 0; i < 20000 && marble.vel.y >= 0; i++) stepFine(game);
      return marble.pos.y;
    };

    // 接球線在擋板厚度 12 加上彈珠半徑之處。
    expect(800 - catchHeight('plain')).toBeCloseTo(12 + RADIUS.plain, 0);
    expect(800 - catchHeight('enlarge')).toBeCloseTo(12 + RADIUS.enlarge, 0);
    expect(800 - catchHeight('shrink')).toBeCloseTo(12 + RADIUS.shrink, 0);
  });

  test('縮小的彈珠高速飛行時也不會穿過磚塊', () => {
    const game = newGame({ layout: () => [pathBrick(9), cornerBrick()] });
    catchSize(game, 'shrink');
    const marble = launch(game);

    // 一次推進很大的時間步長，切片步長要隨半徑縮小才不會穿過去。
    for (let i = 0; i < 80 && marble.vel.y <= 0; i++) game.step(0.05, inputs(game, 400));

    expect(marble.vel.y).toBeGreaterThan(0);
    expect(marble.pos.y).toBeGreaterThan(324);
  });
});
