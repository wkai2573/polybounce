import { deriveEvents, summarize, type Summary } from './audio/events.ts';
import { createSfx } from './audio/sfx.ts';
import { ARENA_SIZE, SIDE_ORDER } from './core/config.ts';
import type { GameState, PlayerInput, Side } from './core/types.ts';
import type { ClientSession } from './net/client.ts';
import { createHostSession, type HostSession } from './net/host.ts';
import { joinRoom, openRoom, type OpenRoom } from './net/peer.ts';
import { normalizeRoomCode } from './net/room-code.ts';
import { draw, SIDE_COLORS } from './render/draw.ts';

const STEP = 1 / 120;
const BEST_KEY = 'polybounce.bestLevel';
const SIDE_LABEL: Record<Side, string> = { bottom: '下方', top: '上方', left: '左方', right: '右方' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;
const menu = $('menu');
const lobby = $('lobby');
const overlay = $('overlay');
const menuError = $('menu-error');
const codeInput = $<HTMLInputElement>('code');
const soloButton = $<HTMLButtonElement>('solo');
const createButton = $<HTMLButtonElement>('create');
const joinButton = $<HTMLButtonElement>('join');
const roomCodeEl = $('room-code');
const playersEl = $('players');
const lobbyHint = $('lobby-hint');
const startButton = $<HTMLButtonElement>('start');
const leaveButton = $<HTMLButtonElement>('leave');
const overlayTitle = $('overlay-title');
const overlayText = $('overlay-text');
const retry = $<HTMLButtonElement>('retry');
const back = $<HTMLButtonElement>('back');
const muteButton = $<HTMLButtonElement>('mute');

const sfx = createSfx();
const renderMute = () => {
  muteButton.textContent = sfx.muted ? '🔇 靜音' : '🔊 音效';
};
renderMute();
muteButton.addEventListener('click', () => {
  sfx.setMuted(!sfx.muted);
  renderMute();
});
// 瀏覽器要求使用者操作過才能發聲，所以第一次點擊或按鍵之後才建立音訊環境。
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => sfx.unlock(), { capture: true });

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBest(level: number) {
  try {
    localStorage.setItem(BEST_KEY, String(level));
  } catch {
    // 本機儲存不可用時，只是不記錄最高關卡。
  }
}

/** 單人與房主共用同一個房主會話；其他玩家是玩家端會話。同一時間只會有一種。 */
let host: HostSession | null = null;
let room: OpenRoom | null = null;
let guest: ClientSession | null = null;
let closeGuest: (() => void) | null = null;
let joinedCode = '';
let bestLevel = readBest();
let recordedDefeat = false;

const pointer = { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
let primary = false;
let secondary = false;
/** 點擊當下的指標位置，避免點擊與之後的移動被併進同一幀。 */
const clickPointer = { x: pointer.x, y: pointer.y };

function toArena(e: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * ARENA_SIZE;
  pointer.y = ((e.clientY - rect.top) / rect.height) * ARENA_SIZE;
}

canvas.addEventListener('mousemove', toArena);
canvas.addEventListener('mousedown', (e) => {
  toArena(e);
  clickPointer.x = pointer.x;
  clickPointer.y = pointer.y;
  if (e.button === 0) primary = true;
  if (e.button === 2) secondary = true;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const currentState = (): GameState | null => host?.state ?? guest?.state ?? null;
const localSide = (): Side | null => (host ? host.localSide : (guest?.side ?? null));
const paused = () => (host ? host.paused : (guest?.paused ?? false));

function leaveToMenu(message = '') {
  host?.close();
  room?.close();
  closeGuest?.();
  host = null;
  room = null;
  guest = null;
  closeGuest = null;
  joinedCode = '';
  recordedDefeat = false;
  menuError.textContent = message;
}

function setBusy(busy: boolean) {
  for (const b of [soloButton, createButton, joinButton]) b.disabled = busy;
}

soloButton.addEventListener('click', () => {
  leaveToMenu();
  host = createHostSession();
  host.start();
});

createButton.addEventListener('click', async () => {
  leaveToMenu();
  setBusy(true);
  menuError.textContent = '建立房間中…';
  const session = createHostSession();
  try {
    room = await openRoom(session);
    host = session;
    menuError.textContent = '';
  } catch (e) {
    menuError.textContent = e instanceof Error ? e.message : '建立房間失敗';
  } finally {
    setBusy(false);
  }
});

joinButton.addEventListener('click', async () => {
  const code = normalizeRoomCode(codeInput.value);
  if (!code) {
    menuError.textContent = '房間碼是 5 個字母或數字';
    return;
  }
  leaveToMenu();
  setBusy(true);
  menuError.textContent = '連線中…';
  try {
    const joined = await joinRoom(code);
    guest = joined.session;
    closeGuest = joined.close;
    joinedCode = code;
    menuError.textContent = '';
  } catch (e) {
    menuError.textContent = e instanceof Error ? e.message : '加入房間失敗';
  } finally {
    setBusy(false);
  }
});

startButton.addEventListener('click', () => host?.start());
leaveButton.addEventListener('click', () => leaveToMenu());
retry.addEventListener('click', () => host?.restart());
back.addEventListener('click', () => leaveToMenu());
window.addEventListener('beforeunload', () => leaveToMenu());

window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    sfx.setMuted(!sfx.muted);
    renderMute();
  }
  // 只有房主（含單人）能暫停；其他玩家按了沒有作用。
  if ((e.key === 'Escape' || e.key === 'p') && host && currentState()?.status === 'playing') {
    host.setPaused(!host.paused);
  }
});

type Screen = 'menu' | 'lobby' | 'game';

function currentScreen(): Screen {
  if (host) return host.phase === 'lobby' ? 'lobby' : 'game';
  if (guest) {
    if (guest.phase === 'playing' || guest.phase === 'hostLeft') return 'game';
    return 'lobby';
  }
  return 'menu';
}

/** 玩家端遇到被拒絕、或大廳裡房主就離開，沒有遊戲可顯示，直接回主選單並說明。 */
function resolveGuestEnd() {
  if (!guest) return;
  if (guest.phase === 'rejected') {
    leaveToMenu(guest.rejection === 'full' ? '房間已滿（最多 4 人）' : '這一局已經開始，無法中途加入');
  } else if (guest.phase === 'hostLeft' && !guest.state) {
    leaveToMenu('房主已離開房間');
  }
}

let lobbyKey = '';
function syncLobby() {
  const count = host ? host.playerCount : (guest?.lobby?.count ?? 0);
  const you = host ? 0 : (guest?.lobby?.you ?? -1);
  const code = room?.code ?? joinedCode;
  const key = `${code}|${count}|${you}|${host ? 'h' : 'g'}`;
  if (key === lobbyKey) return;
  lobbyKey = key;
  roomCodeEl.textContent = code;
  playersEl.replaceChildren(
    ...Array.from({ length: count }, (_, i) => {
      const side = SIDE_ORDER[i]!;
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.color = SIDE_COLORS[side];
      const label = document.createElement('span');
      label.textContent = `玩家 ${i + 1}（${SIDE_LABEL[side]}）`;
      li.append(dot, label);
      if (i === you) {
        const me = document.createElement('span');
        me.className = 'me';
        me.textContent = '你';
        li.append(me);
      }
      return li;
    }),
  );
  startButton.hidden = !host;
  lobbyHint.textContent = host
    ? count < 2
      ? '把房間碼給朋友加入；也可以現在就開始'
      : '開始後不能再中途加入'
    : '等待房主開始遊戲';
}

let overlayKey = '';
function syncOverlay() {
  const state = currentState();
  let show = false;
  let title = '';
  let text = '';
  let canRetry = false;

  if (guest?.phase === 'hostLeft') {
    show = true;
    title = '房主已離線';
    text = '這一局已經結束';
  } else if (state?.status === 'defeated') {
    if (!recordedDefeat) {
      recordedDefeat = true;
      if (state.level > bestLevel) {
        bestLevel = state.level;
        writeBest(state.level);
      }
    }
    show = true;
    title = '遊戲結束';
    text = `到達第 ${state.level} 關，分數 ${state.score}，最高紀錄第 ${bestLevel} 關`;
    canRetry = host !== null;
    if (!host) text += '\n等待房主開始下一局';
  } else if (paused()) {
    show = true;
    title = host ? '暫停' : '房主已暫停';
    text = host ? '按 Esc 繼續' : '請等待房主繼續';
  }
  if (state?.status !== 'defeated') recordedDefeat = false;

  const key = `${show}|${title}|${text}|${canRetry}`;
  if (key === overlayKey) return;
  overlayKey = key;
  overlay.classList.toggle('show', show);
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayText.style.whiteSpace = 'pre-line';
  retry.hidden = !canRetry;
  back.hidden = !show;
}

let shownScreen: Screen | null = null;
function syncScreens() {
  resolveGuestEnd();
  const screen = currentScreen();
  if (screen !== shownScreen) {
    shownScreen = screen;
    menu.classList.toggle('show', screen === 'menu');
    lobby.classList.toggle('show', screen === 'lobby');
    canvas.classList.toggle('menu', screen !== 'game');
    lobbyKey = '';
    overlayKey = '';
  }
  if (screen === 'lobby') syncLobby();
  if (screen === 'game') syncOverlay();
  else overlay.classList.remove('show');
}

function buildInput(): PlayerInput {
  const clicked = primary || secondary;
  const input: PlayerInput = { pointer: { ...(clicked ? clickPointer : pointer) }, primary, secondary };
  primary = false;
  secondary = false;
  return input;
}

let last = performance.now();
let acc = 0;
let previous: Summary | null = null;

function frame(now: number) {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;

  const input = buildInput();
  if (host?.phase === 'playing') {
    host.setLocalInput(input);
    while (acc >= STEP) {
      host.advance(STEP);
      acc -= STEP;
    }
  } else {
    acc = 0;
    if (guest?.phase === 'playing') guest.sendInput(input);
  }

  syncScreens();

  const state = currentState();
  if (state) {
    draw(ctx, state, pointer, localSide());
    const summary = summarize(state);
    sfx.play(deriveEvents(previous, summary));
    previous = summary;
  } else {
    previous = null;
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
