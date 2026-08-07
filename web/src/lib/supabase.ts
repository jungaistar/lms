import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(URL && ANON && !URL.includes('xxxx'));

/**
 * 설정이 없을 때 쓰는 자리표시자.
 *
 * `??` 가 아니라 `||` 인 게 중요하다. CI 에서 시크릿이 비어 있으면 환경변수가
 * undefined 가 아니라 **빈 문자열**로 들어오고, `??` 는 빈 문자열을 통과시켜
 * createClient 가 "supabaseUrl is required" 로 던진다. 그러면 앱 전체가
 * 흰 화면이 되어 "설정이 없습니다" 안내조차 못 보여준다.
 *
 * 이 클라이언트는 isConfigured 가 false 인 동안 실제로 쓰이지 않는다 —
 * App 이 그 전에 안내 화면으로 빠진다.
 */
const SAFE_URL = URL || 'https://placeholder.supabase.co';
const SAFE_ANON = ANON || 'placeholder-anon-key';

/** 교수용 — Supabase Auth 세션을 브라우저에 유지한다. */
export const teacherClient: SupabaseClient = createClient(SAFE_URL, SAFE_ANON, {
  auth: { persistSession: true, storageKey: 'pa-teacher-auth', autoRefreshToken: true },
});

/**
 * 학생용 — student-login Edge Function 이 발급한 토큰을 헤더에 실어 보낸다.
 * Supabase Auth 세션이 아니므로 persistSession 은 끈다.
 */
let studentCache: { token: string; client: SupabaseClient } | null = null;

export function studentClient(token: string): SupabaseClient {
  if (studentCache?.token === token) return studentCache.client;
  const client = createClient(SAFE_URL, SAFE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  studentCache = { token, client };
  return client;
}

export async function studentLogin(joinCode: string, studentNo: string) {
  const res = await fetch(`${URL}/functions/v1/student-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ join_code: joinCode, student_no: studentNo }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? '로그인에 실패했습니다.');
  return body as {
    token: string;
    expires_in: number;
    student: { id: string; name: string; student_no: string };
    course: { id: string; title: string; term: string; class_no: string | null };
  };
}
