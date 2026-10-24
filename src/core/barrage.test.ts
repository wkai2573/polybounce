import { describe, expect, test } from 'bun:test';
import { BULLET_CAP } from './config.ts';
import { createGame } from './game.ts';
import type { Brick, Bullet, BulletSource, Game, GameOptions, Monster, PlayerInput } from './types.ts';

const at = (x: number): PlayerInput => ({ pointer: { x, y: 0 }, primary: false, secondary: false });
const rightClick = (x: number): PlayerInput => ({ ...at(x), secondary: true });
const DT = 1 / 60;

const cornerBrick = (): Brick => ({ id: 99, x: 160, y: 160, w: 48, h: 24, hp: 100000, maxHp: 100000 });

const monsterAt = (x: number, y: number, hp: number, boss: boolean, id = 0): Monster => ({
  id,
  pos: { x, y },
  radius: boss ? 52 : 36,
  hp,
  maxHp: hp,
  boss,
});

function newGame(monsters: () => Monster[], opts: Partial<GameOptions> = {}) {
  return createGame({ playerCount: 1, seed: 1, layout: () => [cornerBrick()], monsters, dropChance: 0, ...opts });
}

const bossGame = (hp = 100, opts: Partial<GameOptions> = {}) =>
  newGame(() => [monsterAt(400, 400, hp, true)], opts);

function step(game: Game, x = 400) {
  game.step(DT, game.state.players.map(() => at(x)));
}

/** 一路推進，記錄每一步新射出的子彈。 */
function collectVolleys(game: Game, seconds: number, x = 400) {
  const volleys: { t: number; bullets: Bullet[] }[] = [];
  let seen = -1;
  for (const b of game.state.bullets) seen = Math.max(seen, b.id);
  for (let t = 0; t < seconds; t += DT) {
    const player = game.state.monsters.find((m) => m.boss);
    // 把 BOSS 固定在場地中央，方便推算角度。
    if (player) {
      player.pos.x = 400;
      player.pos.y = 400;
    }
    step(game, x);
    const fresh = game.state.bullets.filter((b) => b.id > seen);
    if (fresh.length > 0) {
      volleys.push({ t, bullets: fresh.map((b) => ({ ...b, pos: { ...b.pos }, vel: { ...b.vel } })) });
      seen = Math.max(seen, ...fresh.map((b) => b.id));
    }
  }
  return volleys;
}

const angleDeg = (b: Bullet) => (((Math.atan2(b.vel.y, b.vel.x) * 180) / Math.PI) % 360 + 360) % 360;
const speedOf = (b: Bullet) => Math.hypot(b.vel.x, b.vel.y);
/** 兩個角度之間最短的差（度）。 */
const gap = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

describe('BOSS 彈幕：環形', () => {
  test('約 1.2 秒後施放第一次，一圈 24 發、均勻分佈在 360 度', () => {
    const game = bossGame();

    const [first] = collectVolleys(game, 2);

    expect(first!.t).toBeGreaterThan(1.1);
    expect(first!.t).toBeLessThan(1.3);
    expect(first!.bullets).toHaveLength(24);
    const angles = first!.bullets.map(angleDeg).sort((a, b) => a - b);
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? angles[i + 1]! : angles[0]! + 360;
      expect(next - angles[i]!).toBeCloseTo(15, 4);
    }
  });

  test('子彈從 BOSS 的位置出發，標示為 BOSS 的子彈，速度在 160 到 240 之間且有快有慢', () => {
    const game = bossGame();

    const [first] = collectVolleys(game, 2);

    for (const b of first!.bullets) {
      expect(b.source).toBe('boss' satisfies BulletSource);
      expect(speedOf(b)).toBeGreaterThanOrEqual(160);
      expect(speedOf(b)).toBeLessThanOrEqual(240);
      expect(Math.hypot(b.pos.x - 400, b.pos.y - 400)).toBeLessThan(10);
    }
    const speeds = new Set(first!.bullets.map((b) => Math.round(speedOf(b))));
    expect(speeds.size).toBeGreaterThan(5);
  });

  test('每次環形齊射整圈都轉動一點角度，縫隙每次不同', () => {
    const game = bossGame();

    const rings = collectVolleys(game, 9).filter((v) => v.bullets.length === 24);

    expect(rings.length).toBeGreaterThanOrEqual(2);
    const offset = (bullets: Bullet[]) => Math.min(...bullets.map(angleDeg).map((a) => ((a % 15) + 15) % 15));
    const turned = Math.abs(gap(offset(rings[0]!.bullets), offset(rings[1]!.bullets)));
    expect(turned).toBeGreaterThan(1);
  });

  test('BOSS 血量降到一半以下進入狂暴：齊射更密、每圈發數增加', () => {
    const calm = bossGame(100);
    const calmFirst = collectVolleys(calm, 3);
    const raging = bossGame(100);
    raging.state.monsters[0]!.hp = 50;
    const ragingFirst = collectVolleys(raging, 3);

    expect(ragingFirst[0]!.bullets.length).toBeGreaterThan(calmFirst[0]!.bullets.length);
    const calmGap = calmFirst[1]!.t - calmFirst[0]!.t;
    const ragingGap = ragingFirst[1]!.t - ragingFirst[0]!.t;
    expect(ragingGap).toBeLessThan(calmGap);
  });

  test('血量剛好比一半多一點時還不算狂暴', () => {
    const game = bossGame(100);
    game.state.monsters[0]!.hp = 51;

    const [first] = collectVolleys(game, 2);

    expect(first!.bullets).toHaveLength(24);
  });
});

describe('BOSS 彈幕：瞄準扇形與螺旋', () => {
  test('依序輪替：環形、瞄準扇形、螺旋，然後回到環形', () => {
    const game = bossGame();

    const volleys = collectVolleys(game, 9.5);
    const sizes = volleys.map((v) => v.bullets.length);

    expect(sizes[0]).toBe(24);
    expect(sizes[1]).toBe(7);
    const spiralShots = sizes.slice(2, sizes.indexOf(24, 2));
    expect(spiralShots.length).toBeGreaterThanOrEqual(15);
    expect(spiralShots.every((n) => n === 1)).toBe(true);
    expect(sizes.indexOf(24, 2)).toBeGreaterThan(2);
  });

  test('瞄準扇形朝玩家的擋板射出 7 發，最外側夾角約 40 度，中央那發對準擋板', () => {
    const game = bossGame();

    const fan = collectVolleys(game, 3)[1]!;

    expect(fan.bullets).toHaveLength(7);
    // BOSS 在 (400, 400)，單人的擋板在正下方，所以中央那發朝下（90 度）。
    const angles = fan.bullets.map(angleDeg).sort((a, b) => a - b);
    expect(angles[3]!).toBeCloseTo(90, 0);
    expect(angles[6]! - angles[0]!).toBeCloseTo(40, 0);
    for (const b of fan.bullets) expect(b.source).toBe('boss');
  });

  test('瞄準扇形朝擋板目前的位置射，擋板移動後方向跟著變', () => {
    const left = collectVolleys(bossGame(), 3, 100)[1]!;
    const right = collectVolleys(bossGame(), 3, 700)[1]!;
    const mid = (v: { bullets: Bullet[] }) => v.bullets.map(angleDeg).sort((a, b) => a - b)[3]!;

    // 擋板在左邊時，中央那發偏向左（角度大於 90）；在右邊時偏向右。
    expect(mid(left)).toBeGreaterThan(100);
    expect(mid(right)).toBeLessThan(80);
  });

  test('兩位玩家時，瞄準扇形兩邊的玩家都有機會成為目標', () => {
    const targets = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const game = newGame(() => [monsterAt(400, 400, 100, true)], { playerCount: 2, seed });
      const fan = collectVolleys(game, 3)[1]!;
      const center = fan.bullets.map(angleDeg).sort((a, b) => a - b)[3]!;
      targets.add(center > 180 ? 'top' : 'bottom');
    }

    expect([...targets].sort()).toEqual(['bottom', 'top']);
  });

  test('螺旋約持續 2 秒，每 0.1 秒射出一發，角度逐發旋轉', () => {
    const game = bossGame();

    const volleys = collectVolleys(game, 6.5);
    const spiral = volleys.slice(2).filter((v) => v.bullets.length === 1);
    const first = spiral[0]!;
    const run = spiral.filter((v) => v.t - first.t < 2.1);

    expect(run.length).toBeGreaterThanOrEqual(19);
    expect(run.length).toBeLessThanOrEqual(21);
    for (let i = 1; i < run.length; i++) expect(run[i]!.t - run[i - 1]!.t).toBeCloseTo(0.1, 1);
    const turns = run.slice(1).map((v, i) => gap(angleDeg(run[i]!.bullets[0]!), angleDeg(v.bullets[0]!)));
    expect(turns.every((d) => d > 0)).toBe(true);
    expect(turns.every((d) => d < 45)).toBe(true);
  });

  test('狂暴時瞄準扇形的發數增加、螺旋射得更密', () => {
    const calm = collectVolleys(bossGame(100), 6.5);
    const rageGame = bossGame(100);
    rageGame.state.monsters[0]!.hp = 40;
    const rage = collectVolleys(rageGame, 6.5);

    expect(rage[1]!.bullets.length).toBeGreaterThan(calm[1]!.bullets.length);
    const shots = (volleys: typeof calm) => volleys.slice(2).filter((v) => v.bullets.length === 1 && v.t < 6).length;
    expect(shots(rage)).toBeGreaterThan(shots(calm));
  });

  test('場上沒有玩家時，挑選目標不會出錯', () => {
    const game = bossGame();
    game.removePlayer('bottom');

    expect(() => {
      for (let t = 0; t < 10; t += DT) game.step(DT, []);
    }).not.toThrow();
  });
});

describe('BOSS 彈幕：子彈上限與其他規則', () => {
  /** 在場中放滿不動的子彈，不會自己消失。 */
  function fillStationary(game: Game, count: number) {
    for (let i = 0; i < count; i++) {
      game.state.bullets.push({ id: 1000 + i, pos: { x: 300, y: 300 }, vel: { x: 0, y: 0 }, source: 'monster' });
    }
  }

  test('場上子彈總數不會超過上限', () => {
    const game = bossGame();
    fillStationary(game, BULLET_CAP - 1);

    let peak = 0;
    for (let t = 0; t < 10; t += DT) {
      step(game);
      peak = Math.max(peak, game.state.bullets.length);
    }

    expect(peak).toBe(BULLET_CAP);
  });

  test('達到上限時暫時不再發射，數量下降後恢復', () => {
    const game = bossGame();
    fillStationary(game, BULLET_CAP);

    for (let t = 0; t < 6; t += DT) step(game);
    expect(game.state.bullets).toHaveLength(BULLET_CAP);
    expect(game.state.bullets.every((b) => b.source === 'monster')).toBe(true);

    game.state.bullets = [];
    const volleys = collectVolleys(game, 3);

    expect(volleys.length).toBeGreaterThan(0);
  });

  test('一般怪物維持每 5 秒向一位玩家發射一發，不受 BOSS 彈幕影響', () => {
    const game = newGame(() => [monsterAt(400, 300, 100, true, 0), monsterAt(200, 300, 100, false, 1)]);
    const normalBullets = () => game.state.bullets.filter((b) => b.source === 'monster');

    for (let t = 0; t < 4.9; t += DT) step(game);
    expect(normalBullets()).toHaveLength(0);

    for (let t = 0; t < 0.2; t += DT) step(game);
    expect(normalBullets()).toHaveLength(1);
    expect(speedOf(normalBullets()[0]!)).toBeCloseTo(200);
  });

  test('彈幕不影響彈珠的物理', () => {
    const control = newGame(() => []);
    const barrage = bossGame();
    for (const game of [control, barrage]) game.step(DT, [rightClick(400)]);

    for (let i = 0; i < 180; i++) {
      // 把 BOSS 放在遠離彈珠路徑的地方。
      barrage.state.monsters[0]!.pos = { x: 220, y: 220 };
      step(control);
      step(barrage);
    }

    expect(barrage.state.bullets.length).toBeGreaterThan(0);
    expect(barrage.state.marbles[0]!.pos).toEqual(control.state.marbles[0]!.pos);
    expect(barrage.state.marbles[0]!.vel).toEqual(control.state.marbles[0]!.vel);
  });
});

describe('BOSS 子彈的凍結規則', () => {
  const quiet = () => newGame(() => []);

  function shoot(game: Game, source: BulletSource, y = 776) {
    game.state.bullets.push({ id: 5000 + game.state.bullets.length, pos: { x: 400, y }, vel: { x: 0, y: 60 }, source });
  }

  function runUntilGone(game: Game, seconds = 2) {
    for (let t = 0; t < seconds && game.state.bullets.length > 0; t += DT) step(game);
  }

  const player = (game: Game) => game.state.players[0]!;

  test('BOSS 的子彈打到擋板，該玩家凍結 0.5 秒，子彈消失', () => {
    const game = quiet();
    shoot(game, 'boss');

    runUntilGone(game);

    expect(game.state.bullets).toHaveLength(0);
    expect(player(game).frozen).toBeGreaterThan(0.45);
    expect(player(game).frozen).toBeLessThanOrEqual(0.5);
  });

  test('凍結期間再被 BOSS 的子彈打到，凍結剩餘時間不重新計時，子彈消失', () => {
    const game = quiet();
    shoot(game, 'boss');
    runUntilGone(game);
    for (let i = 0; i < 12; i++) step(game);
    const remaining = player(game).frozen;
    expect(remaining).toBeGreaterThan(0.1);
    expect(remaining).toBeLessThan(0.4);

    shoot(game, 'boss');
    runUntilGone(game);

    expect(game.state.bullets).toHaveLength(0);
    expect(player(game).frozen).toBeLessThan(remaining);
  });

  test('解凍後 1 秒內無敵：BOSS 的子彈穿過擋板，不凍結、不消失', () => {
    const game = quiet();
    shoot(game, 'boss');
    runUntilGone(game);
    for (let i = 0; i < 40 && player(game).frozen > 0; i++) step(game);
    expect(player(game).frozen).toBe(0);
    expect(player(game).invincible).toBeGreaterThan(0.9);

    shoot(game, 'boss');
    const bullet = game.state.bullets[0]!;
    let passed = false;
    for (let i = 0; i < 40 && game.state.bullets.length > 0; i++) {
      step(game);
      expect(player(game).frozen).toBe(0);
      if (bullet.pos.y > 801) passed = true;
    }

    expect(passed).toBe(true);
  });

  test('無敵結束後，BOSS 的子彈又會凍結玩家', () => {
    const game = quiet();
    shoot(game, 'boss');
    runUntilGone(game);
    for (let i = 0; i < 40 && player(game).frozen > 0; i++) step(game);
    for (let i = 0; i < 70; i++) step(game);
    expect(player(game).invincible).toBe(0);

    shoot(game, 'boss');
    runUntilGone(game);

    expect(player(game).frozen).toBeGreaterThan(0.4);
  });

  test('一般怪物的子彈維持舊規則：凍結 1 秒，凍結中再被打到重新計時', () => {
    const game = quiet();
    shoot(game, 'monster');
    runUntilGone(game);
    expect(player(game).frozen).toBeGreaterThan(0.95);
    for (let i = 0; i < 30; i++) step(game);
    expect(player(game).frozen).toBeLessThan(0.55);

    shoot(game, 'monster');
    runUntilGone(game);

    expect(player(game).frozen).toBeGreaterThan(0.95);
  });

  test('一般怪物的子彈不受 BOSS 的無敵影響', () => {
    const game = quiet();
    shoot(game, 'boss');
    runUntilGone(game);
    for (let i = 0; i < 40 && player(game).frozen > 0; i++) step(game);
    expect(player(game).invincible).toBeGreaterThan(0.5);

    shoot(game, 'monster');
    runUntilGone(game);

    expect(game.state.bullets).toHaveLength(0);
    expect(player(game).frozen).toBeGreaterThan(0.95);
  });

  test('BOSS 子彈的半徑 4 比一般子彈的 5 小：擦過擋板邊緣的距離不同', () => {
    // 子彈從擋板右緣外側 4.5 格處飛過：半徑 4 的 BOSS 子彈擦不到，半徑 5 的一般子彈會碰到。
    const edge = 400 + 60 + 4.5;
    const pass = (source: BulletSource) => {
      const game = quiet();
      game.state.bullets.push({ id: 1, pos: { x: edge, y: 776 }, vel: { x: 0, y: 60 }, source });
      runUntilGone(game);
      return game.state.players[0]!.frozen;
    };

    expect(pass('boss')).toBe(0);
    expect(pass('monster')).toBeGreaterThan(0);
  });
});
