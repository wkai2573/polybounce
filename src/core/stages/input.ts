import {
  ARENA_SIZE,
  CHARGE_EPSILON,
  MARBLE_BASE_SPEED,
  MARBLE_SPEED_CAP,
  MARBLE_SPEED_PER_LEVEL,
  PADDLE_MAX_DEPTH,
} from '../config.ts';
import { launchRadius } from '../effects.ts';
import { along, depth, FRAMES } from '../geometry.ts';
import { launchPoint, paddleWidth } from '../paddle.ts';
import type { GameState, PlayerInput, PlayerState, Vec2 } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function marbleSpeed(level: number): number {
  return MARBLE_BASE_SPEED * Math.min(1 + MARBLE_SPEED_PER_LEVEL * (level - 1), MARBLE_SPEED_CAP);
}

/** 輸入階段：依每位玩家的輸入移動擋板（沿邊的位置與離邊的深度），並在發射量足夠時垂直發射彈珠。 */
export function createInputStage(state: GameState, nextMarbleId: () => number) {
  function launch(player: PlayerState, dir: Vec2) {
    const speed = marbleSpeed(state.level);
    player.charge = Math.max(0, player.charge - 1);
    state.marbles.push({
      id: nextMarbleId(),
      pos: launchPoint(player, launchRadius()),
      vel: { x: dir.x * speed, y: dir.y * speed },
      power: 1,
    });
  }

  function handleInput(player: PlayerState, input: PlayerInput) {
    // 死亡的玩家不能移動或發射。
    if (player.dead) return;

    const half = paddleWidth(player) / 2;
    player.paddle = clamp(along(player.side, input.pointer), half, ARENA_SIZE - half);
    player.depth = clamp(depth(player.side, input.pointer), 0, PADDLE_MAX_DEPTH);

    // 發射一律沿自己方位的法線垂直射出。
    if (input.fire && player.charge >= 1 - CHARGE_EPSILON) launch(player, FRAMES[player.side].normal);
  }

  return function applyInputs(inputs: PlayerInput[]) {
    state.players.forEach((player, i) => {
      const input = inputs[i];
      if (input) handleInput(player, input);
    });
  };
}
