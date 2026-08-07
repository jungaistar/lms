import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config, url } from '../config.js';

/**
 * 세션 확보 — 사람이 직접 로그인한다.
 *
 * 로그인 화면에 슬라이더 캡차가 있으므로 자동 로그인은 시도하지 않는다.
 * 캡차 우회 코드를 여기에 추가하지 말 것. (CLAUDE.md 규칙 3)
 */
async function main(): Promise<void> {
  console.log('\n브라우저를 엽니다. 화면에서 직접 로그인해 주세요.');
  console.log('(슬라이더 캡차 때문에 로그인은 자동화하지 않습니다.)\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(url(`${config.basePath}/`), { waitUntil: 'domcontentloaded' });

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('로그인을 완료한 뒤 Enter 를 누르세요... ');
  rl.close();

  const state = await context.storageState();
  const hasSession = state.cookies.some((c) => c.name.toUpperCase() === 'JSESSIONID');

  if (!hasSession) {
    console.error('\n⛔ JSESSIONID 쿠키를 찾지 못했습니다. 로그인이 완료되지 않은 것 같습니다.');
    await browser.close();
    process.exit(1);
  }

  await mkdir(dirname(config.authStatePath), { recursive: true });
  await context.storageState({ path: config.authStatePath });
  await browser.close();

  console.log(`\n✅ 세션을 저장했습니다: ${config.authStatePath}`);
  console.log('   이 파일에는 로그인 쿠키가 들어 있습니다. 공유하거나 커밋하지 마세요.');
  console.log('\n다음: npm run collect -- --course <COURSE_ID> --class <CLASS_NO>');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
