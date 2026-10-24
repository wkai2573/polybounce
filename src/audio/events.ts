import type { GameState } from '../core/types.ts';

export type SfxEvent =
  /** 撞到磚塊或怪物，count 是這段時間內的撞擊次數。 */
  | { kind: 'hit'; count: number }
  | { kind: 'launch'; count: number }
  | { kind: 'pickup' }
  /** 有玩家被子彈打到核心但還活著。 */
  | { kind: 'hurt' }
  | { kind: 'death' }
  | { kind: 'revive' }
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
  /** 每位玩家的發射量，用方位對照；發射的那一步會比前一步少約一顆。 */
  charge: Map<string, number>;
  marbles: number;
  /** 整場貫通的剩餘秒數；只有接到對應的道具時才會變長。 */
  pierce: number;
  /** 磚塊與怪物目前的血量，用編號對照。 */
  targets: Map<string, number>;
  /** 每位玩家的擋板寬度效果剩餘秒數與生命，用方位對照。 */
  paddleEffect: Map<string, number>;
  lives: Map<string, number>;
  dead: Map<string, boolean>;
}

export function summarize(state: GameState): Summary {
  const targets = new Map<string, number>();
  for (const b of state.bricks) targets.set(`b${b.id}`, b.hp);
  for (const m of state.monsters) targets.set(`m${m.id}`, m.hp);
  return {
    status: state.status,
    level: state.level,
    score: state.score,
    marbles: state.marbles.length,
    charge: new Map(state.players.map((p) => [p.side, p.charge])),
    pierce: state.effects.pierce,
    targets,
    paddleEffect: new Map(state.players.map((p) => [p.side, p.paddleEffect?.left ?? 0])),
    lives: new Map(state.players.map((p) => [p.side, p.lives])),
    dead: new Map(state.players.map((p) => [p.side, p.dead])),
  };
}

const rose = (before: Map<string, number>, after: Map<string, number>) =>
  [...after].some(([side, value]) => value > (before.get(side) ?? 0));

/** 方位對照中，由 from 變成 to 的方位；沒有出現在前一份的方位不算。 */
const flipped = (before: Map<string, boolean>, after: Map<string, boolean>, from: boolean) =>
  [...after].some(([side, value]) => before.get(side) === from && value === !from);

/**
 * 兩個摘要之間發射了幾顆：發射量會恢復也會被消耗，每發射一顆就少約一顆，
 * 恢復只是緩慢地增加，所以把各玩家減少的量加總再四捨五入。
 */
function launchesBetween(prev: Summary, next: Summary): number {
  let dropped = 0;
  for (const [side, charge] of next.charge) {
    const before = prev.charge.get(side);
    if (before !== undefined && before > charge) dropped += before - charge;
  }
  return Math.round(dropped);
}

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

  const launches = sameLevel ? launchesBetween(prev, next) : 0;
  if (launches > 0) events.push({ kind: 'launch', count: launches });

  if (sameLevel) {
    const reshaped = rose(prev.paddleEffect, next.paddleEffect);
    // 多球與環爆：場上彈珠的增加量超過發射的顆數。
    const multiplied = next.marbles - prev.marbles - launches >= 2;
    const fieldEffect = next.pierce > prev.pierce;
    // 補血：活著的玩家生命增加。復活也會讓生命增加，但那是另一種事件。
    const healed = [...next.lives].some(([side, lives]) => lives > (prev.lives.get(side) ?? 0) && prev.dead.get(side) === false);
    if (reshaped || multiplied || fieldEffect || healed) events.push({ kind: 'pickup' });

    const died = flipped(prev.dead, next.dead, false);
    // 死亡的那一下生命也會減少，只播死亡音效。
    const hurt = [...next.lives].some(([side, lives]) => lives < (prev.lives.get(side) ?? 0) && next.dead.get(side) === false);
    if (hurt) events.push({ kind: 'hurt' });
    if (died) events.push({ kind: 'death' });
    if (flipped(prev.dead, next.dead, true)) events.push({ kind: 'revive' });
  }

  if (!sameLevel) events.push({ kind: 'clear' });
  if (prev.status === 'playing' && next.status === 'defeated') events.push({ kind: 'defeat' });
  return events;
}
