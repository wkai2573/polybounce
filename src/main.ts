import { deriveEvents, summarize, type Summary } from './audio/events.ts';
import { createSfx } from './audio/sfx.ts';
import { ARENA_SIZE, MAX_START_LEVEL, MIN_START_LEVEL, SIDE_ORDER } from './core/config.ts';
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
const continueButton = $<HTMLButtonElement>('continue');
const retry = $<HTMLButtonElement>('retry');
const soloLevel = $<HTMLInputElement>('solo-level');
const lobbyLevel = $<HTMLInputElement>('lobby-level');
const lockHint = $('lock-hint');
const back = $<HTMLButtonElement>('back');
const muteButton = $<HTMLButtonElement>('mute');

const versionEl = $('version');
versionEl.textContent = `v${__APP_VERSION__}`;
versionEl.title = __APP_COMMIT__ ? `commit ${__APP_COMMIT__}` : '';

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

/** 本機玩家的虛擬指標，永遠在場地 0 到 ARENA_SIZE 之內；準星就畫在這裡，不會同步給其他玩家。 */
const pointer = { x: ARENA_SIZE / 2, y: ARENA_SIZE / 2 };
let primary = false;
let secondary = false;
/** 點擊當下的指標位置，避免點擊與之後的移動被併進同一幀。 */
const clickPointer = { x: pointer.x, y: pointer.y };

/** 滑鼠目前是否鎖定在畫布上。鎖定時用相對位移累積指標，沒鎖定時用滑鼠在畫布上的絕對位置。 */
let locked = false;
/** 瀏覽器不支援或拒絕鎖定時，退回沒有鎖定的原本行為：不攔截點擊，暫停也不需要鎖定才能繼續。 */
let lockUnavailable = !('requestPointerLock' in canvas);

const clampArena = (v: number) => Math.min(ARENA_SIZE, Math.max(0, v));

function toArena(e: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  if (locked) {
    pointer.x = clampArena(pointer.x + (e.movementX / rect.width) * ARENA_SIZE);
    pointer.y = clampArena(pointer.y + (e.movementY / rect.height) * ARENA_SIZE);
  } else {
    pointer.x = clampArena(((e.clientX - rect.left) / rect.width) * ARENA_SIZE);
    pointer.y = clampArena(((e.clientY - rect.top) / rect.height) * ARENA_SIZE);
  }
}

const currentState = (): GameState | null => host?.state ?? guest?.state ?? null;
const localSide = (): Side | null => (host ? host.localSide : (guest?.side ?? null));
const paused = () => (host ? host.paused : (guest?.paused ?? false));
/** 對局進行中：主選單、大廳與結算畫面都不需要鎖定滑鼠。 */
const inPlay = () => currentScreen() === 'game' && currentState()?.status === 'playing';

function onLockDenied() {
  lockUnavailable = true;
  // 鎖不上時，等著靠鎖定才能繼續的暫停就直接繼續。
  if (host?.paused && inPlay()) host.setPaused(false);
}

/** 必須在使用者操作（點擊或按鍵）的處理函式裡呼叫，瀏覽器才會允許鎖定。 */
function requestLock() {
  if (locked || !('requestPointerLock' in canvas)) return;
  try {
    const result: unknown = canvas.requestPointerLock();
    if (result instanceof Promise) result.catch(onLockDenied);
  } catch {
    onLockDenied();
  }
}

function releaseLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}

document.addEventListener('pointerlockerror', onLockDenied);
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) {
    lockUnavailable = false;
    if (host?.paused && inPlay()) host.setPaused(false);
  } else if (host && inPlay()) {
    // 房主與單人解除鎖定（Esc 或失去焦點）視為暫停；其他玩家只是回到「點一下重新鎖定」。
    host.setPaused(true);
  }
});

canvas.addEventListener('mousemove', toArena);
canvas.addEventListener('mousedown', (e) => {
  if (inPlay() && !locked) {
    requestLock();
    // 重新鎖定的那一下點擊只用來鎖定，不當成瞄準或發射。
    if (!lockUnavailable) return;
  }
  toArena(e);
  clickPointer.x = pointer.x;
  clickPointer.y = pointer.y;
  if (e.button === 0) primary = true;
  if (e.button === 2) secondary = true;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// 暫停畫面蓋在畫布上，點空白處也要能重新鎖定並繼續。
overlay.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) return;
  if (inPlay() && !locked) requestLock();
});

function clampLevel(raw: string): number {
  const value = Math.round(Number(raw));
  return Number.isFinite(value) ? Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, value)) : MIN_START_LEVEL;
}

for (const input of [soloLevel, lobbyLevel]) {
  input.addEventListener('change', () => {
    input.value = String(clampLevel(input.value));
    if (input === lobbyLevel) host?.setStartLevel(Number(input.value));
  });
}

function leaveToMenu(message = '') {
  host?.close();
  room?.close();
  closeGuest?.();
  releaseLock();
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
  soloLevel.value = String(clampLevel(soloLevel.value));
  host = createHostSession();
  host.setStartLevel(Number(soloLevel.value));
  host.start();
  requestLock();
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

startButton.addEventListener('click', () => {
  host?.start();
  requestLock();
});
leaveButton.addEventListener('click', () => leaveToMenu());
retry.addEventListener('click', () => {
  host?.restart();
  requestLock();
});
continueButton.addEventListener('click', () => {
  host?.continueRun();
  requestLock();
});
back.addEventListener('click', () => leaveToMenu());
window.addEventListener('beforeunload', () => leaveToMenu());

window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    sfx.setMuted(!sfx.muted);
    renderMute();
  }
  // 只有房主（含單人）能暫停；其他玩家按了沒有作用。
  // 有鎖定時 Esc 由瀏覽器接手解除鎖定（再由解除鎖定的事件暫停），所以 Esc 只在退回沒有鎖定的行為時才處理。
  const pauseKey = e.key === 'p' || e.key === 'P' || (e.key === 'Escape' && lockUnavailable);
  if (!pauseKey || !host || currentState()?.status !== 'playing') return;
  if (locked) releaseLock();
  else if (!host.paused) host.setPaused(true);
  else if (lockUnavailable) host.setPaused(false);
  else requestLock();
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
  const startLevel = host ? host.startLevel : (guest?.startLevel ?? MIN_START_LEVEL);
  const key = `${code}|${count}|${you}|${host ? 'h' : 'g'}|${startLevel}`;
  if (key === lobbyKey) return;
  lobbyKey = key;
  // 房主正在輸入時，不要拿同步回來的值蓋掉他打到一半的數字。
  if (document.activeElement !== lobbyLevel) lobbyLevel.value = String(startLevel);
  lobbyLevel.disabled = !host;
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
  let continueLabel = '';

  if (guest?.phase === 'hostLeft') {
    show = true;
    title = '房主已離線';
    text = '這一局已經結束';
  } else if (state?.status === 'defeated') {
    // 只有從第 1 關開始的局才算最高紀錄；接關是同一局的延續，所以起點仍是第 1 關。
    const counts = state.startLevel === 1;
    if (!recordedDefeat) {
      recordedDefeat = true;
      if (counts && state.level > bestLevel) {
        bestLevel = state.level;
        writeBest(state.level);
      }
    }
    show = true;
    title = '遊戲結束';
    text = `到達第 ${state.level} 關，分數 ${state.score}，最高紀錄第 ${bestLevel} 關`;
    if (!counts) text += `\n這一局從第 ${state.startLevel} 關開始，不計入最高紀錄`;
    canRetry = host !== null;
    continueLabel = `從第 ${state.level} 關接關`;
    if (!host) text += '\n等待房主開始下一局';
  } else if (paused()) {
    show = true;
    if (host) {
      title = '暫停';
      text = lockUnavailable ? '按 Esc 繼續' : '點一下畫面繼續';
    } else {
      title = '房主已暫停';
      text = lockUnavailable ? '請等待房主繼續' : '請等待房主繼續\n點一下畫面可重新鎖定滑鼠';
    }
  }
  if (state?.status !== 'defeated') recordedDefeat = false;
  // 有按鈕的畫面要能用系統游標點按，所以解除鎖定。
  if (state?.status === 'defeated' || guest?.phase === 'hostLeft') releaseLock();

  const key = `${show}|${title}|${text}|${canRetry}|${continueLabel}`;
  if (key === overlayKey) return;
  overlayKey = key;
  overlay.classList.toggle('show', show);
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayText.style.whiteSpace = 'pre-line';
  retry.hidden = !canRetry;
  continueButton.hidden = !canRetry;
  continueButton.textContent = continueLabel;
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
  lockHint.classList.toggle('show', inPlay() && !locked && !lockUnavailable && !overlay.classList.contains('show'));
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
