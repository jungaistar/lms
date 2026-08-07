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
 */
const SAFE_URL = URL || 'https://placeholder.supabase.co';
const SAFE_ANON = ANON || 'placeholder-anon-key';

/** 교수용 — Supabase Auth 세션을 브라우저에 유지한다. */
export const teacherClient: SupabaseClient = createClient(SAFE_URL, SAFE_ANON, {
  auth: { persistSession: true, storageKey: 'pa-teacher-auth', autoRefreshToken: true },
});

/**
 * 학생용.
 *
 * 학생도 이제 진짜 Supabase 세션을 쓴다(토큰 직접 서명 방식에서 옮겨왔다).
 * 그래서 액세스 토큰 만료를 우리가 신경 쓸 필요가 없다 — 클라이언트가 알아서 갱신한다.
 *
 * 저장소로 sessionStorage 를 쓰는 이유: 학교 실습실 PC 처럼 공용 기기에서
 * 탭을 닫으면 세션이 남지 않게 하기 위해서. 학생 본인 휴대폰에서는 차이가 없다.
 */
export const studentClient: SupabaseClient = createClient(SAFE_URL, SAFE_ANON, {
  auth: {
    persistSession: true,
    storageKey: 'pa-student-auth',
    autoRefreshToken: true,
    storage: typeof window === 'undefined' ? undefined : window.sessionStorage,
  },
});

export interface StudentLoginResult {
  access_token: string;
  refresh_token: string;
  student: { id: string; name: string; student_no: string };
  course: { id: string; title: string; term: string; class_no: string | null };
}

/**
 * 학번 + 수업코드로 로그인.
 * Edge Function 이 명단을 대조하고 정상 세션을 발급한다.
 */
export async function studentLogin(joinCode: string, studentNo: string): Promise<StudentLoginResult> {
  const res = await fetch(`${SAFE_URL}/functions/v1/student-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SAFE_ANON,
      Authorization: `Bearer ${SAFE_ANON}`,
    },
    body: JSON.stringify({ join_code: joinCode, student_no: studentNo }),
  });

  let body: Record<string, unknown>;
  try {
    body = await res.json();
  } catch {
    throw new Error(`로그인 서버가 응답하지 않습니다 (HTTP ${res.status}).`);
  }
  if (!res.ok) throw new Error(String(body?.error ?? '로그인에 실패했습니다.'));

  const result = body as unknown as StudentLoginResult;

  // 받은 세션을 클라이언트에 심는다. 이후 모든 질의가 이 세션으로 나간다.
  const { error } = await studentClient.auth.setSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  });
  if (error) throw new Error(`세션을 저장하지 못했습니다: ${error.message}`);

  return result;
}
