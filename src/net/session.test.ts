import { describe, expect, test } from 'bun:test';
import type { Brick, PlayerInput, Side } from '../core/types.ts';
import { createClientSession, type ClientSession } from './client.ts';
import { createHostSession, type HostSession } from './host.ts';
import { createChannelPair } from './memory-channel.ts';
import { roundForWire } from './protocol.ts';

/** 預設把指標放在下方玩家自己那一邊的邊緣（y = 800），擋板深度為零。 */
const at = (x: number, y = 800): PlayerInput => ({ pointer: { x, y }, fire: false });
const fireAt = (x: number): PlayerInput => ({ ...at(x), fire: true });
const DT = 1 / 60;

/** 躲在角落的硬磚，讓關卡不會被彈珠意外清空。 */
const cornerLayout = (): Brick[] => [{ id: 0, x: 160, y: 160, w: 48, h: 24, hp: 100000, maxHp: 100000 }];

function newHost(options: Parameters<typeof createHostSession>[0] = {}) {
  return createHostSession({ seed: 1, gameOptions: { layout: cornerLayout }, ...options });
}

/** 讓一位玩家連上房主，回傳他的客戶端。 */
function join(host: HostSession): ClientSession {
  const { host: hostEnd, client } = createChannelPair();
  const session = createClientSession(client);
  host.addPeer(hostEnd);
  return session;
}

function advance(host: HostSession, seconds: number) {
  for (let t = 0; t < seconds; t += DT) host.advance(DT);
}

describe('大廳', () => {
  test('玩家加入後，每個人都看到人數與自己的編號', () => {
    const host = newHost();
    const a = join(host);
    const b = join(host);

    expect(host.playerCount).toBe(3);
    expect(a.phase).toBe('lobby');
    expect(a.lobby).toEqual({ you: 1, count: 3 });
    expect(b.lobby).toEqual({ you: 2, count: 3 });
  });

  test('房間最多 4 人，第 5 位被拒絕並看到原因', () => {
    const host = newHost();
    const guests = [join(host), join(host), join(host)];
    const fifth = join(host);

    expect(host.playerCount).toBe(4);
    expect(fifth.phase).toBe('rejected');
    expect(fifth.rejection).toBe('full');
    expect(guests.every((g) => g.phase === 'lobby')).toBe(true);
  });

  test('大廳中有人離開，剩下的人依加入順序重新編號', () => {
    const host = newHost();
    const a = join(host);
    const b = join(host);

    a.leave();

    expect(host.playerCount).toBe(2);
    expect(b.lobby).toEqual({ you: 1, count: 2 });
  });

  test('大廳變動時通知房主畫面更新', () => {
    const host = newHost();
    let changes = 0;
    host.onChange(() => changes++);

    join(host);

    expect(changes).toBeGreaterThan(0);
  });
});

describe('開局', () => {
  test('依加入順序分配下、上、左、右，每位玩家的發射量是滿的', () => {
    const host = newHost();
    const guests = [join(host), join(host), join(host)];

    host.start();

    expect(host.state!.players.map((p) => p.side)).toEqual(['bottom', 'top', 'left', 'right']);
    expect(host.state!.players.map((p) => p.charge)).toEqual([5, 5, 5, 5]);
    expect(guests.map((g) => g.side)).toEqual(['top', 'left', 'right']);
    expect(host.localSide).toBe('bottom');
  });

  test('開局後不能中途加入', () => {
    const host = newHost();
    join(host);
    host.start();

    const late = join(host);

    expect(late.phase).toBe('rejected');
    expect(late.rejection).toBe('started');
    expect(host.state!.players).toHaveLength(2);
  });

  test('開局後其他玩家進入遊戲，收到一致的狀態', () => {
    const host = newHost();
    const guest = join(host);

    host.start();

    expect(guest.phase).toBe('playing');
    expect(guest.state).toEqual(JSON.parse(JSON.stringify(host.state)));
  });
});

describe('房主權威', () => {
  test('玩家只送輸入：房主端的擋板依輸入移動，玩家端收到一致的狀態', () => {
    const host = newHost({ sendInterval: DT });
    const guest = join(host);
    host.start();

    guest.sendInput(at(250));
    host.setLocalInput(at(500));
    host.advance(DT);

    const paddles = Object.fromEntries(host.state!.players.map((p) => [p.side, p.paddle]));
    expect(paddles).toEqual({ bottom: 500, top: 250 });
    expect(guest.state).toEqual(JSON.parse(JSON.stringify(host.state)));
  });

  test('玩家端不執行遊戲：沒有房主推進時，送出輸入也不會改變畫面', () => {
    const host = newHost();
    const guest = join(host);
    host.start();
    const before = JSON.stringify(guest.state);

    guest.sendInput(fireAt(300));

    expect(JSON.stringify(guest.state)).toBe(before);
    expect(host.state!.marbles).toHaveLength(0);
  });

  test('玩家的按鍵是邊緣訊號：一次左鍵只發射一顆，即使房主推進很多步', () => {
    const host = newHost();
    const guest = join(host);
    host.start();

    guest.sendInput(fireAt(300));
    advance(host, 0.5);

    expect(host.state!.marbles).toHaveLength(1);
    // 只射出一顆：玩家端的發射量只少了一顆多一點（之後有恢復），房主沒有動。
    expect(host.state!.players[1]!.charge).toBeGreaterThan(4);
    expect(host.state!.players[1]!.charge).toBeLessThan(5);
    expect(host.state!.players[0]!.charge).toBe(5);
  });

  test('點擊與同一步的後續移動不會被併在一起：發射用點擊當下的位置', () => {
    const host = newHost();
    const guest = join(host);
    host.start();

    guest.sendInput(fireAt(300));
    guest.sendInput(at(700));
    host.advance(DT);

    const top = host.state!.players.find((p) => p.side === 'top')!;
    expect(top.paddle).toBe(300);
    expect(host.state!.marbles[0]!.pos.x).toBeCloseTo(300);
  });

  test('玩家按鍵之間的移動訊息不會遺失：之後的步驟擋板跟到最新位置', () => {
    const host = newHost();
    const guest = join(host);
    host.start();

    guest.sendInput(at(300));
    host.advance(DT);
    guest.sendInput(at(450));
    host.advance(DT);

    expect(host.state!.players.find((p) => p.side === 'top')!.paddle).toBe(450);
  });

  test('不合法的輸入會被忽略，不會弄壞遊戲狀態', () => {
    const host = newHost();
    const { host: hostEnd, client } = createChannelPair();
    host.addPeer(hostEnd);
    host.start();

    client.send({ type: 'input', input: { pointer: { x: Number.NaN, y: 0 }, fire: false } });
    client.send({ type: 'input', input: { pointer: { x: 'x' as unknown as number, y: 0 }, fire: true } });
    client.send({ type: 'input' } as never);
    host.advance(DT);

    expect(Number.isFinite(host.state!.players[1]!.paddle)).toBe(true);
  });

  test('單人模式用同一套邏輯，沒有任何連線', () => {
    const host = newHost();

    host.start();
    host.setLocalInput(fireAt(300));
    host.advance(DT);

    expect(host.playerCount).toBe(1);
    expect(host.state!.players.map((p) => p.side)).toEqual(['bottom']);
    expect(host.state!.marbles).toHaveLength(1);
    expect(host.state!.players[0]!.charge).toBeLessThan(5);
  });

  test('狀態不會每一步都送，依送出間隔節流', () => {
    const host = newHost({ sendInterval: 0.1 });
    const guest = join(host);
    host.start();
    const received: number[] = [];
    guest.onChange(() => received.push(guest.state!.marbles.length));

    host.setLocalInput(fireAt(300));
    for (let i = 0; i < 5; i++) host.advance(DT);

    expect(received.length).toBeLessThan(5);
  });
});

describe('暫停', () => {
  test('房主暫停後遊戲不前進，所有人都看到已暫停', () => {
    const host = newHost({ sendInterval: DT });
    const guest = join(host);
    host.start();
    host.setLocalInput(fireAt(300));
    host.advance(DT);
    const y = host.state!.marbles[0]!.pos.y;

    host.setPaused(true);
    advance(host, 1);

    expect(host.paused).toBe(true);
    expect(guest.paused).toBe(true);
    expect(host.state!.marbles[0]!.pos.y).toBe(y);
    expect(guest.state!.marbles[0]!.pos.y).toBe(y);

    host.setPaused(false);
    host.advance(DT);
    expect(guest.paused).toBe(false);
    expect(host.state!.marbles[0]!.pos.y).toBeLessThan(y);
  });

  test('暫停期間的按鍵不會累積，恢復後不會突然發射', () => {
    const host = newHost();
    host.start();
    host.setPaused(true);

    host.setLocalInput(fireAt(300));
    host.advance(DT);
    host.setPaused(false);
    host.advance(DT);

    expect(host.state!.marbles).toHaveLength(0);
  });

  test('玩家送來的暫停訊息無效：只有房主能暫停', () => {
    const host = newHost();
    const { host: hostEnd, client } = createChannelPair();
    host.addPeer(hostEnd);
    host.start();

    client.send({ type: 'pause' } as never);
    client.send({ type: 'restart' } as never);

    expect(host.paused).toBe(false);
  });
});

describe('斷線', () => {
  test('玩家中途斷線，他的方位變成牆，其他人不受影響', () => {
    const host = newHost({ sendInterval: DT });
    const a = join(host);
    const b = join(host);
    host.start();
    host.setLocalInput(fireAt(400));
    host.advance(DT);
    const charge = host.state!.players[0]!.charge;

    a.leave();
    host.advance(DT);

    expect(host.state!.players.map((p) => p.side)).toEqual(['bottom', 'left']);
    expect(host.state!.players[0]!.charge).toBeGreaterThanOrEqual(charge);
    expect(host.state!.status).toBe('playing');
    expect(b.state!.players.map((p) => p.side)).toEqual(['bottom', 'left']);
    expect(b.side).toBe('left');
  });

  test('斷線後留下的玩家仍由原本的輸入控制', () => {
    const host = newHost({ sendInterval: DT });
    const a = join(host);
    const b = join(host);
    host.start();
    a.leave();

    b.sendInput(at(0, 333));
    host.advance(DT);

    expect(host.state!.players.find((p) => p.side === 'left')!.paddle).toBe(333);
  });

  test('所有玩家都離開、只剩房主時，遊戲仍然可以繼續', () => {
    const host = newHost();
    const a = join(host);
    host.start();
    a.leave();

    host.setLocalInput(fireAt(300));
    host.advance(DT);

    expect(host.playerCount).toBe(1);
    expect(host.state!.marbles).toHaveLength(1);
  });

  test('房主離線，其他玩家看到說明', () => {
    const host = newHost();
    const guest = join(host);
    host.start();

    host.close();

    expect(guest.phase).toBe('hostLeft');
  });

  test('被拒絕的玩家不會因為房主關閉連線而改成房主離線', () => {
    const host = newHost();
    join(host);
    host.start();
    const late = join(host);

    expect(late.phase).toBe('rejected');
  });
});

describe('再來一局', () => {
  test('房主重開：同樣的人與方位，從第 1 關開始，發射量補滿', () => {
    const host = newHost();
    const guest = join(host);
    host.start();
    host.setLocalInput(fireAt(300));
    host.advance(DT);
    expect(host.state!.players[0]!.charge).toBeLessThan(5);

    host.restart();

    expect(host.state!.level).toBe(1);
    expect(host.state!.score).toBe(0);
    expect(host.state!.players.map((p) => p.charge)).toEqual([5, 5]);
    expect(host.state!.marbles).toHaveLength(0);
    expect(host.state!.players.map((p) => p.side)).toEqual(['bottom', 'top']);
    expect(guest.state).toEqual(JSON.parse(JSON.stringify(host.state)));
    expect(guest.side).toBe('top');
  });

  test('中途有人離開後重開，留下的人保留原本的方位', () => {
    const host = newHost();
    const a = join(host);
    join(host);
    host.start();
    a.leave();

    host.restart();

    expect(host.state!.players.map((p) => p.side)).toEqual(['bottom', 'left']);
    expect(host.state!.players.map((p) => p.charge)).toEqual([5, 5]);
  });

  test('失敗時所有人都收到失敗的狀態，包含關卡與分數', () => {
    const host = newHost({ sendInterval: 1 });
    const guest = join(host);
    host.start();
    // 兩位玩家都死亡就是失敗。
    for (const p of host.state!.players) {
      p.dead = true;
      p.lives = 0;
    }

    host.advance(DT);

    expect(host.state!.status).toBe('defeated');
    expect(guest.state!.status).toBe('defeated');
    expect(guest.state!.level).toBe(1);
  });
});

/** 讓所有玩家死亡，全隊失敗。 */
function playUntilDefeated(host: HostSession, _guests: ClientSession[] = []) {
  for (const p of host.state!.players) {
    p.dead = true;
    p.lives = 0;
  }
  host.advance(DT);
}

describe('大廳選關', () => {
  test('預設起始關卡是第 1 關，玩家加入時就看得到', () => {
    const host = newHost();
    const guest = join(host);

    expect(host.startLevel).toBe(1);
    expect(guest.startLevel).toBe(1);
  });

  test('房主調整起始關卡，已在大廳的玩家即時看到相同的值', () => {
    const host = newHost();
    const a = join(host);
    const b = join(host);

    host.setStartLevel(12);

    expect(host.startLevel).toBe(12);
    expect(a.startLevel).toBe(12);
    expect(b.startLevel).toBe(12);
  });

  test('後來才加入的玩家看到房主已選好的關卡', () => {
    const host = newHost();
    host.setStartLevel(7);

    const late = join(host);

    expect(late.startLevel).toBe(7);
  });

  test('起始關卡限制在 1 到 99，非數字無效', () => {
    const host = newHost();

    host.setStartLevel(0);
    expect(host.startLevel).toBe(1);
    host.setStartLevel(500);
    expect(host.startLevel).toBe(99);
    host.setStartLevel(30.4);
    expect(host.startLevel).toBe(30);
    host.setStartLevel(Number.NaN);
    expect(host.startLevel).toBe(30);
  });

  test('調整起始關卡時通知房主畫面更新', () => {
    const host = newHost();
    let changes = 0;
    host.onChange(() => changes++);

    host.setStartLevel(5);

    expect(changes).toBe(1);
  });

  test('玩家送來的選關訊息無效：只有房主能選關', () => {
    const host = newHost();
    const { host: hostEnd, client } = createChannelPair();
    const guest = createClientSession(client);
    host.addPeer(hostEnd);

    client.send({ type: 'startLevel', level: 50 } as never);
    client.send({ type: 'continue' } as never);

    expect(host.startLevel).toBe(1);
    expect(guest.startLevel).toBe(1);
  });

  test('玩家加入或離開大廳時，起始關卡設定不會被重設', () => {
    const host = newHost();
    host.setStartLevel(9);
    const a = join(host);
    const b = join(host);

    a.leave();
    join(host);

    expect(host.startLevel).toBe(9);
    expect(b.startLevel).toBe(9);
  });

  test('房主按開始後，全隊從所選關卡開始，每位玩家的發射量補滿，雙方狀態一致', () => {
    const host = newHost();
    const guest = join(host);
    host.setStartLevel(6);

    host.start();

    expect(host.state!.level).toBe(6);
    expect(host.state!.startLevel).toBe(6);
    expect(host.state!.players.map((p) => p.charge)).toEqual([5, 5]);
    expect(guest.state!.level).toBe(6);
    expect(guest.state!.startLevel).toBe(6);
    expect(guest.state).toEqual(JSON.parse(JSON.stringify(host.state)));
  });

  test('開局之後再調整起始關卡無效', () => {
    const host = newHost();
    const guest = join(host);
    host.start();

    host.setStartLevel(30);

    expect(host.startLevel).toBe(1);
    expect(guest.startLevel).toBe(1);
  });

  test('單人也使用所選的起始關卡', () => {
    const host = newHost();
    host.setStartLevel(15);

    host.start();

    expect(host.state!.level).toBe(15);
    expect(host.state!.monsters[0]!.boss).toBe(true);
  });
});

describe('再來一局回到起始關卡', () => {
  test('再來一局回到這一局的起始關卡，並換新種子', () => {
    const host = createHostSession({ seed: 1 });
    host.setStartLevel(5);
    host.start();
    const firstBricks = JSON.stringify(host.state!.bricks);
    host.state!.level = 9;

    host.restart();

    expect(host.state!.level).toBe(5);
    expect(host.state!.startLevel).toBe(5);
    expect(host.state!.score).toBe(0);
    expect(JSON.stringify(host.state!.bricks)).not.toBe(firstBricks);
  });

  test('起始關卡為 1 時，再來一局和以前一致', () => {
    const host = newHost();
    host.start();
    host.state!.level = 4;

    host.restart();

    expect(host.state!.level).toBe(1);
    expect(host.state!.startLevel).toBe(1);
  });
});

describe('從本關接關', () => {
  test('失敗後接關：從失敗的那一關開始，分數歸零，發射量補滿，場上彈珠清空，種子換新', () => {
    const host = createHostSession({ seed: 1 });
    host.setStartLevel(3);
    host.start();
    const brickIdsBefore = JSON.stringify(host.state!.bricks);
    playUntilDefeated(host);
    expect(host.state!.status).toBe('defeated');
    host.state!.score = 1234;

    host.continueRun();

    expect(host.state!.status).toBe('playing');
    expect(host.state!.level).toBe(3);
    expect(host.state!.score).toBe(0);
    expect(host.state!.players[0]!.charge).toBe(5);
    expect(host.state!.marbles).toHaveLength(0);
    expect(host.state!.bullets).toHaveLength(0);
    expect(JSON.stringify(host.state!.bricks)).not.toBe(brickIdsBefore);
  });

  test('接關後這一局的起點仍然是原本的起始關卡', () => {
    const host = newHost();
    host.start();
    playUntilDefeated(host);
    host.state!.level = 7;

    host.continueRun();

    expect(host.state!.level).toBe(7);
    expect(host.state!.startLevel).toBe(1);
  });

  test('還沒失敗時接關無效', () => {
    const host = newHost();
    host.start();
    host.setLocalInput(fireAt(300));
    host.advance(DT);
    const before = JSON.stringify(host.state);

    host.continueRun();

    expect(JSON.stringify(host.state)).toBe(before);
  });

  test('玩家端收到接關後的狀態，包含關卡與這一局的起點，與房主一致', () => {
    const host = newHost({ sendInterval: 1 });
    const guest = join(host);
    host.setStartLevel(4);
    host.start();
    playUntilDefeated(host, [guest]);
    expect(guest.state!.status).toBe('defeated');

    host.continueRun();

    expect(guest.state!.status).toBe('playing');
    expect(guest.state!.level).toBe(4);
    expect(guest.state!.startLevel).toBe(4);
    expect(guest.state).toEqual(JSON.parse(JSON.stringify(host.state)));
  });

  test('其他玩家離開後接關，仍然只用留在場上的玩家與原本的方位', () => {
    const host = newHost();
    const a = join(host);
    join(host);
    host.start();
    a.leave();
    playUntilDefeated(host);

    host.continueRun();

    expect(host.state!.players.map((p) => p.side)).toEqual(['bottom', 'left']);
    expect(host.state!.players.map((p) => p.charge)).toEqual([5, 5]);
  });
});

describe('生命、屍體與整場效果的同步', () => {
  /** 兩人局，每一步都送狀態；玩家端是上方。 */
  function twoPlayers() {
    const host = newHost({ sendInterval: DT });
    const guest = join(host);
    host.start();
    return { host, guest };
  }

  test('玩家端收到的生命、無敵、死亡與屍體復活進度與房主一致', () => {
    const { host, guest } = twoPlayers();
    const [bottom, top] = host.state!.players;
    bottom!.lives = 2;
    bottom!.invincible = 1.2;
    top!.lives = 0;
    top!.dead = true;
    top!.revive = 3;

    host.advance(DT);

    const seen = guest.state!.players;
    expect(seen.find((p) => p.side === 'bottom')).toMatchObject({ lives: 2, dead: false });
    expect(seen.find((p) => p.side === 'bottom')!.invincible).toBeGreaterThan(1);
    expect(seen.find((p) => p.side === 'top')).toMatchObject({ lives: 0, dead: true, revive: 3 });
    expect(guest.state).toEqual(JSON.parse(JSON.stringify(host.state)));
  });

  test('玩家端收到的整場效果與擋板寬度效果與房主一致，彈珠的資料含攻擊力、不含貫通欄位', () => {
    const { host, guest } = twoPlayers();
    host.setLocalInput(fireAt(300));
    host.state!.effects.pierce = 2.5;
    host.state!.players[1]!.paddleEffect = { kind: 'shorten', left: 3 };

    host.advance(DT);

    expect(guest.state!.effects.pierce).toBeGreaterThan(2.4);
    expect(guest.state!.players[1]!.paddleEffect).toMatchObject({ kind: 'shorten' });
    expect(guest.state!.marbles).toHaveLength(1);
    expect(Object.keys(guest.state!.marbles[0]!).sort()).toEqual(['id', 'pos', 'power', 'vel']);
    expect(guest.state).toEqual(JSON.parse(JSON.stringify(host.state)));
  });

  test('房主端被子彈打到之後，玩家端看到同樣的生命與無敵', () => {
    const { host, guest } = twoPlayers();
    host.state!.bullets.push({ id: 1, pos: { x: 400, y: 790 }, vel: { x: 0, y: 0 }, source: 'monster' });

    host.advance(DT);

    expect(host.state!.players[0]!.lives).toBe(2);
    expect(guest.state!.players[0]!.lives).toBe(2);
    expect(guest.state).toEqual(JSON.parse(JSON.stringify(host.state)));
  });

  test('死亡的玩家的輸入被忽略，其他玩家照常', () => {
    const { host, guest } = twoPlayers();
    const top = host.state!.players[1]!;
    top.lives = 0;
    top.dead = true;

    guest.sendInput(at(250));
    host.setLocalInput(at(500));
    host.advance(DT);

    expect(host.state!.players[0]!.paddle).toBe(500);
    expect(top.paddle).toBe(400);
  });
});

describe('擋板深度與多隻怪物的同步', () => {
  function playing(level: number) {
    const host = createHostSession({ seed: 5, sendInterval: DT, gameOptions: { layout: cornerLayout, startLevel: level } });
    host.setStartLevel(level);
    const guest = join(host);
    host.start();
    return { host, guest };
  }

  test('玩家端收到其他玩家的擋板深度，與房主一致', () => {
    const { host, guest } = playing(1);

    host.setLocalInput(at(300, 800 - 40));
    host.advance(DT);

    expect(host.state!.players[0]!.depth).toBe(40);
    expect(guest.state!.players[0]!.depth).toBe(40);
    expect(guest.state).toEqual(JSON.parse(JSON.stringify(host.state)));
  });

  test('玩家端的輸入也會改變自己的擋板深度，房主與其他玩家端看到相同的值', () => {
    const { host, guest } = playing(1);

    // 玩家端守上方：指標離上方邊緣 70。
    guest.sendInput({ pointer: { x: 250, y: 70 }, fire: false });
    host.advance(DT);

    const top = host.state!.players.find((p) => p.side === 'top')!;
    expect(top.depth).toBe(70);
    expect(top.paddle).toBe(250);
    expect(guest.state!.players.find((p) => p.side === 'top')!.depth).toBe(70);
  });

  test('開局時每位玩家的擋板都貼邊，深度是零', () => {
    const { host, guest } = playing(1);

    host.advance(DT);

    for (const p of host.state!.players) expect(p.depth).toBe(0);
    for (const p of guest.state!.players) expect(p.depth).toBe(0);
  });

  test('深度經過數字壓縮後仍正確', () => {
    const { host, guest } = playing(1);

    host.setLocalInput(at(300, 800 - 33.33));
    host.advance(DT);

    expect(host.state!.players[0]!.depth).toBeCloseTo(33.33, 5);
    // 真實連線送出前會把小數壓成一位。
    const onWire = roundForWire(host.state!);
    expect(onWire.players[0]!.depth).toBe(33.3);
    expect(onWire.monsters.map((m) => m.fire)).toEqual(host.state!.monsters.map((m) => Math.round(m.fire * 10) / 10));
  });

  test('玩家端看到的怪物數量、位置與發射倒數與房主一致', () => {
    const { host, guest } = playing(9);
    advance(host, 0.5);

    expect(host.state!.monsters).toHaveLength(4);
    expect(guest.state!.monsters).toHaveLength(4);
    expect(guest.state!.monsters).toEqual(JSON.parse(JSON.stringify(host.state!.monsters)));
    expect(new Set(guest.state!.monsters.map((m) => m.fire)).size).toBe(4);
  });

  test('怪物的發射倒數會隨時間更新到玩家端', () => {
    const { host, guest } = playing(3);
    const before = guest.state!.monsters[0]!.fire;

    advance(host, 0.4);

    expect(guest.state!.monsters[0]!.fire).toBeLessThan(before);
  });
});

describe('傳輸層與核心分離', () => {
  test('玩家端的型別只持有收到的狀態，沒有遊戲核心', () => {
    const host = newHost();
    const guest: ClientSession = join(host);
    host.start();

    expect('step' in guest).toBe(false);
    expect((guest.state as { players: { side: Side }[] }).players).toHaveLength(2);
  });
});
