import { describe, expect, test } from 'bun:test';
import { createGame } from './game.ts';
import { at } from './test-input.ts';
import type { Brick, Game, GameOptions, PlayerInput, PlayerState, Side } from './types.ts';

const DT = 1 / 60;
const fire = (x: number, side: Side = 'bottom'): PlayerInput => ({ ...at(x, side), fire: true });

const brickAt = (x: number, y: number, hp = 1): Brick => ({ id: 0, x, y, w: 48, h: 24, hp, maxHp: hp });
const cornerBrick = (): Brick => ({ ...brickAt(160, 160, 100000), id: 99 });

function newGame(opts: Partial<GameOptions> = {}) {
  return createGame({ playerCount: 1, seed: 1, layout: () => [cornerBrick()], dropChance: 0, ...opts });
}

/** 每位玩家的指標都停在自己那一邊，只有 first 帶著按鍵。 */
function inputs(game: Game, first?: PlayerInput): PlayerInput[] {
  return game.state.players.map((p, i) => (i === 0 && first ? first : at(400, p.side)));
}

function idle(game: Game, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += DT) game.step(DT, inputs(game));
}

const bottom = (game: Game): PlayerState => game.state.players.find((p) => p.side === 'bottom')!;

describe('發射量', () => {
  test('開局是滿的，上限五顆', () => {
    const game = newGame({ playerCount: 2 });

    expect(game.state.players.map((p) => p.charge)).toEqual([5, 5]);
  });

  test('連續發射五次後再按一次沒有作用，場上只有五顆', () => {
    const game = newGame();

    for (let i = 0; i < 6; i++) game.step(DT, inputs(game, fire(400)));

    expect(game.state.marbles).toHaveLength(5);
  });

  test('每秒恢復一顆：用完後等一秒又可以發射一顆', () => {
    const game = newGame();
    for (let i = 0; i < 5; i++) game.step(DT, inputs(game, fire(400)));
    expect(game.state.marbles).toHaveLength(5);

    idle(game, 1);
    game.step(DT, inputs(game, fire(400)));

    expect(game.state.marbles).toHaveLength(6);
  });

  test('恢復是連續的：半秒只恢復半顆，還不能發射', () => {
    const game = newGame();
    bottom(game).charge = 0;

    idle(game, 0.5);
    game.step(DT, inputs(game, fire(400)));

    expect(game.state.marbles).toHaveLength(0);
    expect(bottom(game).charge).toBeGreaterThan(0.5);
    expect(bottom(game).charge).toBeLessThan(0.6);
  });

  test('不會超過上限', () => {
    const game = newGame();

    idle(game, 3);

    expect(bottom(game).charge).toBe(5);
  });

  test('每位玩家各自獨立：一位用完不影響另一位', () => {
    const game = newGame({ playerCount: 2 });
    for (let i = 0; i < 5; i++) game.step(DT, inputs(game, fire(400)));

    expect(bottom(game).charge).toBeLessThan(1);
    expect(game.state.players.find((p) => p.side === 'top')!.charge).toBe(5);
  });

  test('死亡時凍結，復活後保持原值繼續恢復', () => {
    const game = newGame({ playerCount: 2 });
    bottom(game).charge = 2;
    bottom(game).dead = true;
    bottom(game).lives = 0;

    idle(game, 2);
    expect(bottom(game).charge).toBe(2);

    bottom(game).dead = false;
    bottom(game).lives = 1;
    idle(game, 1);

    expect(bottom(game).charge).toBeCloseTo(3);
  });

  test('過關時所有玩家的發射量補滿', () => {
    const game = newGame({ playerCount: 2, layout: (level) => (level === 1 ? [brickAt(376, 300)] : [cornerBrick()]) });
    game.step(DT, inputs(game, fire(400)));
    game.state.players[1]!.charge = 0.5;

    for (let t = 0; t < 5 && game.state.level === 1; t += DT) game.step(DT, inputs(game));

    expect(game.state.level).toBe(2);
    expect(game.state.players.map((p) => p.charge)).toEqual([5, 5]);
  });

  test('沒有發射量、場上也沒有彈珠，只要有人活著就不會失敗', () => {
    const game = newGame();
    bottom(game).charge = 0;

    idle(game, 0.5);

    expect(game.state.status).toBe('playing');
  });

  test('玩家離開不影響其他玩家的發射量', () => {
    const game = newGame({ playerCount: 2 });
    game.state.players[1]!.charge = 3;

    game.removePlayer('top');
    idle(game, 0.1);

    expect(bottom(game).charge).toBe(5);
  });
});
