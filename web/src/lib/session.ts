import type { SupabaseClient } from '@supabase/supabase-js';
import { studentClient } from './supabase';

/**
 * 학생 화면에 표시할 프로필(이름·과목).
 *
 * 인증 자체는 studentClient 의 Supabase 세션이 담당한다. 여기 있는 건
 * 매 화면마다 이름·과목을 다시 조회하지 않기 위한 캐시일 뿐이다.
 * 그래서 이 값이 있다고 로그인된 게 아니고, 없다고 로그아웃된 것도 아니다 —
 * 판단 기준은 항상 Supabase 세션 쪽이다.
 */
const KEY = 'pa-student-profile';

export interface StudentProfile {
  student: { id: string; name: string; student_no: string };
  course: { id: string; title: string; term: string; class_no: string | null };
}

export function saveStudentProfile(p: StudentProfile): void {
  sessionStorage.setItem(KEY, JSON.stringify(p));
}

export function loadStudentSession(): StudentProfile | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudentProfile;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}

export async function clearStudentSession(): Promise<void> {
  sessionStorage.removeItem(KEY);
  await studentClient.auth.signOut();
}

/** 로그인된 학생의 Supabase 클라이언트. */
export function studentDb(): SupabaseClient {
  return studentClient;
}
