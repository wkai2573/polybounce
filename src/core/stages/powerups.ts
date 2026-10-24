import {
  ARENA_SIZE,
  BURST_COUNT,
  MARBLE_FIELD_CAP,
  MULTIBALL_SPREAD_DEG,
  PADDLE_THICKNESS,
  PIERCE_DURATION,
  POOL_CAP_PER_PLAYER,
  POWERUP_DROP_CHANCE,
  POWERUP_KINDS,
  POWERUP_RADIUS,
  POWERUP_SPEED,
  POWERUP_WEIGHTS,
  SUPPLY_AMOUNT,
  WIDEN_DURATION,
} from '../config.ts';
import { along, depth, FRAMES } from '../geometry.ts';
import { paddleWidth } from '../paddle.ts';
import { createRng } from '../rng.ts';
import type { GameOptions, GameState, Marble, PlayerState, PowerUp, PowerUpKind, Vec2 } from '../types.ts';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface Dropper {
  /** 一定掉落：朝每位在場玩家的方位各掉一個、類型相同。 */
  drop(pos: Vec2): void;
  /** 依掉落機率決定要不要掉落。 */
  maybeDrop(pos: Vec2): void;
}

/** 掉落有自己的亂數，所以掉落與否不會影響怪物與子彈的隨機序列。 */
export function createDropper(state: GameState, seed: number, options: GameOptions): Dropper {
  const rng = createRng(seed ^ 0x9e3779b9);
  const chance = options.dropChance ?? POWERUP_DROP_CHANCE;
  const kinds = options.powerUpKinds ?? POWERUP_KINDS;
  let nextId = 0;
  let nextBatch = 0;

  /** 依權重抽一種道具；沒有可抽的種類時回傳 undefined。 */
  function pickKind(): PowerUpKind | undefined {
    const total = kinds.reduce((sum, k) => sum + POWERUP_WEIGHTS[k], 0);
    let roll = rng() * total;
    for (const kind of kinds) {
      roll -= POWERUP_WEIGHTS[kind];
      if (roll < 0) return kind;
    }
    return kinds[kinds.length - 1];
  }

  function drop(pos: Vec2) {
    const kind = pickKind();
    if (!kind) return;
    const batch = nextBatch++;
    for (const player of state.players) {
      state.powerUps.push({ id: nextId++, batch, kind, side: player.side, pos: { x: pos.x, y: pos.y } });
    }
  }

  return {
    drop,
    maybeDrop(pos) {
      if (rng() < chance) drop(pos);
    },
  };
}

/** 道具階段：加寬倒數、道具飄向各自的方位，被該方位的擋板碰到就拾取，飄出場地就消失。 */
export function createPowerUpStage(state: GameState, nextMarbleId: () => number) {
  function rotate(v: Vec2, deg: number): Vec2 {
    const a = (deg * Math.PI) / 180;
    return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
  }

  /**
   * 場上每顆彈珠各自原地分裂出新的彈珠，速度大小不變，並繼承貫通剩餘秒數；
   * 超過場上彈珠上限的就不產生。
   */
  function splitInto(degrees: number[]) {
    for (const m of state.marbles.slice()) {
      for (const deg of degrees) {
        if (state.marbles.length >= MARBLE_FIELD_CAP) return;
        const copy: Marble = { id: nextMarbleId(), pos: { x: m.pos.x, y: m.pos.y }, vel: rotate(m.vel, deg), pierce: m.pierce };
        state.marbles.push(copy);
      }
    }
  }

  const split = () => splitInto([-MULTIBALL_SPREAD_DEG, MULTIBALL_SPREAD_DEG]);

  /** 原本那顆保留，另外新增的方向均勻分佈，所以一共 BURST_COUNT 顆、彼此間隔 360 / BURST_COUNT 度。 */
  const burst = () => splitInto(Array.from({ length: BURST_COUNT - 1 }, (_, i) => ((i + 1) * 360) / BURST_COUNT));

  function pierce() {
    for (const m of state.marbles) m.pierce = PIERCE_DURATION;
  }

  function applyTo(player: PlayerState, powerUp: PowerUp) {
    switch (powerUp.kind) {
      case 'supply': {
        const cap = state.players.length * POOL_CAP_PER_PLAYER;
        state.pool = Math.max(state.pool, Math.min(state.pool + SUPPLY_AMOUNT, cap));
        break;
      }
      case 'widen': {
        player.widen = WIDEN_DURATION;
        const half = paddleWidth(player) / 2;
        player.paddle = clamp(player.paddle, half, ARENA_SIZE - half);
        break;
      }
      case 'multiball':
        split();
        break;
      case 'pierce':
        pierce();
        break;
      case 'burst':
        burst();
        break;
    }
  }

  function touches(player: PlayerState, p: PowerUp) {
    const d = depth(player.side, p.pos);
    if (d > PADDLE_THICKNESS + POWERUP_RADIUS || d < -POWERUP_RADIUS) return false;
    return Math.abs(along(player.side, p.pos) - player.paddle) <= paddleWidth(player) / 2 + POWERUP_RADIUS;
  }

  return function advancePowerUps(dt: number) {
    for (const player of state.players) player.widen = Math.max(0, player.widen - dt);

    const gone = new Set<number>();
    for (const p of state.powerUps) {
      if (gone.has(p.id)) continue;
      const { normal } = FRAMES[p.side];
      p.pos.x -= normal.x * POWERUP_SPEED * dt;
      p.pos.y -= normal.y * POWERUP_SPEED * dt;

      const player = state.players.find((q) => q.side === p.side);
      if (player && touches(player, p)) {
        gone.add(p.id);
        applyTo(player, p);
        // 補給、多球、貫通與環爆是全隊共用的效果，同一批只有第一個被接到的生效；加寬各自接各自的。
        if (p.kind !== 'widen') {
          for (const other of state.powerUps) if (other.batch === p.batch) gone.add(other.id);
        }
      } else if (!player || depth(p.side, p.pos) < -POWERUP_RADIUS) {
        gone.add(p.id);
      }
    }
    if (gone.size > 0) state.powerUps = state.powerUps.filter((p) => !gone.has(p.id));
  };
}
