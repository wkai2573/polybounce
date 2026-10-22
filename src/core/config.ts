import type { Side } from './types.ts';

export const ARENA_SIZE = 800;

/** 玩家依加入順序分配的方位。 */
export const SIDE_ORDER: Side[] = ['bottom', 'top', 'left', 'right'];

/** 磚塊只出現在場地中央這個正方形內，四周留給擋板與反彈空間。 */
export const BRICK_REGION = { min: 160, max: 640 };
export const BRICK_W = 48;
export const BRICK_H = 24;
export const BRICK_COLS = 10;

export const MARBLES_PER_PLAYER = 10;
export const MARBLE_RADIUS = 6;
export const MARBLE_BASE_SPEED = 420;
/** 速度隨關卡小幅增加，但不超過基礎速度的這個倍數。 */
export const MARBLE_SPEED_PER_LEVEL = 0.03;
export const MARBLE_SPEED_CAP = 1.5;

export const PADDLE_WIDTH = 120;
export const PADDLE_THICKNESS = 12;
/** 擋板反彈時，擊中邊緣的最大偏離角度（度）。 */
export const PADDLE_MAX_BOUNCE_DEG = 60;

/** 瞄準方向與自己那一邊的表面至少夾這個角度（度）。 */
export const AIM_MIN_ANGLE_DEG = 15;

/** 擊碎一塊磚得到的分數，乘以該磚的最大血量。 */
export const SCORE_PER_HP = 10;
