import { Link } from 'react-router-dom';
import AdminIcon from './AdminIcon';
import type { MenuGroup, MenuKey } from './adminMenu';

/**
 * 관리자 콘솔 뼈대 — 왼쪽 메뉴 + 오른쪽 본문.
 *
 * 넓은 화면에서는 세로 메뉴, 좁은 화면에서는 가로로 밀리는 줄이 된다.
 * 같은 마크업을 CSS 로만 바꾼다 — 두 벌을 만들면 한쪽이 반드시 뒤처진다.
 */
export default function AdminShell({
  groups,
  current,
  onSelect,
  children,
}: {
  groups: MenuGroup[];
  current: MenuKey;
  onSelect: (key: MenuKey) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="관리자 메뉴">
        <div className="admin-nav-head">관리자 메뉴</div>

        {groups.map((g) => (
          <div className="admin-group" key={g.title}>
            <div className="admin-group-title">{g.title}</div>
            {g.items.map((it) => (
              <button
                key={it.key}
                type="button"
                className="admin-link"
                aria-current={current === it.key ? 'page' : undefined}
                onClick={() => onSelect(it.key)}
              >
                <AdminIcon name={it.icon} />
                <span className="admin-link-text">
                  {it.label}
                  {it.hint && <i>{it.hint}</i>}
                </span>
              </button>
            ))}
          </div>
        ))}

        <div className="admin-group admin-group-end">
          <Link className="admin-link" to="/teacher">
            <AdminIcon name="people" />
            <span className="admin-link-text">내 과목 목록</span>
          </Link>
          <Link className="admin-link" to="/">
            <AdminIcon name="folder" />
            <span className="admin-link-text">사이트로 돌아가기</span>
          </Link>
        </div>
      </nav>

      <div className="admin-main">{children}</div>
    </div>
  );
}
