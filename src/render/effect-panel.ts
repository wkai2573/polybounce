import { MARBLE_SIZE_DURATION, PIERCE_DURATION, SHORTEN_DURATION, WIDEN_DURATION } from '../core/config.ts';
import type { GameState, PowerUpKind, Side } from '../core/types.ts';
import { POWERUP_STYLE } from './palette.ts';

/** 面板上的一列：標籤、倒數條顏色、剩餘比例（0 到 1）與剩餘秒數（一位小數）。 */
export interface EffectRow {
  label: string;
  color: string;
  ratio: number;
  seconds: number;
}

/** 各玩家區的一列，多了這位玩家的方位、是不是本機玩家自己、是不是死亡。 */
export interface PlayerEffectRow extends EffectRow {
  side: Side;
  self: boolean;
  dead: boolean;
}

/** 沒有任何效果的區塊是空陣列，畫面連標題都不顯示。 */
export interface EffectPanel {
  team: EffectRow[];
  players: PlayerEffectRow[];
}

const row = (kind: PowerUpKind, label: string, left: number, duration: number): EffectRow => ({
  label,
  color: POWERUP_STYLE[kind].color,
  ratio: Math.max(0, Math.min(1, left / duration)),
  seconds: Math.round(Math.max(0, left) * 10) / 10,
});

/**
 * 從遊戲狀態推導效果面板：全隊區是整場效果（貫通、彈珠大小），各玩家區依座位順序列出擋板的加寬或縮短。
 * 只列出生效中的效果。死亡玩家的個人效果照列，剩餘時間本來就不倒數。localSide 是本機玩家的方位。
 */
export function deriveEffectPanel(state: GameState, localSide: Side | null): EffectPanel {
  const team: EffectRow[] = [];
  if (state.effects.pierce > 0) team.push(row('pierce', '貫通', state.effects.pierce, PIERCE_DURATION));
  const size = state.effects.marbleSize;
  if (size) team.push(row(size.kind, size.kind === 'enlarge' ? '放大彈珠' : '縮小彈珠', size.left, MARBLE_SIZE_DURATION));

  const players: PlayerEffectRow[] = [];
  for (const p of state.players) {
    if (!p.paddleEffect) continue;
    const { kind, left } = p.paddleEffect;
    const base = kind === 'widen' ? row('widen', '加寬', left, WIDEN_DURATION) : row('shorten', '縮短', left, SHORTEN_DURATION);
    players.push({ ...base, side: p.side, self: p.side === localSide, dead: p.dead });
  }
  return { team, players };
}
