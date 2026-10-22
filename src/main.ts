import { ARENA_SIZE } from './core/config.ts';
import { createGame } from './core/game.ts';
import type { Game, PlayerInput } from './core/types.ts';
import { draw } from './render/draw.ts';

const STEP = 1 / 120;
const BEST_KEY = 'polybounce.bestLevel';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const overlay = document.getElementById('overlay')!;
const overlayTitle = document.getElementById('overlay-title')!;
const overlayText = document.getElementById('overlay-text')!;
const retry = document.getElementById('retry') as HTMLButtonElement;

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

function newGame(): Game {
  return createGame({ playerCount: 1, seed: (Math.random() * 2 ** 32) >>> 0 });
}

let game = newGame();
let paused = false;
let bestLevel = readBest();
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

window.addEventListener('keydown', (e) => {
  if ((e.key === 'Escape' || e.key === 'p') && game.state.status === 'playing') {
    paused = !paused;
    showOverlay();
  }
});

retry.addEventListener('click', () => {
  game = newGame();
  paused = false;
  showOverlay();
});

function showOverlay() {
  const { status, level, score } = game.state;
  if (status === 'defeated') {
    if (level > bestLevel) {
      bestLevel = level;
      writeBest(level);
    }
    overlayTitle.textContent = '遊戲結束';
    overlayText.textContent = `到達第 ${level} 關，分數 ${score}，最高紀錄第 ${bestLevel} 關`;
    retry.hidden = false;
    overlay.classList.add('show');
  } else if (paused) {
    overlayTitle.textContent = '暫停';
    overlayText.textContent = '按 Esc 繼續';
    retry.hidden = true;
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
  }
}

let last = performance.now();
let acc = 0;
let wasDefeated = false;

function frame(now: number) {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;

  if (!paused) {
    while (acc >= STEP) {
      const clicked = primary || secondary;
      const input: PlayerInput = { pointer: { ...(clicked ? clickPointer : pointer) }, primary, secondary };
      primary = false;
      secondary = false;
      game.step(STEP, [input]);
      acc -= STEP;
    }
  } else {
    acc = 0;
    primary = false;
    secondary = false;
  }

  const defeated = game.state.status === 'defeated';
  if (defeated !== wasDefeated) {
    wasDefeated = defeated;
    showOverlay();
  }

  draw(ctx, game.state, pointer);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
