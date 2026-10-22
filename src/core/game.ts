import {
  AIM_MIN_ANGLE_DEG,
  ARENA_SIZE,
  MARBLE_BASE_SPEED,
  MARBLE_RADIUS,
  MARBLE_SPEED_CAP,
  MARBLE_SPEED_PER_LEVEL,
  MARBLES_PER_PLAYER,
  PADDLE_MAX_BOUNCE_DEG,
  PADDLE_THICKNESS,
  PADDLE_WIDTH,
  SCORE_PER_HP,
  SIDE_ORDER,
} from './config.ts';
import { aimDirection, along, depth, FRAMES, pointAt } from './geometry.ts';
import { generateLevel } from './level.ts';
import type { Game, GameOptions, GameState, Marble, PlayerInput, PlayerState, Side, Vec2 } from './types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function marbleSpeed(level: number): number {
  return MARBLE_BASE_SPEED * Math.min(1 + MARBLE_SPEED_PER_LEVEL * (level - 1), MARBLE_SPEED_CAP);
}

export function createGame(options: GameOptions): Game {
  const layout = options.layout ?? ((level: number) => generateLevel(level, options.seed));
  const state: GameState = {
    status: 'playing',
    level: 1,
    score: 0,
    pool: MARBLES_PER_PLAYER * options.playerCount,
    marbles: [],
    bricks: layout(1),
    players: SIDE_ORDER.slice(0, options.playerCount).map((side) => ({
      side,
      paddle: ARENA_SIZE / 2,
      aiming: false,
    })),
  };

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

  const occupied = new Set<Side>(state.players.map((p) => p.side));

  function bounceOffWalls(m: Marble) {
    for (const side of SIDE_ORDER) {
      if (occupied.has(side)) continue;
      const { normal } = FRAMES[side];
      const d = depth(side, m.pos);
      const toward = m.vel.x * normal.x + m.vel.y * normal.y;
      if (d >= MARBLE_RADIUS || toward >= 0) continue;
      m.pos.x += normal.x * (MARBLE_RADIUS - d);
      m.pos.y += normal.y * (MARBLE_RADIUS - d);
      m.vel.x -= 2 * toward * normal.x;
      m.vel.y -= 2 * toward * normal.y;
    }
  }

  /** 彈珠這一小段剛好從上方穿過擋板表面時，依擊中位置決定反彈角度。 */
  function bounceOffPaddles(m: Marble, prev: Vec2) {
    const line = PADDLE_THICKNESS + MARBLE_RADIUS;
    const halfWidth = PADDLE_WIDTH / 2;
    for (const player of state.players) {
      const { side } = player;
      const { normal, tangent } = FRAMES[side];
      const before = depth(side, prev);
      const after = depth(side, m.pos);
      if (before < line || after >= line) continue;
      const offset = (along(side, m.pos) - player.paddle) / halfWidth;
      if (Math.abs(offset) > 1 + MARBLE_RADIUS / halfWidth) continue;
      const angle = (clamp(offset, -1, 1) * PADDLE_MAX_BOUNCE_DEG * Math.PI) / 180;
      const speed = Math.hypot(m.vel.x, m.vel.y);
      m.vel.x = (normal.x * Math.cos(angle) + tangent.x * Math.sin(angle)) * speed;
      m.vel.y = (normal.y * Math.cos(angle) + tangent.y * Math.sin(angle)) * speed;
      m.pos.x += normal.x * (line - after);
      m.pos.y += normal.y * (line - after);
    }
  }

  /** 每一小段最多撞一塊磚，沿著穿透比較淺的那個軸反彈。 */
  function bounceOffBricks(m: Marble) {
    for (const brick of state.bricks) {
      const cx = clamp(m.pos.x, brick.x, brick.x + brick.w);
      const cy = clamp(m.pos.y, brick.y, brick.y + brick.h);
      const dx = m.pos.x - cx;
      const dy = m.pos.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist >= MARBLE_RADIUS) continue;

      if (dist === 0) {
        // 中心已陷進磚塊內，沒有可用的法線，只能掉頭。
        m.vel.y = -m.vel.y;
      } else {
        // 沿著彈珠與磚塊最近點的法線反彈，所以擦過角落也會被彈開。
        const nx = dx / dist;
        const ny = dy / dist;
        const into = m.vel.x * nx + m.vel.y * ny;
        if (into >= 0) continue;
        m.vel.x -= 2 * into * nx;
        m.vel.y -= 2 * into * ny;
        m.pos.x = cx + nx * MARBLE_RADIUS;
        m.pos.y = cy + ny * MARBLE_RADIUS;
      }

      brick.hp -= 1;
      if (brick.hp <= 0) {
        state.score += brick.maxHp * SCORE_PER_HP;
        state.bricks = state.bricks.filter((b) => b !== brick);
      }
      return;
    }
  }

  function moveMarble(m: Marble, dt: number) {
    const travel = Math.hypot(m.vel.x, m.vel.y) * dt;
    // 切成小段移動，避免高速時穿過薄的障礙物。
    const slices = Math.max(1, Math.ceil(travel / (MARBLE_RADIUS / 2)));
    const h = dt / slices;
    for (let i = 0; i < slices; i++) {
      const prev = { x: m.pos.x, y: m.pos.y };
      m.pos.x += m.vel.x * h;
      m.pos.y += m.vel.y * h;
      bounceOffWalls(m);
      bounceOffPaddles(m, prev);
      bounceOffBricks(m);
    }
  }

  function step(dt: number, inputs: PlayerInput[]) {
    state.players.forEach((player, i) => {
      const input = inputs[i];
      if (input) handleInput(player, input);
    });
    for (const m of state.marbles) moveMarble(m, dt);
    state.marbles = state.marbles.filter((m) => !hasLeft(m));
    if (state.bricks.length === 0) startNextLevel();
    if (state.pool === 0 && state.marbles.length === 0) state.status = 'defeated';
  }

  function startNextLevel() {
    state.level += 1;
    state.bricks = layout(state.level);
    state.pool = MARBLES_PER_PLAYER * state.players.length;
    state.marbles = [];
  }

  /** 彈珠整顆越過有玩家的那一邊，就是漏接。 */
  function hasLeft(m: Marble) {
    return state.players.some((p) => depth(p.side, m.pos) < -MARBLE_RADIUS);
  }

  return { state, step };
}
