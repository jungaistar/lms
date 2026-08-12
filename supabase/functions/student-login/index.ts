// ════════════════════════════════════════════════════════════════
//  학생 로그인
//
//  두 가지 방식이 있고, 과목의 `entry_mode` 가 어느 쪽인지 정한다.
//
//   · approval (기본) — 이메일 + 학번 + 이름 → 명단 대조 → 교수 승인 → 입장
//   · code            — 수업코드 + 학번 (옛 방식). 쓰고 싶은 과목만 켠다
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
//  ⚠️ 승인 판정은 **여기서만** 한다. 화면에서 버튼을 감추는 방식이 아니다.
//     `student_access` 에는 학생용 RLS 정책이 아예 없어서 학생 토큰으로는
//     읽을 수도 없다.
// ════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

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
const authEmailFor = (studentId: string) => `s.${studentId}@students.invalid`;

/** 로그인할 때마다 새로 만들어 바로 쓰고 버리는 비밀번호. 저장하지 않는다. */
function freshPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 이름 비교용. 공백을 지우고 본다 — "홍 길동" 과 "홍길동" 은 같은 사람이다.
 *
 * NFC 로 맞추는 이유: 같은 한글이라도 자모가 풀어진 형태(NFD)로 들어오는 경우가
 * 있다. 맥에서 만든 파일을 거쳐 온 명단이 특히 그렇다. 눈으로는 똑같은데
 * 문자열 비교가 어긋나서 "명단에 없습니다" 가 된다.
 */
const squash = (s: string) => s.normalize('NFC').replace(/\s+/g, '');

/** 이메일 비교용. 대소문자와 앞뒤 공백만 정리한다. 점·플러스는 건드리지 않는다. */
const normEmail = (s: string) => s.trim().toLowerCase();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Course {
  id: string;
  title: string;
  term: string;
  class_no: string | null;
}

interface Student {
  id: string;
  name: string;
  student_no: string;
  active: boolean;
  auth_user_id: string | null;
}

/**
 * 명단이 맞은 학생에게 세션을 만들어 준다.
 * 두 방식이 마지막에 함께 지나가는 길이다.
 */
async function issueSession(
  admin: SupabaseClient,
  url: string,
  anonKey: string,
  student: Student,
  course: Course,
) {
  const email = authEmailFor(student.id);
  const password = freshPassword();
  const appMeta = {
    student_id: student.id,
    course_id: course.id,
    student_no: student.student_no,
    user_kind: 'student',
  };

  let authUserId = student.auth_user_id;

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
      return { error: json({ error: '계정을 준비하지 못했습니다. 교수님께 알려주세요.' }, 500) };
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
    return { error: json({ error: '로그인에 실패했습니다. 교수님께 알려주세요.' }, 500) };
  }

  return {
    ok: {
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      student: { id: student.id, name: student.name, student_no: student.student_no },
      course: { id: course.id, title: course.title, term: course.term, class_no: course.class_no },
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: '요청 형식이 올바르지 않습니다.' }, 400);
  }

  const joinCode = String(body.join_code ?? '').trim().toUpperCase();
  const studentNo = String(body.student_no ?? '').trim();
  const email = normEmail(String(body.email ?? ''));
  const name = String(body.name ?? '').trim();
  // 이름·학번이 여러 과목에 걸릴 때 학생이 고른 과목.
  const pickedCourse = String(body.course_id ?? '').trim();

  const url = Deno.env.get('SUPABASE_URL')!;

  /*
   * 키를 두 체계에서 찾는다.
   *
   * 이 프로젝트는 2026-08-09 에 **레거시 JWT 키(anon · service_role)를
   * 비활성화**했다. 그런데 Supabase 가 함수에 자동으로 넣어 주는
   * SUPABASE_SERVICE_ROLE_KEY 는 그 레거시 값이라 이제 아무 권한이 없다.
   *
   * 무서운 건 **조용히 실패한다**는 것이다. 죽은 키로 만든 클라이언트는
   * 오류를 내지 않고 그냥 익명으로 동작한다 → RLS 에 걸려 명단이 0건으로
   * 보이고 → 학생은 "명단에서 찾지 못했습니다" 를 듣는다. 학번을 백 번
   * 다시 넣어도 안 된다. 실제로 이것 때문에 한참 헤맸다.
   *
   * 그래서 새 키(sb_secret_… / sb_publishable_…)를 먼저 보고,
   * 없으면 레거시로 떨어진다. 새 키는 Edge Functions → Secrets 에 넣는다.
   */
  const serviceKey =
    Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey =
    Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!serviceKey || !anonKey) {
    console.error('키가 없습니다. SB_SECRET_KEY / SB_PUBLISHABLE_KEY 를 확인하세요.');
    return json({ error: '서버 설정이 끝나지 않았습니다. 교수님께 알려주세요.' }, 500);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // ════════════════════════════════════════════════════════
  //  옛 방식 — 수업코드 + 학번
  // ════════════════════════════════════════════════════════
  if (joinCode) {
    if (!studentNo) return json({ error: '수업코드와 학번을 모두 입력하세요.' }, 400);

    const { data: course } = await admin
      .from('courses')
      .select('id, title, term, class_no, entry_mode')
      .eq('join_code', joinCode)
      .maybeSingle();

    // 수업코드가 틀렸는지 학번이 틀렸는지 구분해 알려주지 않는다.
    // 코드 하나만 가지고 명단을 캐내는 걸 막기 위해서.
    const denied = () => json({ error: '수업코드 또는 학번이 명단과 맞지 않습니다.' }, 401);
    if (!course) return denied();

    if (course.entry_mode === 'approval') {
      return json({
        error: '이 과목은 수업코드로 들어오지 않습니다. 이메일 · 학번 · 이름으로 들어오세요.',
        use_approval: true,
      }, 409);
    }

    const { data: student } = await admin
      .from('students')
      .select('id, name, student_no, active, auth_user_id')
      .eq('course_id', course.id)
      .eq('student_no', studentNo)
      .maybeSingle();

    if (!student || !student.active) return denied();

    const r = await issueSession(admin, url, anonKey, student as Student, course as Course);
    if (r.error) return r.error;

    await admin.from('audit_log').insert({
      actor: `student:${student.id}`,
      action: 'student_login',
      course_id: course.id,
      detail: { student_no: student.student_no, mode: 'code' },
    });

    return json(r.ok);
  }

  // ════════════════════════════════════════════════════════
  //  새 방식 — 이메일 + 학번 + 이름 → 명단 대조 → 승인
  // ════════════════════════════════════════════════════════
  if (!email || !studentNo || !name) {
    return json({ error: '이메일 · 학번 · 이름을 모두 입력하세요.' }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ error: '이메일 주소를 다시 확인해 주세요.' }, 400);
  }

  // 학번으로 후보를 모은 뒤 이름으로 거른다. 이름은 공백을 지우고 본다.
  const { data: rows, error: lookupError } = await admin
    .from('students')
    .select('id, name, student_no, active, auth_user_id, course_id, courses(id, title, term, class_no, entry_mode)')
    .eq('student_no', studentNo)
    .eq('active', true);

  // 조회 자체가 실패한 것을 "명단에 없다" 로 뭉뚱그리면 안 된다.
  // 학생은 학번을 백 번 다시 넣어 보고, 교수는 왜 안 되는지 알 수 없다.
  if (lookupError) {
    console.error('명단 조회 실패:', lookupError.message);
    return json({ error: '명단을 확인하지 못했습니다. 교수님께 알려주세요.' }, 500);
  }

  type CourseRow = Course & { entry_mode: string };
  type Row = Student & { course_id: string; courses: CourseRow | CourseRow[] | null };

  /**
   * 붙여 온 과목을 꺼낸다.
   *
   * PostgREST 는 다대일 관계를 보통 **객체**로 주지만, 관계를 못 알아보면
   * 한 칸짜리 **배열**로 준다. 배열로 왔을 때 `.entry_mode` 를 읽으면 undefined 라
   * 후보가 통째로 걸러지고, 학생에게는 "명단에 없습니다" 로 보인다.
   * 어느 쪽으로 와도 받도록 한다.
   */
  const courseOf = (r: Row): CourseRow | null => {
    const c = r.courses;
    return Array.isArray(c) ? (c[0] ?? null) : c;
  };

  /*
   * 왜 못 찾았는지를 갈라서 알려 준다.
   *
   * 전부 "명단에서 찾지 못했습니다" 로 뭉뚱그리면 학생은 무엇을 고쳐야 할지
   * 모른 채 같은 값을 계속 다시 넣는다. 학번이 틀린 것과 이름이 틀린 것은
   * 학생이 스스로 고칠 수 있는 서로 다른 문제다.
   */
  const byNo = (rows ?? []) as unknown as Row[];
  const withCourse = byNo
    .map((r) => ({ row: r, course: courseOf(r) }))
    .filter((x): x is { row: Row; course: CourseRow } => x.course !== null);
  const nameMatched = withCourse.filter((x) => squash(x.row.name) === squash(name));
  const candidates = nameMatched.filter((x) => x.course.entry_mode === 'approval');

  if (candidates.length === 0) {
    /*
     * 진짜 명단에 없는 것과 **명단을 통째로 못 읽는 것**을 가른다.
     *
     * 권한 키가 죽어 있으면 이 함수는 익명으로 동작하고, RLS 때문에 명단이
     * 0건으로 보인다. 그 상태를 "명단에 없습니다" 로 돌려보내면 학생은
     * 학번을 백 번 다시 넣고 교수는 원인을 영영 모른다.
     * 명단이 통째로 비어 보이면 그건 학생 문제가 아니라 서버 문제다.
     */
    const { count } = await admin
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);

    if (!count) {
      console.error('명단이 통째로 비어 보입니다 — 권한 키를 확인하세요 (SB_SECRET_KEY).');
      return json({
        error: '서버가 명단을 읽지 못했습니다. 학생 잘못이 아닙니다 — 교수님께 알려주세요.',
      }, 500);
    }

    // 명단에 없는 시도도 남긴다. 교수가 "누가 못 들어왔나" 를 볼 수 있어야 한다.
    // 표를 따로 만들지 않는 이유 — 아무나 줄을 만들 수 있으면 그게 스팸이 된다.
    await admin.from('audit_log').insert({
      actor: `anon:${studentNo}`,
      action: 'student_login_unmatched',
      detail: {
        student_no: studentNo,
        name,
        email,
        // 어디서 걸렸는지 남긴다. 교수가 로그만 보고 원인을 알 수 있어야 한다.
        by_no: byNo.length,
        with_course: withCourse.length,
        name_matched: nameMatched.length,
      },
    });

    if (byNo.length === 0) {
      return json({
        error: '이 학번을 명단에서 찾지 못했습니다. 학번을 다시 확인해 주세요.',
      }, 401);
    }
    if (withCourse.length === 0) {
      // 학번은 찾았는데 그 줄에 과목이 안 붙어 왔다. 학생이 고칠 수 있는 게 없다.
      console.error('명단 줄에 과목이 붙지 않았습니다:', JSON.stringify(byNo[0]));
      return json({
        error: '서버가 수업 정보를 읽지 못했습니다. 학생 잘못이 아닙니다 — 교수님께 알려주세요.',
      }, 500);
    }
    if (nameMatched.length === 0) {
      return json({
        error: '학번은 명단에 있는데 이름이 다릅니다. 명단에 적힌 이름 그대로 넣어 주세요.',
      }, 401);
    }
    return json({
      error: '이 수업은 아직 이메일로 들어올 수 없습니다. 교수님께 말씀해 주세요.',
    }, 401);
  }

  // 여러 과목에 같은 학번·이름이 있으면 학생이 고른다.
  let chosen = candidates[0]!;
  if (candidates.length > 1) {
    if (!pickedCourse) {
      return json({
        need_course: true,
        courses: candidates.map((x) => ({
          id: x.course.id,
          title: x.course.title,
          term: x.course.term,
          class_no: x.course.class_no,
        })),
      });
    }
    const hit = candidates.find((x) => x.course.id === pickedCourse);
    if (!hit) return json({ error: '고른 과목을 찾지 못했습니다.' }, 400);
    chosen = hit;
  }

  const picked = chosen.row;
  const course = chosen.course;

  const { data: access } = await admin
    .from('student_access')
    .select('id, email, status')
    .eq('course_id', course.id)
    .eq('student_id', picked.id)
    .maybeSingle();

  // ── 아직 신청한 적이 없다 → 대기 줄을 만든다 ────────────
  if (!access) {
    await admin.from('student_access').insert({
      course_id: course.id,
      student_id: picked.id,
      email,
      status: 'pending',
      requested_at: new Date().toISOString(),
    });
    await admin.from('audit_log').insert({
      actor: `student:${picked.id}`,
      action: 'student_access_requested',
      course_id: course.id,
      detail: { student_no: picked.student_no, email },
    });
    return json({ status: 'pending', course: { title: course.title, class_no: course.class_no } });
  }

  if (access.status === 'rejected') {
    return json({ status: 'rejected', course: { title: course.title, class_no: course.class_no } });
  }

  if (access.status === 'pending') {
    // 이메일을 고쳐서 다시 낼 수 있게 열어 둔다. 아직 승인 전이라 안전하다.
    if (normEmail(access.email ?? '') !== email) {
      await admin.from('student_access')
        .update({ email, requested_at: new Date().toISOString() })
        .eq('id', access.id);
    }
    return json({ status: 'pending', course: { title: course.title, class_no: course.class_no } });
  }

  // ── 승인됨 ───────────────────────────────────────────────
  // 이메일이 아직 안 묶여 있으면(교수가 미리 승인해 둔 경우) 지금 묶는다.
  // 이미 묶여 있으면 그것과 같아야 한다 — 승인 뒤의 두 번째 열쇠다.
  const bound = normEmail(access.email ?? '');
  if (bound && bound !== email) {
    await admin.from('audit_log').insert({
      actor: `student:${picked.id}`,
      action: 'student_login_email_mismatch',
      course_id: course.id,
      detail: { student_no: picked.student_no, tried: email },
    });
    return json({
      error: '승인받은 이메일과 다릅니다. 처음 넣은 주소로 들어오거나, 교수님께 말씀해 주세요.',
    }, 401);
  }

  const r = await issueSession(admin, url, anonKey, picked, course);
  if (r.error) return r.error;

  await admin.from('student_access').update({
    email: bound ? access.email : email,
    last_login_at: new Date().toISOString(),
  }).eq('id', access.id);

  await admin.from('audit_log').insert({
    actor: `student:${picked.id}`,
    action: 'student_login',
    course_id: course.id,
    detail: { student_no: picked.student_no, mode: 'approval' },
  });

  return json(r.ok);
});
