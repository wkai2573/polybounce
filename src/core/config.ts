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
/** 擋板深度的上限：擋板表面離自己那一邊最多這麼遠（像素）。 */
export const PADDLE_MAX_DEPTH = 100;
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

/** 一般怪物的數量：第三關起兩隻，之後每隔這麼多關多一隻，上限四隻。與玩家人數無關。 */
export const MONSTER_BASE_COUNT = 2;
export const MONSTER_COUNT_LEVEL_STEP = 3;
export const MONSTER_MAX_COUNT = 4;

/**
 * 每隻一般怪物各自計時，每隔這麼多秒向一位玩家發射一發子彈。第三關起是 MONSTER_FIRE_INTERVAL，
 * 之後每過 MONSTER_FIRE_LEVEL_STEP 關縮短 MONSTER_FIRE_INTERVAL_STEP 秒，最短 MONSTER_FIRE_INTERVAL_MIN 秒。
 */
export const MONSTER_FIRE_INTERVAL = 3;
export const MONSTER_FIRE_LEVEL_STEP = 5;
export const MONSTER_FIRE_INTERVAL_STEP = 0.5;
export const MONSTER_FIRE_INTERVAL_MIN = 1.5;
export const BULLET_SPEED = 200;
/** 一般怪物的子彈半徑；BOSS 的子彈（BOSS_BULLET_RADIUS）仍比它小，以便分辨來源。 */
export const BULLET_RADIUS = 8;

/** 場上子彈總數的上限，達到時暫時不再發射。每發子彈都會隨狀態同步，所以不能無限增加。 */
export const BULLET_CAP = 100;
export const BOSS_BULLET_RADIUS = 6;
/** BOSS 每發子彈的速度在這個範圍內隨機，讓彈幕有快有慢。 */
export const BOSS_BULLET_SPEED_MIN = 160;
export const BOSS_BULLET_SPEED_MAX = 240;

/** BOSS 血量降到最大血量的這個比例以下時進入狂暴。 */
export const BOSS_RAGE_HP_RATIO = 0.5;
/** BOSS 兩次齊射之間的秒數，狂暴時縮短。三種樣式輪流施放。 */
export const BOSS_VOLLEY_INTERVAL = 1.2;
export const BOSS_RAGE_VOLLEY_INTERVAL = 0.8;
/** 環形：一圈的發數，以及每次齊射整圈轉動的角度（度）。 */
export const BOSS_RING_COUNT = 24;
export const BOSS_RING_RAGE_COUNT = 32;
export const BOSS_RING_TURN_DEG = 7;
/** 瞄準扇形：朝一位玩家的發數，與最外側兩發的夾角（度）。 */
export const BOSS_FAN_COUNT = 7;
export const BOSS_FAN_RAGE_COUNT = 9;
export const BOSS_FAN_SPREAD_DEG = 40;
/** 螺旋：持續秒數、每發之間的秒數，以及每發轉動的角度（度）。 */
export const BOSS_SPIRAL_DURATION = 2;
export const BOSS_SPIRAL_INTERVAL = 0.1;
export const BOSS_SPIRAL_RAGE_INTERVAL = 0.07;
export const BOSS_SPIRAL_TURN_DEG = 14;

/** 道具飄向方位的速度（每秒像素）與碰撞半徑。掉落機率與權重集中在 drop-config.ts。 */
export const POWERUP_SPEED = 90;
export const POWERUP_RADIUS = 12;

/** 補給增加的彈珠數，彈珠池上限是人數乘以 POOL_CAP_PER_PLAYER。 */
export const SUPPLY_AMOUNT = 5;
export const POOL_CAP_PER_PLAYER = 20;

/** 擋板寬度效果：加寬與縮短是同一個維度，後接到的覆蓋前一個並重新計時，不疊加。 */
export const WIDEN_FACTOR = 1.5;
export const WIDEN_DURATION = 10;
export const SHORTEN_FACTOR = 0.6;
export const SHORTEN_DURATION = 6;

/** 每位玩家的生命：初始與上限相同，補血不超過上限。 */
export const INITIAL_LIVES = 3;
export const MAX_LIVES = 3;
/** 被子彈打到後的無敵秒數，期間子彈穿過核心。 */
export const HIT_INVINCIBLE_DURATION = 1.5;
/** 核心：以擋板中心為中心的方塊邊長，大小不隨擋板寬度改變。只與子彈碰撞，不影響彈珠。 */
export const CORE_SIZE = 16;
/** 彈珠撞到屍體這麼多次，死亡的玩家就復活；復活後的生命與無敵秒數。 */
export const REVIVE_HITS = 5;
export const REVIVE_LIVES = 1;
export const REVIVE_INVINCIBLE_DURATION = 1.5;

/** 多球：每顆彈珠分裂出的兩顆，各偏離原方向這麼多度。場上彈珠數量的上限也在這裡。 */
export const MULTIBALL_SPREAD_DEG = 15;
export const MARBLE_FIELD_CAP = 100;

/** 整場效果：全隊共用的一份倒數，期間場上所有彈珠都受影響；再接到只重新計時，不疊加。 */
export const PIERCE_DURATION = 3;
/** 彈珠大小效果：放大與縮小是同一個維度，後接到的覆蓋前一個並重新計時。 */
export const ENLARGE_FACTOR = 1.7;
export const SHRINK_FACTOR = 0.6;
export const MARBLE_SIZE_DURATION = 6;

/** 環爆：場上每顆彈珠原地分裂成這麼多顆（含原本那顆），均勻散開。 */
export const BURST_COUNT = 10;

/** 起始關卡的範圍。 */
export const MIN_START_LEVEL = 1;
export const MAX_START_LEVEL = 99;
