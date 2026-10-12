// 教材データの検証スクリプト（npm run validate / ビルド時に自動実行）
//
//  - 必須項目・ID重複・教材年度情報のチェック
//  - すべての数式を KaTeX で描画できるか
//  - ステップが参照するキー／ブロックIDが存在するか
//  - check に登録した方程式・途中式が、正答で実際に成り立つか（数値検算）
//  - check.identities の式変形（整数倍・符号の処理など）が、どんな値でも成り立つか
//  - 画面に表示される式（math / calc / answer ブロック）の各行が、正答で成り立つか
//
// AIや手作業で作成したデータは、このスクリプトと目視の両方で確認してから登録する。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import katex from 'katex';
import { KATEX_OPTIONS, keysInTex } from '../src/math/katex-config.js';

const DATA_DIR = new URL('../src/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BLOCK_TYPES = new Set(['text', 'math', 'callout', 'answer', 'pointbox', 'title-card', 'calc']);
const CONTENT_TYPES = new Set(['title', 'point', 'exercise', 'similar', 'advanced', 'lab']);
const EMPHASIS_STYLES = new Set(['color', 'box', 'marker', 'strike', 'dim']);
const COLORS = new Set(['red', 'blue', 'green', 'orange', 'yellow']);
const AREAS = new Set(['top', 'left', 'right', 'full', 'bottom']);
const SOURCES = new Set(['material', 'draft']);

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const stats = { rows: 0, identities: 0, unparsed: [] };

// KaTeX はフォントに無い文字（①など）で警告を出すが、表示には影響しないので抑制する
const origWarn = console.warn;
console.warn = (...a) => { if (!String(a[0]).startsWith('No character metrics')) origWarn(...a); };

function renderTex(where, tex) {
  try {
    katex.renderToString(tex, { ...KATEX_OPTIONS, macros: { ...KATEX_OPTIONS.macros } });
  } catch (e) {
    err(where, `数式エラー: ${e.message}`);
  }
}

// 文章中の $...$ と {{key|...}} / [[key|...]] を処理
function checkText(where, text, keys) {
  const s = Array.isArray(text) ? text.join('\n') : String(text ?? '');
  const parts = s.split('$');
  if (parts.length % 2 === 0) err(where, `$ の数が奇数です: ${s}`);
  parts.forEach((p, i) => {
    if (i % 2 === 1) {
      renderTex(where, p);
      keysInTex(p).forEach((k) => keys.add(k));
    } else {
      for (const m of p.matchAll(/(?:\{\{|\[\[)([A-Za-z0-9_-]+)\|/g)) keys.add(m[1]);
    }
  });
}

function checkBlock(where, b, keys, blockIds) {
  if (!b.id) err(where, 'ブロックに id がありません');
  if (blockIds.has(b.id)) err(where, `ブロックID重複: ${b.id}`);
  blockIds.add(b.id);
  if (!BLOCK_TYPES.has(b.type)) err(where, `不明なブロック種別: ${b.type}`);
  if (b.area && !AREAS.has(b.area)) err(where, `不明な area: ${b.area}`);
  const w = `${where} [${b.id}]`;
  const local = new Set();
  if (b.tex) { renderTex(w, b.tex); keysInTex(b.tex).forEach((k) => local.add(k)); }
  if (b.text) checkText(w, b.text, local);
  if (b.title) checkText(w, b.title, local);
  if (b.type === 'answer' && !b.tex && !b.text) err(w, 'answer には tex か text が必要です');
  for (const it of b.items ?? []) {
    checkText(w, it.text, local);
    if (it.key) local.add(it.key);
  }
  if (b.type === 'calc') {
    if (!Array.isArray(b.rows) || !b.rows.length) err(w, 'calc には rows が必要です');
    for (const r of b.rows ?? []) {
      if (!Array.isArray(r.cells)) { err(w, 'calc の行に cells がありません'); continue; }
      if (r.key) local.add(r.key);
      if (r.label) checkText(w, r.label, local);
      if (r.op) checkText(w, r.op, local);
      for (const c of r.cells) {
        if (c && typeof c === 'object') checkText(w, c.text, local);
        else if (c) { renderTex(w, c); keysInTex(c).forEach((k) => local.add(k)); }
      }
    }
  }
  for (const k of b.hide ?? []) if (!local.has(k)) err(w, `hide のキー "${k}" がブロック内にありません`);
  local.forEach((k) => keys.add(k));
}

// ---- 数値検算 ----

// \cmd{...} の引数（波かっこの対応を考慮）を取り出す
function readGroup(s, i) {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return { body: s.slice(i + 1, j), end: j + 1 };
  }
  return null;
}

// \hl{key}{X} → X、\text{...} → 削除 のように、コマンドを展開する
function unwrap(s, cmd, transform) {
  let idx;
  while ((idx = s.indexOf(cmd + '{')) !== -1) {
    const args = [];
    let pos = idx + cmd.length;
    const n = transform.length;
    for (let k = 0; k < n; k++) {
      const g = readGroup(s, pos);
      if (!g) return s;
      args.push(g.body);
      pos = g.end;
    }
    s = s.slice(0, idx) + transform(...args) + s.slice(pos);
  }
  return s;
}

// 表示用の LaTeX を計算式に変換する（変換できない場合は null）
export function texToExpr(tex) {
  let s = String(tex);
  s = unwrap(s, '\\hl', (_k, x) => x);
  s = unwrap(s, '\\text', (_x) => '');
  s = unwrap(s, '\\frac', (a, b) => `((${a})/(${b}))`);
  s = s
    .replace(/\\(ok|ng|cdots|ldots|quad|qquad|downarrow|left|right)\b/g, '')
    .replace(/\\mkern\d+mu/g, '')
    .replace(/\\[!,;: ]/g, '')
    .replace(/\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\cdot/g, '*')
    .replace(/−/g, '-')
    .replace(/\{\}/g, '')
    .replace(/[{]/g, '(')
    .replace(/[}]/g, ')')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, '');
  if (/\\/.test(s) || !/^[0-9a-z+\-*/().=]*$/.test(s)) return null;
  // 暗黙のかけ算：2x → 2*x, 3(…) → 3*(…), )( → )*(
  s = s.replace(/([0-9a-z)])(?=[a-z(])/g, '$1*').replace(/\)(?=[0-9])/g, ')*');
  return s;
}

function evalChain(expr, sol) {
  const parts = expr.split('=');
  const names = Object.keys(sol);
  const vals = parts.map((p) => new Function(...names, `return (${p});`)(...names.map((n) => sol[n])));
  return vals.every((v) => Math.abs(v - vals[0]) < 1e-9);
}

function verifyRow(where, tex, sol) {
  const expr = texToExpr(tex);
  if (expr === null) {
    stats.unparsed.push(`${where}: ${tex}`);
    return;
  }
  if (!expr.includes('=')) return;
  try {
    if (!evalChain(expr, sol)) err(where, `表示式が正答 ${JSON.stringify(sol)} で成り立ちません: ${tex}`);
    stats.rows++;
  } catch (e) {
    stats.unparsed.push(`${where}: ${tex} (${e.message})`);
  }
}

// 表示ブロックの各行を検算する
function verifyBlock(where, b, sol) {
  if (b.verify === false) return;
  const w = `${where} [${b.id}]`;
  if ((b.type === 'math' || b.type === 'answer') && b.tex) {
    const body = b.tex
      .replace(/\\begin\{array\}\{[^}]*\}|\\begin\{(cases|aligned)\}|\\end\{(array|cases|aligned)\}|\\hline/g, '');
    for (const row of body.split('\\\\')) verifyRow(w, row.replace(/&/g, ''), sol);
  }
  if (b.type === 'calc') {
    for (const r of b.rows) {
      if (r.note || r.head) continue;
      const cells = r.cells.map((c) => (typeof c === 'string' ? c : ''));
      // 「=」だけのセルがある行は1つの式、そうでなければセルごとの式として扱う
      if (cells.includes('=')) verifyRow(w, cells.join(' '), sol);
      else cells.filter((c) => c.includes('=')).forEach((c) => verifyRow(w, c, sol));
    }
  }
}

// 1次方程式の文字列（例 "2*x-3*y=1"）を解で評価する
function holds(eq, sol) {
  return evalChain(eq, sol);
}

function checkTeacherEntry(where, v) {
  if (v && typeof v === 'object') {
    if (!SOURCES.has(v.source)) err(where, `source は material か draft にしてください: ${v.source}`);
    checkText(where, v.text, new Set());
  } else if (v) checkText(where, v, new Set());
}

function checkContent(file, c, ids, catalog) {
  const where = `${file} ${c.id ?? '(id無し)'}`;
  for (const f of ['id', 'type', 'title', 'editions', 'statement', 'steps']) {
    if (c[f] === undefined) err(where, `必須項目 ${f} がありません`);
  }
  if (!CONTENT_TYPES.has(c.type)) err(where, `不明なコンテンツ種別: ${c.type}`);
  if (/p\d|page/i.test(c.id ?? '')) err(where, 'コンテンツIDにページ番号を含めないでください');
  const editionKeys = Object.keys(c.editions ?? {});
  for (const ed of editionKeys) {
    if (!catalog.editions.includes(ed)) err(where, `catalog に無い年度: ${ed}`);
    if (typeof c.editions[ed].page !== 'number') err(where, `${ed}年度の page がありません`);
  }
  const idKey = `${c.id}@${editionKeys.join(',')}`;
  if (ids.has(idKey)) err(where, 'コンテンツIDと年度の組が重複しています');
  ids.add(idKey);

  const keys = new Set();
  const blockIds = new Set();
  const allBlocks = [...(c.statement ?? []), ...(c.steps ?? []).flatMap((s) => s.add ?? [])];
  (c.statement ?? []).forEach((b) => checkBlock(where, b, keys, blockIds));
  (c.steps ?? []).forEach((s) => (s.add ?? []).forEach((b) => checkBlock(`${where} step:${s.id}`, b, keys, blockIds)));

  const hidden = new Set();
  allBlocks.forEach((b) => (b.hide ?? []).forEach((k) => hidden.add(k)));
  const revealed = new Set();
  const stepIds = new Set();
  (c.steps ?? []).forEach((s, i) => {
    const w = `${where} step:${s.id ?? i + 1}`;
    if (!s.id) err(w, 'ステップに id がありません');
    if (stepIds.has(s.id)) err(w, 'ステップID重複');
    stepIds.add(s.id);
    if (!s.title) err(w, 'ステップに title がありません');
    else checkText(w, s.title, new Set());
    if (s.comment) checkText(w, s.comment, new Set());
    if (s.teacherNote) checkTeacherEntry(w, s.teacherNote);
    for (const e of s.emphasis ?? []) {
      if (!keys.has(e.key)) err(w, `強調キー "${e.key}" がどの数式・文章にもありません`);
      if (!EMPHASIS_STYLES.has(e.style)) err(w, `不明な強調スタイル: ${e.style}`);
      if (e.color && !COLORS.has(e.color)) err(w, `不明な色: ${e.color}`);
    }
    for (const k of s.reveal ?? []) {
      if (!hidden.has(k)) err(w, `reveal のキー "${k}" は hide されていません`);
      revealed.add(k);
    }
    for (const a of s.arrows ?? []) {
      if (!keys.has(a.from) || !keys.has(a.to)) err(w, `矢印のキーがありません: ${a.from} → ${a.to}`);
    }
    for (const id of s.remove ?? []) if (!blockIds.has(id)) err(w, `remove のブロック "${id}" がありません`);
  });
  hidden.forEach((k) => { if (!revealed.has(k)) err(where, `hide したキー "${k}" がどのステップでも表示されません`); });

  (c.hints ?? []).forEach((h, i) => checkText(`${where} hint${i + 1}`, h, new Set()));
  const t = c.teacher ?? {};
  if (t.status && t.status !== 'draft') err(where, `teacher.status は draft のみ指定できます: ${t.status}`);
  for (const v of [t.aim, ...[].concat(t.notes ?? []), ...(t.questions ?? []), ...(t.pitfalls ?? []), ...(t.commonErrors ?? []), ...(t.procedure ?? [])]) {
    checkTeacherEntry(`${where} teacher`, v);
  }
  if (c.answer?.tex) renderTex(`${where} answer`, c.answer.tex);
  if (c.edition?.ref) checkText(`${where} ref`, c.edition.ref, new Set());

  if (c.type === 'exercise' && !c.check) err(where, '問題には検算用の check を登録してください');
  if (c.check) {
    const sol = c.check.solution;
    for (const eq of [...(c.check.equations ?? []), ...(c.check.derived ?? [])]) {
      try {
        if (!holds(eq, sol)) err(where, `検算NG: ${eq} は解 ${JSON.stringify(sol)} で成り立ちません`);
      } catch (e) {
        err(where, `検算式を評価できません: ${eq} (${e.message})`);
      }
    }
    // 連立方程式の解が1つに定まること（係数の行列式が0でない）を、解以外の点で式が崩れることで確認
    for (const bad of c.check.nonSolutions ?? []) {
      const ok = (c.check.equations ?? []).every((eq) => holds(eq, bad));
      if (ok) err(where, `nonSolutions の ${JSON.stringify(bad)} がすべての式を満たしています`);
    }
    // 式変形の恒等式：x, y にいろいろな値を入れても成り立つか
    for (const id of c.check.identities ?? []) {
      for (let i = 0; i < 6; i++) {
        const pt = Object.fromEntries(Object.keys(sol).map((n) => [n, Math.floor(Math.random() * 19) - 9 || 1]));
        try {
          if (!holds(id, pt)) {
            err(where, `恒等式NG: ${id} は ${JSON.stringify(pt)} で成り立ちません`);
            break;
          }
        } catch (e) {
          err(where, `恒等式を評価できません: ${id} (${e.message})`);
          break;
        }
      }
      stats.identities++;
    }
    if (c.answer?.values && JSON.stringify(c.answer.values) !== JSON.stringify(sol)) {
      err(where, 'answer.values と check.solution が一致しません');
    }
    // 画面に表示される式を検算
    allBlocks.forEach((b) => verifyBlock(where, b, sol));
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const catalog = JSON.parse(readFileSync(join(DATA_DIR, 'catalog.json'), 'utf8'));
const referenced = new Set();
for (const g of catalog.grades) {
  for (const ch of g.chapters) {
    for (const s of ch.sections) {
      if (s.data) referenced.add(s.data);
      for (const ed of catalog.editions) {
        if (typeof s.pages?.[ed] !== 'number') err(`catalog ${g.id}/${ch.id}/${s.id}`, `${ed}年度のページがありません`);
      }
    }
  }
}

const ids = new Set();
const files = walk(DATA_DIR).filter((p) => p.endsWith('.json') && !p.endsWith('catalog.json'));
let count = 0;
for (const p of files) {
  const rel = relative(DATA_DIR, p).replace(/\\/g, '/');
  const key = rel.replace(/\.json$/, '');
  if (!referenced.has(key)) err(rel, 'catalog.json から参照されていません');
  referenced.delete(key);
  let unit;
  try {
    unit = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    err(rel, `JSON構文エラー: ${e.message}`);
    continue;
  }
  for (const c of unit.contents ?? []) {
    // アプリと同じく、年度ごとの掲載情報を edition として参照できるようにする
    checkContent(rel, { ...c, edition: Object.values(c.editions ?? {})[0] }, ids, catalog);
    count++;
  }
}
referenced.forEach((k) => err('catalog.json', `データファイル ${k}.json がありません`));

if (stats.unparsed.length) {
  console.log(`\n自動検算できなかった表示式（目視で確認してください）: ${stats.unparsed.length} 件`);
  stats.unparsed.forEach((u) => console.log(' - ' + u));
}
if (errors.length) {
  console.error(`\n教材データの検証で ${errors.length} 件の問題が見つかりました:\n`);
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}
console.log(
  `教材データ検証OK（${files.length} ファイル / ${count} コンテンツ / 表示式の検算 ${stats.rows} 行 / 恒等式 ${stats.identities} 件）`,
);
