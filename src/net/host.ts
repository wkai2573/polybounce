import { ARENA_SIZE, MAX_START_LEVEL, MIN_START_LEVEL, SIDE_ORDER } from '../core/config.ts';
import { createGame } from '../core/game.ts';
import { along, pointAt } from '../core/geometry.ts';
import type { Game, GameOptions, GameState, PlayerInput, Side } from '../core/types.ts';
import { MAX_PLAYERS, type ClientMessage, type HostChannel } from './protocol.ts';

export interface HostSessionOptions {
  /** 第一局的種子；之後每次重開都換新的。 */
  seed?: number;
  /** 狀態送給其他玩家的最短間隔（秒）。房主的遊戲以更細的步長前進，不必每一步都送。 */
  sendInterval?: number;
  /** 傳給遊戲核心的其餘選項，讓測試能注入關卡配置。 */
  gameOptions?: Omit<GameOptions, 'playerCount' | 'sides' | 'seed'>;
}

export interface HostSession {
  readonly phase: 'lobby' | 'playing';
  /** 開局之後才有。 */
  readonly state: GameState | null;
  readonly paused: boolean;
  /** 大廳裡是加入的人數，開局後是還在場上的人數。房主本人也算一位。 */
  readonly playerCount: number;
  /** 房主自己的方位，永遠是下方。 */
  readonly localSide: Side;
  /** 大廳裡選的起始關卡，預設第 1 關；開局之後不再改變。 */
  readonly startLevel: number;
  /** 其他玩家連上來。大廳以外或人數已滿時，會回覆拒絕並關閉連線。 */
  addPeer(channel: HostChannel): void;
  /** 大廳人數或場上玩家改變時呼叫。 */
  onChange(handler: () => void): void;
  /** 房主在大廳調整起始關卡（限制在 1 到 99），並通知所有玩家。開局之後無效。 */
  setStartLevel(level: number): void;
  start(): void;
  setLocalInput(input: PlayerInput): void;
  /** 推進遊戲 dt 秒，並依送出間隔把狀態送給其他玩家。 */
  advance(dt: number): void;
  setPaused(paused: boolean): void;
  /** 再來一局：用目前還在的玩家與方位，回到這一局的起始關卡重開。 */
  restart(): void;
  /** 從本關接關：失敗之後，以失敗的那一關為起點重開，分數歸零。這一局的起點不變。沒有失敗時無效。 */
  continueRun(): void;
  close(): void;
}

interface Member {
  /** 房主自己沒有連線。 */
  channel: HostChannel | null;
  side: Side;
  /** 最近一次的輸入；按鍵邊緣在被遊戲讀走之前會累積。 */
  input: PlayerInput;
}

const DEFAULT_SEND_INTERVAL = 1 / 30;
const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 來自網路的輸入不可信，格式不對就整則丟掉。 */
function parseInput(message: ClientMessage): PlayerInput | null {
  if (message?.type !== 'input') return null;
  const input = message.input;
  if (!input || !input.pointer) return null;
  if (!isNumber(input.pointer.x) || !isNumber(input.pointer.y)) return null;
  return { pointer: { x: input.pointer.x, y: input.pointer.y }, primary: input.primary === true, secondary: input.secondary === true };
}

export function createHostSession(options: HostSessionOptions = {}): HostSession {
  const sendInterval = options.sendInterval ?? DEFAULT_SEND_INTERVAL;
  const members: Member[] = [{ channel: null, side: 'bottom', input: neutral() }];
  const changeHandlers: Array<() => void> = [];
  let phase: 'lobby' | 'playing' = 'lobby';
  let startLevel: number = MIN_START_LEVEL;
  let game: Game | null = null;
  let paused = false;
  let sinceSend = 0;
  let lastStatus: GameState['status'] = 'playing';

  /** 還沒收到輸入時的指標：自己那一邊邊緣的正中央。 */
  function neutral(side: Side = 'bottom'): PlayerInput {
    return { pointer: pointAt(side, ARENA_SIZE / 2, 0), primary: false, secondary: false };
  }

  const emitChange = () => changeHandlers.forEach((h) => h());

  function broadcastLobby() {
    members.forEach((m, index) => m.channel?.send({ type: 'lobby', you: index, count: members.length, startLevel }));
  }

  function broadcastState() {
    if (!game) return;
    sinceSend = 0;
    lastStatus = game.state.status;
    for (const m of members) m.channel?.send({ type: 'state', state: game.state, paused });
  }

  /** 方位依加入順序分配，只有大廳裡才會重新排。 */
  function assignSides() {
    members.forEach((m, i) => {
      m.side = SIDE_ORDER[i]!;
    });
  }

  function receive(member: Member, message: ClientMessage) {
    const input = parseInput(message);
    if (!input) return;
    const pending = member.input;
    const hasEdge = pending.primary || pending.secondary;
    // 有按鍵還沒被讀走時，保留按下當下的指標位置，不讓之後的移動蓋掉它。
    if (!hasEdge) pending.pointer = input.pointer;
    pending.primary ||= input.primary;
    pending.secondary ||= input.secondary;
  }

  /** 把累積的輸入交給遊戲，並清掉按鍵邊緣；指標位置保留到下一次輸入。 */
  function take(member: Member): PlayerInput {
    const out = { pointer: { ...member.input.pointer }, primary: member.input.primary, secondary: member.input.secondary };
    member.input.primary = false;
    member.input.secondary = false;
    return out;
  }

  function leave(member: Member) {
    const index = members.indexOf(member);
    if (index <= 0) return;
    members.splice(index, 1);
    if (phase === 'lobby') {
      assignSides();
      broadcastLobby();
    } else if (game) {
      game.removePlayer(member.side);
      broadcastState();
    }
    emitChange();
  }

  /** 一局開始時，每位玩家的指標放回自己那一邊的邊緣（沿邊的位置不變），擋板不會一開局就頂在最深處。 */
  function resetPointers() {
    for (const m of members) {
      const p = pointAt(m.side, along(m.side, m.input.pointer), 0);
      m.input.pointer = { x: p.x, y: p.y };
    }
  }

  /** level 是開始遊玩的關卡，runStart 是這一局的起點；接關時兩者不同。 */
  function newGame(level: number, runStart: number) {
    resetPointers();
    // 第一局可以由呼叫端指定種子，之後每次重開都換新的。
    const seed = game === null ? (options.seed ?? randomSeed()) : randomSeed();
    game = createGame({
      ...options.gameOptions,
      playerCount: members.length as GameOptions['playerCount'],
      sides: members.map((m) => m.side),
      seed,
      startLevel: level,
      runStartLevel: runStart,
    });
    paused = false;
  }

  return {
    get phase() {
      return phase;
    },
    get state() {
      return game?.state ?? null;
    },
    get paused() {
      return paused;
    },
    get playerCount() {
      return members.length;
    },
    localSide: 'bottom',
    get startLevel() {
      return startLevel;
    },

    addPeer(channel) {
      if (members.length >= MAX_PLAYERS || phase !== 'lobby') {
        channel.send({ type: 'rejected', reason: phase === 'lobby' ? 'full' : 'started' });
        channel.close();
        return;
      }
      const member: Member = { channel, side: 'bottom', input: neutral() };
      members.push(member);
      assignSides();
      channel.onMessage((message) => receive(member, message));
      channel.onClose(() => leave(member));
      broadcastLobby();
      emitChange();
    },

    onChange(handler) {
      changeHandlers.push(handler);
    },

    setStartLevel(level) {
      if (phase !== 'lobby' || !Number.isFinite(level)) return;
      const next = Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, Math.round(level)));
      if (next === startLevel) return;
      startLevel = next;
      broadcastLobby();
      emitChange();
    },

    start() {
      if (phase !== 'lobby') return;
      phase = 'playing';
      newGame(startLevel, startLevel);
      for (const m of members) m.channel?.send({ type: 'start', you: m.side });
      broadcastState();
      emitChange();
    },

    setLocalInput(input) {
      receive(members[0]!, { type: 'input', input });
    },

    advance(dt) {
      if (phase !== 'playing' || !game) return;
      const inputs = game.state.players.map((p) => {
        const member = members.find((m) => m.side === p.side);
        return member ? take(member) : neutral(p.side);
      });
      if (paused) return;
      game.step(dt, inputs);
      sinceSend += dt;
      if (sinceSend >= sendInterval || game.state.status !== lastStatus) broadcastState();
    },

    setPaused(value) {
      if (phase !== 'playing' || paused === value) return;
      paused = value;
      broadcastState();
    },

    restart() {
      if (phase !== 'playing' || !game) return;
      const origin = game.state.startLevel;
      newGame(origin, origin);
      broadcastState();
    },

    continueRun() {
      if (phase !== 'playing' || !game || game.state.status !== 'defeated') return;
      newGame(game.state.level, game.state.startLevel);
      broadcastState();
    },

    close() {
      for (const m of members.slice(1)) m.channel?.close();
    },
  };
}
