/**
 * 版本號 = package.json 的主版本與次版本，加上 commit 總數當作修訂號。
 * 每次 commit 都會自動遞增，不必手動改；要升主版本或次版本時才改 package.json。
 */
export function resolveVersion(base: string, git: (args: string) => string): { version: string; commit: string } {
  try {
    const count = git('rev-list --count HEAD').trim();
    const commit = git('rev-parse --short HEAD').trim();
    if (!/^\d+$/.test(count)) throw new Error('commit 數不是數字');
    const [major, minor] = base.split('.');
    return { version: `${major}.${minor}.${count}`, commit };
  } catch {
    // 沒有 git 歷史時（例如下載原始碼壓縮檔來建置），只能用 package.json 的版本。
    return { version: base, commit: '' };
  }
}
