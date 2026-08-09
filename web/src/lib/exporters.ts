/**
 * 표 내보내기 — CSV · XLSX · PDF(인쇄).
 *
 * 라이브러리를 넣지 않는다. 이 파일은 브라우저로 그대로 나가고,
 * 표 하나 내보내자고 수백 KB 를 받게 하고 싶지 않다.
 *
 * · CSV   — 엑셀이 한글을 깨뜨리지 않도록 BOM 을 붙인다.
 * · XLSX  — 무압축(stored) ZIP 을 직접 만든다. 진짜 .xlsx 라 엑셀이 그대로 연다.
 * · PDF   — 만들지 않는다. 인쇄 창을 띄워 "PDF로 저장"을 쓰게 한다.
 *           한글이 들어간 PDF 를 직접 만들려면 폰트를 통째로 심어야 해서
 *           수 MB 가 붙는다. 인쇄 경로가 글자도 깨지지 않고 결과도 낫다.
 */

export interface SheetTable {
  /** 시트 이름. 엑셀이 금지하는 글자는 알아서 걸러낸다. */
  name: string;
  /** 첫 줄은 머리글로 쓴다. */
  rows: Array<Array<string | number | null | undefined>>;
}

// ── CSV ──────────────────────────────────────────────────────
const csvCell = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // 쉼표·따옴표·줄바꿈이 있으면 감싸고, 안의 따옴표는 두 번 쓴다.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: SheetTable['rows']): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인 Blob 을 만든다. */
export function csvBlob(rows: SheetTable['rows']): Blob {
  return new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
}

// ── ZIP (무압축) ─────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * 무압축 ZIP 을 만든다.
 * xlsx 는 압축을 요구하지 않는다 — deflate 없이도 엑셀이 연다.
 */
export function makeZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) =>
    new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  const cat = (parts: Uint8Array[]) => {
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);

    const local = cat([
      u32(0x04034b50),      // 로컬 헤더 서명
      u16(20), u16(0),      // 버전 / 플래그
      u16(0),               // 압축 방식 0 = stored
      u16(0), u16(0),       // 시각 / 날짜 (0 으로 둔다 — 재현 가능한 파일이 된다)
      u32(crc), u32(e.data.length), u32(e.data.length),
      u16(nameBytes.length), u16(0),
      nameBytes,
    ]);
    chunks.push(local, e.data);

    central.push(cat([
      u32(0x02014b50),
      u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(e.data.length), u32(e.data.length),
      u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]));

    offset += local.length + e.data.length;
  }

  const dir = cat(central);
  const end = cat([
    u32(0x06054b50),
    u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(dir.length), u32(offset),
    u16(0),
  ]);

  return cat([...chunks, dir, end]);
}

// ── XLSX ─────────────────────────────────────────────────────
const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A, B, … Z, AA, AB … */
export function columnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** 엑셀 시트 이름 규칙: 31자 이하, : \ / ? * [ ] 금지 */
export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, ' ').trim();
  return (cleaned || 'Sheet1').slice(0, 31);
}

function sheetXml(rows: SheetTable['rows']): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v === null || v === undefined || v === '') return '';
          const ref = `${columnName(c)}${r + 1}`;
          if (typeof v === 'number' && Number.isFinite(v)) {
            return `<c r="${ref}"><v>${v}</v></c>`;
          }
          // 문자열은 sharedStrings 없이 inlineStr 로 넣는다 — 파일이 단순해진다.
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** 여러 시트를 담은 .xlsx 바이트를 만든다. */
export function xlsxBytes(sheets: SheetTable[]): Uint8Array {
  const enc = new TextEncoder();
  const list = sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [] }];

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    list
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    `</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list
    .map((s, i) => `<sheet name="${xmlEscape(safeSheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join('')}</Relationships>`;

  return makeZip([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    ...list.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: enc.encode(sheetXml(s.rows)),
    })),
  ]);
}

export function xlsxBlob(sheets: SheetTable[]): Blob {
  const bytes = xlsxBytes(sheets);
  // ArrayBuffer 로 잘라 넘겨야 SharedArrayBuffer 타입 문제가 없다.
  return new Blob([bytes.slice().buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ── 내려받기 ─────────────────────────────────────────────────
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 즉시 해제하면 사파리에서 내려받기가 끊긴다.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 파일명에 못 쓰는 글자를 걸러낸다. */
export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim();

export function downloadCsv(rows: SheetTable['rows'], filename: string): void {
  downloadBlob(csvBlob(rows), `${safeFileName(filename)}.csv`);
}

export function downloadXlsx(sheets: SheetTable[], filename: string): void {
  downloadBlob(xlsxBlob(sheets), `${safeFileName(filename)}.xlsx`);
}

// ── PDF (인쇄) ───────────────────────────────────────────────
/**
 * 표를 인쇄 창으로 띄운다. 사용자가 "대상: PDF로 저장"을 고르면 PDF 가 된다.
 *
 * 새 창에 표만 그려서 띄운다 — 화면의 메뉴·버튼이 같이 인쇄되지 않게 하려는 것이다.
 * 팝업이 막혀 있으면 false 를 돌려주니 화면에서 안내해 줄 것.
 */
export function printTable(title: string, sheets: SheetTable[]): boolean {
  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) return false;

  const tables = sheets
    .map((s) => {
      const [head, ...body] = s.rows;
      const thead = head
        ? `<thead><tr>${head.map((h) => `<th>${xmlEscape(String(h ?? ''))}</th>`).join('')}</tr></thead>`
        : '';
      const tbody = `<tbody>${body
        .map((r) => `<tr>${r.map((c) => `<td>${xmlEscape(String(c ?? ''))}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      return `<h2>${xmlEscape(s.name)}</h2><table>${thead}${tbody}</table>`;
    })
    .join('');

  win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${xmlEscape(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: 'Malgun Gothic', 'Pretendard', sans-serif; color: #16202B; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  .meta { font-size: 11px; color: #5B6B7C; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #D9E0E8; padding: 4px 6px; text-align: left; }
  th { background: #EDF1F5; }
  tr { break-inside: avoid; }
</style></head><body>
<h1>${xmlEscape(title)}</h1>
<div class="meta">인쇄 창에서 <b>대상</b>을 <b>PDF로 저장</b>으로 바꾸면 PDF 파일이 됩니다.</div>
${tables}
</body></html>`);
  win.document.close();
  win.focus();
  // 글꼴이 자리를 잡은 뒤 인쇄 창을 띄운다.
  setTimeout(() => win.print(), 300);
  return true;
}
