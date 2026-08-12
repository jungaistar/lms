/**
 * 오류에서 사람이 읽을 문장을 꺼낸다.
 *
 * 왜 필요한가 — Supabase 가 돌려주는 오류(`PostgrestError`)는 **`Error` 의
 * 인스턴스가 아니다.** `{ message, details, hint, code }` 를 가진 그냥 객체다.
 * 그래서 화면 곳곳에 있던
 *
 *     catch (e) { setError(e instanceof Error ? e.message : '반영하지 못했습니다.') }
 *
 * 는 **DB 가 알려 준 진짜 이유를 통째로 버리고** 두루뭉술한 문장만 남겼다.
 * 실제로 "반영하지 못했습니다" 만 보고 원인을 찾는 데 한참 걸렸다.
 * 진짜 이유는 "there is no unique or exclusion constraint matching the
 * ON CONFLICT specification" 이었다.
 *
 * details·hint 까지 붙이는 이유 — Postgres 는 무엇이 잘못됐는지를 hint 에
 * 담아 주는 경우가 많다. 교수가 그 문장을 그대로 알려 주면 바로 고칠 수 있다.
 */
export function errText(e: unknown, fallback: string): string {
  if (typeof e === 'string' && e.trim()) return e;

  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [o.message, o.details, o.hint]
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '');
    if (parts.length > 0) {
      const code = typeof o.code === 'string' && o.code ? ` (${o.code})` : '';
      // 같은 말이 두 번 나오는 경우가 잦아서 중복은 접는다.
      return [...new Set(parts)].join(' — ') + code;
    }
  }

  return fallback;
}
