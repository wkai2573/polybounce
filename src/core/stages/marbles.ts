import { MARBLE_RADIUS, PADDLE_MAX_BOUNCE_DEG, PADDLE_THICKNESS, PADDLE_WIDTH, SIDE_ORDER } from '../config.ts';
import { along, depth, FRAMES } from '../geometry.ts';
import type { GameState, Marble, Side, Vec2 } from '../types.ts';

/** 彈珠每移動一小段之後呼叫，負責一種實體對彈珠的反彈。prev 是這一小段開始前的位置。 */
export type MarbleCollider = (m: Marble, prev: Vec2) => void;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 沒有玩家佔據的方位是牆，會把彈珠彈回。 */
function createWallCollider(state: GameState): MarbleCollider {
  const occupied = new Set<Side>(state.players.map((p) => p.side));

  return (m) => {
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
  };
}

/** 彈珠這一小段剛好從上方穿過擋板表面時，依擊中位置決定反彈角度。 */
function createPaddleCollider(state: GameState): MarbleCollider {
  return (m, prev) => {
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
  };
}

/**
 * 彈珠階段：移動場上彈珠，每一小段依序交給牆、擋板與傳入的其他碰撞者處理反彈，
 * 最後移除漏接的彈珠。新的實體只需要提供自己的碰撞者。
 */
export function createMarbleStage(state: GameState, extraColliders: MarbleCollider[]) {
  const colliders = [createWallCollider(state), createPaddleCollider(state), ...extraColliders];

  function moveMarble(m: Marble, dt: number) {
    const travel = Math.hypot(m.vel.x, m.vel.y) * dt;
    // 切成小段移動，避免高速時穿過薄的障礙物。
    const slices = Math.max(1, Math.ceil(travel / (MARBLE_RADIUS / 2)));
    const h = dt / slices;
    for (let i = 0; i < slices; i++) {
      const prev = { x: m.pos.x, y: m.pos.y };
      m.pos.x += m.vel.x * h;
      m.pos.y += m.vel.y * h;
      for (const collide of colliders) collide(m, prev);
    }
  }

  /** 彈珠整顆越過有玩家的那一邊，就是漏接。 */
  function hasLeft(m: Marble) {
    return state.players.some((p) => depth(p.side, m.pos) < -MARBLE_RADIUS);
  }

  return function advanceMarbles(dt: number) {
    for (const m of state.marbles) moveMarble(m, dt);
    state.marbles = state.marbles.filter((m) => !hasLeft(m));
  };
}
