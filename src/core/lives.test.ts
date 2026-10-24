import { describe, expect, test } from 'bun:test';
import { createGame } from './game.ts';
import type { Brick, Game, GameOptions, Marble, Monster, PlayerInput, PlayerState, Side } from './types.ts';
import { at } from './test-input.ts';

const DT = 1 / 60;
const rightClick = (x: number): PlayerInput => ({ ...at(x), secondary: true });
const leftClick = (x: number): PlayerInput => ({ ...at(x), primary: true });

const brickAt = (x: number, y: number, hp = 1): Brick => ({ id: 0, x, y, w: 48, h: 24, hp, maxHp: hp });
/** 躲在角落、不會擋到中線彈珠的磚塊，讓關卡不會一開始就算清空。 */
const cornerBrick = (): Brick => ({ ...brickAt(160, 160, 100000), id: 99 });

const monsterAt = (x: number, y: number, hp = 5): Monster => ({ id: 0, pos: { x, y }, radius: 36, hp, maxHp: hp, boss: false, fire: 5 });

function newGame(opts: Partial<GameOptions> = {}) {
  return createGame({ playerCount: 1, seed: 1, layout: () => [cornerBrick()], dropChance: 0, ...opts });
}

/** 所有玩家的指標都停在 x，只有第一位玩家額外帶著 first 的按鍵。 */
function inputs(game: Game, x: number, first: PlayerInput = at(x)): PlayerInput[] {
  return game.state.players.map((p, i) => (i === 0 ? first : at(x, p.side)));
}

function step(game: Game, x = 400, first?: PlayerInput) {
  game.step(DT, inputs(game, x, first));
}

function runUntil(game: Game, done: () => boolean, maxSeconds = 20, x = 400) {
  for (let t = 0; t < maxSeconds && !done(); t += DT) step(game, x);
}

const player = (game: Game, side: Side): PlayerState => game.state.players.find((p) => p.side === side)!;

/** 直接讓某位玩家死亡，用來測試死亡之後的規則。 */
function kill(game: Game, side: Side) {
  const p = player(game, side);
  p.lives = 0;
  p.dead = true;
  p.aiming = false;
}

/** 在某位玩家的核心上放一發會立刻打中的子彈。 */
function shootCore(game: Game, side: Side = 'bottom') {
  const p = player(game, side);
  const pos =
    side === 'bottom' ? { x: p.paddle, y: 786 } : side === 'top' ? { x: p.paddle, y: 14 } : side === 'left' ? { x: 14, y: p.paddle } : { x: 786, y: p.paddle };
  game.state.bullets.push({ id: 7000 + game.state.bullets.length, pos, vel: { x: 0, y: 0 }, source: 'monster' });
}

function launch(game: Game): Marble {
  const before = game.state.marbles.length;
  step(game, 400, rightClick(400));
  return game.state.marbles[before]!;
}

describe('生命', () => {
  test('每位玩家各有 3 點生命，沒有死亡也沒有無敵', () => {
    const game = newGame({ playerCount: 3 });

    for (const p of game.state.players) {
      expect(p.lives).toBe(3);
      expect(p.dead).toBe(false);
      expect(p.invincible).toBe(0);
      expect(p.revive).toBe(0);
    }
  });

  test('被打到的玩家扣血，其他玩家不受影響', () => {
    const game = newGame({ playerCount: 2 });
    shootCore(game, 'top');

    step(game);

    expect(player(game, 'top').lives).toBe(2);
    expect(player(game, 'bottom').lives).toBe(3);
  });

  test('過關時所有玩家生命補滿、無敵清除', () => {
    const game = newGame({ layout: (level) => (level === 1 ? [brickAt(376, 300)] : [cornerBrick()]) });
    game.state.players[0]!.lives = 1;
    game.state.players[0]!.invincible = 1;
    step(game, 400, rightClick(400));

    runUntil(game, () => game.state.level === 2);

    expect(game.state.level).toBe(2);
    expect(game.state.players[0]!.lives).toBe(3);
    expect(game.state.players[0]!.invincible).toBe(0);
  });
});

describe('死亡', () => {
  test('生命歸零就死亡：擋板位置與寬度停在當下，取消瞄準', () => {
    const game = newGame();
    step(game, 300);
    player(game, 'bottom').paddleEffect = { kind: 'widen', left: 5 };
    player(game, 'bottom').lives = 1;
    step(game, 300, leftClick(300));
    expect(player(game, 'bottom').aiming).toBe(true);

    shootCore(game);
    step(game, 300);

    const p = player(game, 'bottom');
    expect(p.dead).toBe(true);
    expect(p.lives).toBe(0);
    expect(p.aiming).toBe(false);
    expect(p.paddle).toBe(300);
  });

  test('死亡的玩家不能移動、瞄準或發射', () => {
    const game = newGame({ playerCount: 2 });
    kill(game, 'bottom');
    const pool = game.state.pool;

    game.step(DT, [{ pointer: { x: 700, y: 0 }, primary: true, secondary: true }, at(400)]);
    game.step(DT, [{ pointer: { x: 700, y: 0 }, primary: true, secondary: false }, at(400)]);

    const p = player(game, 'bottom');
    expect(p.paddle).toBe(400);
    expect(p.aiming).toBe(false);
    expect(game.state.pool).toBe(pool);
    expect(game.state.marbles).toHaveLength(0);
  });

  test('死亡期間擋板寬度效果不倒數，屍體的寬度不變', () => {
    const game = newGame({ playerCount: 2 });
    player(game, 'bottom').paddleEffect = { kind: 'widen', left: 0.2 };
    kill(game, 'bottom');

    for (let i = 0; i < 60; i++) step(game);

    expect(player(game, 'bottom').paddleEffect).toEqual({ kind: 'widen', left: 0.2 });
  });

  test('死亡玩家的方位整條是牆：彈珠不會從那裡漏掉', () => {
    const game = newGame({ playerCount: 2 });
    kill(game, 'top');
    const marble = launch(game);

    // 上方的活擋板若在別處會漏接；死亡後是牆，彈珠一定被彈回來。
    runUntil(game, () => marble.vel.y > 0, 5);

    expect(game.state.marbles).toHaveLength(1);
    expect(marble.vel.y).toBeGreaterThan(0);
    expect(marble.pos.y).toBeGreaterThanOrEqual(6);
  });

  test('活著的玩家漏接照舊：死亡的是別人時，自己的方位行為不變', () => {
    const game = newGame({ playerCount: 2 });
    kill(game, 'top');
    launch(game);

    for (let t = 0; t < 8; t += DT) step(game, 700);

    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.pool).toBe(19);
  });

  test('死亡玩家的方位不再掉落道具，已飄向他的道具消失', () => {
    const game = newGame({ playerCount: 2, layout: () => [brickAt(376, 300), cornerBrick()], dropChance: 1, powerUpKinds: ['supply'] });
    game.state.powerUps.push({ id: 900, batch: 99, kind: 'supply', side: 'top', pos: { x: 100, y: 300 } });
    kill(game, 'top');

    step(game, 400, rightClick(400));
    runUntil(game, () => game.state.bricks.length === 1, 5);

    expect(game.state.powerUps.every((p) => p.side === 'bottom')).toBe(true);
    expect(game.state.powerUps.some((p) => p.id === 900)).toBe(false);
    expect(game.state.powerUps).toHaveLength(1);
  });

  test('死亡的玩家接不到道具', () => {
    const game = newGame({ playerCount: 2 });
    kill(game, 'top');
    game.state.pool = 3;
    game.state.powerUps.push({ id: 900, batch: 99, kind: 'supply', side: 'top', pos: { x: 400, y: 10 } });

    step(game);

    expect(game.state.pool).toBe(3);
    expect(game.state.powerUps).toHaveLength(0);
  });

  test('一般怪物的子彈只瞄準還活著的玩家', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const game = newGame({ playerCount: 2, seed, monsters: () => [monsterAt(400, 400)] });
      kill(game, 'top');

      runUntil(game, () => game.state.bullets.length > 0, 6);

      expect(game.state.bullets[0]!.vel.y).toBeGreaterThan(0);
    }
  });

  test('BOSS 的瞄準扇形只瞄準還活著的玩家', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const boss: Monster = { ...monsterAt(400, 400, 100), radius: 52, boss: true };
      const game = newGame({ playerCount: 2, seed, monsters: () => [boss] });
      kill(game, 'top');

      // 第一次是環形，第二次才是瞄準扇形（7 發）。
      const seen = new Set<number>();
      for (let t = 0; t < 3.5; t += DT) {
        boss.pos = { x: 400, y: 400 };
        step(game);
        for (const b of game.state.bullets) seen.add(b.id);
        if (seen.size === 24 + 7) break;
      }
      const fan = game.state.bullets.filter((b) => b.id >= 24);

      expect(fan).toHaveLength(7);
      const middle = fan.map((b) => Math.atan2(b.vel.y, b.vel.x)).sort((a, b) => a - b)[3]!;
      expect(middle).toBeGreaterThan(0);
    }
  });

  test('場上沒有活著的玩家時，挑選目標不會出錯', () => {
    const game = newGame({ monsters: () => [monsterAt(400, 400)] });
    kill(game, 'bottom');

    expect(() => {
      for (let t = 0; t < 10; t += DT) step(game);
    }).not.toThrow();
  });
});

describe('失敗', () => {
  test('單人生命歸零就失敗', () => {
    const game = newGame();
    game.state.players[0]!.lives = 1;
    shootCore(game);

    step(game);

    expect(game.state.players[0]!.dead).toBe(true);
    expect(game.state.status).toBe('defeated');
  });

  test('多人時全部玩家都死亡才失敗，還有人活著就繼續', () => {
    const game = newGame({ playerCount: 3 });
    kill(game, 'bottom');
    kill(game, 'top');
    step(game);
    expect(game.state.status).toBe('playing');

    kill(game, 'left');
    step(game);

    expect(game.state.status).toBe('defeated');
  });

  test('原有的失敗條件保留：彈珠池為空且場上沒有彈珠', () => {
    const game = newGame({ playerCount: 2 });
    game.state.pool = 0;

    step(game);

    expect(game.state.status).toBe('defeated');
    expect(game.state.players.every((p) => !p.dead)).toBe(true);
  });

  test('最後一位玩家死亡的同一步清空了關卡，仍然算失敗，不會被過關的復活蓋掉', () => {
    const game = newGame({ layout: (level) => (level === 1 ? [brickAt(376, 300)] : [cornerBrick()]) });
    game.state.players[0]!.lives = 1;
    shootCore(game);
    game.state.bricks = [];

    step(game);

    expect(game.state.status).toBe('defeated');
    expect(game.state.level).toBe(1);
    expect(game.state.players[0]!.dead).toBe(true);
  });

  test('失敗之後不會因為清空磚塊而過關', () => {
    const game = newGame({ layout: (level) => (level === 1 ? [brickAt(376, 300)] : [cornerBrick()]) });
    const marble = launch(game);
    kill(game, 'bottom');
    runUntil(game, () => game.state.status === 'defeated', 1);
    expect(game.state.status).toBe('defeated');

    game.state.bricks = [];
    game.state.marbles = [marble];
    step(game);

    expect(game.state.level).toBe(1);
    expect(game.state.status).toBe('defeated');
  });
});

describe('過關時的復活與彈珠池', () => {
  const twoLevels = (level: number) => (level === 1 ? [brickAt(376, 300)] : [cornerBrick()]);

  test('死亡的玩家一起復活並補滿生命，復活進度清除', () => {
    const game = newGame({ playerCount: 2, layout: twoLevels });
    kill(game, 'top');
    player(game, 'top').revive = 3;
    step(game, 400, rightClick(400));

    runUntil(game, () => game.state.level === 2);

    const top = player(game, 'top');
    expect(game.state.level).toBe(2);
    expect(top.dead).toBe(false);
    expect(top.lives).toBe(3);
    expect(top.revive).toBe(0);
    expect(game.state.status).toBe('playing');
  });

  test('彈珠池依有座位的玩家數補滿，包含死亡的人', () => {
    const game = newGame({ playerCount: 3, layout: twoLevels });
    kill(game, 'left');
    step(game, 400, rightClick(400));

    runUntil(game, () => game.state.level === 2);

    expect(game.state.pool).toBe(30);
  });

  test('玩家連線中斷離開時，該方位變成沒有屍體的牆，不論死活', () => {
    for (const dead of [false, true]) {
      const game = newGame({ playerCount: 2 });
      if (dead) kill(game, 'top');

      game.removePlayer('top');
      const marble = launch(game);
      runUntil(game, () => marble.vel.y > 0, 5);

      expect(game.state.players.map((p) => p.side)).toEqual(['bottom']);
      expect(marble.vel.y).toBeGreaterThan(0);
      expect(game.state.marbles).toHaveLength(1);
    }
  });
});

describe('屍體復活', () => {
  /** 兩人局：上方玩家死亡，擋板停在 paddleX。 */
  function corpseGame(paddleX = 400) {
    const game = newGame({ playerCount: 2 });
    const top = player(game, 'top');
    top.paddle = paddleX;
    kill(game, 'top');
    return { game, top };
  }

  /** 把彈珠直接放在上牆附近，下一步就會撞上去。 */
  function marbleAtWall(game: Game, x: number, id = 500): Marble {
    const m: Marble = { id, pos: { x, y: 12 }, vel: { x: 0, y: -420 } };
    game.state.marbles.push(m);
    return m;
  }

  test('彈珠反彈到屍體區域，復活進度加 1', () => {
    const { game, top } = corpseGame();
    marbleAtWall(game, 400);

    step(game);

    expect(top.revive).toBe(1);
    expect(top.dead).toBe(true);
  });

  test('撞到牆的其他部分不累計', () => {
    const { game, top } = corpseGame(600);
    marbleAtWall(game, 100);

    step(game);

    expect(top.revive).toBe(0);
  });

  test('實際從下方射出的彈珠來回撞屍體，累計 5 次後復活', () => {
    const { game, top } = corpseGame();
    launch(game);

    runUntil(game, () => top.revive === 1, 6);
    expect(top.revive).toBe(1);
    expect(top.dead).toBe(true);

    runUntil(game, () => !top.dead, 40);

    expect(top.dead).toBe(false);
    expect(game.state.marbles).toHaveLength(1);
  });

  test('第 5 次撞擊復活：生命 1 點、無敵 1.5 秒、進度歸零，可以重新操作', () => {
    const { game, top } = corpseGame();
    top.revive = 4;
    marbleAtWall(game, 400);

    step(game);

    expect(top.dead).toBe(false);
    expect(top.lives).toBe(1);
    expect(top.invincible).toBeGreaterThan(1.4);
    expect(top.invincible).toBeLessThanOrEqual(1.5);
    expect(top.revive).toBe(0);

    game.step(DT, [at(400), at(250)]);
    expect(top.paddle).toBe(250);
  });

  test('復活後的無敵期間，子彈穿過核心', () => {
    const { game, top } = corpseGame();
    top.revive = 4;
    marbleAtWall(game, 400);
    step(game);

    shootCore(game, 'top');
    step(game);

    expect(top.lives).toBe(1);
    expect(top.dead).toBe(false);
  });

  test('環爆這類一次大量撞擊的情況，同一步累計 5 次就復活', () => {
    const { game, top } = corpseGame();
    for (let i = 0; i < 5; i++) marbleAtWall(game, 380 + i * 10, 500 + i);

    step(game);

    expect(top.dead).toBe(false);
    expect(top.lives).toBe(1);
  });

  test('復活後方位恢復：漏接判定恢復', () => {
    const { game, top } = corpseGame();
    top.revive = 4;
    marbleAtWall(game, 400);
    step(game);
    expect(top.dead).toBe(false);
    game.state.marbles = [];

    // 彈珠飛向上方，上方擋板在 x=400，彈珠在 x=100：被漏接而消失。
    game.state.marbles.push({ id: 600, pos: { x: 100, y: 200 }, vel: { x: 0, y: -420 } });
    for (let t = 0; t < 2; t += DT) step(game);

    expect(game.state.marbles).toHaveLength(0);
  });

  /** 讓上方的屍體馬上被撞活，並清掉場上的彈珠。 */
  function reviveTop(game: Game) {
    player(game, 'top').revive = 4;
    marbleAtWall(game, 400);
    step(game);
    expect(player(game, 'top').dead).toBe(false);
    game.state.marbles = [];
  }

  test('復活後道具掉落恢復：朝復活玩家的方位也掉', () => {
    const game = newGame({ playerCount: 2, layout: () => [brickAt(376, 300), cornerBrick()], dropChance: 1, powerUpKinds: ['supply'] });
    kill(game, 'top');
    reviveTop(game);

    launch(game);
    runUntil(game, () => game.state.powerUps.length > 0, 5);

    expect(game.state.powerUps.map((p) => p.side).sort()).toEqual(['bottom', 'top']);
  });

  test('復活後怪物的子彈又會瞄準他', () => {
    const aimed = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const game = newGame({ playerCount: 2, seed, monsters: () => [monsterAt(400, 400)] });
      kill(game, 'top');
      reviveTop(game);

      runUntil(game, () => game.state.bullets.length > 0, 6);

      aimed.add(game.state.bullets[0]!.vel.y > 0 ? 'bottom' : 'top');
    }

    expect([...aimed].sort()).toEqual(['bottom', 'top']);
  });

  test('活著的玩家的方位撞到擋板不累計復活進度', () => {
    const game = newGame({ playerCount: 2 });
    const top = player(game, 'top');
    top.revive = 2;
    launch(game);

    for (let t = 0; t < 8; t += DT) step(game);

    expect(top.revive).toBe(2);
  });
});
