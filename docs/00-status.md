# 지금 어디까지 왔나 — 2026-08-23 점검

이 문서는 **측정한 값**만 적는다. 다른 문서의 "적용 완료" 를 옮겨 적지 않았다.
(그렇게 해서 한 번 틀린 적이 있다 — `CLAUDE.md` 의 "문서보다 DB 를 믿을 것".)

각 줄 끝에 어떻게 확인했는지를 남겼으므로 **같은 명령을 다시 돌리면 이 표를
갱신할 수 있다.** 날짜가 지난 이 문서를 믿지 말고 다시 재라.

| 영역 | 지금 | 확인한 방법 |
|---|---|---|
| 코드 (`main`) | `1fd8da5` · PR #1~#4 전부 병합 | `git log` |
| 검사 | `npm test` 실패 0 (39 · 31 · 27 · 34 · 20 + 명단 6파일 199명) | `cd web && npm test` |
| 배포 | GitHub Actions 최근 5회 전부 success | `gh run list` |
| 주소 (HTTP) | `http://lms.miraejob.co.kr` **뜬다** (200) | `curl -o /dev/null -w '%{http_code}'` |
| 주소 (HTTPS) | **안 뜬다** — 아래 3절 | `openssl s_client` |
| DB 마이그레이션 | `0001`~`0010` 적용 · `0011`~`0013` **미적용** | 아래 2절 |
| 병합 안 된 가지 | **4개** — 아래 1절 | `git branch -r` |

---

## 1. 병합 안 된 가지 4개

지금 저장소에서 가장 큰 덩어리다. **일이 `main` 이 아니라 가지에 쌓여 있다.**
넷 다 PR 이 없어서 `git branch -r` 로 보지 않으면 안 보인다.

| 가지 | 마지막 커밋 | 무엇 | 크기 |
|---|---|---|---|
| `claude/lms-attendance-system-idr4tk` | 2026-08-23 | 연락처(전화번호) · 일자별 기록 · 문자·알림. `0012`+`0013`, 화면 3개, 검사 101항목 | +3811줄 / 20파일 |
| `claude/github-connection-yk085m` | 2026-08-23 | 위 작업의 **먼저 판** (데이터 계층만, "작업 중"). `0012_contacts_session_marks.sql` · `lib/phone.ts` | +634줄 / 4파일 |
| `claude/learning-materials-ai-guidelines-nxij4u` | 2026-08-22 | 1주차 강의자료 — `materials/` 아래 슬라이드 · SVG · PPTX 빌더 | +28220줄 / 63파일 |
| `claude/learning-materials-ai-guidelines-a57o7t` | 2026-08-22 | 위와 **같은 일의 다른 판** — `docs/lecture/week01/` 아래 | +7916줄 / 53파일 |

두 쌍이 각각 같은 일의 두 판이다. 병합하기 전에 **어느 쪽을 남길지 정해야 한다.**
`…-idr4tk` 는 `…-yk085m` 을 포함해 다시 쓴 것으로 보인다 (표 이름이
`0012_contacts_session_marks` → `0012_contacts_daily_marks` 로 바뀌었다).

강의자료 두 판은 **놓는 자리가 다르다** (`materials/` vs `docs/lecture/`).
`docs/` 는 Pages 가 보는 자리가 아니지만 이 저장소의 문서 자리이므로,
성적을 다루는 운영 코드와 강의 자료를 섞을지부터 정하는 게 먼저다 —
`농협/` 을 `jungaistar/nonghyup` 으로 내보낸 것과 같은 판단이다 (2026-08-20).

`…-idr4tk` 는 `main` 의 `CLAUDE.md` · `docs/90-worklog.md` 를 함께 고친다.
**그 두 파일을 `main` 에서 먼저 건드리면 충돌한다.** 이 문서를 새 파일로 만든
이유가 그것이다.

## 2. DB — 무엇이 실제로 올라가 있나

Supabase 프로젝트 `aujvpcpjpgxghxmsheur` 에 REST 로 직접 물어봤다.

| 마이그레이션 | 상태 | 근거 |
|---|---|---|
| `0001`~`0009` | **적용됨** | `surveys` · `task_sync_log` 가 200 |
| `0010_student_access` | **적용됨** | `courses?select=entry_mode` 가 200 |
| `0011_student_grade_dept` | **미적용** | `students?select=grade` → `42703 column students.grade does not exist` |
| `0012` · `0013` | **미적용** (가지에만 있다) | `student_contacts` · `session_marks` · `message_log` 전부 404 |

확인 명령 (anon key 로 충분하다 — 있는지 없는지만 본다):

```bash
cd web && U=$(grep VITE_SUPABASE_URL .env | cut -d= -f2-) \
        && K=$(grep VITE_SUPABASE_ANON_KEY .env | cut -d= -f2-)
curl -s "$U/rest/v1/students?select=grade&limit=1" -H "apikey: $K"
for t in student_contacts session_marks message_log; do
  echo -n "$t "; curl -s -o /dev/null -w '%{http_code}\n' "$U/rest/v1/$t?select=id&limit=1" -H "apikey: $K"
done
```

`404` 는 표가 없는 것이고 `200`(또는 빈 배열 `[]`)이면 표는 있고 anon 이 못 읽는
것뿐이다. **둘을 헷갈리지 말 것** — RLS 로 막힌 것과 표가 없는 것은 다르다.

`supabase/run-0011.sql` 은 `0011` 하나만 SQL Editor 에서 돌리고 같은 화면에서
확인까지 하도록 만들어 둔 파일이다. 지금까지 커밋 안 된 채 로컬에만 있었다.

## 3. 주소 — HTTP 는 뜨고 HTTPS 는 안 뜬다

DNS 와 Pages 설정은 **끝나 있다.**

- `lms.miraejob.co.kr` → `185.199.108~111.153` (GitHub Pages apex 4개) + IPv6
- Pages API: `status: built` · `cname: lms.miraejob.co.kr` · `build_type: workflow`
- `http://lms.miraejob.co.kr/` → **200**

막힌 것은 인증서 하나다.

```
$ openssl s_client -servername lms.miraejob.co.kr -connect lms.miraejob.co.kr:443
subject=CN=*.github.io          ← 우리 도메인 이름이 들어 있지 않다
```

GitHub 이 `lms.miraejob.co.kr` 용 Let's Encrypt 인증서를 **아직 발급하지 않았다.**
그래서 이름이 안 맞아 `curl` 이 exit 60 으로 끊는다. Pages API 도
`https_enforced: false` 다.

**할 일** — 저장소 `Settings → Pages` 에서 Custom domain 을 **지웠다가 다시
저장**한다. 그러면 GitHub 이 도메인을 다시 확인하고 인증서를 새로 신청한다.
초록불(“DNS check successful”) 뒤 보통 몇 분~한 시간이면 발급된다.
발급된 뒤에 **`Enforce HTTPS` 를 켠다.** 켜는 것은 그 다음이다 —
인증서 없이 켜면 사이트가 통째로 안 열린다.

발급됐는지는 위 `openssl` 한 줄로 본다. `subject=CN=lms.miraejob.co.kr` 이면 끝난 것이다.

## 4. 사람 손이 남은 것

코드로 해결되지 않는 것만 순서대로.

1. **`0011` 올리기** → 6과목 명단을 한 번 더 붙여넣어야 학년 · 학과가 채워진다.
   지금 명단에는 학번 · 이름만 들어가 있다 (`supabase/run-0011.sql`).
2. **가지 정리** → 어느 판을 남길지 정하고 병합. 그 뒤 `0012` · `0013` 올리기
   (`docs/70-attendance-contacts.md` 6절이 그 가지 안에 있다).
3. **과목마다 `입장 승인 → 명단 전원 승인`** — 아직 안 눌렀다.
   누르기 전에는 학생이 로그인해도 승인 대기 줄에만 선다. 의도한 동작이다.
4. **HTTPS** — 3절.
5. **학교 LMS 성적 입력** — 화면 셀렉터 미확인으로 잠겨 있다
   (`SELECTORS_VERIFIED = false`). 그때까지는 CSV 를 내려받아 손으로 넣는다.

학기 운영 순서는 [`30-operations.md`](30-operations.md), 날짜순 이력은
[`90-worklog.md`](90-worklog.md) 에 있다.
