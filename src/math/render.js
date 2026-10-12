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
//   {{key|語句}}   キー付きの重要語句（赤太字。ステップで隠す・表示・強調できる）
//   [[key|語句]]   キー付きの語句（見た目は通常の文字。強調の対象にするだけ）
//   改行           <br>
// {{ }} と [[ ]] の中には数式（$...$）を入れてもよい。
export function inlineToHtml(text) {
  const src = Array.isArray(text) ? text.join('\n') : String(text ?? '');
  const { marked, opens, closes } = markKeyedSpans(src);
  return marked
    .split('$')
    .map((part, i) => {
      if (i % 2 === 1) return texToHtml(part);
      return escapeHtml(part).replace(/\n/g, '<br>');
    })
    .join('')
    .replace(/\u0001(\d+)\u0003/g, (_, n) => opens[n])
    .replace(/\u0002(\d+)\u0003/g, (_, n) => closes[n]);
}

// {{key|…}} / [[key|…]] / **…** / __…__ を、数式の外側だけで探して目印の文字に置き換える。
// 数式の中の「}}」（例 \frac{1}{4}}）を閉じ記号と取り違えないよう、$ の内外を数えながら読む。
// これにより、どの書式の中にも数式を入れられる。
function markKeyedSpans(src) {
  const opens = [];
  const closes = [];
  const closers = [];
  const toggles = { '**': ['<strong class="kw">', '</strong>'], __: ['<u>', '</u>'] };
  const toggled = { '**': false, __: false };
  let out = '';
  let inMath = false;
  const open = (html) => {
    opens.push(html);
    return `\u0001${opens.length - 1}\u0003`;
  };
  const close = (html) => {
    closes.push(html);
    return `\u0002${closes.length - 1}\u0003`;
  };
  for (let i = 0; i < src.length; ) {
    const ch = src[i];
    if (ch === '$') {
      inMath = !inMath;
      out += ch;
      i++;
      continue;
    }
    if (!inMath) {
      const t = src.startsWith('**', i) ? '**' : src.startsWith('__', i) ? '__' : null;
      if (t) {
        out += toggled[t] ? close(toggles[t][1]) : open(toggles[t][0]);
        toggled[t] = !toggled[t];
        i += 2;
        continue;
      }
      const m = /^(\{\{|\[\[)([A-Za-z0-9_-]+)\|/.exec(src.slice(i, i + 80));
      if (m) {
        const kw = m[1] === '{{';
        out += open(`<span class="kspan ${kw ? 'kw ' : ''}k-${m[2]}">`);
        closers.push(kw ? '}}' : ']]');
        i += m[0].length;
        continue;
      }
      const closer = closers[closers.length - 1];
      if (closer && src.startsWith(closer, i)) {
        closers.pop();
        out += close('</span>');
        i += 2;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return { marked: out, opens, closes };
}
