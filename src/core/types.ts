export type Side = 'bottom' | 'top' | 'left' | 'right';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Marble {
  id: number;
  pos: Vec2;
  vel: Vec2;
}

/** 磚塊的 x、y 為左上角。 */
export interface Brick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
}

/** 怪物的 pos 是圓心。 */
export interface Monster {
  id: number;
  pos: Vec2;
  radius: number;
  hp: number;
  maxHp: number;
  /** BOSS 與一般怪物行為相同，只是更大、血量更多。 */
  boss: boolean;
}

/** 怪物發射的子彈，pos 是圓心。不會與彈珠互相碰撞。 */
export interface Bullet {
  id: number;
  pos: Vec2;
  vel: Vec2;
}

export type PowerUpKind = 'supply' | 'widen' | 'multiball';

/**
 * 掉落的道具，pos 是圓心。同一次掉落朝每位玩家的方位各掉一個，共用同一個 batch 與 kind。
 */
export interface PowerUp {
  id: number;
  batch: number;
  kind: PowerUpKind;
  /** 道具飄向、也只能由這個方位的擋板拾取。 */
  side: Side;
  pos: Vec2;
}

export interface PlayerState {
  side: Side;
  /** 擋板中心沿著自己那一邊的座標：上下兩邊是 x，左右兩邊是 y。 */
  paddle: number;
  aiming: boolean;
  /** 凍結剩餘秒數，0 代表沒有凍結。凍結只鎖擋板移動。 */
  frozen: number;
  /** 加寬剩餘秒數，0 代表擋板是原本的寬度。 */
  widen: number;
}

/** primary 與 secondary 是這一幀才按下的邊緣訊號，不是持續按住。 */
export interface PlayerInput {
  pointer: Vec2;
  primary: boolean;
  secondary: boolean;
}

export interface GameState {
  status: 'playing' | 'defeated';
  level: number;
  score: number;
  pool: number;
  marbles: Marble[];
  bricks: Brick[];
  monsters: Monster[];
  bullets: Bullet[];
  powerUps: PowerUp[];
  players: PlayerState[];
}

export interface Game {
  readonly state: GameState;
  /** inputs 的索引就是玩家編號。 */
  step(dt: number, inputs: PlayerInput[]): void;
  /** 玩家離開：他的方位變成牆，其餘玩家照原順序排列，彈珠池與分數不變。 */
  removePlayer(side: Side): void;
}

export interface GameOptions {
  playerCount: 1 | 2 | 3 | 4;
  /** 指定每位玩家的方位，取代依 playerCount 分配的預設順序；用來讓重開的一局保留原本的方位。 */
  sides?: Side[];
  seed: number;
  /** 取代預設的關卡生成，主要讓測試能放置已知位置的磚塊。 */
  layout?: (level: number) => Brick[];
  /** 取代預設的怪物生成，讓測試能放置已知位置與血量的怪物。 */
  monsters?: (level: number) => Monster[];
  /** 擊碎磚塊掉落道具的機率，預設 POWERUP_DROP_CHANCE。 */
  dropChance?: number;
  /** 可能掉落的道具類型，預設全部。 */
  powerUpKinds?: PowerUpKind[];
}
