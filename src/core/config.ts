import type { PowerUpKind, Side } from './types.ts';

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

/** 第一次出現怪物的關卡。 */
export const MONSTER_FIRST_LEVEL = 3;
export const MONSTER_RADIUS = 36;
/** 怪物遊走的速度（每秒像素）。怪物只在 BRICK_REGION 這個中央區域內活動。 */
export const MONSTER_SPEED = 40;
/** 怪物血量只隨關卡增加，不隨玩家人數改變。 */
export const MONSTER_BASE_HP = 5;
export const MONSTER_HP_PER_LEVEL = 2;
/** 每這麼多關出現一次 BOSS。 */
export const BOSS_LEVEL_INTERVAL = 5;
export const BOSS_RADIUS = 52;
/** BOSS 血量是同一關一般怪物的這個倍數。 */
export const BOSS_HP_MULTIPLIER = 3;
/** 打倒怪物得到的分數，乘以該怪物的最大血量。 */
export const MONSTER_SCORE_PER_HP = 20;

/** 怪物每隔這麼多秒向一位玩家發射一發子彈。 */
export const MONSTER_FIRE_INTERVAL = 5;
export const BULLET_SPEED = 200;
export const BULLET_RADIUS = 5;
/** 擋板被子彈打到後的凍結秒數，凍結期間再被打到會重新計時。 */
export const FREEZE_DURATION = 1;

/** 擊碎磚塊時掉落道具的機率。 */
export const POWERUP_DROP_CHANCE = 0.15;
export const POWERUP_KINDS: PowerUpKind[] = ['supply', 'widen', 'multiball'];
/** 怪物血量降到最大血量的這些比例以下時，各掉落一次道具。 */
export const MONSTER_DROP_THRESHOLDS = [0.66, 0.33];
/** 道具飄向方位的速度（每秒像素）與碰撞半徑。 */
export const POWERUP_SPEED = 90;
export const POWERUP_RADIUS = 12;

/** 補給增加的彈珠數，彈珠池上限是人數乘以 POOL_CAP_PER_PLAYER。 */
export const SUPPLY_AMOUNT = 5;
export const POOL_CAP_PER_PLAYER = 20;

/** 加寬時擋板寬度的倍數與持續秒數；重複接到只重新計時，不疊加。 */
export const WIDEN_FACTOR = 1.5;
export const WIDEN_DURATION = 10;

/** 多球：每顆彈珠分裂出的兩顆，各偏離原方向這麼多度。場上彈珠數量的上限也在這裡。 */
export const MULTIBALL_SPREAD_DEG = 15;
export const MARBLE_FIELD_CAP = 100;
