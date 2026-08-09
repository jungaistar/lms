# 10. 설치 — Supabase 프로젝트 만들기

한 번만 하면 됩니다. 이후 학기에는 과목만 새로 만들면 됩니다.

---

## 1단계 — Supabase 프로젝트 생성

1. https://supabase.com 에 GitHub 계정으로 로그인
2. **New project** → 이름은 아무거나 (예: `peer-assessment`)
3. **Region 은 Northeast Asia (Seoul)** 을 고르세요. 학생 접속이 눈에 띄게 빨라집니다.
4. Database Password 는 잘 적어두세요. 나중에 CLI로 붙을 때 씁니다.

무료 플랜으로 충분합니다. 학생 수백 명, 평가 수만 건까지 여유가 있습니다.

## 2단계 — 스키마 올리기

**방법 A — 대시보드에서 복사·붙여넣기 (CLI 설치가 부담스러우면 이 쪽)**

좌측 **SQL Editor** 에서 아래 세 파일을 **순서대로** 붙여넣고 각각 실행합니다.

1. `supabase/migrations/0001_schema.sql` — 테이블
2. `supabase/migrations/0002_rls.sql` — 접근 권한
3. `supabase/migrations/0003_functions.sql` — 배정·집계 함수
4. `supabase/migrations/0004_student_auth.sql` — 학생 인증 연결
5. `supabase/migrations/0005_profiles.sql` — 회원가입·회원관리
6. `supabase/migrations/0006_course_ops.sql` — 주차·공지·자료·과제·출석·성적
7. `supabase/migrations/0007_deductions_heyyoung.sql` — 감점 항목·기타 성적·헤이영
8. `supabase/migrations/0008_fix_task_submission_insert.sql` — 제출물 정책 보강

이미 0001~0005 가 올라가 있다면 [11-migrate.md](11-migrate.md) 를 보라 —
0006 이후만 올리는 절차와 확인 질의가 정리되어 있다.

> 순서가 중요합니다. 2번은 1번의 테이블을, 3번은 2번의 헬퍼 함수를,
> 4번은 앞의 전부를 씁니다.

**방법 B — Supabase CLI**

```bash
npm i -g supabase
supabase login
supabase link --project-ref <프로젝트 ref>
supabase db push
```

## 3단계 — 학생 로그인 함수 배포

학생은 회원가입을 하지 않습니다. 대신 Edge Function이 명단을 대조한 뒤,
그 학생에 대응하는 계정으로 **정상 로그인 세션**을 만들어 줍니다.

```bash
supabase functions deploy student-login --no-verify-jwt
```

`--no-verify-jwt` 가 필요한 이유: 이 함수는 **로그인하기 전에** 불리는 함수라
토큰 검사를 요구하면 아무도 호출할 수 없습니다.

환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` 는
Supabase가 자동으로 주입하므로 따로 설정할 필요가 없습니다.

> **왜 토큰을 직접 서명하지 않는가.** 처음에는 프로젝트 JWT 시크릿으로 HS256
> 토큰을 직접 만들려 했습니다. 그런데 요즘 만들어지는 Supabase 프로젝트는
> 서명 키가 **ES256(비대칭)** 이 기본이고 HS256 공유 시크릿은 legacy 로만 남습니다.
> 직접 서명하면 그 legacy 키를 폐기하는 순간 학생 로그인이 전부 죽습니다.
> Supabase가 자기 키로 서명하게 두면 키 종류가 뭐든, 나중에 회전하든 상관없습니다.
>
> 학생 식별자(`student_id`, `course_id`)는 JWT의 `app_metadata` 에 실립니다.
> `app_metadata` 는 서버만 쓸 수 있어 학생이 자기 토큰을 고쳐 남의 `student_id` 를
> 주장할 수 없습니다.

## 4단계 — 관리자 계정 만들기

대시보드에서 만들 필요가 없습니다. **앱의 회원가입 화면**에서 직접 가입합니다.

1. 배포된 사이트 → **교수 → 회원가입**
2. 관리자로 지정된 이메일(`radical8566@gmail.com`)로 가입하면
   **자동으로 관리자 + 승인 상태**가 됩니다
3. 다른 이메일로 가입한 사람은 **승인 대기** 상태로 들어오고,
   관리자가 승인해야 과목을 만들 수 있습니다

관리자 이메일은 `supabase/migrations/0005_profiles.sql` 의 `admin_email()` 함수에
하드코딩되어 있습니다. 바꾸려면 그 함수만 고쳐 다시 실행하세요.

```sql
create or replace function admin_email() returns text
language sql immutable as $$ select '새주소@example.com' $$;
```

> **왜 프론트가 아니라 DB에 박아두는가.** 프론트에서 이메일을 비교하면
> 브라우저에서 코드를 고쳐 관리자 행세를 할 수 있습니다. DB에 두면
> RLS가 JWT의 email 클레임을 직접 보고 판단하므로 위조할 수 없습니다.

### Auth 설정

**Authentication → Sign In / Providers → Email** 에서 다음이 맞는지 확인하세요.

| 항목 | 값 | 이유 |
|---|---|---|
| Enable Sign Ups | **켬** | 교수가 스스로 가입해야 하므로 |
| Confirm email | **끔** (autoconfirm) | 메일 발송에 의존하지 않기 위해. 대신 관리자 승인이 문지기 역할을 합니다 |
| Minimum password length | 8 | |

가입을 열어두어도 안전한 이유: **승인 전에는 과목을 만들 수 없습니다.**
이건 화면에서 버튼을 감추는 게 아니라, `courses` INSERT 정책이
`is_approved()` 를 요구하기 때문입니다.

## 5단계 — 프론트에 연결

**Settings → API** 에서 두 값을 복사합니다.

```bash
cd web
cp .env.example .env
```

`.env` 를 채웁니다.

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> `anon` key 는 공개되어도 되는 값입니다. 실제 접근 통제는 RLS가 합니다.
> **`service_role` key 는 절대 여기에 넣지 마세요.** 그 키는 RLS를 전부 무시합니다.

```bash
npm install
npm run dev        # http://localhost:5173
```

## 6단계 — GitHub Pages 배포

저장소 **Settings → Secrets and variables → Actions → New repository secret** 에
두 개를 등록합니다.

| 이름 | 값 |
|---|---|
| `VITE_SUPABASE_URL` | 5단계와 같은 값 |
| `VITE_SUPABASE_ANON_KEY` | 5단계와 같은 값 |

**Settings → Pages → Source 를 `GitHub Actions`** 로 바꿉니다.

`web/` 아래를 고쳐서 `main` 에 push하면 자동으로 배포됩니다.

---

## 확인 체크리스트

- [ ] SQL 다섯 개가 오류 없이 실행됐다
- [ ] `student-login` 함수가 배포됐다
- [ ] 관리자 이메일로 가입하니 바로 과목을 만들 수 있다
- [ ] 다른 이메일로 가입하면 "승인 대기"가 뜨고 과목 생성 버튼이 잠긴다
- [ ] 관리자 화면의 회원관리에서 그 사람을 승인하면 바로 풀린다
- [ ] 명단을 붙여넣으면 학생이 표에 뜬다
- [ ] 학생 화면에서 수업코드 + 학번으로 들어가진다

## 잘 안 될 때

| 증상 | 원인 |
|---|---|
| 화면에 "Supabase 설정이 없습니다" | `.env` 가 없거나 빌드 후에 만들었다. `.env` 를 채우고 다시 빌드 |
| 학생 로그인 시 "수업코드 또는 학번이 명단과 맞지 않습니다" | 명단에 없거나, 학번 앞뒤 공백, 또는 제외 처리된 학생 |
| 학생 로그인이 500 | `student-login` 미배포, 또는 `--no-verify-jwt` 없이 배포됨 |
| 교수 화면에서 목록이 비어 보임 | RLS는 정상. 다른 계정으로 만든 과목은 보이지 않는다 |
| 학생이 평가 화면에서 저장 실패 | 활동이 `open` 이 아니거나 마감 시각이 지났다 |

---

➡️ 다음: [20. 평가 설계](20-assessment-design.md) · [30. 학기 중 운영](30-operations.md)
