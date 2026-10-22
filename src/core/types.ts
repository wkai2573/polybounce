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
}

/** 怪物發射的子彈，pos 是圓心。不會與彈珠互相碰撞。 */
export interface Bullet {
  id: number;
  pos: Vec2;
  vel: Vec2;
}

export interface PlayerState {
  side: Side;
  /** 擋板中心沿著自己那一邊的座標：上下兩邊是 x，左右兩邊是 y。 */
  paddle: number;
  aiming: boolean;
  /** 凍結剩餘秒數，0 代表沒有凍結。凍結只鎖擋板移動。 */
  frozen: number;
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
  players: PlayerState[];
}

export interface Game {
  readonly state: GameState;
  /** inputs 的索引就是玩家編號。 */
  step(dt: number, inputs: PlayerInput[]): void;
}

export interface GameOptions {
  playerCount: 1 | 2 | 3 | 4;
  seed: number;
  /** 取代預設的關卡生成，主要讓測試能放置已知位置的磚塊。 */
  layout?: (level: number) => Brick[];
  /** 取代預設的怪物生成，讓測試能放置已知位置與血量的怪物。 */
  monsters?: (level: number) => Monster[];
}
