/** 아주 단순한 인자 파서. 식별자는 절대 하드코딩하지 않고 여기로 주입한다. */
export function parseArgs(argv = process.argv.slice(2)): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

export function requireArg(args: Record<string, string | boolean>, name: string, fallback?: string): string {
  const v = args[name] ?? fallback;
  if (typeof v !== 'string' || v === '') {
    throw new Error(`--${name} 인자가 필요합니다. (또는 .env 에 설정하세요)`);
  }
  return v;
}
