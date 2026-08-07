// ════════════════════════════════════════════════════════════════
//  학생 로그인 — 학번 + 수업코드
//
//  학생은 회원가입을 하지 않는다. 이 함수가 명단을 대조한 뒤,
//  그 학생에 대응하는 auth 사용자로 **정상 Supabase 세션**을 만들어 준다.
//
//  왜 토큰을 직접 서명하지 않는가:
//  요즘 프로젝트는 JWT 서명 키가 ES256(비대칭)이 기본이고 HS256 공유
//  시크릿은 legacy 로만 남는다. 직접 서명하면 그 legacy 키를 폐기하는 순간
//  전부 죽는다. Supabase 가 자기 키로 서명하게 두면 키가 뭐든 상관없다.
//
//  학생 식별자는 app_metadata 에 넣는다. app_metadata 는 서버만 쓸 수 있어
//  학생이 자기 토큰을 고쳐 남의 student_id 를 주장할 수 없다.
//
//  ⚠️ 이건 "본인 확인"이 아니라 "명단 확인"이다. 같은 수업 학생끼리는 서로의
//     학번을 알 수 있으므로 사칭이 이론적으로 가능하다. 그래서 (a) 수업코드는
//     수업 중에만 알려주고, (b) 교수 화면에서 제출 시각을 볼 수 있게 하고,
//     (c) 성적 확정 전 교수가 검토한다.
// ════════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

/** 이 학생만 쓰는 내부 주소. .invalid 는 실제로 존재할 수 없는 TLD (RFC 2606). */
const emailFor = (studentId: string) => `s.${studentId}@students.invalid`;

/** 로그인할 때마다 새로 만들어 바로 쓰고 버리는 비밀번호. 저장하지 않는다. */
function freshPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

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

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: course } = await admin
    .from('courses')
    .select('id, title, term, class_no')
    .eq('join_code', joinCode)
    .maybeSingle();

  // 수업코드가 틀렸는지 학번이 틀렸는지 구분해 알려주지 않는다.
  // 코드 하나만 가지고 명단을 캐내는 걸 막기 위해서.
  const denied = () => json({ error: '수업코드 또는 학번이 명단과 맞지 않습니다.' }, 401);
  if (!course) return denied();

  const { data: student } = await admin
    .from('students')
    .select('id, name, student_no, active, auth_user_id')
    .eq('course_id', course.id)
    .eq('student_no', studentNo)
    .maybeSingle();

  if (!student || !student.active) return denied();

  const email = emailFor(student.id);
  const password = freshPassword();
  const appMeta = {
    student_id: student.id,
    course_id: course.id,
    student_no: student.student_no,
    user_kind: 'student',
  };

  let authUserId = student.auth_user_id as string | null;

  if (authUserId) {
    // 이미 만들어진 사용자 — 비밀번호를 새로 돌리고 클레임을 최신으로 맞춘다.
    // (팀이 바뀌거나 명단이 갱신돼도 다음 로그인부터 바로 반영된다.)
    const { error } = await admin.auth.admin.updateUserById(authUserId, {
      password,
      app_metadata: appMeta,
    });
    if (error) {
      // 대시보드에서 사용자를 지운 경우 등 — 아래에서 다시 만든다.
      console.error('updateUserById 실패, 재생성합니다:', error.message);
      authUserId = null;
    }
  }

  if (!authUserId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 메일을 보내지 않는다. 확인 절차 없이 바로 쓸 수 있게.
      app_metadata: appMeta,
    });
    if (error || !created.user) {
      console.error('createUser 실패:', error?.message);
      return json({ error: '계정을 준비하지 못했습니다. 교수님께 알려주세요.' }, 500);
    }
    authUserId = created.user.id;
    await admin.from('students').update({ auth_user_id: authUserId }).eq('id', student.id);
  }

  // 방금 정한 비밀번호로 정상 로그인해서 세션을 받는다.
  const publicClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: session, error: signInError } = await publicClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !session.session) {
    console.error('signInWithPassword 실패:', signInError?.message);
    return json({ error: '로그인에 실패했습니다. 교수님께 알려주세요.' }, 500);
  }

  await admin.from('audit_log').insert({
    actor: `student:${student.id}`,
    action: 'student_login',
    course_id: course.id,
    detail: { student_no: student.student_no },
  });

  return json({
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    student: { id: student.id, name: student.name, student_no: student.student_no },
    course: { id: course.id, title: course.title, term: course.term, class_no: course.class_no },
  });
});
