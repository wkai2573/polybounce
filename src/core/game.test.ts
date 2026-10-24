import { describe, expect, test } from 'bun:test';
import { PADDLE_WIDTH } from './config.ts';
import { createGame } from './game.ts';
import type { Brick, Game, GameOptions, Monster, PlayerInput } from './types.ts';

/** 預設把指標放在下方玩家自己那一邊的邊緣（y = 800），擋板深度為零。 */
const at = (x: number, y = 800): PlayerInput => ({ pointer: { x, y }, fire: false });

describe('開局狀態', () => {
  test('單人從第 1 關開始，玩家在下方，發射量是滿的、場上沒有彈珠', () => {
    const { state } = createGame({ playerCount: 1, seed: 1 });

    expect(state.status).toBe('playing');
    expect(state.level).toBe(1);
    expect(state.score).toBe(0);
    expect(state.players[0]!.lives).toBe(3);
    expect(state.players[0]!.charge).toBe(5);
    expect(state.marbles).toHaveLength(0);
    expect(state.bricks.length).toBeGreaterThan(0);
    expect(state.players.map((p) => p.side)).toEqual(['bottom']);
  });

  test('每多一位玩家就多一個方位，每位玩家各自有滿的發射量', () => {
    const { state } = createGame({ playerCount: 3, seed: 1 });

    expect(state.players.map((p) => p.charge)).toEqual([5, 5, 5]);
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

const fireAt = (x: number): PlayerInput => ({ ...at(x), fire: true });

describe('發射', () => {
  test('從擋板中央垂直射出一顆彈珠，發射量減一', () => {
    const game = createGame({ playerCount: 1, seed: 1 });

    game.step(1 / 60, [fireAt(300)]);

    const { state } = game;
    expect(state.players[0]!.charge).toBeCloseTo(4 + 1 / 60);
    expect(state.marbles).toHaveLength(1);
    const m = state.marbles[0]!;
    expect(m.pos.x).toBeCloseTo(300);
    expect(m.pos.y).toBeLessThan(800 - 12);
    expect(m.vel.x).toBeCloseTo(0);
    expect(m.vel.y).toBeCloseTo(-420);
  });
});

const leftClick = (x: number, y: number): PlayerInput => ({ pointer: { x, y }, fire: true });

describe('左鍵發射', () => {
  test('指標不論在哪裡，左鍵都從擋板垂直射出，不會朝指標方向偏', () => {
    const game = createGame({ playerCount: 1, seed: 1 });

    game.step(1 / 60, [leftClick(300, 400)]);

    const { state } = game;
    const m = state.marbles[0]!;
    expect(state.players[0]!.charge).toBeCloseTo(4 + 1 / 60);
    expect(m.vel.x).toBeCloseTo(0);
    expect(m.vel.y).toBeCloseTo(-420);
  });

  test('發射的同一幀擋板仍跟著指標移動', () => {
    const game = createGame({ playerCount: 1, seed: 1 });

    game.step(1 / 60, [leftClick(300, 800)]);

    expect(game.state.players[0]!.paddle).toBe(300);
    expect(game.state.marbles).toHaveLength(1);
  });

  test('沒按左鍵就不會發射，擋板任何時候都能移動', () => {
    const game = createGame({ playerCount: 1, seed: 1 });

    game.step(1 / 60, [at(300)]);
    game.step(1 / 60, [at(500, 400)]);

    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.players[0]!.paddle).toBe(500);
  });

  test('發射量不足一顆，左鍵沒有作用，也不會消耗發射量', () => {
    const game = createGame({ playerCount: 1, seed: 1 });
    game.state.players[0]!.charge = 0.5;

    game.step(1 / 60, [leftClick(300, 800)]);

    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.players[0]!.charge).toBeCloseTo(0.5 + 1 / 60);
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
    game.step(1 / 60, [fireAt(300)]);
    const before = game.state.marbles[0]!.pos.y;

    game.step(0.1, [at(300)]);

    expect(before - game.state.marbles[0]!.pos.y).toBeCloseTo(42);
  });

  test('沒有玩家的那一邊是牆，彈珠會反彈回來', () => {
    const game = newGame();
    game.step(1 / 60, [fireAt(300)]);

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
    game.step(1 / 60, [fireAt(300)]);
    runUntil(game, () => game.state.marbles[0]!.vel.y > 0, at(300));

    runUntil(game, () => game.state.marbles[0]!.vel.y < 0, at(300));

    const m = game.state.marbles[0]!;
    expect(m.vel.x).toBeCloseTo(0);
    expect(m.vel.y).toBeCloseTo(-420);
  });

  test('打中擋板邊緣會斜著彈出，越靠邊角度越大', () => {
    const game = newGame();
    game.step(1 / 60, [fireAt(300)]);
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
  test('漏接的彈珠會消失，不會回來；只要有人活著就不算失敗', () => {
    const game = newGame();
    game.step(1 / 60, [fireAt(300)]);

    run(game, 5, at(700));

    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.status).toBe('playing');
  });

  test('發射量是零，且場上最後一顆彈珠也漏接，遊戲不會失敗', () => {
    const game = newGame();
    for (let i = 0; i < 5; i++) game.step(1 / 60, [fireAt(300)]);
    game.state.players[0]!.charge = 0;

    run(game, 5, at(700));

    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.status).toBe('playing');
  });

  test('全部玩家都死亡才算失敗', () => {
    const game = newGame(cornerLayout, 2);
    game.state.players[0]!.dead = true;
    game.step(1 / 60, [at(400), at(400)]);
    expect(game.state.status).toBe('playing');

    game.state.players[1]!.dead = true;
    game.step(1 / 60, [at(400), at(400)]);

    expect(game.state.status).toBe('defeated');
  });
});

describe('撞擊磚塊', () => {
  /** 磚塊正好在彈珠垂直射出的路徑上（x 從 376 到 424）。 */
  const inPathLayout = (hp: number) => () => [brickAt(376, 300, hp), brickAt(160, 160)];

  test('彈珠撞到普通磚：磚塊消失、得 10 分、彈珠反彈向下', () => {
    const game = newGame(inPathLayout(1));
    game.step(1 / 60, [fireAt(400)]);

    runUntil(game, () => game.state.bricks.length === 1, at(400));

    expect(game.state.score).toBe(10);
    expect(game.state.marbles[0]!.vel.y).toBeGreaterThan(0);
  });

  test('硬磚要撞多次才碎，碎的時候才得分', () => {
    const game = newGame(inPathLayout(2));
    game.step(1 / 60, [fireAt(400)]);

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
    game.step(1 / 60, [fireAt(400)]);
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

  test('過關時所有玩家的發射量補滿，場上的彈珠清空', () => {
    const game = clearFirstLevel();

    expect(game.state.players[0]!.charge).toBe(5);
    expect(game.state.marbles).toHaveLength(0);
  });

  test('關卡越後面彈珠越快', () => {
    const game = clearFirstLevel();

    game.step(1 / 60, [fireAt(400)]);

    expect(game.state.marbles[0]!.vel.y).toBeCloseTo(-420 * 1.03);
  });
});

describe('多人', () => {
  test('有玩家的方位不是牆：上方玩家接得到彈珠，彈珠被擋板彈回去', () => {
    const game = newGame(cornerLayout, 2);
    game.step(1 / 60, [fireAt(400), at(400)]);

    run(game, 2.5, at(400), at(400));

    expect(game.state.marbles).toHaveLength(1);
    expect(game.state.marbles[0]!.vel.y).toBeGreaterThan(0);
  });

  test('上方玩家漏接，彈珠從上方離開場地', () => {
    const game = newGame(cornerLayout, 2);
    game.step(1 / 60, [fireAt(400), at(400)]);

    run(game, 2.5, at(400), at(700));

    expect(game.state.marbles).toHaveLength(0);
  });

  test('兩人時左右兩側仍是牆：貼著表面斜射的彈珠不會飛出場地', () => {
    const game = newGame(cornerLayout, 2);
    game.state.marbles.push({ id: 9000, pos: { x: 20, y: 600 }, vel: { x: -300, y: -100 }, power: 1 });

    run(game, 3, at(400), at(400));

    for (const m of game.state.marbles) {
      expect(m.pos.x).toBeGreaterThanOrEqual(6);
    }
    expect(game.state.marbles).toHaveLength(1);
  });
});

describe('審查發現的邊界情況', () => {
  test('兩位玩家的發射量各自獨立：一位用完不影響另一位', () => {
    const game = newGame(cornerLayout, 2);
    game.state.players[0]!.charge = 0;

    game.step(1 / 60, [fireAt(300), { ...at(400, 0), fire: true }]);

    expect(game.state.marbles).toHaveLength(1);
    expect(game.state.players[0]!.charge).toBeCloseTo(1 / 60);
    expect(game.state.players[1]!.charge).toBeCloseTo(4 + 1 / 60);
  });

  test('彈珠垂直擦過磚塊角落時會被彈開，不會穿過去', () => {
    const game = newGame(() => [brickAt(376, 300), brickAt(160, 160)]);
    // 彈珠中心 x=372，離磚塊左緣 4，小於半徑 6，所以會擦到左上角。
    game.step(1 / 60, [fireAt(372)]);

    runUntil(game, () => game.state.bricks.length === 1, at(372));

    const v = game.state.marbles[0]!.vel;
    expect(v.x).toBeLessThan(0);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(420);
  });
});

const monsterAt = (x: number, y: number, hp = 3, boss = false): Monster => ({
  id: 0,
  pos: { x, y },
  radius: boss ? 52 : 36,
  hp,
  maxHp: hp,
  boss,
  fire: boss ? 0 : 5,
});

describe('怪物', () => {
  /** 怪物在彈珠垂直射出的路徑上，離擋板近，所以緩慢遊走的偏移不會讓彈珠落空。 */
  const inPath = (hp: number) => (level: number) => (level === 1 ? [monsterAt(400, 560, hp)] : []);
  const newMonsterGame = (monsters: GameOptions['monsters'], layout: GameOptions['layout'] = cornerLayout) =>
    createGame({ playerCount: 1, seed: 1, layout, monsters });

  test('預設第 1、2 關沒有怪物，第 3 關出現兩隻', () => {
    const game = createGame({ playerCount: 1, seed: 1, layout: (level) => (level < 3 ? [brickAt(376, 300)] : cornerLayout()) });
    expect(game.state.monsters).toHaveLength(0);

    while (game.state.level < 3) {
      game.step(1 / 60, [fireAt(400)]);
      const before = game.state.level;
      runUntil(game, () => game.state.level > before, at(400));
      if (game.state.level === 2) expect(game.state.monsters).toHaveLength(0);
    }

    expect(game.state.monsters).toHaveLength(2);
  });

  test('怪物血量不隨玩家人數改變', () => {
    const hpAtLevel3 = (playerCount: GameOptions['playerCount']) => {
      const game = createGame({
        playerCount,
        seed: 1,
        layout: (level) => (level < 3 ? [brickAt(376, 300)] : cornerLayout()),
      });
      const idle = Array.from({ length: playerCount }, () => at(400));
      while (game.state.level < 3) {
        game.step(1 / 60, [fireAt(400), ...idle.slice(1)]);
        const before = game.state.level;
        for (let t = 0; t < 10 && game.state.level === before; t += 1 / 60) game.step(1 / 60, idle);
      }
      return game.state.monsters[0]!.maxHp;
    };

    expect(hpAtLevel3(4)).toBe(hpAtLevel3(1));
  });

  test('彈珠撞到怪物會反彈並使怪物扣一點血', () => {
    const game = newMonsterGame(inPath(3));
    game.step(1 / 60, [fireAt(400)]);

    runUntil(game, () => game.state.monsters[0]!.hp < 3, at(400));

    expect(game.state.monsters[0]!.hp).toBe(2);
    expect(game.state.marbles[0]!.vel.y).toBeGreaterThan(0);
    expect(game.state.score).toBe(0);
  });

  test('血量歸零時怪物被移除並得分', () => {
    const game = newMonsterGame(inPath(1));
    game.step(1 / 60, [fireAt(400)]);

    runUntil(game, () => game.state.monsters.length === 0, at(400));

    expect(game.state.monsters).toHaveLength(0);
    expect(game.state.score).toBe(20);
  });

  test('怪物在中央區域內遊走，不會飄出去', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const game = createGame({ playerCount: 1, seed, layout: cornerLayout, monsters: () => [monsterAt(196, 196)] });
      const m = game.state.monsters[0]!;
      let moved = false;
      for (let t = 0; t < 60; t += 1 / 60) {
        game.step(1 / 60, [at(400)]);
        moved ||= m.pos.x !== 196 || m.pos.y !== 196;
        expect(m.pos.x).toBeGreaterThanOrEqual(160 + 36);
        expect(m.pos.x).toBeLessThanOrEqual(640 - 36);
        expect(m.pos.y).toBeGreaterThanOrEqual(160 + 36);
        expect(m.pos.y).toBeLessThanOrEqual(640 - 36);
      }
      expect(moved).toBe(true);
    }
  });

  test('只清完磚塊不算過關，怪物也清完才進入下一關', () => {
    // 先打倒路徑上的怪物，再打掉怪物上方的磚塊。
    const game = newMonsterGame(inPath(1), (level) => (level === 1 ? [brickAt(376, 300)] : cornerLayout()));
    game.step(1 / 60, [fireAt(400)]);

    runUntil(game, () => game.state.monsters.length === 0, at(400));
    expect(game.state.level).toBe(1);
    expect(game.state.bricks).toHaveLength(1);

    game.step(1 / 60, [fireAt(400)]);
    runUntil(game, () => game.state.level === 2, at(400));
    expect(game.state.level).toBe(2);
  });

  test('怪物數量與玩家人數無關，BOSS 關只有 BOSS 一隻', () => {
    for (const playerCount of [1, 2, 3, 4] as const) {
      expect(createGame({ playerCount, seed: 1, startLevel: 6 }).state.monsters).toHaveLength(3);
      expect(createGame({ playerCount, seed: 1, startLevel: 9 }).state.monsters).toHaveLength(4);
      const boss = createGame({ playerCount, seed: 1, startLevel: 10 }).state.monsters;
      expect(boss).toHaveLength(1);
      expect(boss[0]!.boss).toBe(true);
    }
  });

  test('只剩一隻怪物不算過關，全部清除才進入下一關', () => {
    const game = newMonsterGame(
      (level) => (level === 1 ? [{ ...monsterAt(400, 560, 1), id: 0 }, { ...monsterAt(580, 580, 5), id: 1 }] : []),
      (level) => (level === 1 ? [] : cornerLayout()),
    );
    game.step(1 / 60, [fireAt(400)]);

    runUntil(game, () => game.state.monsters.length === 1, at(400));
    run(game, 0.5, at(400));

    expect(game.state.monsters).toHaveLength(1);
    expect(game.state.monsters[0]!.id).toBe(1);
    expect(game.state.level).toBe(1);

    game.state.monsters.length = 0;
    run(game, 0.1, at(400));

    expect(game.state.level).toBe(2);
  });

  test('只清完怪物不算過關', () => {
    const game = newMonsterGame(inPath(1));
    game.step(1 / 60, [fireAt(400)]);

    runUntil(game, () => game.state.monsters.length === 0, at(400));
    run(game, 0.5, at(400));

    expect(game.state.level).toBe(1);
  });

  test('只清完磚塊不算過關', () => {
    const game = newMonsterGame(
      (level) => (level === 1 ? [monsterAt(580, 580, 5)] : []),
      (level) => (level === 1 ? [brickAt(376, 300)] : cornerLayout()),
    );
    game.step(1 / 60, [fireAt(400)]);

    runUntil(game, () => game.state.bricks.length === 0, at(400));
    run(game, 0.5, at(400));

    expect(game.state.monsters).toHaveLength(1);
    expect(game.state.level).toBe(1);
  });
});

describe('子彈', () => {
  const lone = () => createGame({ playerCount: 1, seed: 1, layout: cornerLayout, monsters: () => [monsterAt(400, 500)] });
  const pair = (seed: number) =>
    createGame({ playerCount: 2, seed, layout: cornerLayout, monsters: () => [monsterAt(400, 400)] });

  test('怪物存在時每 5 秒發射一發子彈', () => {
    const game = lone();

    run(game, 4.9, at(400));
    expect(game.state.bullets).toHaveLength(0);

    run(game, 0.2, at(400));
    expect(game.state.bullets).toHaveLength(1);
    const first = game.state.bullets[0]!.id;

    run(game, 5, at(400));
    expect(game.state.bullets).toHaveLength(1);
    expect(game.state.bullets[0]!.id).not.toBe(first);
  });

  test('沒有怪物就不發射子彈', () => {
    const game = createGame({ playerCount: 1, seed: 1, layout: cornerLayout, monsters: () => [] });

    run(game, 12, at(400));

    expect(game.state.bullets).toHaveLength(0);
  });

  test('單人時子彈以固定速度朝下方的玩家飛去', () => {
    const game = lone();

    run(game, 5.1, at(400));

    const v = game.state.bullets[0]!.vel;
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(200);
    expect(v.y).toBeGreaterThan(0);
  });

  test('兩人時子彈只會射向上方或下方的玩家，兩邊都有機會', () => {
    const directions = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const game = pair(seed);
      run(game, 5.1, at(400), at(400));
      const v = game.state.bullets[0]!.vel;
      expect(Math.abs(v.y)).toBeGreaterThan(Math.abs(v.x));
      directions.add(v.y > 0 ? 'bottom' : 'top');
    }

    expect([...directions].sort()).toEqual(['bottom', 'top']);
  });

  test('子彈穿過磚塊：磚塊不受損，子彈照常飛到核心並使玩家扣一點生命', () => {
    const wall = Array.from({ length: 10 }, (_, c) => ({ ...brickAt(160 + c * 48, 640), id: c }));
    const game = createGame({ playerCount: 1, seed: 1, layout: () => wall, monsters: () => [monsterAt(400, 400)] });

    runUntil(game, () => game.state.bullets.some((b) => b.pos.y > 660), at(400));
    expect(game.state.bullets).toHaveLength(1);

    runUntil(game, () => game.state.players[0]!.lives < 3, at(400));

    expect(game.state.players[0]!.lives).toBe(2);
    expect(game.state.bullets).toHaveLength(0);
    expect(game.state.bricks).toHaveLength(10);
    expect(game.state.bricks.every((b) => b.hp === 1)).toBe(true);
  });

  test('一般怪物的子彈標示來源為一般怪物', () => {
    const game = lone();

    run(game, 5.1, at(400));

    expect(game.state.bullets[0]!.source).toBe('monster');
  });

  test('子彈沒碰到核心就飛出場地消失，不會扣血', () => {
    const game = lone();
    run(game, 5.1, at(400));
    expect(game.state.bullets).toHaveLength(1);
    const first = game.state.bullets[0]!.id;

    // 怪物每隔幾秒又會射下一發，所以只確認第一發飛出場地消失。
    for (let t = 0; t < 4; t += 1 / 60) {
      game.step(1 / 60, [at(700)]);
      expect(game.state.players[0]!.lives).toBe(3);
    }

    expect(game.state.bullets.some((b) => b.id === first)).toBe(false);
  });
});

describe('核心受擊', () => {
  const newLone = () =>
    createGame({ playerCount: 1, seed: 1, layout: cornerLayout, monsters: () => [monsterAt(400, 500)] });
  const livesOf = (game: Game, i = 0) => game.state.players[i]!.lives;

  function hitOnce() {
    const game = newLone();
    runUntil(game, () => livesOf(game) < 3, at(400));
    return game;
  }

  test('子彈打到核心，該玩家扣 1 點生命，子彈消失', () => {
    const game = hitOnce();

    expect(livesOf(game)).toBe(2);
    expect(game.state.bullets).toHaveLength(0);
    expect(game.state.players[0]!.dead).toBe(false);
  });

  test('受傷後擋板照樣可以移動，沒有凍結', () => {
    const game = hitOnce();

    game.step(1 / 60, [at(700)]);

    expect(game.state.players[0]!.paddle).toBe(700);
  });

  test('受傷後仍然可以發射彈珠', () => {
    const game = hitOnce();

    game.step(1 / 60, [leftClick(400, 400)]);
    expect(game.state.players[0]!.charge).toBeCloseTo(4 + 1 / 60);
    expect(game.state.marbles).toHaveLength(1);
  });

  test('受傷有 1.5 秒無敵，之後倒數歸零', () => {
    const game = hitOnce();

    expect(game.state.players[0]!.invincible).toBeGreaterThan(1.4);
    expect(game.state.players[0]!.invincible).toBeLessThanOrEqual(1.5);

    run(game, 1.6, at(400));
    expect(game.state.players[0]!.invincible).toBe(0);
  });

  test('生命只影響被打到的玩家', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const game = createGame({ playerCount: 2, seed, layout: cornerLayout, monsters: () => [monsterAt(400, 400)] });

      runUntil(game, () => game.state.players.some((p) => p.lives < 3), at(400));

      expect(game.state.players.filter((p) => p.lives < 3)).toHaveLength(1);
    }
  });
});

describe('BOSS', () => {
  test('BOSS 發射的子彈標示來源為 BOSS', () => {
    const game = createGame({ playerCount: 1, seed: 1, layout: cornerLayout, monsters: () => [monsterAt(400, 500, 3, true)] });

    runUntil(game, () => game.state.bullets.length > 0, at(400));

    expect(game.state.bullets.every((b) => b.source === 'boss')).toBe(true);
  });

  test('BOSS 被彈珠撞到一樣扣一點血，血量歸零時移除並依最大血量得分', () => {
    const game = createGame({
      playerCount: 1,
      seed: 1,
      layout: cornerLayout,
      monsters: (level) => (level === 1 ? [monsterAt(400, 560, 1, true)] : []),
    });
    game.step(1 / 60, [fireAt(400)]);

    runUntil(game, () => game.state.monsters.length === 0, at(400));

    expect(game.state.score).toBe(20);
  });
});

describe('玩家離開', () => {
  /** 左右兩邊的玩家沿 y 軸移動。 */
  const atY = (y: number): PlayerInput => ({ pointer: { x: 0, y }, fire: false });

  test('離開玩家的方位變成牆：原本會漏出去的彈珠改為反彈', () => {
    const game = newGame(cornerLayout, 2);
    game.step(1 / 60, [fireAt(400), at(400)]);
    game.removePlayer('top');

    run(game, 2.5, at(400));

    expect(game.state.marbles).toHaveLength(1);
    expect(game.state.marbles[0]!.vel.y).toBeGreaterThan(0);
  });

  test('分數與其他玩家的擋板不受影響，遊戲繼續', () => {
    const game = newGame(cornerLayout, 3);
    game.step(1 / 60, [fireAt(400), at(300), at(500)]);
    const before = { score: game.state.score };

    game.removePlayer('top');
    game.step(1 / 60, [at(400), atY(500)]);

    expect(game.state.players.map((p) => p.side)).toEqual(['bottom', 'left']);
    expect(game.state.players[1]!.paddle).toBe(500);
    expect(game.state.score).toBe(before.score);
    expect(game.state.status).toBe('playing');
  });

  test('輸入依剩下的玩家順序對應', () => {
    const game = newGame(cornerLayout, 3);
    game.removePlayer('top');

    game.step(1 / 60, [at(300), atY(550)]);

    expect(game.state.players.map((p) => [p.side, p.paddle])).toEqual([
      ['bottom', 300],
      ['left', 550],
    ]);
  });

  test('只剩一位玩家時遊戲仍然可以繼續', () => {
    const game = newGame(cornerLayout, 2);

    game.removePlayer('top');
    game.step(1 / 60, [fireAt(400)]);

    expect(game.state.marbles).toHaveLength(1);
  });

  test('飄向離開玩家方位的道具消失', () => {
    const game = createGame({ playerCount: 2, seed: 1, layout: () => [brickAt(376, 300), brickAt(160, 160)], dropChance: 1, powerUpKinds: ['pierce'] });
    game.step(1 / 60, [fireAt(400), at(400)]);
    runUntil(game, () => game.state.powerUps.length > 0, at(400));
    expect(game.state.powerUps.map((p) => p.side).sort()).toEqual(['bottom', 'top']);

    game.removePlayer('top');

    expect(game.state.powerUps.map((p) => p.side)).toEqual(['bottom']);
  });

  test('過關補滿剩下的玩家的發射量', () => {
    const game = createGame({ playerCount: 3, seed: 1, layout: (level) => (level === 1 ? [brickAt(376, 300)] : [brickAt(160, 160)]) });
    game.step(1 / 60, [fireAt(400), at(400), at(400)]);
    game.removePlayer('left');

    game.state.players[1]!.charge = 0.5;

    runUntil(game, () => game.state.level === 2, at(400));

    expect(game.state.players.map((p) => p.charge)).toEqual([5, 5]);
  });

  test('可以指定方位開局，每位玩家的發射量是滿的', () => {
    const game = createGame({ playerCount: 2, sides: ['bottom', 'left'], seed: 1, layout: cornerLayout });

    expect(game.state.players.map((p) => p.side)).toEqual(['bottom', 'left']);
    expect(game.state.players.map((p) => p.charge)).toEqual([5, 5]);
  });
});
