import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.includes('<')) {
    throw new Error(`.env 의 ${name} 값을 실제 값으로 채우세요. (.env.example 참고)`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  host: required('LMS_HOST').replace(/\/$/, ''),
  basePath: optional('LMS_BASE_PATH', '/lms'),

  /** 학기 + 과목코드 + 분반이 이어붙은 문자열. 코드에 하드코딩하지 말 것. */
  courseId: process.env.COURSE_ID ?? '',
  classNo: process.env.CLASS_NO ?? '',

  dbPath: optional('DB_PATH', './data/lms.sqlite'),
  downloadDir: optional('DOWNLOAD_DIR', './data/submissions'),
  authStatePath: optional('AUTH_STATE_PATH', './.auth/state.json'),

  /** 요청 간 최소 간격. 학교 서버 부담을 줄이기 위한 값 — 낮추지 말 것. */
  requestIntervalMs: Number(optional('REQUEST_INTERVAL_MS', '1200')),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: optional('ANTHROPIC_MODEL', 'claude-opus-5'),

  /**
   * 쓰기 작업 안전장치.
   * 명시적으로 DRY_RUN=false 를 설정하지 않는 한 어떤 저장도 수행되지 않는다.
   */
  dryRun: optional('DRY_RUN', 'true').toLowerCase() !== 'false',
} as const;

export function url(path: string): string {
  return `${config.host}${path}`;
}
