// 教材データの検証スクリプト（npm run validate / ビルド時に自動実行）
//
//  - 必須項目・ID重複・教材年度情報のチェック
//  - すべての数式を KaTeX で描画できるか
//  - ステップが参照するキー／ブロックIDが存在するか
//  - check に登録した方程式が、正答で実際に成り立つか（数値検算）
//
// AIや手作業で作成したデータは、このスクリプトと目視の両方で確認してから登録する。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import katex from 'katex';
import { KATEX_OPTIONS, keysInTex } from '../src/math/katex-config.js';

const DATA_DIR = new URL('../src/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BLOCK_TYPES = new Set(['text', 'math', 'callout', 'answer', 'pointbox', 'title-card']);
const CONTENT_TYPES = new Set(['title', 'point', 'exercise', 'similar', 'advanced', 'lab']);
const EMPHASIS_STYLES = new Set(['color', 'box', 'marker', 'strike', 'dim']);
const COLORS = new Set(['red', 'blue', 'green', 'orange', 'yellow']);
const AREAS = new Set(['top', 'left', 'right', 'bottom']);

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

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

// 文章中の $...$ と {{key|...}} を処理
function checkText(where, text, keys) {
  const s = Array.isArray(text) ? text.join('\n') : String(text ?? '');
  const parts = s.split('$');
  if (parts.length % 2 === 0) err(where, `$ の数が奇数です: ${s}`);
  parts.forEach((p, i) => {
    if (i % 2 === 1) {
      renderTex(where, p);
      keysInTex(p).forEach((k) => keys.add(k));
    } else {
      for (const m of p.matchAll(/\{\{([A-Za-z0-9_-]+)\|/g)) keys.add(m[1]);
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
  (b.items ?? []).forEach((it) => checkText(w, it.text, local));
  for (const k of b.hide ?? []) if (!local.has(k)) err(w, `hide のキー "${k}" がブロック内にありません`);
  local.forEach((k) => keys.add(k));
}

// 1次方程式の文字列（例 "2*x-3*y=1"）を解で評価する
function holds(eq, sol) {
  const [l, r] = eq.split('=');
  if (r === undefined) return false;
  const names = Object.keys(sol);
  const f = new Function(...names, `return [(${l}), (${r})];`);
  const [a, b] = f(...names.map((n) => sol[n]));
  return Math.abs(a - b) < 1e-9;
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
  (c.statement ?? []).forEach((b) => checkBlock(where, b, keys, blockIds));
  (c.steps ?? []).forEach((s) => (s.add ?? []).forEach((b) => checkBlock(`${where} step:${s.id}`, b, keys, blockIds)));

  const hidden = new Set();
  [...(c.statement ?? []), ...(c.steps ?? []).flatMap((s) => s.add ?? [])].forEach((b) => (b.hide ?? []).forEach((k) => hidden.add(k)));
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
    if (s.teacherNote) checkText(w, s.teacherNote, new Set());
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
  for (const v of [t.aim, t.notes, ...(t.questions ?? []), ...(t.pitfalls ?? []), ...(t.commonErrors ?? []), ...(t.procedure ?? [])]) {
    if (v) checkText(`${where} teacher`, v, new Set());
  }
  if (c.answer?.tex) renderTex(`${where} answer`, c.answer.tex);

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
    if (c.answer?.values && JSON.stringify(c.answer.values) !== JSON.stringify(sol)) {
      err(where, 'answer.values と check.solution が一致しません');
    }
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
    checkContent(rel, c, ids, catalog);
    count++;
  }
}
referenced.forEach((k) => err('catalog.json', `データファイル ${k}.json がありません`));

if (errors.length) {
  console.error(`\n教材データの検証で ${errors.length} 件の問題が見つかりました:\n`);
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}
console.log(`教材データ検証OK（${files.length} ファイル / ${count} コンテンツ）`);
