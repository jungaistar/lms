# 60. 사용자 지정 도메인 — `<저장소>.miraejob.co.kr`

이 저장소의 웹 화면은 GitHub Pages 에 올라간다. 주소를
`jungaistar.github.io/lms/` 대신 **`lms.miraejob.co.kr`** 로 쓴다.
앞으로 만드는 저장소도 같은 규칙이다 — **저장소 이름이 그대로 서브도메인**이 된다.

| 저장소 | 주소 |
|---|---|
| `jungaistar/lms` | `https://lms.miraejob.co.kr` |
| `jungaistar/<새 저장소>` | `https://<새 저장소>.miraejob.co.kr` |

---

## 지금 DNS 가 어떻게 되어 있나 (2026-08-20 확인)

`miraejob.co.kr` 의 네임서버는 **Cloudflare** 다
(`arya.ns.cloudflare.com`, `sergi.ns.cloudflare.com`). 실제로 조회한 결과는 이렇다.

| 이름 | 종류 | 값 | 상태 |
|---|---|---|---|
| `miraejob.co.kr` | A ×4 | `185.199.108~111.153` | GitHub Pages **apex 4개** 정상 |
| `www.miraejob.co.kr` | CNAME | `jungaistar.github.io` | 정상 (프록시 꺼짐 — 응답이 GitHub IP 그대로) |
| `lms.miraejob.co.kr` | — | **없음 (NXDOMAIN)** | ← 이것만 추가하면 된다 |
| 와일드카드 `*` | — | 없음 | 저장소마다 한 줄씩 넣는 방식 |

`_` 로 시작하는 인증용 레코드는 필요 없다. GitHub 이 Let's Encrypt 인증서를
알아서 받는다.

---

## 저장소 하나를 도메인에 붙이는 절차

### 1) Cloudflare 에 CNAME 한 줄

`dash.cloudflare.com` → `miraejob.co.kr` → **DNS → Records → Add record**

| 칸 | 값 |
|---|---|
| Type | `CNAME` |
| Name | `lms` ← **저장소 이름** |
| Target | `jungaistar.github.io` ← 저장소 이름은 **안 붙인다** |
| Proxy status | **DNS only (회색 구름)** |
| TTL | Auto |

> **주황 구름(프록시)을 켜지 말 것.** 켜면 GitHub 이 도메인 소유를 확인하지
> 못해 인증서를 못 받고, Pages 설정에 `Certificate not yet created` 가 계속 뜬다.
> 나중에 캐시가 필요하면 인증서가 발급되고 `Enforce HTTPS` 가 켜진 **뒤에**
> 켜고, Cloudflare SSL 모드를 `Full (strict)` 로 둔다.

Target 이 `jungaistar.github.io` 인 이유 — GitHub Pages 는 사용자 사이트 한
곳으로 모든 요청을 받고, **어느 저장소로 보낼지는 저장소 쪽 CNAME 설정**이
정한다. `jungaistar.github.io/lms` 같은 값은 CNAME 레코드에 넣을 수 없다.

### 2) 저장소에 `web/public/CNAME`

한 줄짜리 파일이다. Vite 가 `public/` 을 그대로 `dist/` 로 복사하므로
빌드 결과물의 뿌리에 `CNAME` 이 놓인다.

```
lms.miraejob.co.kr
```

새 저장소라면 이 파일에 그 저장소의 주소를 적는다.

### 3) GitHub Settings → Pages 에서 도메인 지정 (**사람이 한 번 눌러야 한다**)

이 저장소는 **GitHub Actions 로 배포**한다(`.github/workflows/deploy.yml`).
브랜치 배포와 달리 **`CNAME` 파일만으로는 설정이 켜지지 않는다.**

`Settings → Pages → Custom domain` 에 `lms.miraejob.co.kr` 을 넣고 **Save**.
DNS check 가 초록불이 되면(보통 1~2분, 길면 수십 분) **Enforce HTTPS** 를 켠다.

설정이 끝나면 `jungaistar.github.io/lms/` 는 새 주소로 넘어간다.

### 저장소 뿌리의 `CNAME` 은 배포물에 안 들어간다

Settings 에서 도메인을 저장하면 GitHub 이 기본 브랜치 **뿌리**에 `CNAME` 파일을
만들어 커밋한다(`Create CNAME`). 브랜치 배포를 쓰는 저장소를 위한 것이라,
`web/dist` 만 올리는 이 저장소에서는 **그 파일이 배포물에 들어가지 않는다.**
설정 자체는 저장소 설정에 남아 있으니 그 파일은 흔적일 뿐이다 — 지워도 되고
남겨 둬도 해가 없다. 실제로 배포되는 것은 `web/public/CNAME` 이다.

### 4) 순서

DNS 레코드(1) → Pages 설정(3) 순서로 한다. 레코드 없이 도메인을 먼저 넣으면
GitHub 이 `DNS check failed` 로 거절한다.

`web/public/CNAME`(2)과 배포 순서는 자유롭다 — **자산 경로가 상대 경로**라
`/lms/` 에서도 도메인 뿌리에서도 같은 빌드가 그대로 돈다(`web/vite.config.ts`).
도메인을 갈아끼우는 동안 화면이 죽지 않게 하려고 그렇게 두었다.

---

## 확인

```bash
# 레코드가 올라왔나
python3 - <<'PY'
import socket; print(socket.gethostbyname('lms.miraejob.co.kr'))
PY
# 185.199.108~111.153 중 하나가 나오면 된다

# 화면이 뜨나 (인증서 발급 전에는 https 가 실패한다 — 정상)
curl -sSI https://lms.miraejob.co.kr/ | head -3
```

브라우저에서 `https://lms.miraejob.co.kr/#/teacher` 까지 열어 본다.
해시 라우팅이라 새로고침해도 404 가 나지 않아야 한다.

---

## 도메인이 바뀌면 함께 고치는 곳

| 파일 | 무엇 |
|---|---|
| `web/public/CNAME` | Pages 가 읽는 주소 |
| `web/index.html` | `og:url` · `canonical` |
| `README.md` | 가이드 사이트 링크 |
| GitHub `Settings → Pages` | Custom domain (파일만 고쳐서는 안 바뀐다) |

`web/src/brand.ts` 에는 이 주소가 없다. 그 파일은 기관·과목 표기용이다.

## Supabase 쪽은 손댈 게 없다

- 학생 로그인은 Edge Function 이 세션을 발급한다. 리다이렉트 주소를 쓰지 않는다.
- 교수 로그인은 이메일+비밀번호(`signInWithPassword`)라 역시 리다이렉트가 없다.
- 다만 **가입 확인 메일이나 비밀번호 재설정 메일**을 쓰게 되면 그때는
  Supabase `Authentication → URL Configuration` 의 Site URL / Redirect URLs 에
  `https://lms.miraejob.co.kr` 을 넣어야 한다. 지금은 쓰지 않는다.

## 하지 말 것

- **와일드카드 `*.miraejob.co.kr`** 로 한 번에 처리하지 말 것. GitHub 도
  권하지 않는다 — 남이 아무 이름이나 잡아 자기 Pages 를 우리 도메인에 붙일 수 있다.
  저장소마다 한 줄씩 넣는 게 그것을 막는다.
- **Cloudflare 프록시(주황 구름)** 를 인증서 발급 전에 켜지 말 것.
- `web/vite.config.ts` 의 `base` 를 `/lms/` 로 되돌리지 말 것. 도메인 주소에서
  자산이 전부 404 난다.
