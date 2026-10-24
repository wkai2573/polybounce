import {
  AIM_MIN_ANGLE_DEG,
  ARENA_SIZE,
  MARBLE_BASE_SPEED,
  MARBLE_SPEED_CAP,
  MARBLE_SPEED_PER_LEVEL,
  PADDLE_MAX_DEPTH,
} from '../config.ts';
import { marbleRadius } from '../effects.ts';
import { aimDirection, along, depth, FRAMES } from '../geometry.ts';
import { launchPoint, paddleWidth } from '../paddle.ts';
import type { GameState, PlayerInput, PlayerState, Vec2 } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function marbleSpeed(level: number): number {
  return MARBLE_BASE_SPEED * Math.min(1 + MARBLE_SPEED_PER_LEVEL * (level - 1), MARBLE_SPEED_CAP);
}

/** 輸入階段：依每位玩家的輸入移動擋板（沿邊的位置與離邊的深度）、切換瞄準模式、從彈珠池發射彈珠。 */
export function createInputStage(state: GameState, nextMarbleId: () => number) {
  function launch(player: PlayerState, dir: Vec2) {
    const speed = marbleSpeed(state.level);
    state.pool -= 1;
    state.marbles.push({
      id: nextMarbleId(),
      pos: launchPoint(player, marbleRadius(state)),
      vel: { x: dir.x * speed, y: dir.y * speed },
    });
  }

  function handleInput(player: PlayerState, input: PlayerInput) {
    // 死亡的玩家不能移動、瞄準或發射。
    if (player.dead) return;

    if (!player.aiming) {
      const half = paddleWidth(player) / 2;
      player.paddle = clamp(along(player.side, input.pointer), half, ARENA_SIZE - half);
      player.depth = clamp(depth(player.side, input.pointer), 0, PADDLE_MAX_DEPTH);
    }

    if (input.secondary) {
      if (player.aiming) player.aiming = false;
      else if (state.pool > 0) launch(player, FRAMES[player.side].normal);
    }

    if (input.primary) {
      if (player.aiming) {
        // 瞄準期間彈珠池可能已被其他玩家用光。
        if (state.pool > 0) {
          launch(player, aimDirection(player.side, launchPoint(player, marbleRadius(state)), input.pointer, AIM_MIN_ANGLE_DEG));
        }
        player.aiming = false;
      } else if (state.pool > 0) {
        player.aiming = true;
      }
    }
  }

  return function applyInputs(inputs: PlayerInput[]) {
    state.players.forEach((player, i) => {
      const input = inputs[i];
      if (input) handleInput(player, input);
    });
  };
}
