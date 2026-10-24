import { describe, expect, test } from 'bun:test';
import { resolveVersion } from './version.ts';

const git = (answers: Record<string, string>) => (args: string) => {
  const answer = answers[args];
  if (answer === undefined) throw new Error('git 失敗');
  return `${answer}\n`;
};

describe('resolveVersion', () => {
  test('版本號是 package.json 的主次版本加上 commit 數，所以每次 commit 都自動遞增', () => {
    const run = git({ 'rev-list --count HEAD': '16', 'rev-parse --short HEAD': 'abc1234' });

    expect(resolveVersion('0.2.0', run)).toEqual({ version: '0.2.16', commit: 'abc1234' });
  });

  test('多一個 commit，版本號就加一', () => {
    const before = resolveVersion('0.2.0', git({ 'rev-list --count HEAD': '16', 'rev-parse --short HEAD': 'a' }));
    const after = resolveVersion('0.2.0', git({ 'rev-list --count HEAD': '17', 'rev-parse --short HEAD': 'b' }));

    expect(after.version).not.toBe(before.version);
    expect(after.version).toBe('0.2.17');
  });

  test('升主版本或次版本時，改 package.json 即可，後面的數字仍跟著 commit 數', () => {
    const run = git({ 'rev-list --count HEAD': '40', 'rev-parse --short HEAD': 'abc1234' });

    expect(resolveVersion('1.0.0', run).version).toBe('1.0.40');
  });

  test('取不到 git 資訊時（例如沒有 .git），退回 package.json 的版本', () => {
    expect(resolveVersion('0.2.0', git({}))).toEqual({ version: '0.2.0', commit: '' });
  });
});
