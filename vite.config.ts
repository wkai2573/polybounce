import { defineConfig } from 'vite'

export default defineConfig({
  // 使用相對路徑，讓 GitHub Pages 的子路徑部署也能正確載入資源
  base: './',
})
