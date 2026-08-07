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

> 순서가 중요합니다. 2번은 1번의 테이블을, 3번은 2번의 헬퍼 함수를 씁니다.

**방법 B — Supabase CLI**

```bash
npm i -g supabase
supabase login
supabase link --project-ref <프로젝트 ref>
supabase db push
```

## 3단계 — 학생 로그인 함수 배포

학생은 Supabase 계정을 만들지 않습니다. 대신 Edge Function이 명단을 대조하고
토큰을 발급합니다.

```bash
supabase functions deploy student-login --no-verify-jwt
```

`--no-verify-jwt` 가 필요한 이유: 이 함수는 **로그인하기 전에** 불리는 함수라
토큰 검사를 요구하면 아무도 호출할 수 없습니다.

환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` 은
Supabase가 자동으로 주입하므로 따로 설정할 필요가 없습니다.

## 4단계 — 교수 계정 만들기

대시보드 **Authentication → Users → Add user**

- Email: 본인 이메일
- Password: 원하는 비밀번호
- **Auto Confirm User 를 켜세요** (메일 인증 절차를 건너뜁니다)

학생용 회원가입은 열지 마세요. **Authentication → Providers → Email** 에서
**Enable Sign Ups 를 끄면** 교수 계정만 존재하게 됩니다.

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

- [ ] SQL 세 개가 오류 없이 실행됐다
- [ ] `student-login` 함수가 배포됐다
- [ ] 교수 계정으로 로그인해서 과목을 만들 수 있다
- [ ] 명단을 붙여넣으면 학생이 표에 뜬다
- [ ] 학생 화면에서 수업코드 + 학번으로 들어가진다
- [ ] 회원가입(Sign up)이 막혀 있다

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
