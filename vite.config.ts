import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };
import { resolveVersion } from './scripts/version.ts';

const { version, commit } = resolveVersion(pkg.version, (args) => execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString());

export default defineConfig({
  // 使用相對路徑，讓 GitHub Pages 的子路徑部署也能正確載入資源
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
});
