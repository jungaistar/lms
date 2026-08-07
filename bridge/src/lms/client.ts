import { request } from 'undici';
import { config, url } from '../config.js';
import type { Endpoint } from './endpoints.js';
import { cookieHeader, looksLikeLoginPage, SessionExpiredError } from './session.js';

/**
 * 읽기 전용 LMS HTTP 클라이언트.
 *
 * ⛔ 이 파일에 저장/수정 요청을 추가하지 말 것. (CLAUDE.md 규칙 1)
 *    쓰기는 src/automation/ 의 브라우저 자동화 경로에만 존재한다.
 *    이 클래스는 조회 엔드포인트만 받도록 설계되어 있다.
 */

export interface LmsResponse {
  /** 응답 원본. DB에 함께 저장해 두면 나중에 파서만 고쳐 재처리할 수 있다. */
  raw: string;
  contentType: string;
  isJson: boolean;
  status: number;
  /** 실제 호출한 URL — Referer 체인 구성과 디버깅에 사용 */
  requestedUrl: string;
}

type Params = Record<string, string | number>;

export class LmsClient {
  private lastRequestAt = 0;
  private cookie: string | null = null;
  /** 직전 요청 URL. 서버 렌더링 앱은 Referer 를 검사하는 경우가 있다. */
  private referer: string;

  constructor() {
    this.referer = url(`${config.basePath}/`);
  }

  /** 레이트리밋 — 학교 서버 부담 방지. 이 값을 낮추지 말 것. (CLAUDE.md 규칙 7) */
  private async throttle(): Promise<void> {
    const wait = config.requestIntervalMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private async cookies(): Promise<string> {
    this.cookie ??= await cookieHeader();
    return this.cookie;
  }

  /** 엔드포인트가 요구하는 파라미터가 모두 있는지 호출 전에 검사한다. */
  private assertParams(endpoint: Endpoint, params: Params): void {
    const missing = endpoint.requires.filter((k) => params[k] === undefined || params[k] === '');
    if (missing.length > 0) {
      throw new Error(`${endpoint.path} 호출에 필요한 파라미터 누락: ${missing.join(', ')}`);
    }
  }

  async call(endpoint: Endpoint, params: Params = {}): Promise<LmsResponse> {
    this.assertParams(endpoint, params);
    await this.throttle();

    const target = new URL(url(endpoint.path));
    const body = new URLSearchParams();

    for (const [k, v] of Object.entries(params)) {
      if (endpoint.method === 'GET') target.searchParams.set(k, String(v));
      else body.set(k, String(v));
    }

    const headers: Record<string, string> = {
      Cookie: await this.cookies(),
      Referer: this.referer,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) lms-grading-assistant/0.1',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (endpoint.method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    }

    const res = await request(target, {
      method: endpoint.method,
      headers,
      body: endpoint.method === 'POST' ? body.toString() : undefined,
    });

    const raw = await res.body.text();
    const contentType = String(res.headers['content-type'] ?? '');

    // 이 앱은 세션 만료 시 401 대신 200 + 로그인 화면을 돌려주기도 한다.
    if (looksLikeLoginPage(raw)) throw new SessionExpiredError();
    if (res.statusCode >= 400) {
      throw new Error(`${endpoint.path} 요청 실패: HTTP ${res.statusCode}`);
    }

    this.referer = target.toString();

    return {
      raw,
      contentType,
      isJson: contentType.includes('json'),
      status: res.statusCode,
      requestedUrl: target.toString(),
    };
  }

  /** 세션이 살아있는지 확인. 거의 모든 화면이 호출하는 엔드포인트를 그대로 이용한다. */
  async checkSessionAlive(): Promise<boolean> {
    const { ENDPOINTS } = await import('./endpoints.js');
    try {
      await this.call(ENDPOINTS.sessionInfo);
      return true;
    } catch (e) {
      if (e instanceof SessionExpiredError) return false;
      throw e;
    }
  }
}
