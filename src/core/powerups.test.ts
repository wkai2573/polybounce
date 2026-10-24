import { describe, expect, test } from 'bun:test';
import { createGame } from './game.ts';
import type { Brick, Game, GameOptions, Monster, PlayerInput, PowerUp, PowerUpKind, Side } from './types.ts';

const at = (x: number): PlayerInput => ({ pointer: { x, y: 0 }, primary: false, secondary: false });
const rightClick = (x: number): PlayerInput => ({ ...at(x), secondary: true });

const brickAt = (x: number, y: number, hp = 1): Brick => ({ id: 0, x, y, w: 48, h: 24, hp, maxHp: hp });
const cornerBrick = () => brickAt(160, 160);
/** 磚塊在垂直射出的路徑上，中心是 (400, 312)。 */
const inPathLayout = () => [brickAt(376, 300), cornerBrick()];

const monsterAt = (x: number, y: number, hp: number, boss = false): Monster => ({
  id: 0,
  pos: { x, y },
  radius: boss ? 52 : 36,
  hp,
  maxHp: hp,
  boss,
});

function dropGame(opts: Partial<GameOptions> = {}) {
  return createGame({
    playerCount: 1,
    seed: 1,
    layout: inPathLayout,
    dropChance: 1,
    powerUpKinds: ['supply'],
    ...opts,
  });
}

/** 所有玩家的指標都停在 x，只有第一位玩家額外帶著 first 的按鍵。 */
function inputs(game: Game, x: number, first: PlayerInput = at(x)): PlayerInput[] {
  return game.state.players.map((_, i) => (i === 0 ? first : at(x)));
}

function run(game: Game, seconds: number, x: number) {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) game.step(dt, inputs(game, x));
}

function runUntil(game: Game, done: () => boolean, x: number, maxSeconds = 20) {
  const dt = 1 / 60;
  for (let t = 0; t < maxSeconds && !done(); t += dt) game.step(dt, inputs(game, x));
}

/** 從下方玩家垂直射出一顆彈珠，打碎路徑上的磚塊。 */
function breakPathBrick(game: Game) {
  const before = game.state.bricks.length;
  game.step(1 / 60, inputs(game, 400, rightClick(400)));
  runUntil(game, () => game.state.bricks.length < before, 400);
}

/** 直接把道具放在某位玩家的擋板上，用來測試拾取的效果。 */
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

describe('道具掉落', () => {
  test('掉落機率是 0 時，擊碎磚塊不會掉落道具', () => {
    const game = dropGame({ dropChance: 0 });

    breakPathBrick(game);

    expect(game.state.powerUps).toHaveLength(0);
  });

  test('擊碎磚塊掉落道具：單人只有一個，出現在磚塊中心，朝自己的方位飄', () => {
    const game = dropGame();

    breakPathBrick(game);

    const [p] = game.state.powerUps;
    expect(game.state.powerUps).toHaveLength(1);
    expect(p!.side).toBe('bottom');
    expect(p!.kind).toBe('supply');
    expect(p!.pos.x).toBeCloseTo(400);
    const y0 = p!.pos.y;
    run(game, 1, 100);
    expect(p!.pos.y).toBeGreaterThan(y0 + 50);
    expect(p!.pos.x).toBeCloseTo(400);
  });

  test('每位在場玩家的方位各掉一個、類型相同、屬於同一批；牆沒有道具', () => {
    const game = dropGame({ playerCount: 3, powerUpKinds: ['supply', 'widen', 'multiball'] });

    breakPathBrick(game);

    const drops = game.state.powerUps;
    expect(drops.map((p) => p.side).sort()).toEqual(['bottom', 'left', 'top']);
    expect(new Set(drops.map((p) => p.kind)).size).toBe(1);
    expect(new Set(drops.map((p) => p.batch)).size).toBe(1);
  });

  test('不同次掉落的批次不同', () => {
    const game = dropGame({ layout: () => [brickAt(376, 300), brickAt(176, 300), cornerBrick()] });
    breakPathBrick(game);
    const before = game.state.bricks.length;
    game.step(1 / 60, inputs(game, 200, rightClick(200)));
    runUntil(game, () => game.state.bricks.length < before, 200);

    const batches = new Set(game.state.powerUps.map((p) => p.batch));

    expect(game.state.powerUps).toHaveLength(2);
    expect(batches.size).toBe(2);
  });

  test('預設掉落機率約 15%', () => {
    let dropped = 0;
    const games = 300;
    for (let seed = 1; seed <= games; seed++) {
      const game = createGame({ playerCount: 1, seed, layout: inPathLayout });
      breakPathBrick(game);
      if (game.state.powerUps.length > 0) dropped++;
    }

    expect(dropped / games).toBeGreaterThan(0.08);
    expect(dropped / games).toBeLessThan(0.25);
  });

  test('沒有被接到的道具飄出場地後消失，不影響彈珠池', () => {
    const game = dropGame();
    breakPathBrick(game);
    const pool = game.state.pool;

    runUntil(game, () => game.state.powerUps.length === 0, 100);

    expect(game.state.powerUps).toHaveLength(0);
    expect(game.state.pool).toBe(pool);
  });

  test('道具只有被擋板碰到才拾取：擋板在別處時不會拾取', () => {
    const game = dropGame();
    const p = placeOnPaddle(game, 'bottom', 'supply');
    p.pos.x = 100;

    game.step(1 / 60, [at(400)]);

    expect(game.state.powerUps).toHaveLength(1);
    expect(game.state.pool).toBe(10);
  });
});

describe('補給', () => {
  test('被擋板接到，彈珠池增加 5 顆', () => {
    const game = dropGame();
    placeOnPaddle(game, 'bottom', 'supply');
    game.state.pool = 4;

    game.step(1 / 60, [at(400)]);

    expect(game.state.pool).toBe(9);
    expect(game.state.powerUps).toHaveLength(0);
  });

  test('實際掉落的補給也能接到：從磚塊飄下來被擋板接住', () => {
    const game = dropGame();
    breakPathBrick(game);
    const pool = game.state.pool;

    runUntil(game, () => game.state.powerUps.length === 0, 400);

    expect(game.state.pool).toBe(pool + 5);
  });

  test('彈珠池不會超過人數乘以 20', () => {
    const game = dropGame();
    placeOnPaddle(game, 'bottom', 'supply');
    game.state.pool = 17;

    game.step(1 / 60, [at(400)]);

    expect(game.state.pool).toBe(20);
  });

  test('已經在上限的彈珠池接補給不會增加', () => {
    const game = dropGame({ playerCount: 2 });
    placeOnPaddle(game, 'bottom', 'supply');
    game.state.pool = 40;

    game.step(1 / 60, [at(400), at(400)]);

    expect(game.state.pool).toBe(40);
  });

  test('同一批補給只有第一個被接到的生效，其餘立刻消失', () => {
    const game = dropGame({ playerCount: 2 });
    placeOnPaddle(game, 'bottom', 'supply', 5, 1);
    const far = placeOnPaddle(game, 'top', 'supply', 5, 2);
    far.pos.y = 300;
    game.state.pool = 10;

    game.step(1 / 60, [at(400), at(400)]);

    expect(game.state.pool).toBe(15);
    expect(game.state.powerUps).toHaveLength(0);
  });

  test('不同批的補給各自生效', () => {
    const game = dropGame();
    placeOnPaddle(game, 'bottom', 'supply', 1, 1);
    placeOnPaddle(game, 'bottom', 'supply', 2, 2);
    game.state.pool = 3;

    game.step(1 / 60, [at(400)]);

    expect(game.state.pool).toBe(13);
  });
});

describe('加寬', () => {
  const catchWiden = (game: Game, id = 900) => {
    placeOnPaddle(game, 'bottom', 'widen', id, id);
    game.step(1 / 60, [at(400)]);
  };
  const widenGame = () => dropGame({ layout: () => [cornerBrick()], powerUpKinds: ['widen'] });

  /** 彈珠在 x=400 垂直來回；擋板移到 paddleX 等著，回傳回來時彈珠是否還在場上。 */
  const catchesAt = (game: Game, paddleX: number) => {
    game.step(1 / 60, [rightClick(400)]);
    run(game, 4.5, paddleX);
    return game.state.marbles.length === 1;
  };

  test('被擋板接到，該玩家的擋板變寬 10 秒，之後恢復', () => {
    const game = widenGame();
    catchWiden(game);

    expect(game.state.players[0]!.widen).toBeGreaterThan(9.9);
    run(game, 9.5, 400);
    expect(game.state.players[0]!.widen).toBeGreaterThan(0);
    run(game, 1, 400);
    expect(game.state.players[0]!.widen).toBe(0);
  });

  test('加寬的擋板接得到原本會漏接的彈珠', () => {
    // 回來的彈珠在 x=400，擋板在 x=480：一般半寬 60 接不到，加寬後半寬 90 接得到。
    const plain = widenGame();
    const wide = widenGame();
    catchWiden(wide);

    expect(catchesAt(plain, 480)).toBe(false);
    expect(catchesAt(wide, 480)).toBe(true);
  });

  test('加寬後接球的反彈角度仍以擋板中心與擊中位置計算', () => {
    const game = widenGame();
    catchWiden(game);
    game.step(1 / 60, [rightClick(400)]);
    // 彈珠 x=400 回來時，擋板中心在 x=490：偏移 -90，是加寬後的邊緣，往左斜彈。
    let bounced = false;
    for (let t = 0; t < 5 && !bounced; t += 1 / 60) {
      const before = game.state.marbles[0];
      const vy = before?.vel.y ?? 0;
      game.step(1 / 60, [at(490)]);
      const after = game.state.marbles[0];
      if (vy > 0 && after && after.vel.y < 0) bounced = true;
    }

    expect(bounced).toBe(true);
    expect(game.state.marbles[0]!.vel.x).toBeLessThan(-300);
  });

  test('效果期間再接到加寬，只重新計時，寬度不再增加', () => {
    const game = widenGame();
    catchWiden(game, 1);
    run(game, 6, 400);
    expect(game.state.players[0]!.widen).toBeLessThan(5);

    catchWiden(game, 2);

    expect(game.state.players[0]!.widen).toBeGreaterThan(9.9);
    // 偏移 110 超出加寬後的半寬 90；若寬度疊加成 135 就會接到。
    expect(catchesAt(game, 510)).toBe(false);
  });

  test('只影響接到的玩家，同批其他玩家的加寬道具各自接各自的', () => {
    const game = dropGame({ playerCount: 2, powerUpKinds: ['widen'] });
    placeOnPaddle(game, 'bottom', 'widen', 7, 1);
    const top = placeOnPaddle(game, 'top', 'widen', 7, 2);
    top.pos.y = 300;

    game.step(1 / 60, [at(400), at(400)]);

    expect(game.state.players[0]!.widen).toBeGreaterThan(9.9);
    expect(game.state.players[1]!.widen).toBe(0);
    expect(game.state.powerUps).toHaveLength(1);
    expect(game.state.powerUps[0]!.side).toBe('top');

    game.state.powerUps[0]!.pos.y = 10;
    game.step(1 / 60, [at(400), at(400)]);

    expect(game.state.players[1]!.widen).toBeGreaterThan(9.9);
  });

  test('擋板在邊緣時接到加寬，擋板不會超出場地', () => {
    const game = widenGame();
    game.step(1 / 60, [at(0)]);
    placeOnPaddle(game, 'bottom', 'widen');

    game.step(1 / 60, [at(0)]);

    expect(game.state.players[0]!.paddle).toBeGreaterThanOrEqual(90);
  });
});

describe('多球', () => {
  const multiGame = (playerCount: GameOptions['playerCount'] = 1) =>
    dropGame({ playerCount, layout: () => [cornerBrick()], powerUpKinds: ['multiball'] });

  test('場上每顆彈珠各分裂成三顆，速度大小不變、方向略有不同', () => {
    const game = multiGame();
    game.step(1 / 60, [rightClick(400)]);
    game.step(1 / 60, [rightClick(400)]);
    const speed = Math.hypot(game.state.marbles[0]!.vel.x, game.state.marbles[0]!.vel.y);
    placeOnPaddle(game, 'bottom', 'multiball');

    game.step(1 / 60, [at(400)]);

    expect(game.state.marbles).toHaveLength(6);
    for (const m of game.state.marbles) expect(Math.hypot(m.vel.x, m.vel.y)).toBeCloseTo(speed);
    const angles = new Set(game.state.marbles.map((m) => Math.round(Math.atan2(m.vel.x, -m.vel.y) * 100)));
    expect(angles.size).toBe(3);
  });

  test('分裂不會從彈珠池扣除，也不會增加彈珠池', () => {
    const game = multiGame();
    game.step(1 / 60, [rightClick(400)]);
    const pool = game.state.pool;
    placeOnPaddle(game, 'bottom', 'multiball');

    game.step(1 / 60, [at(400)]);

    expect(game.state.marbles).toHaveLength(3);
    expect(game.state.pool).toBe(pool);
  });

  test('包含其他玩家發射的彈珠，每顆都分裂', () => {
    const game = multiGame(2);
    game.step(1 / 60, [at(400), rightClick(400)]);
    game.step(1 / 60, [rightClick(400), at(400)]);
    expect(game.state.marbles).toHaveLength(2);
    placeOnPaddle(game, 'bottom', 'multiball');

    game.step(1 / 60, [at(400), at(400)]);

    expect(game.state.marbles).toHaveLength(6);
  });

  test('同一批多球只有第一個被接到的生效，其餘立刻消失', () => {
    const game = multiGame(2);
    game.step(1 / 60, [rightClick(400), at(400)]);
    placeOnPaddle(game, 'bottom', 'multiball', 3, 1);
    const far = placeOnPaddle(game, 'top', 'multiball', 3, 2);
    far.pos.y = 300;

    game.step(1 / 60, [at(400), at(400)]);

    expect(game.state.marbles).toHaveLength(3);
    expect(game.state.powerUps).toHaveLength(0);
  });

  test('場上彈珠有上限 100 顆，超出的分裂結果不產生', () => {
    const game = multiGame(4);
    for (let i = 0; i < 10; i++) game.step(1 / 60, game.state.players.map(() => rightClick(400)));
    expect(game.state.marbles).toHaveLength(40);
    placeOnPaddle(game, 'bottom', 'multiball');

    game.step(1 / 60, game.state.players.map(() => at(400)));

    expect(game.state.marbles).toHaveLength(100);
  });

  test('失敗條件只看彈珠池與場上彈珠，不受分裂影響', () => {
    // 磚塊夠硬，彈珠亂飛也不會意外過關而補滿彈珠池。
    const game = dropGame({ layout: () => [brickAt(160, 160, 100000)], powerUpKinds: ['multiball'] });
    for (let i = 0; i < 10; i++) game.step(1 / 60, [rightClick(400)]);
    placeOnPaddle(game, 'bottom', 'multiball');
    game.step(1 / 60, [at(400)]);
    expect(game.state.pool).toBe(0);
    expect(game.state.marbles.length).toBeGreaterThan(10);
    expect(game.state.status).toBe('playing');

    runUntil(game, () => game.state.marbles.length === 0, 100, 300);

    expect(game.state.marbles).toHaveLength(0);
    expect(game.state.status).toBe('defeated');
  });
});

describe('怪物與 BOSS 掉落', () => {
  /** 怪物在彈珠垂直射出的路徑上；擋板接住每一次反彈，所以彈珠會持續撞擊怪物。 */
  const monsterGame = (hp: number, boss: boolean, playerCount: GameOptions['playerCount'] = 1) =>
    createGame({
      playerCount,
      seed: 1,
      layout: () => [cornerBrick()],
      monsters: (level) => (level === 1 ? [monsterAt(400, 560, hp, boss)] : []),
      dropChance: 0,
      powerUpKinds: ['widen'],
    });

  /** 第一位玩家的擋板跟著怪物走，彈珠打完就再補發一顆，讓彈珠持續撞擊怪物。 */
  function chase(game: Game) {
    const x = game.state.monsters[0]?.pos.x ?? 400;
    return inputs(game, x, game.state.marbles.length === 0 ? rightClick(x) : at(x));
  }

  /** 一路推進到 until 成立，回傳期間看過的道具編號。 */
  function dropIds(game: Game, until: () => boolean) {
    const seen = new Set<number>();
    for (let t = 0; t < 120 && !until(); t += 1 / 60) {
      game.step(1 / 60, chase(game));
      for (const p of game.state.powerUps) seen.add(p.id);
    }
    return seen;
  }

  test('血量降到門檻時掉落，每個門檻只掉一次，打倒時也不重複', () => {
    const game = monsterGame(6, false);
    game.state.pool = 100;
    const hp = () => game.state.monsters[0]?.hp ?? 0;

    // 6 點血：血量還高於 66%（約 4 點）時不掉落。
    const early = dropIds(game, () => hp() <= 4);
    expect(early.size).toBe(0);

    // 之後降到 3 點掉一次、降到 1 點再掉一次，打倒時不再掉。
    const rest = dropIds(game, () => game.state.monsters.length === 0);
    expect(rest.size).toBe(2);
  });

  test('BOSS 與一般怪物使用同樣的規則', () => {
    const game = monsterGame(6, true);
    game.state.pool = 100;

    const all = dropIds(game, () => game.state.monsters.length === 0);

    expect(all.size).toBe(2);
  });

  test('怪物掉落朝每位玩家的方位各一個、類型相同、同一批', () => {
    const game = monsterGame(6, false, 3);
    game.state.pool = 100;
    const hp = () => game.state.monsters[0]?.hp ?? 0;
    for (let t = 0; t < 120 && hp() > 3; t += 1 / 60) game.step(1 / 60, chase(game));

    const drops = game.state.powerUps;

    expect(drops.map((p) => p.side).sort()).toEqual(['bottom', 'left', 'top']);
    expect(new Set(drops.map((p) => p.kind)).size).toBe(1);
    expect(new Set(drops.map((p) => p.batch)).size).toBe(1);
  });
});
