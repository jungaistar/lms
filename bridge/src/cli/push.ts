import { config } from '../config.js';
import { pushFromCsv } from '../automation/pushFromCsv.js';
import { parseArgs, requireArg } from './args.js';

/**
 * 동료평가 웹앱에서 내려받은 CSV 를 학교 LMS 성적 화면에 입력한다.
 *
 *   npm run push -- --csv "3주차 발표_성적.csv" --dry-run
 *
 * 첫 실행은 반드시 --dry-run 으로 화면 구조부터 확인하세요.
 */
async function main(): Promise<void> {
  const args = parseArgs();
  await pushFromCsv({
    csvPath: requireArg(args, 'csv'),
    courseId: requireArg(args, 'course', config.courseId),
    classNo: requireArg(args, 'class', config.classNo),
    dryRun: args['dry-run'] === true || config.dryRun,
    limit: args['limit'] ? Number(args['limit']) : undefined,
  });
}

main().catch((e) => {
  console.error(`\n⛔ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
