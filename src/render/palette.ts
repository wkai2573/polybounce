import type { PowerUpKind, Side } from '../core/types.ts';

export const SIDE_COLORS: Record<Side, string> = {
  bottom: '#4fd1ff',
  top: '#ff6bd6',
  left: '#9dff6b',
  right: '#ffd24f',
};

export const POWERUP_STYLE: Record<PowerUpKind, { color: string; label: string; nerf?: true }> = {
  supply: { color: '#7dffb0', label: '+5' },
  widen: { color: '#4fd1ff', label: '↔' },
  multiball: { color: '#ffe14f', label: '×3' },
  pierce: { color: '#ff9d4f', label: '貫' },
  // 環爆很稀有，所以顏色獨特、標籤和光暈都比其他道具稍大。
  burst: { color: '#ff4fe0', label: '環爆' },
  heal: { color: '#ff7a93', label: '♥' },
  enlarge: { color: '#6bffea', label: '大' },
  // nerf 共用警示色與虛線外框，和增益一眼分得出來。
  shorten: { color: '#ff6b6b', label: '短', nerf: true },
  shrink: { color: '#ff6b6b', label: '小', nerf: true },
};
