import { NavLink } from 'react-router-dom';

/**
 * 학생 화면 사이를 오가는 줄.
 *
 * 교수 쪽은 세로 메뉴지만 학생은 휴대폰으로 본다 — 가로로 밀리는 줄이 맞다.
 * 스타일은 이미 있는 `.tabs` 를 그대로 쓴다. 새 클래스를 만들면 두 곳이 어긋난다.
 */
const LINKS: Array<[string, string]> = [
  ['/home', '강의홈'],
  ['/lessons', '주차 학습'],
  ['/me', '내 평가'],
  ['/record', '내 기록'],
  ['/feedback', '받은 피드백'],
];

export default function StudentNav() {
  return (
    <nav className="tabs" aria-label="학생 메뉴">
      {LINKS.map(([to, label]) => (
        <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
          {({ isActive }) => (
            <span
              className="tabs-link"
              aria-selected={isActive}
              style={{
                display: 'inline-block', padding: '12px 16px', fontSize: '14.5px',
                fontWeight: 700, minHeight: 46, whiteSpace: 'nowrap',
                borderBottom: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                color: isActive ? 'var(--accent)' : 'var(--fg-disabled)',
              }}
            >
              {label}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
