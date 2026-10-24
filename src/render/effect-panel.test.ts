import { describe, expect, test } from 'bun:test';
import { MARBLE_SIZE_DURATION, PIERCE_DURATION, SHORTEN_DURATION, WIDEN_DURATION } from '../core/config.ts';
import { createGame } from '../core/game.ts';
import type { GameState, PlayerState, Side } from '../core/types.ts';
import { deriveEffectPanel } from './effect-panel.ts';
import { POWERUP_STYLE } from './palette.ts';

function stateWith(playerCount: 1 | 2 | 3 | 4 = 2): GameState {
  return createGame({ playerCount, seed: 1, layout: () => [], monsters: () => [] }).state;
}

const player = (state: GameState, side: Side): PlayerState => state.players.find((p) => p.side === side)!;

describe('效果面板：全隊區', () => {
  test('沒有任何整場效果時全隊區不輸出', () => {
    expect(deriveEffectPanel(stateWith(), 'bottom').team).toEqual([]);
  });

  test('貫通：名稱、道具顏色、剩餘比例與一位小數的剩餘秒數', () => {
    const state = stateWith();
    state.effects.pierce = PIERCE_DURATION / 2;

    const { team } = deriveEffectPanel(state, 'bottom');

    expect(team).toEqual([{ label: '貫通', color: POWERUP_STYLE.pierce.color, ratio: 0.5, seconds: 1.5 }]);
  });

  test('放大彈珠與縮小彈珠各自對應正確的名稱與道具顏色', () => {
    const state = stateWith();
    state.effects.marbleSize = { kind: 'enlarge', left: MARBLE_SIZE_DURATION };
    expect(deriveEffectPanel(state, 'bottom').team).toEqual([
      { label: '放大彈珠', color: POWERUP_STYLE.enlarge.color, ratio: 1, seconds: MARBLE_SIZE_DURATION },
    ]);

    state.effects.marbleSize = { kind: 'shrink', left: 1.5 };
    expect(deriveEffectPanel(state, 'bottom').team).toEqual([
      { label: '縮小彈珠', color: POWERUP_STYLE.shrink.color, ratio: 0.25, seconds: 1.5 },
    ]);
  });

  test('貫通與彈珠大小同時生效時，依序是貫通、彈珠大小', () => {
    const state = stateWith();
    state.effects.marbleSize = { kind: 'shrink', left: 3 };
    state.effects.pierce = 2;

    expect(deriveEffectPanel(state, 'bottom').team.map((r) => r.label)).toEqual(['貫通', '縮小彈珠']);
  });

  test('剩餘秒數取一位小數', () => {
    const state = stateWith();
    state.effects.pierce = 2.349;
    expect(deriveEffectPanel(state, 'bottom').team[0]!.seconds).toBe(2.3);

    state.effects.pierce = 2.351;
    expect(deriveEffectPanel(state, 'bottom').team[0]!.seconds).toBe(2.4);
  });

  test('倒數條比例是剩餘比總時長', () => {
    const state = stateWith();
    state.effects.pierce = PIERCE_DURATION * 0.2;

    expect(deriveEffectPanel(state, 'bottom').team[0]!.ratio).toBeCloseTo(0.2, 10);
  });

  test('效果剛好用完（零或負）時不列出', () => {
    const state = stateWith();
    state.effects.pierce = 0;

    expect(deriveEffectPanel(state, 'bottom').team).toEqual([]);
  });
});

describe('效果面板：各玩家區', () => {
  test('沒有任何個人效果時各玩家區不輸出', () => {
    expect(deriveEffectPanel(stateWith(4), 'bottom').players).toEqual([]);
  });

  test('加寬與縮短的名稱、道具顏色、比例與秒數', () => {
    const state = stateWith(2);
    player(state, 'bottom').paddleEffect = { kind: 'widen', left: WIDEN_DURATION / 2 };
    player(state, 'top').paddleEffect = { kind: 'shorten', left: SHORTEN_DURATION / 4 };

    const { players } = deriveEffectPanel(state, 'bottom');

    expect(players).toEqual([
      { side: 'bottom', label: '加寬', color: POWERUP_STYLE.widen.color, ratio: 0.5, seconds: 5, self: true, dead: false },
      { side: 'top', label: '縮短', color: POWERUP_STYLE.shorten.color, ratio: 0.25, seconds: 1.5, self: false, dead: false },
    ]);
  });

  test('只列出有個人效果的玩家，依玩家座位順序', () => {
    const state = stateWith(4);
    player(state, 'right').paddleEffect = { kind: 'widen', left: 4 };
    player(state, 'top').paddleEffect = { kind: 'shorten', left: 2 };

    expect(deriveEffectPanel(state, 'bottom').players.map((r) => r.side)).toEqual(['top', 'right']);
  });

  test('本機玩家的那一列標記為自己，連線玩家端以自己的方位判斷', () => {
    const state = stateWith(3);
    for (const p of state.players) p.paddleEffect = { kind: 'widen', left: 4 };

    expect(deriveEffectPanel(state, 'bottom').players.map((r) => r.self)).toEqual([true, false, false]);
    expect(deriveEffectPanel(state, 'top').players.map((r) => r.self)).toEqual([false, true, false]);
    expect(deriveEffectPanel(state, 'left').players.map((r) => r.self)).toEqual([false, false, true]);
  });

  test('不知道本機方位時沒有任何一列是自己', () => {
    const state = stateWith(2);
    for (const p of state.players) p.paddleEffect = { kind: 'widen', left: 4 };

    expect(deriveEffectPanel(state, null).players.every((r) => !r.self)).toBe(true);
  });

  test('死亡玩家的個人效果仍列出，標記為死亡，剩餘時間維持不變', () => {
    const state = stateWith(2);
    const top = player(state, 'top');
    top.paddleEffect = { kind: 'widen', left: 4.2 };
    top.dead = true;
    top.lives = 0;

    const before = deriveEffectPanel(state, 'bottom').players;
    // 死亡期間個人效果不倒數：推進遊戲之後，同一列的剩餘時間不變。
    // 留一塊打不壞的磚塊，關卡才不會一開始就清空、讓死亡玩家被過關復活。
    const game = createGame({
      playerCount: 2,
      seed: 1,
      layout: () => [{ id: 0, x: 160, y: 160, w: 48, h: 24, hp: 100000, maxHp: 100000 }],
      monsters: () => [],
    });
    const t = game.state.players.find((p) => p.side === 'top')!;
    t.paddleEffect = { kind: 'widen', left: 4.2 };
    t.dead = true;
    t.lives = 0;
    for (let i = 0; i < 120; i++) game.step(1 / 60, game.state.players.map(() => ({ pointer: { x: 400, y: 0 }, primary: false, secondary: false })));
    const after = deriveEffectPanel(game.state, 'bottom').players;

    expect(before).toEqual([{ side: 'top', label: '加寬', color: POWERUP_STYLE.widen.color, ratio: 4.2 / WIDEN_DURATION, seconds: 4.2, self: false, dead: true }]);
    expect(after).toEqual(before);
  });

  test('自己死亡時，自己的列同時標記為自己與死亡', () => {
    const state = stateWith(2);
    const bottom = player(state, 'bottom');
    bottom.paddleEffect = { kind: 'shorten', left: 3 };
    bottom.dead = true;

    expect(deriveEffectPanel(state, 'bottom').players[0]).toMatchObject({ side: 'bottom', self: true, dead: true });
  });
});

describe('效果面板：整體', () => {
  test('全隊區與各玩家區各自獨立，沒有效果的區塊是空的', () => {
    const state = stateWith(2);
    state.effects.pierce = 1;
    expect(deriveEffectPanel(state, 'bottom')).toMatchObject({ players: [] });
    expect(deriveEffectPanel(state, 'bottom').team).toHaveLength(1);

    state.effects.pierce = 0;
    player(state, 'top').paddleEffect = { kind: 'widen', left: 2 };
    expect(deriveEffectPanel(state, 'bottom').team).toEqual([]);
    expect(deriveEffectPanel(state, 'bottom').players).toHaveLength(1);
  });

  test('只讀取狀態，不修改它', () => {
    const state = stateWith(2);
    state.effects.pierce = 1;
    player(state, 'top').paddleEffect = { kind: 'widen', left: 2 };
    const snapshot = JSON.stringify(state);

    deriveEffectPanel(state, 'bottom');

    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
