import Peer, { type DataConnection } from 'peerjs';
import { createClientSession, type ClientSession } from './client.ts';
import type { HostSession } from './host.ts';
import type { Channel } from './protocol.ts';
import { generateRoomCode, normalizeRoomCode, peerIdForRoom } from './room-code.ts';

/** 這一層只負責把 PeerJS 接成可替換的傳輸介面，不含遊戲規則，所以不在單元測試範圍內。 */

const CONNECT_TIMEOUT_MS = 10000;
const ROOM_CODE_ATTEMPTS = 5;
const PEER_OPTIONS = { debug: 1 };
/** 狀態是純 JSON，用 json 序列化最單純，也不依賴二進位編碼器對物件的處理。 */
const CONNECT_OPTIONS = { reliable: true, serialization: 'json' } as const;

function toChannel<In, Out>(conn: DataConnection): Channel<In, Out> {
  const closeHandlers: Array<() => void> = [];
  let closed = false;
  const notifyClosed = () => {
    if (closed) return;
    closed = true;
    closeHandlers.forEach((h) => h());
  };
  conn.on('close', notifyClosed);
  conn.on('error', () => {
    // 連線出錯時主動關掉底層連線，避免殘留。
    conn.close();
    notifyClosed();
  });
  return {
    send: (message) => {
      if (conn.open) conn.send(message);
    },
    onMessage: (handler) => {
      conn.on('data', (data) => handler(data as In));
    },
    onClose: (handler) => {
      closeHandlers.push(handler);
    },
    close: () => {
      conn.close();
      notifyClosed();
    },
  };
}

function describeError(type: string): string {
  switch (type) {
    case 'peer-unavailable':
      return '找不到這個房間，請確認房間碼是否正確，以及房主是否還開著房間';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return '無法連線到配對伺服器，請檢查網路後再試一次';
    case 'browser-incompatible':
      return '這個瀏覽器不支援點對點連線';
    default:
      return `連線失敗（${type}）`;
  }
}

export interface OpenRoom {
  code: string;
  close(): void;
}

/** 房主開房間：取得房間碼後，之後連進來的人交給 session。房間碼被占用時自動換一組重試。 */
export function openRoom(session: HostSession): Promise<OpenRoom> {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function attempt() {
      attempts++;
      const code = generateRoomCode();
      const peer = new Peer(peerIdForRoom(code), PEER_OPTIONS);

      peer.on('open', () => {
        peer.on('connection', (conn) => {
          conn.on('open', () => session.addPeer(toChannel(conn)));
        });
        // 與配對伺服器斷線時，已經建立的連線不受影響；重連是為了還能接受新的加入。
        peer.on('disconnected', () => peer.reconnect());
        resolve({
          code,
          close() {
            session.close();
            peer.destroy();
          },
        });
      });

      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && attempts < ROOM_CODE_ATTEMPTS) {
          peer.destroy();
          attempt();
          return;
        }
        reject(new Error(describeError(err.type)));
      });
    }

    attempt();
  });
}

/** 輸入房間碼加入房間；連線成功時回傳玩家端的 session。失敗時 reject 並附上說明。 */
export function joinRoom(input: string): Promise<{ session: ClientSession; close(): void }> {
  const code = normalizeRoomCode(input);
  if (!code) return Promise.reject(new Error('房間碼是 5 個字母或數字'));

  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_OPTIONS);
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.destroy();
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail('連線逾時，請確認房間碼，或請房主重新建立房間'), CONNECT_TIMEOUT_MS);

    peer.on('error', (err) => fail(describeError(err.type)));
    peer.on('open', () => {
      const conn = peer.connect(peerIdForRoom(code), CONNECT_OPTIONS);
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const session = createClientSession(toChannel(conn));
        resolve({
          session,
          close() {
            session.leave();
            peer.destroy();
          },
        });
      });
    });
  });
}
