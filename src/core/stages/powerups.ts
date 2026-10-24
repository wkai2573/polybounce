import {
  BURST_COUNT,
  MARBLE_FIELD_CAP,
  MAX_LIVES,
  MULTIBALL_SPREAD_DEG,
  PIERCE_DURATION,
  POWERUP_RADIUS,
  POWERUP_SPEED,
  SHORTEN_DURATION,
  WIDEN_DURATION,
} from '../config.ts';
import { MONSTER_DROP_KINDS, POWERUP_DROP_CHANCE, POWERUP_KINDS, POWERUP_WEIGHTS } from '../drop-config.ts';
import { along, depth, FRAMES } from '../geometry.ts';
import { alivePlayers, clampPaddle, paddleSurface, paddleWidth } from '../paddle.ts';
import { createRng } from '../rng.ts';
import type { GameOptions, GameState, Marble, PlayerState, PowerUp, PowerUpKind, Vec2 } from '../types.ts';

/** 個人效果：各接各的。其餘都是全隊共用，同一批只有第一個被接到的生效。 */
const PERSONAL_KINDS: ReadonlySet<PowerUpKind> = new Set(['widen', 'shorten', 'heal']);

export interface Dropper {
  /** 怪物血量降到門檻時一定掉落：從怪物必掉的種類中依權重抽，朝每位活著的玩家的方位各掉一個、類型相同。 */
  dropForMonster(pos: Vec2): void;
  /** 依掉落機率決定要不要掉落，從磚塊可掉落的種類中依權重抽。 */
  maybeDrop(pos: Vec2): void;
}

/** 掉落有自己的亂數，所以掉落與否不會影響怪物與子彈的隨機序列。 */
export function createDropper(state: GameState, seed: number, options: GameOptions): Dropper {
  const rng = createRng(seed ^ 0x9e3779b9);
  const chance = options.dropChance ?? POWERUP_DROP_CHANCE;
  const brickKinds = options.powerUpKinds ?? POWERUP_KINDS;
  const monsterKinds = options.monsterDropKinds ?? MONSTER_DROP_KINDS;
  let nextId = 0;
  let nextBatch = 0;

  /** 依權重從 kinds 抽一種道具；沒有可抽的種類時回傳 undefined。 */
  function pickKind(kinds: readonly PowerUpKind[]): PowerUpKind | undefined {
    const total = kinds.reduce((sum, k) => sum + POWERUP_WEIGHTS[k], 0);
    let roll = rng() * total;
    for (const kind of kinds) {
      roll -= POWERUP_WEIGHTS[kind];
      if (roll < 0) return kind;
    }
    return kinds[kinds.length - 1];
  }

  /** 死亡玩家的方位沒人接得到，所以不掉。 */
  function drop(pos: Vec2, kinds: readonly PowerUpKind[]) {
    const kind = pickKind(kinds);
    if (!kind) return;
    const batch = nextBatch++;
    for (const player of alivePlayers(state)) {
      state.powerUps.push({ id: nextId++, batch, kind, side: player.side, pos: { x: pos.x, y: pos.y } });
    }
  }

  return {
    dropForMonster: (pos) => drop(pos, monsterKinds),
    maybeDrop(pos) {
      if (rng() < chance) drop(pos, brickKinds);
    },
  };
}

/** 道具階段：擋板寬度效果倒數、道具飄向各自的方位，被該方位活著的玩家的擋板（在它目前的深度）碰到就拾取，飄到原本的邊緣外就消失。 */
export function createPowerUpStage(state: GameState, nextMarbleId: () => number) {
  function rotate(v: Vec2, deg: number): Vec2 {
    const a = (deg * Math.PI) / 180;
    return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
  }

  /** 場上每顆彈珠各自原地分裂出新的彈珠，速度大小不變；超過場上彈珠上限的就不產生。 */
  function splitInto(degrees: number[]) {
    for (const m of state.marbles.slice()) {
      for (const deg of degrees) {
        if (state.marbles.length >= MARBLE_FIELD_CAP) return;
        // 分裂出來的新彈珠從攻擊力一開始，不繼承原彈珠。
        const copy: Marble = { id: nextMarbleId(), pos: { x: m.pos.x, y: m.pos.y }, vel: rotate(m.vel, deg), power: 1 };
        state.marbles.push(copy);
      }
    }
  }

  const split = () => splitInto([-MULTIBALL_SPREAD_DEG, MULTIBALL_SPREAD_DEG]);

  /** 原本那顆保留，另外新增的方向均勻分佈，所以一共 BURST_COUNT 顆、彼此間隔 360 / BURST_COUNT 度。 */
  const burst = () => splitInto(Array.from({ length: BURST_COUNT - 1 }, (_, i) => ((i + 1) * 360) / BURST_COUNT));

  function setPaddleEffect(player: PlayerState, kind: 'widen' | 'shorten', left: number) {
    player.paddleEffect = { kind, left };
    clampPaddle(player);
  }

  function applyTo(player: PlayerState, powerUp: PowerUp) {
    switch (powerUp.kind) {
      case 'widen':
        setPaddleEffect(player, 'widen', WIDEN_DURATION);
        break;
      case 'shorten':
        setPaddleEffect(player, 'shorten', SHORTEN_DURATION);
        break;
      case 'heal':
        player.lives = Math.min(MAX_LIVES, player.lives + 1);
        break;
      case 'multiball':
        split();
        break;
      case 'pierce':
        state.effects.pierce = PIERCE_DURATION;
        break;
      case 'burst':
        burst();
        break;
    }
  }

  function touches(player: PlayerState, p: PowerUp) {
    const d = depth(player.side, p.pos);
    if (d > paddleSurface(player) + POWERUP_RADIUS || d < player.depth - POWERUP_RADIUS) return false;
    return Math.abs(along(player.side, p.pos) - player.paddle) <= paddleWidth(player) / 2 + POWERUP_RADIUS;
  }

  /** 死亡期間不倒數，所以屍體的寬度不會在原地變來變去。 */
  function tickPaddleEffects(dt: number) {
    for (const player of state.players) {
      if (player.dead || !player.paddleEffect) continue;
      player.paddleEffect.left -= dt;
      if (player.paddleEffect.left <= 0) player.paddleEffect = null;
    }
  }

  return function advancePowerUps(dt: number) {
    tickPaddleEffects(dt);

    const gone = new Set<number>();
    for (const p of state.powerUps) {
      if (gone.has(p.id)) continue;
      const { normal } = FRAMES[p.side];
      p.pos.x -= normal.x * POWERUP_SPEED * dt;
      p.pos.y -= normal.y * POWERUP_SPEED * dt;

      const player = state.players.find((q) => q.side === p.side);
      if (player && !player.dead && touches(player, p)) {
        gone.add(p.id);
        applyTo(player, p);
        if (!PERSONAL_KINDS.has(p.kind)) {
          for (const other of state.powerUps) if (other.batch === p.batch) gone.add(other.id);
        }
      } else if (!player || player.dead || depth(p.side, p.pos) < -POWERUP_RADIUS) {
        gone.add(p.id);
      }
    }
    if (gone.size > 0) state.powerUps = state.powerUps.filter((p) => !gone.has(p.id));
  };
}
