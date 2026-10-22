import {
  AIM_MIN_ANGLE_DEG,
  ARENA_SIZE,
  MARBLE_BASE_SPEED,
  MARBLE_RADIUS,
  MARBLE_SPEED_CAP,
  MARBLE_SPEED_PER_LEVEL,
  PADDLE_THICKNESS,
  PADDLE_WIDTH,
} from '../config.ts';
import { aimDirection, along, FRAMES, pointAt } from '../geometry.ts';
import type { GameState, PlayerInput, PlayerState, Vec2 } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function marbleSpeed(level: number): number {
  return MARBLE_BASE_SPEED * Math.min(1 + MARBLE_SPEED_PER_LEVEL * (level - 1), MARBLE_SPEED_CAP);
}

/** 輸入階段：依每位玩家的輸入移動擋板、切換瞄準模式、從彈珠池發射彈珠。 */
export function createInputStage(state: GameState) {
  let nextMarbleId = 0;

  function launchPoint(player: PlayerState) {
    return pointAt(player.side, player.paddle, PADDLE_THICKNESS + MARBLE_RADIUS + 1);
  }

  function launch(player: PlayerState, dir: Vec2) {
    const speed = marbleSpeed(state.level);
    state.pool -= 1;
    state.marbles.push({
      id: nextMarbleId++,
      pos: launchPoint(player),
      vel: { x: dir.x * speed, y: dir.y * speed },
    });
  }

  function handleInput(player: PlayerState, input: PlayerInput) {
    if (!player.aiming) {
      player.paddle = clamp(along(player.side, input.pointer), PADDLE_WIDTH / 2, ARENA_SIZE - PADDLE_WIDTH / 2);
    }

    if (input.secondary) {
      if (player.aiming) player.aiming = false;
      else if (state.pool > 0) launch(player, FRAMES[player.side].normal);
    }

    if (input.primary) {
      if (player.aiming) {
        // 瞄準期間彈珠池可能已被其他玩家用光。
        if (state.pool > 0) {
          launch(player, aimDirection(player.side, launchPoint(player), input.pointer, AIM_MIN_ANGLE_DEG));
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
