import type { RecordDraft } from './chain';

export type ArtTheme = RecordDraft['theme'];
const palettes = {
  blue: { page: '#e9f0ff', ink: '#152c72', line: '#4775ee', accent: '#c9d8ff' },
  green: { page: '#e3f3e7', ink: '#145b4a', line: '#27896c', accent: '#bce4d2' },
  pink: { page: '#fae9ef', ink: '#743d60', line: '#bd739f', accent: '#f1cbdc' },
};

export function artSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function contourPaths(seed: number, width = 600, height = 600): string[] {
  const cx = width * (0.53 + ((seed % 19) - 9) / 180);
  const cy = height * (0.61 + (((seed >>> 5) % 23) - 11) / 200);
  const phase = (seed % 1000) / 1000 * Math.PI * 2;
  return Array.from({ length: 20 }, (_, n) => {
    const radius = 28 + n * 18;
    const points = Array.from({ length: 81 }, (_, i) => {
      const a = i / 80 * Math.PI * 2;
      const wave = Math.sin(a * 3 + phase + n * 0.15) * (5 + n * .36)
        + Math.cos(a * 5 - phase * .6) * (2 + n * .18);
      const x = cx + Math.cos(a) * (radius + wave);
      const y = cy + Math.sin(a) * (radius * .79 + wave);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    return `${points.join(' ')} Z`;
  });
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
}

function wrapText(text: string, maxChars = 25): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const chunks = word.match(new RegExp(`.{1,${maxChars}}`, 'gu')) || [word];
    for (const chunk of chunks) {
      if (!lines.length || `${lines[lines.length - 1]} ${chunk}`.length > maxChars) lines.push(chunk);
      else lines[lines.length - 1] += ` ${chunk}`;
    }
  }
  return lines;
}

export function createRecordSvg(draft: RecordDraft, mint?: string): string {
  const colors = palettes[draft.theme];
  const seed = artSeed(`${draft.kind}:${draft.statement}:${mint || ''}`);
  const paths = contourPaths(seed, 840, 840);
  const lines = wrapText(draft.statement, 29);
  const fontSize = lines.length > 7 ? 33 : lines.length > 5 ? 41 : lines.length > 3 ? 50 : lines.length > 2 ? 58 : 68;
  const statement = lines.map((line, i) => `<tspan x="70" dy="${i ? 1.13 : 0}em">${escapeXml(line)}</tspan>`).join('');
  const proof = mint ? `MINT ${escapeXml(mint)}` : 'UNSIGNED DRAFT';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 1080" role="img" aria-label="BEFORE statement card"><rect width="840" height="1080" rx="28" fill="${colors.page}"/><defs><clipPath id="art"><rect x="0" y="0" width="840" height="1080" rx="28"/></clipPath></defs><g clip-path="url(#art)"><g fill="none" stroke="${colors.line}" stroke-width="2" opacity=".42">${paths.map(p => `<path d="${p}"/>`).join('')}</g><rect x="45" y="45" width="750" height="990" rx="17" fill="none" stroke="${colors.ink}" opacity=".16"/><text x="70" y="104" fill="${colors.ink}" font-family="Archivo,Arial,sans-serif" font-size="32" font-weight="900" letter-spacing="-1">BEFORE<span font-size="20" baseline-shift="super">®</span></text><text x="70" y="173" fill="${colors.ink}" font-family="Arial,sans-serif" font-size="17" font-weight="700" letter-spacing="3">${draft.kind.toUpperCase()}</text><rect x="45" y="254" width="750" height="444" rx="18" fill="${colors.page}" opacity=".82"/><text x="70" y="335" fill="${colors.ink}" font-family="Archivo,Arial,sans-serif" font-size="${fontSize}" font-weight="800" letter-spacing="-2">${statement}</text><line x1="70" y1="922" x2="770" y2="922" stroke="${colors.ink}" opacity=".3"/><text x="70" y="964" fill="${colors.ink}" font-family="Arial,sans-serif" font-size="17" font-weight="700" letter-spacing="2">ONE STATEMENT. ONE TOKEN.</text><text x="70" y="1003" fill="${colors.ink}" font-family="Arial,sans-serif" font-size="14">${proof}</text></g></svg>`;
}

export function downloadRecordSvg(draft: RecordDraft, mint?: string): void {
  const blob = new Blob([createRecordSvg(draft, mint)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `before-${mint ? mint.slice(0, 8) : 'draft'}.svg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
