import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(URL && ANON && !URL.includes('xxxx'));

/** 교수용 — Supabase Auth 세션을 브라우저에 유지한다. */
export const teacherClient: SupabaseClient = createClient(URL ?? 'http://localhost', ANON ?? 'anon', {
  auth: { persistSession: true, storageKey: 'pa-teacher-auth', autoRefreshToken: true },
});

/**
 * 학생용 — student-login Edge Function 이 발급한 토큰을 헤더에 실어 보낸다.
 * Supabase Auth 세션이 아니므로 persistSession 은 끈다.
 */
let studentCache: { token: string; client: SupabaseClient } | null = null;

export function studentClient(token: string): SupabaseClient {
  if (studentCache?.token === token) return studentCache.client;
  const client = createClient(URL ?? 'http://localhost', ANON ?? 'anon', {
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
