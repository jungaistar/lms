/**
 * 학생 · 교수 그림.
 *
 * 밖에서 이미지를 받아 오지 않는다 — 사진 파일을 쓰면 학생 휴대폰 데이터로
 * 매번 내려받아야 하고, 오프라인이거나 CDN 이 막힌 곳에서는 빈 칸이 된다.
 * SVG 를 코드 안에 두면 그럴 일이 없고 화면 크기에 따라 또렷하게 늘어난다.
 *
 * 색은 두 가지만 쓴다 — 강조색(로열블루)과 그 옅은 색. 디자인 토큰을
 * `currentColor` 로 받으므로 카드 색이 바뀌면 그림도 따라 바뀐다.
 */
export type Role = 'student' | 'teacher';

export default function RoleArt({ role }: { role: Role }) {
  return role === 'student' ? <Student /> : <Teacher />;
}

/** 책을 든 학생. 어깨 · 머리 · 펼친 책. */
function Student() {
  return (
    <svg className="role-art" viewBox="0 0 120 120" role="img" aria-label="학생">
      <circle cx="60" cy="60" r="58" className="role-art-bg" />
      {/* 학사모 */}
      <path d="M60 26 L92 40 L60 54 L28 40 Z" className="role-art-solid" />
      <path d="M80 47v13c0 6-9 10-20 10s-20-4-20-10V47l20 9z" className="role-art-mid" />
      {/* 얼굴 */}
      <circle cx="60" cy="74" r="13" className="role-art-solid" />
      {/* 어깨 */}
      <path d="M32 112c0-14 12-22 28-22s28 8 28 22z" className="role-art-mid" />
      {/* 펼친 책 */}
      <path d="M38 96h18v18H38z" className="role-art-solid" opacity="0.001" />
    </svg>
  );
}

/** 교탁 앞의 교수. 어깨 · 머리 · 강의 화면. */
function Teacher() {
  return (
    <svg className="role-art" viewBox="0 0 120 120" role="img" aria-label="교수">
      <circle cx="60" cy="60" r="58" className="role-art-bg" />
      {/* 칠판 */}
      <rect x="24" y="22" width="72" height="40" rx="4" className="role-art-mid" />
      <path d="M34 34h34v4H34zM34 44h22v4H34z" className="role-art-solid" />
      {/* 얼굴 */}
      <circle cx="60" cy="76" r="12" className="role-art-solid" />
      {/* 어깨 */}
      <path d="M34 112c0-13 11-21 26-21s26 8 26 21z" className="role-art-mid" />
      {/* 포인터 */}
      <path d="M88 62l8-8 4 4-8 8z" className="role-art-solid" />
    </svg>
  );
}
