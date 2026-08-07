import type { LmsClient } from '../lms/client.js';
import { ENDPOINTS } from '../lms/endpoints.js';
import { load, parseJson, parseTable, ParseError } from '../lms/parse.js';

export interface Student {
  userNo: string;
  name: string;
  dept: string | null;
}

export interface ScoreItem {
  itemKey: string;
  label: string;
  weight: number | null;
  maxScore: number | null;
}

/**
 * 학생 명단 — 성적산출 그리드 데이터에서 가져온다.
 * 이 엔드포인트는 Tabulator 그리드용이라 JSON 을 반환할 수 있고,
 * 화면에 따라 HTML 을 반환할 수도 있다. Content-Type 으로 분기한다.
 */
export async function collectStudents(
  client: LmsClient,
  courseId: string,
  classNo: string,
): Promise<Student[]> {
  const res = await client.call(ENDPOINTS.scoreStudents, { course_id: courseId, class_no: classNo });

  if (res.isJson) {
    const data = parseJson<{ data?: unknown[]; rows?: unknown[] } | unknown[]>(res);
    const rows = Array.isArray(data) ? data : (data.data ?? data.rows ?? []);
    return (rows as Record<string, string>[]).map((r) => ({
      userNo: String(r['user_no'] ?? r['userNo'] ?? r['학번'] ?? ''),
      name: String(r['user_nm'] ?? r['name'] ?? r['성명'] ?? ''),
      dept: (r['dept_nm'] ?? r['dept'] ?? null) as string | null,
    })).filter((s) => s.userNo !== '');
  }

  const $ = load(res);
  const rows = parseTable($, 'table', '학생 명단');
  const students = rows
    .map((r) => ({
      userNo: r['학번'] ?? '',
      name: r['성명'] ?? r['이름'] ?? '',
      dept: r['학과'] ?? null,
    }))
    .filter((s) => s.userNo !== '');

  if (students.length === 0) throw new ParseError('학생 명단', '학번 컬럼을 찾지 못했습니다');
  return students;
}

/** 평가항목·가중치 메타데이터 */
export async function collectScoreItems(
  client: LmsClient,
  courseId: string,
  classNo: string,
): Promise<ScoreItem[]> {
  const res = await client.call(ENDPOINTS.scorePageInfo, { course_id: courseId, class_no: classNo });

  if (!res.isJson) {
    // 평가기준 미설정 시 안내 문구 HTML 이 올 수 있다.
    throw new ParseError('평가항목', 'JSON 이 아닌 응답 — 평가기준이 아직 설정되지 않았을 수 있습니다');
  }

  const data = parseJson<{ items?: Record<string, string>[] }>(res);
  // TODO(phase-2): 실제 응답 키 이름에 맞춰 매핑을 고정할 것.
  return (data.items ?? []).map((i) => ({
    itemKey: String(i['item_cd'] ?? i['key'] ?? ''),
    label: String(i['item_nm'] ?? i['label'] ?? ''),
    weight: i['weight'] != null ? Number(i['weight']) : null,
    maxScore: i['max_score'] != null ? Number(i['max_score']) : null,
  }));
}
