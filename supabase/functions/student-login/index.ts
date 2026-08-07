// ════════════════════════════════════════════════════════════════
//  학생 로그인 — 학번 + 수업코드
//
//  학생은 Supabase Auth 계정을 만들지 않는다(가입 절차 없이 첫 수업에서 바로 쓰기 위해).
//  대신 이 함수가 명단을 대조한 뒤, 프로젝트 JWT 시크릿으로 서명한 토큰을 발급한다.
//  토큰에는 student_id / course_id 클레임이 들어가고, RLS 정책이 그걸 읽는다.
//
//  ⚠️ 이건 "본인 확인"이 아니라 "명단 확인"이다. 같은 수업 학생끼리는
//     서로의 학번을 알 수 있으므로 사칭이 이론적으로 가능하다.
//     그래서 (a) 수업코드는 수업 중에만 알려주고, (b) 교수 화면에서
//     제출 시각·중복 접속을 볼 수 있게 하고, (c) 성적 확정 전 교수가 검토한다.
//     더 강한 확인이 필요하면 학생별 PIN 을 추가하는 방향으로 확장한다.
// ════════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** 토큰 유효 기간. 수업 한 타임(3시간)보다 넉넉하되 하루를 넘기지 않는다. */
const TOKEN_TTL_SECONDS = 60 * 60 * 8;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);

  let joinCode: string, studentNo: string;
  try {
    const body = await req.json();
    joinCode = String(body.join_code ?? '').trim().toUpperCase();
    studentNo = String(body.student_no ?? '').trim();
  } catch {
    return json({ error: '요청 형식이 올바르지 않습니다.' }, 400);
  }

  if (!joinCode || !studentNo) {
    return json({ error: '수업코드와 학번을 모두 입력하세요.' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: course } = await admin
    .from('courses')
    .select('id, title, term, class_no')
    .eq('join_code', joinCode)
    .maybeSingle();

  // 수업코드가 틀렸는지 학번이 틀렸는지 구분해서 알려주지 않는다.
  // 코드만 가지고 명단을 캐내는 걸 막기 위해서.
  const denied = () => json({ error: '수업코드 또는 학번이 명단과 맞지 않습니다.' }, 401);
  if (!course) return denied();

  const { data: student } = await admin
    .from('students')
    .select('id, name, student_no, team_id, active')
    .eq('course_id', course.id)
    .eq('student_no', studentNo)
    .maybeSingle();

  if (!student || !student.active) return denied();

  const secret = Deno.env.get('SUPABASE_JWT_SECRET');
  if (!secret) return json({ error: '서버 설정 오류: JWT 시크릿이 없습니다.' }, 500);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

  const token = await create(
    { alg: 'HS256', typ: 'JWT' },
    {
      aud: 'authenticated',
      role: 'authenticated',
      sub: student.id,
      exp: getNumericDate(TOKEN_TTL_SECONDS),
      // RLS 정책이 읽는 커스텀 클레임
      student_id: student.id,
      course_id: course.id,
      student_no: student.student_no,
      name: student.name,
      user_kind: 'student',
    },
    key,
  );

  await admin.from('audit_log').insert({
    actor: `student:${student.id}`,
    action: 'student_login',
    course_id: course.id,
    detail: { student_no: student.student_no },
  });

  return json({
    token,
    expires_in: TOKEN_TTL_SECONDS,
    student: { id: student.id, name: student.name, student_no: student.student_no },
    course: { id: course.id, title: course.title, term: course.term, class_no: course.class_no },
  });
});
