import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 를 **상대 경로**로 둔다. 주소가 두 개이기 때문이다.
//
//   https://lms.miraejob.co.kr/          ← 지금 쓰는 주소 (사용자 지정 도메인)
//   https://jungaistar.github.io/lms/    ← 도메인을 떼면 돌아가는 자리
//
// `/lms/` 로 박아 두면 도메인 주소에서 자산이 404 나고, `/` 로 박아 두면
// github.io 주소가 깨진다. 상대 경로면 둘 다 그대로 돈다 — HashRouter 라
// 문서는 언제나 그 자리의 index.html 하나뿐이라서 기준점이 흔들리지 않는다.
// 도메인을 갈아끼우는 동안 어느 쪽도 죽지 않는 게 이 선택의 이유다.
//
// 특정 경로에 고정해야 하면 VITE_BASE 로 덮어쓴다.
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
