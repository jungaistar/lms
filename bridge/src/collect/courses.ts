import type { LmsClient } from '../lms/client.js';
import { ENDPOINTS } from '../lms/endpoints.js';
import { load, text, extractJsArgs, ParseError } from '../lms/parse.js';

export interface CourseRef {
  courseId: string;
  classNo: string;
  term: string;
  title: string;
}

/**
 * 담당 과목 목록 수집 — 모든 작업의 시작점.
 *
 * 메뉴가 javascript:fncGoClassroom('<course_id>','<class_no>') 형태라
 * href 대신 함수 인자에서 식별자를 뽑아낸다. (docs/01-findings.md §1.3)
 */
export async function collectCourses(client: LmsClient): Promise<CourseRef[]> {
  const res = await client.call(ENDPOINTS.myCourses);
  const $ = load(res);

  const courses: CourseRef[] = [];

  $('a[href*="fncGoClassroom"], a[href*="fnGoContent"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const args = extractJsArgs(href);
    // 첫 인자가 course_id, 두 번째가 class_no 인 패턴
    const [courseId, classNo] = args;
    if (!courseId || !/^\d{6}/.test(courseId)) return;

    courses.push({
      courseId,
      classNo: classNo ?? courseId.slice(-2),
      term: courseId.slice(0, 6),
      title: text($(el)) || '(제목 없음)',
    });
  });

  if (courses.length === 0) {
    throw new ParseError('담당 과목 목록', '강의실 이동 링크를 하나도 찾지 못했습니다');
  }

  // 같은 과목이 여러 링크로 노출될 수 있으므로 중복 제거
  const seen = new Set<string>();
  return courses.filter((c) => {
    const key = `${c.courseId}|${c.classNo}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
