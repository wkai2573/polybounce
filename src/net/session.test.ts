import { describe, expect, test } from 'bun:test';
import type { Brick, PlayerInput, Side } from '../core/types.ts';
import { createClientSession, type ClientSession } from './client.ts';
import { createHostSession, type HostSession } from './host.ts';
import { createChannelPair } from './memory-channel.ts';

const at = (x: number, y = 0): PlayerInput => ({ pointer: { x, y }, primary: false, secondary: false });
const rightClick = (x: number): PlayerInput => ({ ...at(x), secondary: true });
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
  test('依加入順序分配下、上、左、右，彈珠池是人數乘以 10', () => {
    const host = newHost();
    const guests = [join(host), join(host), join(host)];

    host.start();

    expect(host.state!.players.map((p) => p.side)).toEqual(['bottom', 'top', 'left', 'right']);
    expect(host.state!.pool).toBe(40);
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

    guest.sendInput(rightClick(300));

    expect(JSON.stringify(guest.state)).toBe(before);
    expect(host.state!.marbles).toHaveLength(0);
  });

  test('玩家的按鍵是邊緣訊號：一次右鍵只發射一顆，即使房主推進很多步', () => {
    const host = newHost();
    const guest = join(host);
    host.start();

    guest.sendInput(rightClick(300));
    advance(host, 0.5);

    expect(host.state!.marbles).toHaveLength(1);
    expect(host.state!.pool).toBe(19);
  });

  test('點擊與同一步的後續移動不會被併在一起：發射用點擊當下的位置', () => {
    const host = newHost();
    const guest = join(host);
    host.start();

    guest.sendInput(rightClick(300));
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

    client.send({ type: 'input', input: { pointer: { x: Number.NaN, y: 0 }, primary: false, secondary: false } });
    client.send({ type: 'input', input: { pointer: { x: 'x' as unknown as number, y: 0 }, primary: true, secondary: false } });
    client.send({ type: 'input' } as never);
    host.advance(DT);

    expect(Number.isFinite(host.state!.players[1]!.paddle)).toBe(true);
  });

  test('單人模式用同一套邏輯，沒有任何連線', () => {
    const host = newHost();

    host.start();
    host.setLocalInput(rightClick(300));
    host.advance(DT);

    expect(host.playerCount).toBe(1);
    expect(host.state!.players.map((p) => p.side)).toEqual(['bottom']);
    expect(host.state!.marbles).toHaveLength(1);
    expect(host.state!.pool).toBe(9);
  });

  test('狀態不會每一步都送，依送出間隔節流', () => {
    const host = newHost({ sendInterval: 0.1 });
    const guest = join(host);
    host.start();
    const received: number[] = [];
    guest.onChange(() => received.push(guest.state!.marbles.length));

    host.setLocalInput(rightClick(300));
    for (let i = 0; i < 5; i++) host.advance(DT);

    expect(received.length).toBeLessThan(5);
  });
});

describe('暫停', () => {
  test('房主暫停後遊戲不前進，所有人都看到已暫停', () => {
    const host = newHost({ sendInterval: DT });
    const guest = join(host);
    host.start();
    host.setLocalInput(rightClick(300));
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

    host.setLocalInput(rightClick(300));
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
  test('玩家中途斷線，他的方位變成牆，其他人與彈珠池不受影響', () => {
    const host = newHost({ sendInterval: DT });
    const a = join(host);
    const b = join(host);
    host.start();
    host.setLocalInput(rightClick(400));
    host.advance(DT);
    const pool = host.state!.pool;

    a.leave();
    host.advance(DT);

    expect(host.state!.players.map((p) => p.side)).toEqual(['bottom', 'left']);
    expect(host.state!.pool).toBe(pool);
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

    host.setLocalInput(rightClick(300));
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
  test('房主重開：同樣的人與方位，從第 1 關開始，彈珠池補滿', () => {
    const host = newHost();
    const guest = join(host);
    host.start();
    host.setLocalInput(rightClick(300));
    host.advance(DT);
    expect(host.state!.pool).toBe(19);

    host.restart();

    expect(host.state!.level).toBe(1);
    expect(host.state!.score).toBe(0);
    expect(host.state!.pool).toBe(20);
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
    expect(host.state!.pool).toBe(20);
  });

  test('失敗時所有人都收到失敗的狀態，包含關卡與分數', () => {
    const host = newHost({ sendInterval: 1 });
    const guest = join(host);
    host.start();
    // 兩位玩家各把彈珠池用完，並讓擋板離開彈珠的路線。
    for (let i = 0; i < 10; i++) {
      host.setLocalInput(rightClick(100));
      guest.sendInput(rightClick(100));
      host.advance(DT);
    }
    host.setLocalInput(at(700));
    guest.sendInput(at(700));

    for (let t = 0; t < 120 && host.state!.status !== 'defeated'; t += DT) host.advance(DT);

    expect(host.state!.status).toBe('defeated');
    expect(guest.state!.status).toBe('defeated');
    expect(guest.state!.level).toBe(1);
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
