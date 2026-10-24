import type { PowerUpKind, Side } from '../core/types.ts';

export const SIDE_COLORS: Record<Side, string> = {
  bottom: '#4fd1ff',
  top: '#ff6bd6',
  left: '#9dff6b',
  right: '#ffd24f',
};

const MARBLE_COLORS = [
  [255, 255, 255],
  [255, 210, 79],
  [176, 107, 255],
] as const;

/** 彈珠顏色隨攻擊力從白色漸變到金黃再到亮紫，攻擊力九以上固定為亮紫。 */
export function marbleColor(power: number): string {
  const t = Math.min(1, Math.max(0, (power - 1) / 8)) * (MARBLE_COLORS.length - 1);
  const i = Math.min(MARBLE_COLORS.length - 2, Math.floor(t));
  const f = t - i;
  const [r, g, b] = [0, 1, 2].map((k) => Math.round(MARBLE_COLORS[i]![k]! + (MARBLE_COLORS[i + 1]![k]! - MARBLE_COLORS[i]![k]!) * f));
  return `rgb(${r}, ${g}, ${b})`;
}

export const POWERUP_STYLE: Record<PowerUpKind, { color: string; label: string; nerf?: true }> = {
  widen: { color: '#4fd1ff', label: '↔' },
  multiball: { color: '#ffe14f', label: '×3' },
  pierce: { color: '#ff9d4f', label: '貫' },
  // 環爆很稀有，所以顏色獨特、標籤和光暈都比其他道具稍大。
  burst: { color: '#ff4fe0', label: '環爆' },
  heal: { color: '#ff7a93', label: '♥' },
  // nerf 共用警示色與虛線外框，和增益一眼分得出來。
  shorten: { color: '#ff6b6b', label: '短', nerf: true },
};
