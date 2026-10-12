// KaTeX の共通設定。アプリ本体と scripts/validate-data.mjs の両方から読み込む。
//
// 教材データ内の数式では、強調・段階表示の対象となる部分に「キー」を付ける。
//   \hl{key}{3y}     … 項 3y にキー key を付ける
//   x\hl{key}{+3y}   … 符号ごと「+3y」にキーを付ける（演算子の前後の空白は通常どおり入る）
// キーを付けた部分は、ステップの emphasis（強調）や reveal（表示）の対象にできる。
// 筆算（calc ブロック）のセルで符号付きの項を書くときは {}-6y のように {} を前に置く
// （2項演算子として扱われ、符号の前後に通常の空白が入る）。
//   \ok / \ng        … 判定の ○ / ×
//   \tc{blue}{x}     … 文字の色（文章題で「x の品物＝青」のように、表・イラストと色をそろえる。強調ではない常時の色）

export const KATEX_MACROS = {
  '\\hl': '\\htmlClass{k-#1}{#2}',
  '\\ok': '\\htmlClass{mark-ok}{\\bigcirc}',
  '\\ng': '\\htmlClass{mark-ng}{\\times}',
  '\\tc': '\\htmlClass{tc-#1}{#2}',
};

export const KATEX_OPTIONS = {
  throwOnError: true,
  strict: 'ignore',
  output: 'html',
  macros: KATEX_MACROS,
  // \htmlClass のみ許可する（教材データ由来の任意HTMLは許可しない）
  trust: (ctx) => ctx.command === '\\htmlClass',
};

// 数式中に現れるキーを列挙する（検証用）
export function keysInTex(tex) {
  const keys = [];
  const re = /\\hl\{([A-Za-z0-9_-]+)\}/g;
  let m;
  while ((m = re.exec(tex))) keys.push(m[1]);
  return keys;
}
