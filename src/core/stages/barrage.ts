import {
  BOSS_BULLET_SPEED_MAX,
  BOSS_BULLET_SPEED_MIN,
  BOSS_FAN_COUNT,
  BOSS_FAN_RAGE_COUNT,
  BOSS_FAN_SPREAD_DEG,
  BOSS_RAGE_HP_RATIO,
  BOSS_RAGE_VOLLEY_INTERVAL,
  BOSS_RING_COUNT,
  BOSS_RING_RAGE_COUNT,
  BOSS_RING_TURN_DEG,
  BOSS_SPIRAL_DURATION,
  BOSS_SPIRAL_INTERVAL,
  BOSS_SPIRAL_RAGE_INTERVAL,
  BOSS_SPIRAL_TURN_DEG,
  BOSS_VOLLEY_INTERVAL,
} from '../config.ts';
import { alivePlayers, coreCenter } from '../paddle.ts';
import type { GameState, Monster, Vec2 } from '../types.ts';

/** 射出一發 BOSS 的子彈；場上子彈已達上限時由呼叫端略過，所以這裡不必處理。 */
export type BossShooter = (origin: Vec2, vel: Vec2) => void;

type Pattern = 'ring' | 'fan' | 'spiral';
/** 三種樣式依序輪替。 */
const ORDER: Pattern[] = ['ring', 'fan', 'spiral'];

interface Barrage {
  /** 下一次要施放 ORDER 中的哪一種。 */
  next: number;
  /** 距離下一次施放還有幾秒。 */
  wait: number;
  /** 環形整圈目前的轉角（度），每次齊射增加一點，讓縫隙每次不同。 */
  ringAngle: number;
  /** 螺旋目前的射出角度（度），延續到下一次螺旋，所以每次起點不同。 */
  spiralAngle: number;
  /** 螺旋進行中時才有：剩餘秒數與距離下一發的秒數。 */
  spiral: { left: number; tick: number } | null;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * BOSS 彈幕：輪流施放環形、瞄準扇形與螺旋。血量降到一半以下進入狂暴，間隔縮短、發數增加。
 * 施放的進度只是 BOSS 的過程，不屬於遊戲狀態，所以不放進快照。
 */
export function createBarrageStage(state: GameState, rng: () => number, shoot: BossShooter) {
  const barrages = new WeakMap<Monster, Barrage>();

  const raging = (boss: Monster) => boss.hp <= boss.maxHp * BOSS_RAGE_HP_RATIO;

  function shootAt(boss: Monster, angleRad: number) {
    const speed = BOSS_BULLET_SPEED_MIN + rng() * (BOSS_BULLET_SPEED_MAX - BOSS_BULLET_SPEED_MIN);
    shoot({ x: boss.pos.x, y: boss.pos.y }, { x: Math.cos(angleRad) * speed, y: Math.sin(angleRad) * speed });
  }

  function fireRing(boss: Monster, barrage: Barrage) {
    const count = raging(boss) ? BOSS_RING_RAGE_COUNT : BOSS_RING_COUNT;
    for (let i = 0; i < count; i++) shootAt(boss, rad(barrage.ringAngle) + (i * 2 * Math.PI) / count);
    barrage.ringAngle += BOSS_RING_TURN_DEG;
  }

  function fireFan(boss: Monster) {
    const candidates = alivePlayers(state);
    const target = candidates[Math.floor(rng() * candidates.length)];
    if (!target) return;
    const goal = coreCenter(target);
    const center = Math.atan2(goal.y - boss.pos.y, goal.x - boss.pos.x);
    const count = raging(boss) ? BOSS_FAN_RAGE_COUNT : BOSS_FAN_COUNT;
    const step = rad(BOSS_FAN_SPREAD_DEG) / (count - 1);
    for (let i = 0; i < count; i++) shootAt(boss, center + (i - (count - 1) / 2) * step);
  }

  return function advanceBarrage(boss: Monster, dt: number) {
    let barrage = barrages.get(boss);
    if (!barrage) {
      barrage = { next: 0, wait: BOSS_VOLLEY_INTERVAL, ringAngle: 0, spiralAngle: 0, spiral: null };
      barrages.set(boss, barrage);
    }
    const interval = raging(boss) ? BOSS_RAGE_VOLLEY_INTERVAL : BOSS_VOLLEY_INTERVAL;

    if (barrage.spiral) {
      barrage.spiral.left -= dt;
      barrage.spiral.tick -= dt;
      if (barrage.spiral.left <= 0) {
        barrage.spiral = null;
        barrage.wait = interval;
        return;
      }
    } else {
      barrage.wait -= dt;
      if (barrage.wait > 0) return;
      const pattern = ORDER[barrage.next]!;
      barrage.next = (barrage.next + 1) % ORDER.length;
      if (pattern === 'ring') fireRing(boss, barrage);
      else if (pattern === 'fan') fireFan(boss);
      else barrage.spiral = { left: BOSS_SPIRAL_DURATION, tick: 0 };
      if (!barrage.spiral) {
        barrage.wait += interval;
        return;
      }
    }

    // 螺旋進行中：每隔一小段射一發，射出角度逐發旋轉。
    const spiral = barrage.spiral!;
    const gap = raging(boss) ? BOSS_SPIRAL_RAGE_INTERVAL : BOSS_SPIRAL_INTERVAL;
    while (spiral.tick <= 0) {
      shootAt(boss, rad(barrage.spiralAngle));
      barrage.spiralAngle += BOSS_SPIRAL_TURN_DEG;
      spiral.tick += gap;
    }
  };
}
