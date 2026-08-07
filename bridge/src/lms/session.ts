import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';

/**
 * 세션 확보 정책
 * ──────────────────────────────────────────────────────────
 * 로그인 화면에 슬라이더 캡차가 있으므로 로그인은 자동화하지 않는다.
 * 사람이 브라우저에서 직접 로그인하고, 그때 만들어진 쿠키를 저장해 재사용한다.
 * 캡차 우회 코드를 이 파일에 추가하지 말 것. (CLAUDE.md 규칙 3)
 */

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
}

/** Playwright storageState 중 우리가 쓰는 부분만 */
interface StorageState {
  cookies: StoredCookie[];
}

export async function saveSession(state: StorageState): Promise<void> {
  await mkdir(dirname(config.authStatePath), { recursive: true });
  await writeFile(config.authStatePath, JSON.stringify(state, null, 2), 'utf8');
}

export async function loadSession(): Promise<StorageState> {
  try {
    const raw = await readFile(config.authStatePath, 'utf8');
    return JSON.parse(raw) as StorageState;
  } catch {
    throw new Error(
      `저장된 세션이 없습니다 (${config.authStatePath}).\n` +
        `먼저 "npm run auth" 를 실행해 브라우저에서 직접 로그인하세요.`,
    );
  }
}

/** 저장된 쿠키를 Cookie 헤더 문자열로 변환 */
export async function cookieHeader(): Promise<string> {
  const { cookies } = await loadSession();
  const host = new URL(config.host).hostname;
  return cookies
    .filter((c) => host.endsWith(c.domain.replace(/^\./, '')))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

/** 세션 쿠키가 존재하는지(형태상) 확인. 실제 생존 여부는 checkSessionAlive 로 확인. */
export async function hasSessionCookie(): Promise<boolean> {
  const { cookies } = await loadSession();
  return cookies.some((c) => c.name.toUpperCase() === 'JSESSIONID');
}

/**
 * 응답 본문이 세션 만료를 의미하는지 판단한다.
 * 이 앱은 만료 시 401이 아니라 200 + 로그인 화면 HTML 을 돌려주는 경우가 있다.
 */
export function looksLikeLoginPage(body: string): boolean {
  const markers = ['slidercaptcha', 'j_username', '로그인이 필요', 'doLogin.dunet', 'login_form'];
  const lower = body.toLowerCase();
  return markers.some((m) => lower.includes(m.toLowerCase()));
}

export class SessionExpiredError extends Error {
  constructor() {
    super('세션이 만료되었습니다. "npm run auth" 로 다시 로그인하세요.');
    this.name = 'SessionExpiredError';
  }
}
