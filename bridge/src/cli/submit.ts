import { config } from '../config.js';
import { submitScores } from '../automation/submitScores.js';
import { parseArgs, requireArg } from './args.js';

/**
 * 유일한 쓰기 명령.
 *
 * 기본값이 dry-run 이고, 학생 단위 확인을 거치며, 저장 후 값을 재검증한다.
 * 첫 실행은 반드시 --limit 1 로 한 명만 해 보고 화면에서 눈으로 확인하세요.
 */
async function main(): Promise<void> {
  const args = parseArgs();

  const dryRun = args['dry-run'] === true || config.dryRun;
  if (!dryRun) {
    console.log('\n🔴 실제 저장 모드입니다. (.env 의 DRY_RUN=false)');
    console.log('   학생마다 확인을 받으며, 저장 후 값을 재조회해 검증합니다.\n');
  }

  await submitScores({
    courseId: requireArg(args, 'course', config.courseId),
    classNo: requireArg(args, 'class', config.classNo),
    reportNo: Number(requireArg(args, 'report')),
    dryRun,
    limit: args['limit'] ? Number(args['limit']) : undefined,
  });
}

main().catch((e) => {
  console.error(`\n⛔ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
