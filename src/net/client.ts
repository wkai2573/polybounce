import type { GameState, PlayerInput, Side } from '../core/types.ts';
import type { ClientChannel, RejectReason } from './protocol.ts';

export type ClientPhase = 'connecting' | 'lobby' | 'playing' | 'rejected' | 'hostLeft';

/**
 * 房主以外的玩家：只送輸入、只顯示收到的狀態，不執行任何遊戲邏輯。
 */
export interface ClientSession {
  readonly phase: ClientPhase;
  readonly lobby: { you: number; count: number } | null;
  /** 開局後這位玩家守的方位。 */
  readonly side: Side | null;
  /** 最近一次收到的遊戲狀態。 */
  readonly state: GameState | null;
  readonly paused: boolean;
  readonly rejection: RejectReason | null;
  sendInput(input: PlayerInput): void;
  /** 任何欄位改變時呼叫。 */
  onChange(handler: () => void): void;
  /** 主動離開房間。 */
  leave(): void;
}

export function createClientSession(channel: ClientChannel): ClientSession {
  let phase: ClientPhase = 'connecting';
  let lobby: ClientSession['lobby'] = null;
  let side: Side | null = null;
  let state: GameState | null = null;
  let paused = false;
  let rejection: RejectReason | null = null;
  let leaving = false;
  const handlers: Array<() => void> = [];
  const emit = () => handlers.forEach((h) => h());

  channel.onMessage((message) => {
    switch (message.type) {
      case 'lobby':
        phase = 'lobby';
        lobby = { you: message.you, count: message.count };
        break;
      case 'rejected':
        phase = 'rejected';
        rejection = message.reason;
        break;
      case 'start':
        phase = 'playing';
        side = message.you;
        break;
      case 'state':
        state = message.state;
        paused = message.paused;
        break;
      default:
        return;
    }
    emit();
  });

  channel.onClose(() => {
    // 被拒絕之後房主會關掉連線，那不算房主離線。
    if (leaving || phase === 'rejected' || phase === 'hostLeft') return;
    phase = 'hostLeft';
    emit();
  });

  return {
    get phase() {
      return phase;
    },
    get lobby() {
      return lobby;
    },
    get side() {
      return side;
    },
    get state() {
      return state;
    },
    get paused() {
      return paused;
    },
    get rejection() {
      return rejection;
    },
    sendInput(input) {
      channel.send({ type: 'input', input });
    },
    onChange(handler) {
      handlers.push(handler);
    },
    leave() {
      leaving = true;
      channel.close();
    },
  };
}
