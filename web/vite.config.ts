import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 는 https://<user>.github.io/lms/ 아래에 서빙되므로 base 를 맞춘다.
// 다른 곳(Vercel 등)에 올릴 때는 VITE_BASE=/ 로 덮어쓴다.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/lms/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
