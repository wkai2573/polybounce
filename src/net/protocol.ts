import type { GameState, PlayerInput, Side } from '../core/types.ts';

/** 房間最多 4 人。 */
export const MAX_PLAYERS = 4;

/** 其他玩家只會傳送輸入；暫停、再來一局、接關與選關只有房主能做，所以沒有對應的訊息。 */
export type ClientMessage = { type: 'input'; input: PlayerInput };

export type RejectReason = 'full' | 'started';

export type HostMessage =
  /** 大廳狀態：you 是收到這則訊息的人在加入順序中的編號（從 0 開始），count 是目前總人數，startLevel 是房主選的起始關卡。 */
  | { type: 'lobby'; you: number; count: number; startLevel: number }
  | { type: 'rejected'; reason: RejectReason }
  /** 開局：告知這位玩家守哪個方位。 */
  | { type: 'start'; you: Side }
  | { type: 'state'; state: GameState; paused: boolean };

/**
 * 送上網路前壓縮狀態的數字：小數只留一位。座標與速度多出來的位數肉眼看不出差別，
 * 卻會讓每則狀態的位元組數多出一倍以上。
 */
export function roundForWire<T>(message: T): T {
  return JSON.parse(JSON.stringify(message, (_key, value) => (typeof value === 'number' ? Math.round(value * 10) / 10 : value)));
}

/**
 * 一條可雙向傳訊的連線。真實實作用 PeerJS，測試用記憶體內的假連線。
 * In 是這一端會收到的訊息，Out 是這一端會送出的訊息。
 */
export interface Channel<In, Out> {
  send(message: Out): void;
  onMessage(handler: (message: In) => void): void;
  /** 連線關閉時呼叫，不論是哪一端關的。 */
  onClose(handler: () => void): void;
  close(): void;
}

export type HostChannel = Channel<ClientMessage, HostMessage>;
export type ClientChannel = Channel<HostMessage, ClientMessage>;
