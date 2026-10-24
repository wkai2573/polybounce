import { PADDLE_MAX_BOUNCE_DEG, REVIVE_HITS, SIDE_ORDER } from '../config.ts';
import { marbleRadius } from '../effects.ts';
import { along, depth, FRAMES, isWall } from '../geometry.ts';
import { paddleSurface, paddleWidth, revivePlayer } from '../paddle.ts';
import type { GameState, Marble, PlayerState, Vec2 } from '../types.ts';

/** 彈珠每移動一小段之後呼叫，負責一種實體對彈珠的反彈。prev 是這一小段開始前的位置。 */
export type MarbleCollider = (m: Marble, prev: Vec2) => void;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 牆會把彈珠彈回：沒有玩家佔據的方位，以及玩家已死亡的方位。
 * 死亡玩家的方位整條都是牆，其中撞到屍體（擋板停著的範圍）的那一下另外累計一次復活進度。
 */
function createWallCollider(state: GameState): MarbleCollider {
  function corpseAt(side: PlayerState['side'], m: Marble, radius: number): PlayerState | undefined {
    const corpse = state.players.find((p) => p.side === side && p.dead);
    if (!corpse) return undefined;
    return Math.abs(along(side, m.pos) - corpse.paddle) <= paddleWidth(corpse) / 2 + radius ? corpse : undefined;
  }

  return (m) => {
    const radius = marbleRadius(m);
    for (const side of SIDE_ORDER) {
      if (!isWall(state.players, side)) continue;
      const { normal } = FRAMES[side];
      const d = depth(side, m.pos);
      const toward = m.vel.x * normal.x + m.vel.y * normal.y;
      if (d >= radius || toward >= 0) continue;
      const corpse = corpseAt(side, m, radius);
      m.pos.x += normal.x * (radius - d);
      m.pos.y += normal.y * (radius - d);
      m.vel.x -= 2 * toward * normal.x;
      m.vel.y -= 2 * toward * normal.y;
      if (corpse && ++corpse.revive >= REVIVE_HITS) revivePlayer(corpse);
    }
  };
}

/**
 * 彈珠往邊緣飛、碰到擋板目前的表面時，依擊中位置決定反彈角度。表面隨擋板深度走。
 * 彈珠的圓心落在表面與擋板外緣之間也算碰到，所以擋板往內移動追上正往邊緣飛的彈珠時能反彈它；
 * 圓心已經在擋板外緣以外（板後）的彈珠不反彈，繼續飛出邊緣，漏接仍以原本的邊緣為準。
 * 死亡玩家的擋板是屍體，由牆處理。
 */
function createPaddleCollider(state: GameState): MarbleCollider {
  return (m) => {
    const radius = marbleRadius(m);
    for (const player of state.players) {
      if (player.dead) continue;
      const halfWidth = paddleWidth(player) / 2;
      const { side } = player;
      const { normal, tangent } = FRAMES[side];
      const line = paddleSurface(player) + radius;
      const after = depth(side, m.pos);
      if (after >= line || after < player.depth) continue;
      if (m.vel.x * normal.x + m.vel.y * normal.y >= 0) continue;
      const offset = (along(side, m.pos) - player.paddle) / halfWidth;
      if (Math.abs(offset) > 1 + radius / halfWidth) continue;
      const angle = (clamp(offset, -1, 1) * PADDLE_MAX_BOUNCE_DEG * Math.PI) / 180;
      const speed = Math.hypot(m.vel.x, m.vel.y);
      m.vel.x = (normal.x * Math.cos(angle) + tangent.x * Math.sin(angle)) * speed;
      m.vel.y = (normal.y * Math.cos(angle) + tangent.y * Math.sin(angle)) * speed;
      m.pos.x += normal.x * (line - after);
      m.pos.y += normal.y * (line - after);
      m.power += 1;
    }
  };
}

/**
 * 彈珠階段：移動場上彈珠，每一小段依序交給牆、擋板與傳入的其他碰撞者處理反彈，
 * 遞減整場效果的倒數，最後移除漏接的彈珠。新的實體只需要提供自己的碰撞者。
 */
export function createMarbleStage(state: GameState, extraColliders: MarbleCollider[]) {
  const colliders = [createWallCollider(state), createPaddleCollider(state), ...extraColliders];

  function moveMarble(m: Marble, dt: number) {
    const radius = marbleRadius(m);
    const travel = Math.hypot(m.vel.x, m.vel.y) * dt;
    // 切成小段移動，避免高速時穿過薄的障礙物；彈珠越小，每段越短。
    const slices = Math.max(1, Math.ceil(travel / (radius / 2)));
    const h = dt / slices;
    for (let i = 0; i < slices; i++) {
      const prev = { x: m.pos.x, y: m.pos.y };
      m.pos.x += m.vel.x * h;
      m.pos.y += m.vel.y * h;
      for (const collide of colliders) collide(m, prev);
    }
  }

  /** 彈珠整顆越過有活著的玩家的那一邊，就是漏接。死亡玩家的方位是牆，不會漏。 */
  function hasLeft(m: Marble) {
    const radius = marbleRadius(m);
    return state.players.some((p) => !p.dead && depth(p.side, m.pos) < -radius);
  }

  function tickEffects(dt: number) {
    const { effects } = state;
    effects.pierce = Math.max(0, effects.pierce - dt);
  }

  return function advanceMarbles(dt: number) {
    for (const m of state.marbles) moveMarble(m, dt);
    tickEffects(dt);
    state.marbles = state.marbles.filter((m) => !hasLeft(m));
  };
}
