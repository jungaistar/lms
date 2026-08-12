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

export interface StudentSession {
  access_token: string;
  refresh_token: string;
  student: { id: string; name: string; student_no: string };
  course: { id: string; title: string; term: string; class_no: string | null };
}

export interface CourseChoice {
  id: string;
  title: string;
  term: string;
  class_no: string | null;
}

/**
 * 로그인 시도의 결과.
 *
 * 새 방식(이메일 + 학번 + 이름)은 **바로 못 들어가는 경우가 정상**이다 —
 * 처음 신청하면 승인을 기다려야 한다. 그래서 예외가 아니라 값으로 돌린다.
 * 예외는 "잘못됐다" 는 뜻으로만 남겨 둔다.
 */
export type StudentLoginOutcome =
  | { kind: 'session'; session: StudentSession }
  | { kind: 'pending'; courseLabel: string }
  | { kind: 'rejected'; courseLabel: string }
  /** 같은 학번·이름이 여러 과목에 있다. 학생이 골라야 한다. */
  | { kind: 'choose'; courses: CourseChoice[] };

async function callLogin(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${SAFE_URL}/functions/v1/student-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SAFE_ANON,
      Authorization: `Bearer ${SAFE_ANON}`,
    },
    body: JSON.stringify(payload),
  });

  let body: Record<string, unknown>;
  try {
    body = await res.json();
  } catch {
    throw new Error(`로그인 서버가 응답하지 않습니다 (HTTP ${res.status}).`);
  }
  if (!res.ok) throw new Error(String(body?.error ?? '로그인에 실패했습니다.'));
  return body;
}

/** 받은 세션을 클라이언트에 심는다. 이후 모든 질의가 이 세션으로 나간다. */
async function adopt(body: Record<string, unknown>): Promise<StudentSession> {
  const result = body as unknown as StudentSession;
  const { error } = await studentClient.auth.setSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  });
  if (error) throw new Error(`세션을 저장하지 못했습니다: ${error.message}`);
  return result;
}

const courseLabel = (c: { title?: unknown; class_no?: unknown } | undefined) =>
  c ? `${String(c.title ?? '')}${c.class_no ? ` (${String(c.class_no)}반)` : ''}` : '';

/**
 * 이메일 + 학번 + 이름으로 들어오기 (기본 방식).
 *
 * Edge Function 이 명단을 대조하고, 교수가 승인한 뒤에만 세션을 준다.
 * 같은 학번·이름이 여러 과목에 있으면 `choose` 가 돌아온다 —
 * 학생이 고른 과목 id 를 `courseId` 로 다시 부르면 된다.
 */
export async function studentEnter(
  email: string,
  studentNo: string,
  name: string,
  courseId?: string,
): Promise<StudentLoginOutcome> {
  const body = await callLogin({
    email,
    student_no: studentNo,
    name,
    ...(courseId ? { course_id: courseId } : {}),
  });

  if (body.need_course) {
    return { kind: 'choose', courses: (body.courses ?? []) as CourseChoice[] };
  }
  if (body.status === 'pending') {
    return { kind: 'pending', courseLabel: courseLabel(body.course as never) };
  }
  if (body.status === 'rejected') {
    return { kind: 'rejected', courseLabel: courseLabel(body.course as never) };
  }
  return { kind: 'session', session: await adopt(body) };
}

/**
 * 학번 + 수업코드로 로그인 (옛 방식).
 * 과목의 `entry_mode` 가 `code` 인 동안만 통한다.
 */
export async function studentLogin(joinCode: string, studentNo: string): Promise<StudentSession> {
  return adopt(await callLogin({ join_code: joinCode, student_no: studentNo }));
}
