import katex from 'katex';
import 'katex/dist/katex.min.css';
import { KATEX_OPTIONS } from './katex-config.js';

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function texToHtml(tex, displayMode = false) {
  try {
    return katex.renderToString(tex, { ...KATEX_OPTIONS, macros: { ...KATEX_OPTIONS.macros }, displayMode });
  } catch (e) {
    console.error(e);
    return `<span class="tex-error" title="${escapeHtml(e.message)}">${escapeHtml(tex)}</span>`;
  }
}

// 教材の文章を HTML に変換する。使える書式：
//   $...$          インライン数式
//   **語句**       重要語句（赤太字）
//   __語句__       下線
//   {{key|語句}}   キー付きの重要語句（ステップで隠す・表示・強調できる）
//   改行           <br>
export function inlineToHtml(text) {
  const src = Array.isArray(text) ? text.join('\n') : String(text ?? '');
  return src
    .split('$')
    .map((part, i) => {
      if (i % 2 === 1) return texToHtml(part);
      return escapeHtml(part)
        .replace(/\{\{([A-Za-z0-9_-]+)\|(.+?)\}\}/g, '<span class="kw k-$1">$2</span>')
        .replace(/\*\*(.+?)\*\*/g, '<strong class="kw">$1</strong>')
        .replace(/__(.+?)__/g, '<u>$1</u>')
        .replace(/\n/g, '<br>');
    })
    .join('');
}
