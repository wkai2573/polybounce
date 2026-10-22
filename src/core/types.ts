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

export interface PlayerState {
  side: Side;
  /** 擋板中心沿著自己那一邊的座標：上下兩邊是 x，左右兩邊是 y。 */
  paddle: number;
  aiming: boolean;
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
}
