/**
 * 실제 명단 파일(data/roster/*.tsv)을 파서에 통과시켜 본다.
 *
 * data/ 는 커밋하지 않는 실제 학생 정보라, 파일이 없으면 조용히 넘어간다.
 * (CI 나 다른 사람 컴퓨터에서는 파일이 없는 게 정상이다.)
 *
 * 실행: npx tsx test/roster-files.check.ts
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parseRoster } from '../src/lib/roster';

const DIR = new URL('../../data/roster/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

if (!existsSync(DIR)) {
  console.log('명단 파일 점검: data/roster 가 없어 건너뜁니다.');
  process.exit(0);
}

let fail = 0;
let total = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.tsv'))) {
  const raw = readFileSync(`${DIR}/${file}`, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim()).length;
  const rows = parseRoster(raw);
  const noGrade = rows.filter((r) => r.grade === null);
  const noDept = rows.filter((r) => r.dept === null);
  const dupes = rows.length - new Set(rows.map((r) => r.student_no)).size;
  const strayTeam = rows.filter((r) => r.team !== null);

  const bad: string[] = [];
  if (rows.length !== lines) bad.push(`줄 ${lines}개 중 ${rows.length}개만 읽힘`);
  if (noGrade.length) bad.push(`학년 없음 ${noGrade.length}명 (${noGrade[0]!.name})`);
  if (noDept.length) bad.push(`학과 없음 ${noDept.length}명 (${noDept[0]!.name})`);
  if (dupes) bad.push(`학번 중복 ${dupes}건`);
  if (strayTeam.length) bad.push(`팀이 잘못 읽힘 ${strayTeam.length}건 (${strayTeam[0]!.team})`);

  total += rows.length;
  if (bad.length) { fail += 1; console.error(`  ✗ ${file} — ${bad.join(' · ')}`); }
  else console.log(`  ✓ ${file.padEnd(32)} ${String(rows.length).padStart(3)}명`);
}

console.log(`\n명단 파일 점검: 합계 ${total}명${fail ? `, ${fail}개 파일 실패` : ''}`);
process.exit(fail ? 1 : 0);
