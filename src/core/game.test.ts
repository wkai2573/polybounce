import { describe, expect, test } from 'bun:test';
import { PADDLE_WIDTH } from './config.ts';
import { createGame } from './game.ts';
import type { Brick, Game, GameOptions, PlayerInput } from './types.ts';

const at = (x: number, y = 0): PlayerInput => ({ pointer: { x, y }, primary: false, secondary: false });

describe('開局狀態', () => {
  test('單人從第 1 關開始，玩家在下方，彈珠池 10 顆、場上沒有彈珠', () => {
    const { state } = createGame({ playerCount: 1, seed: 1 });

    expect(state.status).toBe('playing');
    expect(state.level).toBe(1);
    expect(state.score).toBe(0);
    expect(state.pool).toBe(10);
    expect(state.marbles).toHaveLength(0);
    expect(state.bricks.length).toBeGreaterThan(0);
    expect(state.players.map((p) => p.side)).toEqual(['bottom']);
  });

  test('每多一位玩家就多一個方位與 10 顆彈珠', () => {
    const { state } = createGame({ playerCount: 3, seed: 1 });

    expect(state.pool).toBe(30);
    expect(state.players.map((p) => p.side)).toEqual(['bottom', 'top', 'left']);
  });
});

describe('擋板移動', () => {
  test('擋板跟著指標沿自己那一邊移動', () => {
    const game = createGame({ playerCount: 1, seed: 1 });

    game.step(1 / 60, [at(300)]);

    expect(game.state.players[0]!.paddle).toBe(300);
  });

  test('擋板不會超出場地', () => {
    const game = createGame({ playerCount: 1, seed: 1 });

    game.step(1 / 60, [at(-50)]);
    expect(game.state.players[0]!.paddle).toBe(PADDLE_WIDTH / 2);

    game.step(1 / 60, [at(5000)]);
    expect(game.state.players[0]!.paddle).toBe(800 - PADDLE_WIDTH / 2);
  });
});

const rightClick = (x: number): PlayerInput => ({ ...at(x), secondary: true });

describe('發射', () => {
  test('右鍵從擋板中央垂直射出一顆彈珠，彈珠池減一', () => {
    const game = createGame({ playerCount: 1, seed: 1 });

    game.step(1 / 60, [rightClick(300)]);

    const { state } = game;
    expect(state.pool).toBe(9);
    expect(state.marbles).toHaveLength(1);
    const m = state.marbles[0]!;
    expect(m.pos.x).toBeCloseTo(300);
    expect(m.pos.y).toBeLessThan(800 - 12);
    expect(m.vel.x).toBeCloseTo(0);
    expect(m.vel.y).toBeCloseTo(-420);
  });
});

const leftClick = (x: number, y: number): PlayerInput => ({ pointer: { x, y }, primary: true, secondary: false });

describe('瞄準模式', () => {
  test('左鍵進入瞄準模式：擋板被鎖住，也不會射出彈珠', () => {
    const game = createGame({ playerCount: 1, seed: 1 });

    game.step(1 / 60, [leftClick(300, 400)]);
    game.step(1 / 60, [at(500, 400)]);

    const { state } = game;
    expect(state.players[0]!.aiming).toBe(true);
    expect(state.players[0]!.paddle).toBe(300);
    expect(state.marbles).toHaveLength(0);
    expect(state.pool).toBe(10);
  });

  test('瞄準時再按左鍵，朝指標方向射出並離開瞄準模式', () => {
    const game = createGame({ playerCount: 1, seed: 1 });
    game.step(1 / 60, [leftClick(300, 400)]);

    game.step(1 / 60, [leftClick(400, 681)]);

    const { state } = game;
    const v = state.marbles[0]!.vel;
    expect(state.players[0]!.aiming).toBe(false);
    expect(state.pool).toBe(9);
    expect(v.x).toBeCloseTo(420 * Math.SQRT1_2);
    expect(v.y).toBeCloseTo(-420 * Math.SQRT1_2);
  });

  test('瞄準角度與自己那一邊的表面至少夾 15 度', () => {
    const game = createGame({ playerCount: 1, seed: 1 });
    game.step(1 / 60, [leftClick(300, 400)]);

    game.step(1 / 60, [leftClick(790, 781)]);

    const v = game.state.marbles[0]!.vel;
    expect(v.x).toBeCloseTo(420 * Math.cos((15 * Math.PI) / 180));
    expect(v.y).toBeCloseTo(-420 * Math.sin((15 * Math.PI) / 180));
  });

  test('指標在擋板後方時，也會夾在最小角度之內', () => {
    const game = createGame({ playerCount: 1, seed: 1 });
    game.step(1 / 60, [leftClick(300, 400)]);

    game.step(1 / 60, [leftClick(10, 799)]);

    const v = game.state.marbles[0]!.vel;
    expect(v.x).toBeLessThan(0);
    expect(v.y).toBeCloseTo(-420 * Math.sin((15 * Math.PI) / 180));
  });

  test('瞄準時按右鍵是取消瞄準，不會射出彈珠', () => {
    const game = createGame({ playerCount: 1, seed: 1 });
    game.step(1 / 60, [leftClick(300, 400)]);

    game.step(1 / 60, [rightClick(300)]);

    const { state } = game;
    expect(state.players[0]!.aiming).toBe(false);
    expect(state.marbles).toHaveLength(0);
    expect(state.pool).toBe(10);
  });

  test('彈珠池空了，左鍵不會進入瞄準模式', () => {
    const game = createGame({ playerCount: 1, seed: 1 });
    for (let i = 0; i < 10; i++) game.step(1 / 60, [rightClick(300)]);

    game.step(1 / 60, [leftClick(300, 400)]);

    expect(game.state.pool).toBe(0);
    expect(game.state.players[0]!.aiming).toBe(false);
  });
});

const brickAt = (x: number, y: number, hp = 1): Brick => ({ id: 0, x, y, w: 48, h: 24, hp, maxHp: hp });
/** 躲在角落、不會擋到中線彈珠的磚塊，讓關卡不會一開始就算清空。 */
const cornerLayout = () => [brickAt(160, 160)];

function newGame(layout: GameOptions['layout'] = cornerLayout, playerCount: GameOptions['playerCount'] = 1) {
  return createGame({ playerCount, seed: 1, layout });
}

function run(game: Game, seconds: number, ...inputs: PlayerInput[]) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) game.step(dt, inputs);
}

describe('彈珠飛行', () => {
  test('彈珠依速度移動', () => {
    const game = newGame();
    game.step(1 / 60, [rightClick(300)]);
    const before = game.state.marbles[0]!.pos.y;

    game.step(0.1, [at(300)]);

    expect(before - game.state.marbles[0]!.pos.y).toBeCloseTo(42);
  });

  test('沒有玩家的那一邊是牆，彈珠會反彈回來', () => {
    const game = newGame();
    game.step(1 / 60, [rightClick(300)]);

    run(game, 2, at(300));

    const m = game.state.marbles[0]!;
    expect(m.vel.y).toBeGreaterThan(0);
    expect(m.pos.y).toBeGreaterThanOrEqual(6);
  });
});

function runUntil(game: Game, done: () => boolean, input: PlayerInput, maxSeconds = 10) {
  const dt = 1 / 60;
  for (let t = 0; t < maxSeconds && !done(); t += dt) game.step(dt, [input]);
}

describe('擋板接球', () => {
  test('彈珠打中擋板中央，垂直彈回去', () => {
    const game = newGame();
    game.step(1 / 60, [rightClick(300)]);
    runUntil(game, () => game.state.marbles[0]!.vel.y > 0, at(300));

    runUntil(game, () => game.state.marbles[0]!.vel.y < 0, at(300));

    const m = game.state.marbles[0]!;
    expect(m.vel.x).toBeCloseTo(0);
    expect(m.vel.y).toBeCloseTo(-420);
  });

  test('打中擋板邊緣會斜著彈出，越靠邊角度越大', () => {
    const game = newGame();
    game.step(1 / 60, [rightClick(300)]);
    runUntil(game, () => game.state.marbles[0]!.vel.y > 0, at(300));

    // 擋板中心 250、彈珠在 300：偏右 50，是半寬 60 的 5/6，所以偏離垂直 50 度。
    runUntil(game, () => game.state.marbles[0]!.vel.y < 0, at(250));

    const m = game.state.marbles[0]!;
    const angle = (50 * Math.PI) / 180;
    expect(m.vel.x).toBeCloseTo(420 * Math.sin(angle));
    expect(m.vel.y).toBeCloseTo(-420 * Math.cos(angle));
  });
});

describe('漏接與失敗', () => {
  test('漏接的彈珠會消失，不會回到彈珠池；池裡還有彈珠就不算失敗', () => {
    const game = newGame();
    game.step(1 / 60, [rightClick(300)]);

    run(game, 5, at(700));

    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.pool).toBe(9);
    expect(game.state.status).toBe('playing');
  });

  test('彈珠池空了，且場上最後一顆彈珠也漏接，遊戲失敗', () => {
    const game = newGame();
    for (let i = 0; i < 10; i++) game.step(1 / 60, [rightClick(300)]);
    expect(game.state.status).toBe('playing');

    run(game, 5, at(700));

    expect(game.state.pool).toBe(0);
    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.status).toBe('defeated');
  });

  test('彈珠池空了，但場上還有彈珠，遊戲還沒失敗', () => {
    const game = newGame();
    for (let i = 0; i < 10; i++) game.step(1 / 60, [rightClick(300)]);

    run(game, 1, at(700));

    expect(game.state.pool).toBe(0);
    expect(game.state.marbles.length).toBeGreaterThan(0);
    expect(game.state.status).toBe('playing');
  });
});

describe('撞擊磚塊', () => {
  /** 磚塊正好在彈珠垂直射出的路徑上（x 從 376 到 424）。 */
  const inPathLayout = (hp: number) => () => [brickAt(376, 300, hp), brickAt(160, 160)];

  test('彈珠撞到普通磚：磚塊消失、得 10 分、彈珠反彈向下', () => {
    const game = newGame(inPathLayout(1));
    game.step(1 / 60, [rightClick(400)]);

    runUntil(game, () => game.state.bricks.length === 1, at(400));

    expect(game.state.score).toBe(10);
    expect(game.state.marbles[0]!.vel.y).toBeGreaterThan(0);
  });

  test('硬磚要撞多次才碎，碎的時候才得分', () => {
    const game = newGame(inPathLayout(2));
    game.step(1 / 60, [rightClick(400)]);

    const target = () => game.state.bricks.find((b) => b.x === 376);

    runUntil(game, () => target()?.hp === 1, at(400));
    expect(target()).toBeDefined();
    expect(game.state.score).toBe(0);

    runUntil(game, () => target() === undefined, at(400));
    expect(game.state.score).toBe(20);
  });
});

describe('過關', () => {
  const twoLevels = (level: number) => (level === 1 ? [brickAt(376, 300)] : [brickAt(100 * level, 160)]);

  function clearFirstLevel() {
    const game = newGame(twoLevels);
    game.step(1 / 60, [rightClick(400)]);
    runUntil(game, () => game.state.level === 2, at(400));
    return game;
  }

  test('清空全部磚塊就進入下一關，並換上新的磚塊', () => {
    const game = clearFirstLevel();

    expect(game.state.level).toBe(2);
    expect(game.state.bricks.map((b) => b.x)).toEqual([200]);
    expect(game.state.score).toBe(10);
    expect(game.state.status).toBe('playing');
  });

  test('過關時彈珠池補滿，場上的彈珠清空', () => {
    const game = clearFirstLevel();

    expect(game.state.pool).toBe(10);
    expect(game.state.marbles).toHaveLength(0);
  });

  test('關卡越後面彈珠越快', () => {
    const game = clearFirstLevel();

    game.step(1 / 60, [rightClick(400)]);

    expect(game.state.marbles[0]!.vel.y).toBeCloseTo(-420 * 1.03);
  });
});

describe('多人', () => {
  test('有玩家的方位不是牆：上方玩家接得到彈珠，彈珠被擋板彈回去', () => {
    const game = newGame(cornerLayout, 2);
    game.step(1 / 60, [rightClick(400), at(400)]);

    run(game, 2.5, at(400), at(400));

    expect(game.state.marbles).toHaveLength(1);
    expect(game.state.marbles[0]!.vel.y).toBeGreaterThan(0);
  });

  test('上方玩家漏接，彈珠從上方離開場地', () => {
    const game = newGame(cornerLayout, 2);
    game.step(1 / 60, [rightClick(400), at(400)]);

    run(game, 2.5, at(400), at(700));

    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.pool).toBe(19);
  });

  test('兩人時左右兩側仍是牆：貼著表面斜射的彈珠不會飛出場地', () => {
    const game = newGame(cornerLayout, 2);
    game.step(1 / 60, [leftClick(100, 100), at(400)]);
    game.step(1 / 60, [leftClick(10, 781), at(400)]);

    run(game, 3, at(400), at(400));

    for (const m of game.state.marbles) {
      expect(m.pos.x).toBeGreaterThanOrEqual(6);
    }
    expect(game.state.marbles).toHaveLength(1);
  });
});

describe('審查發現的邊界情況', () => {
  test('彈珠池被別人用光時，已在瞄準的玩家射不出去，彈珠池也不會變負數', () => {
    const game = newGame(cornerLayout, 2);
    for (let i = 0; i < 19; i++) game.step(1 / 60, [rightClick(300), at(400)]);
    expect(game.state.pool).toBe(1);
    game.step(1 / 60, [at(300), leftClick(400, 100)]);
    game.step(1 / 60, [rightClick(300), at(400)]);
    expect(game.state.pool).toBe(0);
    const onField = game.state.marbles.length;

    game.step(1 / 60, [at(300), leftClick(400, 100)]);

    expect(game.state.pool).toBe(0);
    expect(game.state.marbles).toHaveLength(onField);
    expect(game.state.players[1]!.aiming).toBe(false);
  });

  test('彈珠垂直擦過磚塊角落時會被彈開，不會穿過去', () => {
    const game = newGame(() => [brickAt(376, 300), brickAt(160, 160)]);
    // 彈珠中心 x=372，離磚塊左緣 4，小於半徑 6，所以會擦到左上角。
    game.step(1 / 60, [rightClick(372)]);

    runUntil(game, () => game.state.bricks.length === 1, at(372));

    const v = game.state.marbles[0]!.vel;
    expect(v.x).toBeLessThan(0);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(420);
  });
});
