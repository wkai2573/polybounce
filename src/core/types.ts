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
  /** BOSS 更大、血量更多，並且改放彈幕而不是定時射單發。 */
  boss: boolean;
}

/** 子彈是誰射的：BOSS 的子彈比一般怪物的小、顏色不同。 */
export type BulletSource = 'boss' | 'monster';

/** 怪物發射的子彈，pos 是圓心。不會與彈珠互相碰撞，也不會被磚塊擋住。 */
export interface Bullet {
  id: number;
  pos: Vec2;
  vel: Vec2;
  source: BulletSource;
}

export type PowerUpKind =
  | 'supply'
  | 'widen'
  | 'multiball'
  | 'pierce'
  | 'burst'
  | 'heal'
  | 'enlarge'
  | 'shrink'
  | 'shorten';

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

/** 擋板寬度效果：加寬與縮短是同一個維度，後接到的覆蓋前一個。 */
export interface PaddleEffect {
  kind: 'widen' | 'shorten';
  /** 剩餘秒數。 */
  left: number;
}

export interface PlayerState {
  side: Side;
  /** 擋板中心沿著自己那一邊的座標：上下兩邊是 x，左右兩邊是 y。 */
  paddle: number;
  aiming: boolean;
  /** 生命，被子彈打到核心扣 1 點，歸零就死亡。 */
  lives: number;
  /** 死亡時擋板停在原位變成屍體，該方位對彈珠是牆，玩家不能操作。 */
  dead: boolean;
  /** 無敵剩餘秒數：受傷或復活後這段時間內，子彈穿過核心。 */
  invincible: number;
  /** 屍體的復活進度：彈珠撞到屍體的次數，只有死亡時才有意義。 */
  revive: number;
  /** 目前的擋板寬度效果，null 代表原本的寬度。死亡期間不倒數，所以屍體的寬度不變。 */
  paddleEffect: PaddleEffect | null;
}

/** 整場效果：全隊共用，期間場上所有彈珠都受影響，包含新發射與分裂出的。 */
export interface FieldEffects {
  /** 貫通剩餘秒數，0 代表沒有貫通。貫通中的彈珠穿過磚塊與怪物，仍被牆與擋板反彈。 */
  pierce: number;
  /** 彈珠大小效果：放大與縮小二選一，null 代表原本的大小。 */
  marbleSize: { kind: 'enlarge' | 'shrink'; left: number } | null;
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
  /** 這一局的起始關卡。接關之後仍然是原本的起點，用來判斷是否從第 1 關開始，以及再來一局要回到哪一關。 */
  startLevel: number;
  score: number;
  pool: number;
  marbles: Marble[];
  bricks: Brick[];
  monsters: Monster[];
  bullets: Bullet[];
  powerUps: PowerUp[];
  players: PlayerState[];
  effects: FieldEffects;
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
  /** 開始遊玩的關卡，預設第 1 關。這一關之前的關卡不會被生成。 */
  startLevel?: number;
  /** 這一局的起點，記錄進狀態的 startLevel；預設等於 startLevel。接關時開始的關卡不同於這一局的起點。 */
  runStartLevel?: number;
  /** 取代預設的關卡生成，主要讓測試能放置已知位置的磚塊。 */
  layout?: (level: number) => Brick[];
  /** 取代預設的怪物生成，讓測試能放置已知位置與血量的怪物。 */
  monsters?: (level: number) => Monster[];
  /** 擊碎磚塊掉落道具的機率，預設 POWERUP_DROP_CHANCE。 */
  dropChance?: number;
  /** 擊碎磚塊時可能掉落的道具類型，預設 POWERUP_KINDS。 */
  powerUpKinds?: PowerUpKind[];
  /** 怪物血量降到門檻時必掉的道具類型，預設 MONSTER_DROP_KINDS。 */
  monsterDropKinds?: PowerUpKind[];
}
