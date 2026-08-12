import { Link } from 'react-router-dom';
import AdminIcon from './AdminIcon';
import type { MenuGroup, MenuKey } from './adminMenu';

/**
 * 관리자 콘솔 뼈대 — 왼쪽 메뉴 + 오른쪽 본문.
 *
 * 넓은 화면(901px~)은 세로 메뉴, 좁은 화면은 **네이티브 select** 다.
 * 처음에는 좁은 화면에서도 같은 마크업을 가로로 눕혀 썼는데, 390px 에서
 * 열어 보니 18개 중 3개만 보이고 그룹 이름도 사라졌다. 수업 중에 태블릿·폰으로
 * 화면을 옮겨 다녀야 하는데 그럴 수가 없었다.
 *
 * select 는 iOS·안드로이드가 각자 자기 피커를 띄워 준다 — 한 번 눌러 18개를
 * 다 본다. optgroup 으로 그룹 이름도 남는다.
 *
 * 메뉴 정의(`groups`)는 하나다. 두 모양이 같은 배열을 읽으므로 어긋나지 않는다.
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
      {/* 좁은 화면 전용. CSS 로 900px 이하에서만 보인다. */}
      <div className="admin-picker">
        <label htmlFor="admin-menu-select">관리자 메뉴</label>
        <select
          id="admin-menu-select"
          value={current}
          onChange={(e) => onSelect(e.target.value as MenuKey)}
        >
          {groups.map((g) => (
            <optgroup key={g.title} label={g.title}>
              {g.items.map((it) => (
                <option key={it.key} value={it.key}>{it.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="admin-picker-links">
          <Link to="/teacher">내 과목 목록</Link>
          <Link to="/">사이트로 돌아가기</Link>
        </div>
      </div>

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
