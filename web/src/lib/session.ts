import type { SupabaseClient } from '@supabase/supabase-js';
import { studentClient } from './supabase';

const KEY = 'pa-student-session';

export interface StudentSession {
  token: string;
  expiresAt: number; // epoch ms
  student: { id: string; name: string; student_no: string };
  course: { id: string; title: string; term: string; class_no: string | null };
}

export function saveStudentSession(s: StudentSession): void {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function loadStudentSession(): StudentSession | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as StudentSession;
    // 만료된 토큰으로 요청을 보내 401 을 받느니, 여기서 바로 정리한다.
    if (s.expiresAt <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}

export function clearStudentSession(): void {
  sessionStorage.removeItem(KEY);
}

/** 로그인된 학생의 Supabase 클라이언트. 세션이 없으면 던진다. */
export function studentDb(): SupabaseClient {
  const s = loadStudentSession();
  if (!s) throw new Error('로그인이 필요합니다.');
  return studentClient(s.token);
}
