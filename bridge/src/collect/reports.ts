import type { LmsClient } from '../lms/client.js';
import { ENDPOINTS } from '../lms/endpoints.js';
import { load, parseTable, parseScore, text, ParseError } from '../lms/parse.js';

export interface ReportRef {
  reportNo: number;
  reportSeq: number;
  title: string;
  week: number | null;
  maxScore: number | null;
  dueAt: string | null;
}

export interface MarkRow {
  userNo: string;
  name: string;
  submitted: boolean;
  currentScore: number | null;
}

export interface SubmissionDetail {
  userNo: string;
  submittedAt: string | null;
  body: string;
  attachments: Array<{ name: string; url: string }>;
  currentScore: number | null;
  currentComment: string;
  rawHtml: string;
}

/** 주차별 과제 목록 → report_no / report_seq 확보 */
export async function collectReports(
  client: LmsClient,
  courseId: string,
  classNo: string,
): Promise<ReportRef[]> {
  const res = await client.call(ENDPOINTS.reportList, { course_id: courseId, class_no: classNo });
  const $ = load(res);

  const reports: ReportRef[] = [];

  $('a[href*="report_no"], a[href*="doFormReport"], a[onclick*="report_no"]').each((_, el) => {
    const attr = `${$(el).attr('href') ?? ''} ${$(el).attr('onclick') ?? ''}`;
    const no = attr.match(/report_no['"=\s,:]+(\d+)/)?.[1];
    const seq = attr.match(/report_seq['"=\s,:]+(\d+)/)?.[1];
    if (!no) return;

    const $row = $(el).closest('tr');
    reports.push({
      reportNo: Number(no),
      reportSeq: Number(seq ?? 1),
      title: text($(el)) || '(제목 없음)',
      week: Number(text($row.find('td').first())) || null,
      // TODO(phase-2): 실제 화면의 배점/마감일 컬럼 위치에 맞게 셀렉터를 고정할 것
      maxScore: null,
      dueAt: null,
    });
  });

  if (reports.length === 0) {
    throw new ParseError('과제 목록', 'report_no 를 담은 링크를 찾지 못했습니다');
  }
  return reports;
}

/** 학생별 제출 여부 + 현재 점수 */
export async function collectMarkList(
  client: LmsClient,
  courseId: string,
  classNo: string,
  reportNo: number,
): Promise<MarkRow[]> {
  const res = await client.call(ENDPOINTS.reportMarkList, {
    course_id: courseId,
    class_no: classNo,
    report_no: reportNo,
  });
  const $ = load(res);

  // TODO(phase-2): 실제 표 셀렉터로 교체. 헤더 이름도 화면 문구에 맞출 것.
  const rows = parseTable($, 'table', '과제 채점 목록');

  return rows.map((r) => ({
    userNo: r['학번'] ?? r['아이디'] ?? '',
    name: r['성명'] ?? r['이름'] ?? '',
    submitted: (r['제출여부'] ?? '').includes('제출'),
    currentScore: parseScore(r['취득점수'] ?? r['점수'] ?? ''),
  }));
}

/**
 * 개별 제출물 상세 — 채점 초안 생성에 필요한 원본이 전부 여기 있다.
 * 반환된 rawHtml 은 반드시 DB에 함께 저장한다. 파서만 고쳐 재처리할 수 있게.
 */
export async function collectSubmission(
  client: LmsClient,
  courseId: string,
  classNo: string,
  reportNo: number,
  reportSeq: number,
  userNo: string,
): Promise<SubmissionDetail> {
  const res = await client.call(ENDPOINTS.reportSubmission, {
    course_id: courseId,
    class_no: classNo,
    report_no: reportNo,
    report_seq: reportSeq,
    user_no: userNo,
    gubun: 'mark',
  });
  const $ = load(res);

  const attachments = $('a[href*="download"], a[href*="fileDown"]')
    .toArray()
    .map((el) => ({ name: text($(el)), url: $(el).attr('href') ?? '' }))
    .filter((a) => a.url !== '');

  return {
    userNo,
    // TODO(phase-2): 아래 셀렉터들을 실제 모달 마크업에 맞게 고정할 것.
    //   임시로 넓게 잡혀 있어 오탐 가능. 첫 수집 시 raw_html 로 검증하세요.
    submittedAt: text($('.submit-date, [class*="date"]').first()) || null,
    body: text($('.report-content, .content, textarea').first()),
    attachments,
    currentScore: parseScore($('input[name*="score"]').first().attr('value') ?? ''),
    currentComment: $('textarea[name*="comment"]').first().text().trim(),
    rawHtml: res.raw,
  };
}
