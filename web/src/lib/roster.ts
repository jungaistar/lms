/**
 * 명단 붙여넣기 읽기.
 *
 * 교수가 명단을 만드는 길은 실제로 두 가지다.
 *
 *  ① 엑셀에서 직접 — "학번 · 이름 · 팀"
 *       202458001   김민준   1조
 *
 *  ② 학교 LMS(lms.dima.ac.kr) 의 '성적산출/결과' 표를 그대로 긁어서
 *       NO  학과            학년  학번        이름   총점  가산점  …
 *       1   성악(보컬)과     3    201936083   전예찬        점 추가점수 저장 출석미달
 *     → 이쪽이 원본이다. 학과 · 학년까지 딸려 오는데, 예전에는 버렸다.
 *
 * 두 모양을 같은 함수로 읽는다. 칸 순서를 세지 않고 **생김새로 고른다** —
 * 학교 LMS 는 화면마다 앞뒤에 칸을 더 붙이기 때문에 위치로 세면 곧 깨진다.
 *
 * 고르는 순서
 *   1. 학번  — 6자리 이상 숫자 칸
 *   2. 이름  — 학번 다음 칸부터 한글 이름처럼 생긴 것 (extTasks 의 pickName)
 *   3. 학과  — '…과 / …계열 / …학부 / …전공' 으로 끝나는 칸
 *   4. 학년  — 학번 바로 앞칸이나 이름 다음 칸의 한 자리 숫자
 *   5. 팀    — 남은 칸 중 첫 번째
 */

import { splitCells, findStudentNo, pickName } from './extTasks';

export interface RosterRow {
  student_no: string;
  name: string;
  team: string | null;
  /** 학년. 엑셀에서 학번·이름만 붙여넣으면 비어 있다. */
  grade: number | null;
  /** 학과 · 계열. 위와 같다. */
  dept: string | null;
}

/**
 * 학과처럼 생긴 칸.
 *
 * 앞에 최소 한 글자가 더 있어야 한다 — 머리글의 '학과' · '계열' 자체는
 * 학과 이름이 아니다. 'K-POP과' 처럼 영문·기호가 섞인 것도 받는다.
 */
const DEPT = /^[가-힣A-Za-z0-9()\-·[\]]{1,}(과|계열|학부|전공)$/;

/** 학년 칸. "3" 도 "3학년" 도 받는다. 학년은 1~6을 넘지 않는다. */
const GRADE = /^([1-6])\s*(학년)?$/;

/**
 * 이름도 학과도 팀도 아닌, 표에 늘 딸려 오는 칸.
 *
 * 학교 LMS 성적 화면은 학생마다 "점 · 추가점수 저장 · 출석미달" 을 붙인다.
 * 이걸 팀으로 읽으면 학생마다 팀이 하나씩 생긴다.
 */
const NOISE = new Set([
  '점', '추가점수', '저장', '추가점수저장', '출석미달', '출석', '미달',
  '조회', '보기', '채점', '수정', '삭제', '다운로드', '추가', '완료',
  '학번', '이름', '성명', '학과', '학년', '팀', '구분', 'no', 'NO',
  '-', '—', '·',
]);

const squash = (s: string) => s.replace(/\s/g, '');

function isHeaderLine(line: string): boolean {
  // "NO 학과 학년 학번 이름 …" 같은 머리글. 학번 칸이 없으니 대개 아래에서
  // 걸리지만, '학번' 이라는 낱말이 든 줄은 여기서 먼저 조용히 버린다.
  return /학번/.test(line) && !/\d{6}/.test(line);
}

export function parseRoster(text: string): RosterRow[] {
  const rows: RosterRow[] = [];

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || isHeaderLine(line)) continue;

    const cells = splitCells(line).filter((c) => c !== '');
    const studentNo = findStudentNo(cells);
    if (!studentNo) continue;

    const at = cells.indexOf(studentNo);
    const name = pickName(cells, studentNo);
    if (!name) continue;

    const nameAt = cells.indexOf(name);

    // ── 학과 ──────────────────────────────────────────────
    const deptAt = cells.findIndex(
      (c, i) => i !== at && i !== nameAt && !NOISE.has(squash(c)) && DEPT.test(squash(c)),
    );

    // ── 학년 ──────────────────────────────────────────────
    // 학교 LMS 는 학번 바로 앞, 우리가 내보내는 파일은 이름 바로 뒤에 둔다.
    // 맨 앞 NO 칸도 한 자리 숫자라서, 자리를 이 둘로 좁혀야 NO 를 학년으로
    // 잘못 읽지 않는다. ("3학년" 처럼 적혀 있으면 자리와 무관하게 받는다.)
    //
    // 맨 숫자 한 글자는 **학과 칸이 함께 있을 때만** 학년으로 본다.
    // 학과가 없으면 "학번 이름 팀" 이고, 세 번째 칸은 팀 이름이다 —
    // 팀을 "1" "2" 로 적는 교수가 실제로 있어서 이 둘을 갈라야 한다.
    const inRange = (i: number) => i >= 0 && i < cells.length && i !== at && i !== nameAt && i !== deptAt;
    let gradeAt =
      deptAt < 0 ? -1 : [at - 1, nameAt + 1].find((i) => inRange(i) && GRADE.test(squash(cells[i]!))) ?? -1;
    if (gradeAt < 0) {
      gradeAt = cells.findIndex((c, i) => inRange(i) && /^[1-6]\s*학년$/.test(squash(c)));
    }
    const grade = gradeAt < 0 ? null : Number(GRADE.exec(squash(cells[gradeAt]!))![1]);

    // ── 팀 ────────────────────────────────────────────────
    const team =
      cells.find((c, i) => {
        if (i === at || i === nameAt || i === gradeAt || i === deptAt) return false;
        const v = squash(c);
        if (!v || NOISE.has(v)) return false;
        // 학번 앞쪽 숫자 칸은 NO 다. 팀 이름이 "1" 인 경우를 살리려고
        // 학번 뒤쪽 숫자만 팀으로 받는다.
        if (/^\d+$/.test(v) && i < at) return false;
        return true;
      }) ?? null;

    rows.push({
      student_no: squash(studentNo),
      name,
      team,
      grade,
      dept: deptAt < 0 ? null : cells[deptAt]!.trim(),
    });
  }

  return rows;
}
