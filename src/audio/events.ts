import type { GameState } from '../core/types.ts';

export type SfxEvent =
  /** 撞到磚塊或怪物，count 是這段時間內的撞擊次數。 */
  | { kind: 'hit'; count: number }
  | { kind: 'launch'; count: number }
  | { kind: 'pickup' }
  | { kind: 'freeze' }
  | { kind: 'clear' }
  | { kind: 'defeat' };

/**
 * 遊戲狀態的精簡快照。房主端的狀態物件會被原地修改，所以比較前後兩次必須各自留一份摘要，
 * 不能留著狀態物件本身。
 */
export interface Summary {
  status: GameState['status'];
  level: number;
  score: number;
  pool: number;
  marbles: number;
  /** 場上彈珠中最長的貫通剩餘秒數；只有接到貫通時才會變長。 */
  pierce: number;
  /** 磚塊與怪物目前的血量，用編號對照。 */
  targets: Map<string, number>;
  /** 每位玩家的凍結與加寬剩餘秒數，用方位對照。 */
  frozen: Map<string, number>;
  widen: Map<string, number>;
}

export function summarize(state: GameState): Summary {
  const targets = new Map<string, number>();
  for (const b of state.bricks) targets.set(`b${b.id}`, b.hp);
  for (const m of state.monsters) targets.set(`m${m.id}`, m.hp);
  return {
    status: state.status,
    level: state.level,
    score: state.score,
    pool: state.pool,
    marbles: state.marbles.length,
    pierce: Math.max(0, ...state.marbles.map((m) => m.pierce)),
    targets,
    frozen: new Map(state.players.map((p) => [p.side, p.frozen])),
    widen: new Map(state.players.map((p) => [p.side, p.widen])),
  };
}

const rose = (before: Map<string, number>, after: Map<string, number>) =>
  [...after].some(([side, value]) => value > (before.get(side) ?? 0));

/**
 * 從前後兩個摘要推導該播哪些音效。事件由狀態的變化推得，所以單人、房主與其他玩家端
 * 都用同一套，不必由核心額外送事件。
 */
export function deriveEvents(prev: Summary | null, next: Summary): SfxEvent[] {
  if (!prev) return [];
  // 重開一局時分數、關卡都會倒退，那些變化不是遊戲裡的事件。
  if (prev.status === 'defeated' || next.score < prev.score || next.level < prev.level) return [];

  const events: SfxEvent[] = [];
  const sameLevel = next.level === prev.level;

  let hits = 0;
  if (sameLevel) {
    for (const [id, hp] of prev.targets) hits += Math.max(0, hp - (next.targets.get(id) ?? 0));
  }
  // 撞到最後一塊磚時，下一關的新磚塊已經換上，所以過關的那一步也算一次撞擊。
  if (!sameLevel) hits = 1;
  if (hits > 0) events.push({ kind: 'hit', count: hits });

  const launches = sameLevel ? Math.max(0, prev.pool - next.pool) : 0;
  if (launches > 0) events.push({ kind: 'launch', count: launches });

  if (sameLevel) {
    const supplied = next.pool > prev.pool;
    const widened = rose(prev.widen, next.widen);
    // 多球與環爆：場上彈珠的增加量超過發射的顆數。
    const multiplied = next.marbles - prev.marbles - launches >= 2;
    const pierced = next.pierce > prev.pierce;
    if (supplied || widened || multiplied || pierced) events.push({ kind: 'pickup' });
  }

  if (rose(prev.frozen, next.frozen)) events.push({ kind: 'freeze' });
  if (!sameLevel) events.push({ kind: 'clear' });
  if (prev.status === 'playing' && next.status === 'defeated') events.push({ kind: 'defeat' });
  return events;
}
