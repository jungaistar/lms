import * as cheerio from 'cheerio';
import type { LmsResponse } from './client.js';

/**
 * HTML 응답 파싱 유틸.
 *
 * 이 앱은 화면 개편에 따라 마크업이 바뀐다. 셀렉터가 안 맞을 때
 * **빈 배열을 조용히 반환하지 말고 명시적으로 throw** 한다. (CLAUDE.md 파서 작성 규칙)
 * 조용한 실패는 "학생이 0명"처럼 보여 잘못된 채점으로 이어진다.
 */

export class ParseError extends Error {
  constructor(what: string, hint: string) {
    super(`${what} 파싱 실패 — ${hint}\n화면 마크업이 바뀌었을 수 있습니다. 저장된 raw_html 로 셀렉터를 다시 맞추세요.`);
    this.name = 'ParseError';
  }
}

export function load(res: LmsResponse): cheerio.CheerioAPI {
  if (res.isJson) throw new ParseError('HTML', '응답이 JSON입니다. parseJson 을 쓰세요');
  return cheerio.load(res.raw);
}

export function parseJson<T>(res: LmsResponse): T {
  try {
    return JSON.parse(res.raw) as T;
  } catch {
    throw new ParseError('JSON', '응답이 JSON 형식이 아닙니다');
  }
}

/** 텍스트 정규화 — 서버 렌더링 HTML은 공백·개행이 지저분하다. */
export function text($el: cheerio.Cheerio<any>): string {
  return $el.text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** "12 / 20", "12점", "-" 같은 표기에서 숫자만 뽑는다. 미채점이면 null. */
export function parseScore(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '미채점') return null;
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * 표(table) 를 헤더 기준 객체 배열로 변환.
 * 이 LMS 화면 대부분이 table 기반이라 수집기 여러 곳에서 재사용된다.
 */
export function parseTable($: cheerio.CheerioAPI, selector: string, what: string): Record<string, string>[] {
  const $table = $(selector).first();
  if ($table.length === 0) throw new ParseError(what, `셀렉터 "${selector}" 에 해당하는 표가 없습니다`);

  const headers = $table
    .find('thead th, thead td')
    .toArray()
    .map((el) => text($(el)));
  if (headers.length === 0) throw new ParseError(what, '표 헤더(thead)를 찾지 못했습니다');

  return $table
    .find('tbody tr')
    .toArray()
    .map((tr) => {
      const cells = $(tr).find('td').toArray();
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        const cell = cells[i];
        row[h || `col${i}`] = cell ? text($(cell)) : '';
      });
      return row;
    });
}

/**
 * 메뉴 이동은 javascript:fnGoContent(...) / fncGoClassroom(...) 형태의
 * 함수 호출이다. 인자를 뽑아내 course_id / class_no 를 얻는다.
 *
 * 예: fncGoClassroom('202610UN0060****Y2','Y2')  →  ['202610UN0060****Y2', 'Y2']
 */
export function extractJsArgs(href: string): string[] {
  const m = href.match(/\(([^)]*)\)/);
  if (!m?.[1]) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((s) => s.length > 0);
}
