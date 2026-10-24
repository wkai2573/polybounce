import type { PowerUpKind } from './types.ts';

/**
 * 掉落機率的唯一來源：想看或調整道具出現的頻率，只需要改這個檔案。
 * 新增道具時，在 POWERUP_WEIGHTS 加上權重即可；不想讓怪物必掉時，再把它排除在 MONSTER_DROP_KINDS 之外。
 */

/** 擊碎磚塊時掉落道具的機率。 */
export const POWERUP_DROP_CHANCE = 0.25;

/** 道具的抽選權重：數字越大越常出現。磚塊掉落與怪物的必掉共用這一份。 */
export const POWERUP_WEIGHTS: Record<PowerUpKind, number> = {
  multiball: 44,
  widen: 37,
  pierce: 23,
  burst: 7,
  heal: 12,
  shorten: 7,
};

/** 擊碎磚塊時可能掉落的種類：全部。 */
export const POWERUP_KINDS = Object.keys(POWERUP_WEIGHTS) as PowerUpKind[];

/** 怪物血量降到最大血量的這些比例以下時，各必掉一次道具。 */
export const MONSTER_DROP_THRESHOLDS = [0.66, 0.33];

/** 怪物必掉可抽的種類：排除 nerf，打倒怪物的獎勵不會變成懲罰。權重沿用 POWERUP_WEIGHTS。 */
export const MONSTER_DROP_KINDS: PowerUpKind[] = POWERUP_KINDS.filter((kind) => kind !== 'shorten');
