import {
  ARENA_SIZE,
  INITIAL_LIVES,
  MAX_LIVES,
  PADDLE_THICKNESS,
  PADDLE_WIDTH,
  REVIVE_INVINCIBLE_DURATION,
  REVIVE_LIVES,
  SHORTEN_FACTOR,
  WIDEN_FACTOR,
} from './config.ts';
import { pointAt } from './geometry.ts';
import type { GameState, PlayerState, Side, Vec2 } from './types.ts';

/** 擋板目前的寬度：加寬與縮短都是固定倍數，不疊加。 */
export function paddleWidth(player: PlayerState): number {
  switch (player.paddleEffect?.kind) {
    case 'widen':
      return PADDLE_WIDTH * WIDEN_FACTOR;
    case 'shorten':
      return PADDLE_WIDTH * SHORTEN_FACTOR;
    default:
      return PADDLE_WIDTH;
  }
}

/** 把擋板位置夾回場地範圍內：寬度改變後，擋板邊緣不能超出邊界。 */
export function clampPaddle(player: PlayerState): void {
  const half = paddleWidth(player) / 2;
  player.paddle = Math.min(ARENA_SIZE - half, Math.max(half, player.paddle));
}

/** 核心的中心：擋板厚度的正中央，沿自己那一邊以擋板中心為準，離邊的距離隨擋板深度走。 */
export const coreCenter = (player: PlayerState): Vec2 => pointAt(player.side, player.paddle, player.depth + PADDLE_THICKNESS / 2);

/** 擋板的表面離自己那一邊的距離，也就是彈珠反彈的那條線（不含彈珠半徑）。 */
export const paddleSurface = (player: PlayerState): number => player.depth + PADDLE_THICKNESS;

/** 彈珠從擋板目前的位置發射：擋板表面再往場內退彈珠半徑加一點。 */
export const launchPoint = (player: PlayerState, radius: number): Vec2 =>
  pointAt(player.side, player.paddle, paddleSurface(player) + radius + 1);

/** 還活著的玩家：怪物的子彈只瞄準他們，道具也只朝他們的方位掉落。 */
export const alivePlayers = (state: GameState): PlayerState[] => state.players.filter((p) => !p.dead);

export function createPlayer(side: Side): PlayerState {
  return { side, paddle: ARENA_SIZE / 2, depth: 0, aiming: false, lives: INITIAL_LIVES, dead: false, invincible: 0, revive: 0, paddleEffect: null };
}

/** 生命歸零：擋板停在原位變成屍體，取消瞄準。 */
export function killPlayer(player: PlayerState): void {
  player.lives = 0;
  player.dead = true;
  player.aiming = false;
  player.invincible = 0;
  player.revive = 0;
}

/** 彈珠撞滿次數：玩家以 1 點生命與短暫無敵站起來，擋板回到原位。 */
export function revivePlayer(player: PlayerState): void {
  player.dead = false;
  player.lives = REVIVE_LIVES;
  player.invincible = REVIVE_INVINCIBLE_DURATION;
  player.revive = 0;
}

/** 新關卡開始：復活並補滿生命，清掉無敵與復活進度。 */
export function resetForNewLevel(player: PlayerState): void {
  player.dead = false;
  player.lives = MAX_LIVES;
  player.invincible = 0;
  player.revive = 0;
}
