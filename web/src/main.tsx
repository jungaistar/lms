import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

// HashRouter 를 쓰는 이유: GitHub Pages 는 SPA 라우팅용 서버 설정을 할 수 없어서
// /lms/teacher 같은 경로를 새로고침하면 404 가 난다. 해시 라우팅은 그 문제가 없다.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
