import { describe, expect, test } from 'bun:test';
import { createGame } from '../core/game.ts';
import type { Brick, Game, GameOptions, Monster, PlayerInput } from '../core/types.ts';
import { deriveEvents, summarize } from './events.ts';

const at = (x: number): PlayerInput => ({ pointer: { x, y: 0 }, primary: false, secondary: false });
const rightClick = (x: number): PlayerInput => ({ ...at(x), secondary: true });
const brickAt = (x: number, y: number, hp = 1): Brick => ({ id: 0, x, y, w: 48, h: 24, hp, maxHp: hp });
const corner = (): Brick => ({ ...brickAt(160, 160, 100000), id: 99 });
const DT = 1 / 60;

/** 推進一步，回傳這一步產生的音效事件。 */
function stepEvents(game: Game, inputs: PlayerInput[]) {
  const before = summarize(game.state);
  game.step(DT, inputs);
  return deriveEvents(before, summarize(game.state));
}

/** 一路推進，收集途中所有事件的種類。 */
function collect(game: Game, seconds: number, input: PlayerInput) {
  const kinds = new Set<string>();
  const inputs = game.state.players.map(() => input);
  for (let t = 0; t < seconds; t += DT) {
    for (const e of stepEvents(game, inputs)) kinds.add(e.kind);
  }
  return kinds;
}

const newGame = (opts: Partial<GameOptions> = {}) =>
  createGame({ playerCount: 1, seed: 1, layout: () => [corner()], dropChance: 0, ...opts });

describe('音效事件', () => {
  test('沒有任何變化就沒有事件', () => {
    const game = newGame();

    expect(stepEvents(game, [at(400)])).toEqual([]);
  });

  test('第一次看到狀態（沒有前一個狀態）沒有事件', () => {
    const game = newGame();

    expect(deriveEvents(null, summarize(game.state))).toEqual([]);
  });

  test('發射：彈珠池減少', () => {
    const game = newGame();

    expect(stepEvents(game, [rightClick(400)])).toEqual([{ kind: 'launch', count: 1 }]);
  });

  test('撞磚：磚塊血量減少，並回報這一段撞了幾次', () => {
    const game = newGame({ layout: () => [brickAt(376, 300, 3), corner()] });
    stepEvents(game, [rightClick(400)]);

    const hits: number[] = [];
    for (let t = 0; t < 3 && hits.length === 0; t += DT) {
      for (const e of stepEvents(game, [at(400)])) if (e.kind === 'hit') hits.push(e.count);
    }

    expect(hits).toEqual([1]);
  });

  test('撞怪物也算撞擊', () => {
    const monster: Monster = { id: 0, pos: { x: 400, y: 560 }, radius: 36, hp: 3, maxHp: 3, boss: false };
    const game = newGame({ monsters: (level) => (level === 1 ? [{ ...monster }] : []) });
    stepEvents(game, [rightClick(400)]);

    expect(collect(game, 2, at(400)).has('hit')).toBe(true);
  });

  test('擊碎最後一塊磚：先有撞擊，過關時有過關事件，彈珠池補滿不算拾取', () => {
    const game = newGame({ layout: (level) => (level === 1 ? [brickAt(376, 300)] : [corner()]) });
    stepEvents(game, [rightClick(400)]);

    const kinds = collect(game, 3, at(400));

    expect(kinds.has('hit')).toBe(true);
    expect(kinds.has('clear')).toBe(true);
    expect(kinds.has('pickup')).toBe(false);
  });

  test('失敗：狀態變成失敗時只有一次失敗事件', () => {
    const game = newGame();
    for (let i = 0; i < 10; i++) stepEvents(game, [rightClick(400)]);

    const defeats: string[] = [];
    for (let t = 0; t < 30; t += DT) {
      for (const e of stepEvents(game, [at(700)])) if (e.kind === 'defeat') defeats.push(e.kind);
    }

    expect(game.state.status).toBe('defeated');
    expect(defeats).toHaveLength(1);
  });

  test('接到補給、加寬、多球都算拾取', () => {
    for (const kind of ['supply', 'widen', 'multiball'] as const) {
      const game = newGame();
      stepEvents(game, [rightClick(400)]);
      game.state.pool = 4;
      game.state.powerUps.push({ id: 1, batch: 1, kind, side: 'bottom', pos: { x: 400, y: 790 } });

      const events = stepEvents(game, [at(400)]);

      expect(events.map((e) => e.kind)).toContain('pickup');
    }
  });

  test('接到貫通或環爆也算拾取，沿用同一個拾取音效', () => {
    for (const kind of ['pierce', 'burst'] as const) {
      const game = newGame();
      stepEvents(game, [rightClick(400)]);
      game.state.powerUps.push({ id: 1, batch: 1, kind, side: 'bottom', pos: { x: 400, y: 790 } });

      const events = stepEvents(game, [at(400)]);

      expect(events.map((e) => e.kind)).toContain('pickup');
    }
  });

  test('貫通倒數變短不算拾取', () => {
    const game = newGame();
    stepEvents(game, [rightClick(400)]);
    game.state.marbles[0]!.pierce = 5;

    expect(collect(game, 0.5, at(400)).has('pickup')).toBe(false);
  });

  test('道具飄出場地沒被接到，不會有拾取聲', () => {
    const game = newGame();
    game.state.powerUps.push({ id: 1, batch: 1, kind: 'supply', side: 'bottom', pos: { x: 100, y: 820 } });

    expect(stepEvents(game, [at(600)]).map((e) => e.kind)).not.toContain('pickup');
  });

  test('子彈打到擋板：凍結', () => {
    const monster: Monster = { id: 0, pos: { x: 400, y: 500 }, radius: 36, hp: 3, maxHp: 3, boss: false };
    const game = newGame({ monsters: () => [{ ...monster }] });

    expect(collect(game, 8, at(400)).has('freeze')).toBe(true);
  });

  test('凍結中再被 BOSS 的子彈打到，凍結時間沒變，不會再有凍結音效', () => {
    const game = newGame();
    game.state.bullets.push({ id: 1, pos: { x: 400, y: 776 }, vel: { x: 0, y: 60 }, source: 'boss' });
    expect(collect(game, 0.3, at(400)).has('freeze')).toBe(true);
    expect(game.state.players[0]!.frozen).toBeGreaterThan(0);

    game.state.bullets.push({ id: 2, pos: { x: 400, y: 780 }, vel: { x: 0, y: 60 }, source: 'boss' });

    expect(collect(game, 0.15, at(400)).has('freeze')).toBe(false);
    expect(game.state.bullets).toHaveLength(0);
  });

  test('失敗後再來一局，彈珠池補滿不會被當成補給', () => {
    const game = newGame();
    for (let i = 0; i < 10; i++) stepEvents(game, [rightClick(400)]);
    for (let t = 0; t < 30 && game.state.status !== 'defeated'; t += DT) game.step(DT, [at(700)]);
    expect(game.state.status).toBe('defeated');

    const restarted = newGame();

    expect(deriveEvents(summarize(game.state), summarize(restarted.state))).toEqual([]);
  });

  test('多球讓大量彈珠同時撞擊，事件仍然只是一筆撞擊', () => {
    const game = newGame({ layout: () => [brickAt(376, 300, 50), corner()] });
    stepEvents(game, [rightClick(400)]);
    const before = summarize(game.state);
    game.state.bricks[0]!.hp -= 10;

    const events = deriveEvents(before, summarize(game.state));

    expect(events.filter((e) => e.kind === 'hit')).toHaveLength(1);
    expect(events.find((e) => e.kind === 'hit')).toEqual({ kind: 'hit', count: 10 });
  });
});
