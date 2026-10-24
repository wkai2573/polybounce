import { describe, expect, test } from 'bun:test';
import { PADDLE_MAX_DEPTH } from './config.ts';
import { createGame } from './game.ts';
import { revivePlayer } from './paddle.ts';
import { at, atDepth } from './test-input.ts';
import type { Brick, Game, GameOptions, Marble, PlayerInput, PlayerState, PowerUp, Side } from './types.ts';

const DT = 1 / 60;

/** 躲在角落、不會擋到中線彈珠的磚塊，讓關卡不會一開始就算清空。 */
const cornerBrick = (): Brick => ({ id: 99, x: 160, y: 160, w: 48, h: 24, hp: 100000, maxHp: 100000 });

function newGame(opts: Partial<GameOptions> = {}) {
  return createGame({ playerCount: 1, seed: 1, layout: () => [cornerBrick()], monsters: () => [], dropChance: 0, ...opts });
}

const player = (game: Game, side: Side = 'bottom'): PlayerState => game.state.players.find((p) => p.side === side)!;

/** 每位玩家的指標都放在自己那一邊的邊緣、沿邊座標 x；overrides 指定的玩家改用給定的輸入。 */
function step(game: Game, x = 400, overrides: Partial<Record<Side, PlayerInput>> = {}) {
  game.step(DT, game.state.players.map((p) => overrides[p.side] ?? at(x, p.side)));
}

/** 只有下方玩家有輸入，其餘玩家的指標在自己的邊緣。 */
const stepWith = (game: Game, input: PlayerInput) => step(game, 400, { bottom: input });

function kill(game: Game, side: Side) {
  const p = player(game, side);
  p.lives = 0;
  p.dead = true;
  p.aiming = false;
}

const addMarble = (game: Game, marble: Omit<Marble, 'id'>): Marble => {
  const m = { id: 5000 + game.state.marbles.length, ...marble };
  game.state.marbles.push(m);
  return m;
};

const bullet = (game: Game, x: number, y: number, vx = 0, vy = 0) => {
  game.state.bullets.push({ id: 7000 + game.state.bullets.length, pos: { x, y }, vel: { x: vx, y: vy }, source: 'monster' });
};

describe('擋板深度：由指標離自己那一邊的距離決定', () => {
  test('一開局深度是零', () => {
    expect(newGame().state.players[0]!.depth).toBe(0);
  });

  test('指標離邊越遠深度越大，剛好等於距離', () => {
    const game = newGame();

    stepWith(game, atDepth(400, 30));
    expect(player(game).depth).toBe(30);

    stepWith(game, atDepth(400, 75));
    expect(player(game).depth).toBe(75);
  });

  test('指標超出範圍時，深度夾在零到上限', () => {
    const game = newGame();

    stepWith(game, atDepth(400, 5000));
    expect(player(game).depth).toBe(PADDLE_MAX_DEPTH);

    stepWith(game, atDepth(400, -50));
    expect(player(game).depth).toBe(0);
  });

  test('深度停在哪就留在哪，指標沒動就不會自己彈回邊緣', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 60));

    for (let i = 0; i < 120; i++) stepWith(game, atDepth(400, 60));

    expect(player(game).depth).toBe(60);
  });

  test('深度上限是一百', () => {
    expect(PADDLE_MAX_DEPTH).toBe(100);
  });

  test('上下左右四個方位對稱：各自垂直於自己的那一邊', () => {
    const game = newGame({ playerCount: 4 });
    const overrides: Partial<Record<Side, PlayerInput>> = {};
    for (const p of game.state.players) overrides[p.side] = atDepth(300, 40, p.side);

    step(game, 400, overrides);

    for (const p of game.state.players) {
      expect(p.depth).toBe(40);
      expect(p.paddle).toBe(300);
    }
  });

  test('四個方位的深度也都夾在上限', () => {
    const game = newGame({ playerCount: 4 });
    const overrides: Partial<Record<Side, PlayerInput>> = {};
    for (const p of game.state.players) overrides[p.side] = atDepth(300, 700, p.side);

    step(game, 400, overrides);

    for (const p of game.state.players) expect(p.depth).toBe(PADDLE_MAX_DEPTH);
  });

  test('沿邊的位置與深度互不影響', () => {
    const game = newGame();

    stepWith(game, atDepth(250, 80));

    expect(player(game).paddle).toBe(250);
    expect(player(game).depth).toBe(80);
  });
});

describe('擋板深度：瞄準與死亡', () => {
  test('瞄準模式下沿邊位置與深度都鎖住，取消後恢復跟隨指標', () => {
    const game = newGame();
    stepWith(game, { ...atDepth(300, 40), primary: true });
    expect(player(game).aiming).toBe(true);

    stepWith(game, atDepth(500, 90));
    expect(player(game).paddle).toBe(300);
    expect(player(game).depth).toBe(40);

    stepWith(game, { ...atDepth(500, 90), secondary: true });
    stepWith(game, atDepth(500, 90));
    expect(player(game).aiming).toBe(false);
    expect(player(game).paddle).toBe(500);
    expect(player(game).depth).toBe(90);
  });

  test('瞄準後發射，擋板恢復跟隨指標', () => {
    const game = newGame();
    stepWith(game, { ...atDepth(300, 40), primary: true });

    stepWith(game, { ...atDepth(300, 40), primary: true });
    stepWith(game, atDepth(350, 20));

    expect(player(game).aiming).toBe(false);
    expect(game.state.marbles).toHaveLength(1);
    expect(player(game).paddle).toBe(350);
    expect(player(game).depth).toBe(20);
  });

  test('死亡玩家不再接收輸入，深度停在死亡時的值', () => {
    const game = newGame({ playerCount: 2 });
    step(game, 400, { bottom: atDepth(400, 60) });
    kill(game, 'bottom');

    step(game, 400, { bottom: atDepth(200, 10) });

    expect(player(game).depth).toBe(60);
    expect(player(game).paddle).toBe(400);
  });

  test('復活後擋板留在原位，下一個輸入再接手', () => {
    const game = newGame({ playerCount: 2 });
    step(game, 400, { bottom: atDepth(400, 60) });
    kill(game, 'bottom');
    revivePlayer(player(game));

    expect(player(game).depth).toBe(60);
    expect(player(game).paddle).toBe(400);

    step(game, 400, { bottom: atDepth(250, 20) });
    expect(player(game).depth).toBe(20);
    expect(player(game).paddle).toBe(250);
  });
});

describe('擋板深度：彈珠', () => {
  test('彈珠從擋板目前的位置發射', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 100));

    stepWith(game, { ...atDepth(400, 100), secondary: true });

    // 表面在 800 - 100 - 12 = 688，再往場內退彈珠半徑 6 加 1。
    expect(game.state.marbles[0]!.pos.y).toBeLessThan(688 - 6);
    expect(game.state.marbles[0]!.pos.y).toBeGreaterThan(660);
  });

  test('深度為零時的發射起點和原本一樣貼著邊緣', () => {
    const game = newGame();

    stepWith(game, { ...at(400), secondary: true });

    expect(game.state.marbles[0]!.pos.y).toBeGreaterThan(770);
    expect(game.state.marbles[0]!.pos.y).toBeLessThan(800 - 12);
  });

  test('彈珠在擋板目前的表面反彈，而不是貼邊的位置', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 100));
    const m = addMarble(game, { pos: { x: 400, y: 500 }, vel: { x: 0, y: 420 } });
    let lowest = 0;

    for (let i = 0; i < 90; i++) {
      stepWith(game, atDepth(400, 100));
      lowest = Math.max(lowest, m.pos.y);
    }

    expect(m.vel.y).toBeLessThan(0);
    // 反彈線 = 800 - (100 + 12 + 6) = 682
    expect(lowest).toBeLessThanOrEqual(683);
    expect(lowest).toBeGreaterThan(675);
    expect(game.state.marbles).toContain(m);
  });

  test('擋板往內移動追上正往邊緣飛的彈珠時，彈珠被反彈', () => {
    const game = newGame();
    const m = addMarble(game, { pos: { x: 400, y: 690 }, vel: { x: 0, y: 420 } });

    stepWith(game, atDepth(400, 100));

    expect(m.vel.y).toBeLessThan(0);
    expect(game.state.marbles).toContain(m);
  });

  test('擋板往內移動時，沒有對準擋板的彈珠不受影響', () => {
    const game = newGame();
    const m = addMarble(game, { pos: { x: 100, y: 690 }, vel: { x: 0, y: 420 } });

    stepWith(game, atDepth(400, 100));

    expect(m.vel.y).toBeGreaterThan(0);
  });

  test('已經在擋板後面的彈珠不被反彈，繼續飛出原本的邊緣算漏接', () => {
    const game = newGame();
    const m = addMarble(game, { pos: { x: 400, y: 720 }, vel: { x: 0, y: 420 } });

    stepWith(game, atDepth(400, 100));
    expect(m.vel.y).toBeGreaterThan(0);

    // 漏接仍在原本的邊緣：彈珠還沒飛出 800 就還在場上。
    for (let i = 0; i < 4; i++) stepWith(game, atDepth(400, 100));
    expect(m.pos.y).toBeGreaterThan(740);
    expect(game.state.marbles).toContain(m);

    for (let i = 0; i < 30; i++) stepWith(game, atDepth(400, 100));
    expect(game.state.marbles).not.toContain(m);
  });

  test('擋板往外退時，板後的彈珠不被困住，繼續飛出邊緣算漏接', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 100));
    const m = addMarble(game, { pos: { x: 400, y: 795 }, vel: { x: 0, y: 420 } });

    stepWith(game, atDepth(400, 50));
    expect(m.vel.y).toBeGreaterThan(0);

    for (let i = 0; i < 20; i++) stepWith(game, atDepth(400, 50));
    expect(game.state.marbles).not.toContain(m);
  });

  test('穿過擋板側邊的彈珠要飛出原本的邊緣才算漏接', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 100));
    const m = addMarble(game, { pos: { x: 100, y: 600 }, vel: { x: 0, y: 420 } });

    // 0.4 秒後約在 y = 768，離邊緣還有一段，仍在場上。
    for (let i = 0; i < 24; i++) stepWith(game, atDepth(400, 100));
    expect(m.pos.y).toBeGreaterThan(740);
    expect(game.state.marbles).toContain(m);

    for (let i = 0; i < 20; i++) stepWith(game, atDepth(400, 100));
    expect(game.state.marbles).not.toContain(m);
  });
});

describe('擋板深度：核心與子彈', () => {
  test('子彈打到核心的實際位置才扣血', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 100));

    // 核心中心離邊 100 + 6 = 106，也就是 y = 694。
    bullet(game, 400, 694);
    stepWith(game, atDepth(400, 100));

    expect(player(game).lives).toBe(2);
    expect(game.state.bullets).toHaveLength(0);
  });

  test('核心離開貼邊的位置之後，打在原本貼邊位置的子彈不會扣血', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 100));

    bullet(game, 400, 794);
    stepWith(game, atDepth(400, 100));

    expect(player(game).lives).toBe(3);
  });

  test('擋板其他部分仍然讓子彈穿過', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 100));

    bullet(game, 400 + 40, 694);
    stepWith(game, atDepth(400, 100));

    expect(player(game).lives).toBe(3);
    expect(game.state.bullets).toHaveLength(1);
  });

  test('無敵期間子彈穿過核心', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 100));
    player(game).invincible = 1;

    bullet(game, 400, 694);
    stepWith(game, atDepth(400, 100));

    expect(player(game).lives).toBe(3);
  });

  test('子彈越過有玩家的那一邊才消失，位置不隨擋板深度改變', () => {
    const game = newGame();
    stepWith(game, atDepth(100, 100));
    // 子彈在擋板核心之外，往邊緣直線飛行。
    bullet(game, 700, 600, 0, 200);

    let y = 600;
    for (let i = 0; i < 40 * 60 && game.state.bullets.length > 0; i++) {
      y = game.state.bullets[0]!.pos.y;
      stepWith(game, atDepth(100, 100));
    }

    expect(game.state.bullets).toHaveLength(0);
    // 最後一次還看得到時，已經貼近原本的邊緣（800）。
    expect(y).toBeGreaterThan(795);
  });

  test('怪物的子彈瞄準玩家核心的實際位置', () => {
    const game = newGame({
      monsters: () => [{ id: 0, pos: { x: 400, y: 400 }, radius: 36, hp: 5, maxHp: 5, boss: false, fire: 0.01 }],
    });
    stepWith(game, atDepth(100, 100));

    stepWith(game, atDepth(100, 100));

    const b = game.state.bullets[0]!;
    // 核心在 (100, 694)：由怪物 (400, 400) 指向它。
    const dx = 100 - 400;
    const dy = 694 - 400;
    const len = Math.hypot(dx, dy);
    expect(b.vel.x / Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(dx / len, 2);
    expect(b.vel.y / Math.hypot(b.vel.x, b.vel.y)).toBeCloseTo(dy / len, 2);
  });
});

describe('擋板深度：道具', () => {
  const widen = (game: Game, x: number, y: number): PowerUp => {
    const p: PowerUp = { id: 800, batch: 1, kind: 'widen', side: 'bottom', pos: { x, y } };
    game.state.powerUps.push(p);
    return p;
  };

  test('擋板往內迎接，道具在擋板目前的位置更早被接到', () => {
    const game = newGame();
    stepWith(game, atDepth(400, 100));
    const p = widen(game, 400, 650);
    let caughtAt = 0;

    for (let i = 0; i < 4 * 60 && game.state.powerUps.length > 0; i++) {
      caughtAt = p.pos.y;
      stepWith(game, atDepth(400, 100));
    }

    expect(player(game).paddleEffect?.kind).toBe('widen');
    // 擋板貼邊時要飄到 y = 800 - 12 - 12 = 776 才接得到。
    expect(caughtAt).toBeLessThan(700);
  });

  test('擋板貼邊時，同一個位置的道具還沒被接到', () => {
    const game = newGame();
    widen(game, 400, 650);

    for (let i = 0; i < 30; i++) stepWith(game, at(400));

    expect(game.state.powerUps).toHaveLength(1);
    expect(player(game).paddleEffect).toBeNull();
  });

  test('沒接到的道具飛到原本的邊緣才消失，不受擋板深度影響', () => {
    const game = newGame();
    stepWith(game, atDepth(100, 100));
    const p = widen(game, 700, 700);
    let lastY = 0;

    for (let i = 0; i < 10 * 60 && game.state.powerUps.length > 0; i++) {
      lastY = p.pos.y;
      stepWith(game, atDepth(100, 100));
    }

    expect(game.state.powerUps).toHaveLength(0);
    expect(player(game).paddleEffect).toBeNull();
    // 道具半徑 12：越過 800 + 12 才消失。
    expect(lastY).toBeGreaterThan(805);
  });
});

describe('擋板深度：屍體與牆', () => {
  test('屍體停在死亡時的深度，該方位的牆仍在邊緣：彈珠穿過屍體的位置，撞到邊緣才反彈', () => {
    const game = newGame({ playerCount: 2 });
    step(game, 400, { bottom: atDepth(400, 80) });
    kill(game, 'bottom');
    const m = addMarble(game, { pos: { x: 400, y: 600 }, vel: { x: 0, y: 420 } });
    let lowest = 0;

    for (let i = 0; i < 60; i++) {
      step(game);
      lowest = Math.max(lowest, m.pos.y);
    }

    expect(player(game).depth).toBe(80);
    // 屍體在 y = 800 - 80 - 12 = 708 一帶，彈珠沒有在那裡被擋住，一路飛到邊緣的牆才彈回。
    expect(lowest).toBeGreaterThan(785);
    expect(lowest).toBeLessThanOrEqual(794.1);
    expect(m.vel.y).toBeLessThan(0);
  });

  test('彈珠撞到該方位屍體沿邊範圍的牆時累計復活進度，累計五次復活，深度留在原位', () => {
    const game = newGame({ playerCount: 2 });
    step(game, 400, { bottom: atDepth(400, 80) });
    kill(game, 'bottom');

    for (let hit = 1; hit <= 5; hit++) {
      expect(player(game).dead).toBe(true);
      const m = addMarble(game, { pos: { x: 400, y: 780 }, vel: { x: 0, y: 420 } });
      for (let i = 0; i < 20 && m.vel.y > 0; i++) step(game);
      if (hit < 5) expect(player(game).revive).toBe(hit);
    }

    expect(player(game).dead).toBe(false);
    expect(player(game).depth).toBe(80);
    expect(player(game).paddle).toBe(400);
  });

  test('撞到屍體沿邊範圍以外的牆不累計復活進度', () => {
    const game = newGame({ playerCount: 2 });
    step(game, 400, { bottom: atDepth(400, 80) });
    kill(game, 'bottom');
    const m = addMarble(game, { pos: { x: 700, y: 780 }, vel: { x: 0, y: 420 } });

    for (let i = 0; i < 20 && m.vel.y > 0; i++) step(game);

    expect(m.vel.y).toBeLessThan(0);
    expect(player(game).revive).toBe(0);
  });
});

describe('擋板深度：角落重疊', () => {
  test('相鄰兩邊的擋板在角落重疊時，核心各自判定', () => {
    const game = newGame({ playerCount: 3 });
    // 下方擋板與左方擋板都貼著左下角，兩片擋板在角落重疊。
    const overrides = { bottom: atDepth(60, 100), left: atDepth(740, 100, 'left') };
    step(game, 400, overrides);
    expect(player(game, 'bottom').paddle).toBe(60);
    expect(player(game, 'left').paddle).toBe(740);

    // 打在下方核心 (60, 694)：只有下方扣血。
    bullet(game, 60, 694);
    step(game, 400, overrides);

    expect(player(game, 'bottom').lives).toBe(2);
    expect(player(game, 'left').lives).toBe(3);
    expect(player(game, 'top').lives).toBe(3);

    // 打在左方核心 (106, 740)：只有左方扣血。
    bullet(game, 106, 740);
    step(game, 400, overrides);

    expect(player(game, 'bottom').lives).toBe(2);
    expect(player(game, 'left').lives).toBe(2);
  });

  test('道具只被自己方位的擋板接到，角落重疊的另一片擋板不會搶走', () => {
    const game = newGame({ playerCount: 3 });
    const overrides = { bottom: atDepth(60, 100), left: atDepth(740, 100, 'left') };
    step(game, 400, overrides);
    // 左方的加寬道具停在兩片擋板重疊的位置附近。
    game.state.powerUps.push({ id: 801, batch: 1, kind: 'widen', side: 'left', pos: { x: 106, y: 694 } });

    step(game, 400, overrides);

    expect(player(game, 'left').paddleEffect?.kind).toBe('widen');
    expect(player(game, 'bottom').paddleEffect).toBeNull();
  });
});
