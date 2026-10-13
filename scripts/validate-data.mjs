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

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import katex from 'katex';
import { KATEX_OPTIONS, keysInTex } from '../src/math/katex-config.js';
import { routeTimeline, firstCoincidence, dirsOf } from '../src/lesson/motion.js';

const DATA_DIR = new URL('../src/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const BLOCK_TYPES = new Set(['text', 'math', 'callout', 'answer', 'pointbox', 'title-card', 'calc', 'image', 'table', 'illust', 'place', 'bars', 'route', 'circle', 'ratio', 'beakers']);
const PUBLIC_DIR = new URL('../public/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
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

// JSON の書き方のミス（"\\times" を "\times" と書くとタブ文字になる など）を見つける
const CONTROL = /[\u0000-\u0009\u000b-\u001f]/;

function renderTex(where, tex) {
  if (CONTROL.test(tex)) err(where, `数式に制御文字（タブなど）が入っています。\\ の書き忘れでは？: ${JSON.stringify(tex)}`);
  try {
    katex.renderToString(tex, { ...KATEX_OPTIONS, macros: { ...KATEX_OPTIONS.macros } });
  } catch (e) {
    err(where, `数式エラー: ${e.message}`);
  }
}

// 文章中の $...$ と {{key|...}} / [[key|...]] を処理
function checkText(where, text, keys) {
  const s = Array.isArray(text) ? text.join('\n') : String(text ?? '');
  if (CONTROL.test(s)) err(where, `文章に制御文字（タブなど）が入っています。\\ の書き忘れでは？: ${JSON.stringify(s)}`);
  const parts = s.split('$');
  if (parts.length % 2 === 0) err(where, `$ の数が奇数です: ${s}`);
  // {{key|…}} / [[key|…]] の開き・閉じが数式の外側でそろっているか（中に数式があってもよい）
  const outside = parts.filter((_, i) => i % 2 === 0).join(' ');
  const opensKw = (outside.match(/\{\{[A-Za-z0-9_-]+\|/g) ?? []).length;
  const opensK = (outside.match(/\[\[[A-Za-z0-9_-]+\|/g) ?? []).length;
  if (opensKw !== (outside.match(/\}\}/g) ?? []).length) err(where, `{{ }} の対応がとれていません: ${s}`);
  if (opensK !== (outside.match(/\]\]/g) ?? []).length) err(where, `[[ ]] の対応がとれていません: ${s}`);
  if ((outside.match(/\*\*/g) ?? []).length % 2) err(where, `** の対応がとれていません: ${s}`);
  // 改行は JSON で "\n"。"\\n" と書くと「\n」の文字のまま表示される
  if (/\\n(?![a-z])/.test(outside)) err(where, `文章に「\\n」の文字が入っています。改行は JSON で "\\n"（バックスラッシュ1つ）と書きます: ${s}`);
  if ((outside.match(/__/g) ?? []).length % 2) err(where, `__ の対応がとれていません: ${s}`);
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
  if (b.type === 'image') {
    if (!b.src || !existsSync(join(PUBLIC_DIR, b.src))) err(w, `画像ファイルが public/ にありません: ${b.src}`);
    if (!b.alt) err(w, '画像には alt（説明文）を付けてください');
  }
  if (b.width !== undefined && !(Number(b.width) > 0)) err(w, `width は数値（px）で指定してください: ${b.width}`);
  if (b.type === 'illust') {
    if (!Array.isArray(b.items) || !b.items.length) err(w, 'illust には items が必要です');
    for (const it of b.items ?? []) {
      if (it.key) local.add(it.key);
      if (it.sep !== undefined) { checkText(w, it.sep, local); continue; }
      if (!it.asset || !existsSync(join(PUBLIC_DIR, 'illust', `${it.asset}.svg`))) err(w, `イラスト素材が public/illust/ にありません: ${it.asset}`);
      if (!it.name) err(w, 'イラストには name（品物の名前。画像の説明にもなる）を付けてください');
      else checkText(w, it.name, local);
      if (it.count !== undefined && !(Number.isInteger(it.count) && it.count > 0)) err(w, `count は1以上の整数にしてください: ${it.count}`);
      if (it.color && !COLORS.has(it.color)) err(w, `不明な色: ${it.color}`);
      for (const l of it.lines ?? []) checkText(w, l, local);
    }
  } else {
    for (const it of b.items ?? []) {
      checkText(w, it.text, local);
      if (it.key) local.add(it.key);
    }
  }
  if (b.states !== undefined) {
    if (!['place', 'bars', 'route', 'circle', 'ratio', 'beakers'].includes(b.type)) err(w, `states を持てるのは place / bars / route / circle / ratio / beakers ブロックだけです`);
    if (!Array.isArray(b.states) || !b.states.length) err(w, 'states が空です');
    const sids = new Set();
    for (const st of b.states ?? []) {
      if (!st.id || sids.has(st.id)) err(w, `状態の id がないか重複しています: ${st.id}`);
      sids.add(st.id);
    }
    if (b.state !== undefined && !sids.has(b.state)) err(w, `最初の状態 "${b.state}" が states にありません`);
  }
  if (b.type === 'place') {
    // 位取り表：位の数・カード・状態ごとの並び（入れかえ）と、表示する数・式の整合性
    const n = b.labels?.length ?? 0;
    if (!n) err(w, 'place には labels（位の名前）が必要です');
    (b.labels ?? []).forEach((l) => checkText(w, l, local));
    const cardIds = new Set((b.cards ?? []).map((c) => c.id));
    if (cardIds.size !== n || (b.cards ?? []).length !== n) err(w, `数字カードの数（${b.cards?.length}）が位の数（${n}）と一致しないか、id が重複しています`);
    for (const c of b.cards ?? []) {
      // label（文字）がないカードは、すべての状態で数（values）を持つこと
      if (c.label) renderTex(w, c.label);
      else if (!(b.states ?? []).every((st) => st.values?.[c.id] !== undefined)) err(w, `数字カード "${c.id}" に label も数（values）もない状態があります`);
      if (c.key) local.add(c.key);
      if (c.color && !COLORS.has(c.color)) err(w, `不明な色: ${c.color}`);
    }
    if (!b.states) err(w, 'place には states（カードの並びと式）が必要です');
    for (const st of b.states ?? []) {
      const ws = `${w} state:${st.id}`;
      if (!Array.isArray(st.order) || st.order.length !== n || new Set(st.order).size !== n || st.order.some((id) => !cardIds.has(id))) {
        err(ws, `order はカードの id を位の数だけ並べてください: ${JSON.stringify(st.order)}`);
        continue;
      }
      for (const [id, v] of Object.entries(st.values ?? {})) {
        if (!cardIds.has(id)) err(ws, `values のカード "${id}" がありません`);
        if (!/^[0-9]$/.test(String(v))) err(ws, `カードに入れる数は 0〜9 の1文字にしてください: ${v}`);
      }
      if (st.tex) {
        renderTex(ws, st.tex);
        keysInTex(st.tex).forEach((k) => local.add(k));
        // すべてのカードに数が入っているとき、式の右辺の数はカードを左から読んだ数と一致すること（74 → 入れかえて 47）
        const digits = st.order.map((id) => st.values?.[id]).join('');
        const rhs = st.tex.split('=').at(-1).trim();
        if (st.order.every((id) => st.values?.[id] !== undefined) && /^[0-9]+$/.test(rhs) && rhs !== digits) {
          err(ws, `カードの並び（${digits}）と式の数（${rhs}）が一致しません`);
        }
      }
    }
  }
  if (b.type === 'bars') {
    // ブロック図：全体・部分・まとまりの文章とキー。値（value）があれば「部分の和＝全体」を確かめる
    for (const st of [b, ...(b.states ?? [])]) {
      const ws = st === b ? w : `${w} state:${st.id}`;
      const total = st.total ?? b.total;
      const parts = st.parts ?? b.parts;
      const groups = st.groups ?? b.groups ?? [];
      if (!Array.isArray(parts) || !parts.length) { err(ws, 'bars には parts が必要です'); continue; }
      for (const o of [total, ...parts, ...groups].filter(Boolean)) {
        checkText(ws, o.text, local);
        if (o.key) local.add(o.key);
        if (o.color && !COLORS.has(o.color)) err(ws, `不明な色: ${o.color}`);
      }
      for (const g of groups) if (!(g.from >= 0 && g.to >= g.from && g.to < parts.length)) err(ws, `groups の範囲が parts の外です: ${g.from}〜${g.to}`);
      if (total?.value !== undefined && parts.every((p) => p.value !== undefined)) {
        const sum = parts.reduce((a, p) => a + p.value, 0);
        if (sum !== total.value) err(ws, `ブロックの和（${sum}）が全体（${total.value}）と一致しません`);
      }
    }
  }
  if (b.type === 'route') checkRoute(w, b, local);
  if (b.type === 'circle') checkCircle(w, b, local);
  if (b.type === 'ratio') checkRatio(w, b, local);
  if (b.type === 'beakers') checkBeakers(w, b, local);
  if (b.type === 'table') {
    if (!Array.isArray(b.rows) || !b.rows.length) err(w, 'table には rows が必要です');
    const width = b.head?.length ?? b.rows?.[0]?.cells?.length;
    const cellText = (c) => {
      const o = c && typeof c === 'object' ? c : { text: c ?? '' };
      if (o.key) local.add(o.key);
      if (o.color && !COLORS.has(o.color)) err(w, `不明な色: ${o.color}`);
      checkText(w, o.text, local);
    };
    (b.head ?? []).forEach(cellText);
    for (const r of b.rows ?? []) {
      if (!Array.isArray(r.cells)) { err(w, 'table の行に cells がありません'); continue; }
      if (r.cells.length !== width) err(w, `table の列の数がそろっていません（${r.cells.length} / ${width}）`);
      if (r.key) local.add(r.key);
      r.cells.forEach(cellText);
    }
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

// ---- 速さの図（線分図 route・円周移動図 circle） ----
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function checkRoute(w, b, local) {
  if (!b.icon || !existsSync(join(PUBLIC_DIR, 'illust', `${b.icon}.svg`))) {
    if (b.icon || (b.states ?? []).some((s) => s.motion)) err(w, `移動する人の絵が public/illust/ にありません: ${b.icon}`);
  }
  (b.points ?? []).forEach((p) => checkText(w, p.text, local));
  if (!b.states) err(w, 'route には states が必要です');
  for (const st of [b, ...(b.states ?? [])]) {
    const ws = st === b ? w : `${w} state:${st.id}`;
    const segs = st.segments ?? b.segments ?? [];
    if (segs.length + 1 !== (b.points ?? []).length) err(ws, `地点の数（${b.points?.length}）は区間の数（${segs.length}）より1つ多くしてください`);
    for (const o of [st.total ?? b.total, st.side ?? b.side, ...segs.flatMap((s) => [...asList(s.top), ...asList(s.bottom)])].filter(Boolean)) {
      checkText(ws, o.text, local);
      if (o.key) local.add(o.key);
    }
    segs.forEach((s) => s.key && local.add(s.key));
    if (st.note ?? b.note) checkText(ws, st.note ?? b.note, local);
    const m = st.motion;
    if (!m) continue;
    // 再生：区間ごとの道のり・速さが正の数で、図の長さ（w）が道のりに比例していること
    if (!Array.isArray(m.legs) || m.legs.length !== segs.length) { err(ws, 'motion.legs は区間と同じ数だけ必要です'); continue; }
    if (m.legs.some((l) => !(l.distance > 0 && l.speed > 0))) err(ws, 'motion.legs の distance・speed は正の数にしてください');
    for (const l of m.legs) if (l.icon && !existsSync(join(PUBLIC_DIR, 'illust', `${l.icon}.svg`))) err(ws, `区間の絵が public/illust/ にありません: ${l.icon}`);
    const ratio = Number(segs[0].w ?? 1) / m.legs[0].distance;
    if (segs.some((s, i) => !near(Number(s.w ?? 1) / m.legs[i].distance, ratio))) err(ws, '再生する図では、区間の長さ w を道のりに比例させてください（見た目の長さと移動が一致しない）');
    const tl = routeTimeline(m.legs);
    if (m.expect?.time !== undefined && !near(tl.total, m.expect.time)) err(ws, `移動にかかる時間 ${tl.total} が問題の ${m.expect.time} と一致しません`);
    if (m.expect?.distance !== undefined && !near(tl.distance, m.expect.distance)) err(ws, `道のりの合計 ${tl.distance} が問題の ${m.expect.distance} と一致しません`);
    if (!(m.secondsPerUnit > 0)) err(ws, 'motion.secondsPerUnit（1単位を何秒で再生するか）を正の数で指定してください');
  }
}

function checkCircle(w, b, local) {
  if (!(b.length > 0)) err(w, 'circle には length（1周の長さ）が必要です');
  if ((b.runners ?? []).length !== 2) err(w, 'circle の runners は2人にしてください');
  for (const r of b.runners ?? []) {
    if (!r.id || !r.name) err(w, '走る人には id と name が必要です');
    if (r.color && !COLORS.has(r.color)) err(w, `不明な色: ${r.color}`);
  }
  if (b.lengthLabel) { checkText(w, b.lengthLabel.text, local); if (b.lengthLabel.key) local.add(b.lengthLabel.key); }
  if (!b.states) err(w, 'circle には states が必要です');
  for (const st of b.states ?? []) {
    const ws = `${w} state:${st.id}`;
    if (!['opposite', 'same'].includes(st.mode)) err(ws, `mode は opposite（反対方向）か same（同じ方向）: ${st.mode}`);
    if (!['schematic', 'play'].includes(st.view)) err(ws, `view は schematic（模式図）か play（実際の数値で再生）: ${st.view}`);
    if (st.caption) checkText(ws, st.caption, local);
    for (const o of Object.values(st.labels ?? {})) { checkText(ws, o.text, local); if (o.key) local.add(o.key); }
    if (st.view === 'schematic' && !(st.frac > 0 && st.frac < 1)) err(ws, 'schematic の frac は 0 と 1 のあいだにしてください');
    if (st.view !== 'play') continue;
    // 実際の数値で再生：出会い（反対方向）・はじめての追いぬき（同じ方向）の時刻を、少しずつ時間を進めて確かめる
    const speeds = (b.runners ?? []).map((r) => st.speeds?.[r.id]);
    if (speeds.some((v) => !(v > 0))) { err(ws, 'play には全員の speeds（正の数）が必要です'); continue; }
    if (st.mode === 'same' && !(speeds[0] > speeds[1])) err(ws, '同じ方向で追いぬくのは1人目なので、1人目の方を速くしてください');
    const dirs = dirsOf(st.mode);
    const t = firstCoincidence({ length: b.length, runners: speeds.map((speed, i) => ({ speed, dir: dirs[i] })) });
    if (t === null || Math.abs(t - st.until) > 0.01) err(ws, `再生では ${t} ${st.timeUnit ?? ''}後に出会う（追いぬく）計算になり、until（${st.until}）と一致しません`);
    if (!(st.secondsPerUnit > 0)) err(ws, 'secondsPerUnit を正の数で指定してください');
  }
}

// ---- 割合の図（帯グラフ ratio・ビーカー図 beakers） ----
function checkRatio(w, b, local) {
  const max = Number(b.max ?? 120);
  if (!(max >= 100)) err(w, 'ratio の max（目盛りの最大％）は100以上にしてください');
  const ids = new Set();
  for (const r of b.rows ?? []) {
    if (!r.id || ids.has(r.id)) err(w, `帯の id がないか重複しています: ${r.id}`);
    ids.add(r.id);
    if (r.label) { checkText(w, r.label.text, local); if (r.label.key) local.add(r.label.key); }
    if (r.color && !COLORS.has(r.color)) err(w, `不明な色: ${r.color}`);
  }
  if (!b.states) err(w, 'ratio には states が必要です');
  if (b.note) checkText(w, b.note, local);
  for (const st of b.states ?? []) {
    const ws = `${w} state:${st.id}`;
    if (st.note) checkText(ws, st.note, local);
    for (const [id, s] of Object.entries(st.rows ?? {})) {
      if (!ids.has(id)) err(ws, `帯 "${id}" がありません`);
      const pct = Number(s.pct ?? 100);
      if (!(pct > 0 && pct <= max)) err(ws, `帯 "${id}" の割合 ${s.pct}％ が 0〜${max}％ の外です`);
      // 増減の割合 rate と、増減後の割合 pct の対応（8％増 → 108％）
      if (s.rate !== undefined && !near(pct, 100 * (1 + s.rate))) err(ws, `帯 "${id}"：rate ${s.rate} なら ${100 * (1 + s.rate)}％ のはずですが ${pct}％ です`);
      // 実際の量（before → after）があれば、after ＝ before × 割合
      if (s.before !== undefined && s.after !== undefined && !near(s.after, (s.before * pct) / 100)) err(ws, `帯 "${id}"：${s.before} の ${pct}％ は ${(s.before * pct) / 100} ですが after は ${s.after} です`);
      for (const o of [s.base, s.delta, s.result].filter(Boolean)) { checkText(ws, o.text, local); if (o.key) local.add(o.key); }
    }
  }
}

function checkBeakers(w, b, local) {
  const ids = new Set((b.items ?? []).map((it) => it.id));
  if (ids.size !== (b.items ?? []).length || !ids.size) err(w, 'beakers の items の id がないか重複しています');
  for (const it of b.items ?? []) {
    if (!it.name) err(w, 'ビーカーには name が必要です'); else checkText(w, it.name, local);
    if (it.color && !COLORS.has(it.color)) err(w, `不明な色: ${it.color}`);
  }
  if (b.note) checkText(w, b.note, local);
  if (!(Number(b.capacity ?? 600) > 0)) err(w, 'capacity は正の数にしてください');
  if (!b.states) err(w, 'beakers には states が必要です');
  for (const st of b.states ?? []) {
    const ws = `${w} state:${st.id}`;
    const S = st.items ?? {};
    for (const [id, s] of Object.entries(S)) {
      if (!ids.has(id)) err(ws, `ビーカー "${id}" がありません`);
      for (const o of [s.conc, s.water, s.saltText].filter(Boolean)) { checkText(ws, o.text, local); if (o.key) local.add(o.key); }
      if (s.pct !== undefined && !(s.pct > 0 && s.pct < 100)) err(ws, `濃度は 0〜100（％）で指定してください: ${s.pct}`);
      if (s.amount !== undefined && !(s.amount > 0)) err(ws, `食塩水の量は正の数にしてください: ${s.amount}`);
      if (s.amount !== undefined && s.amount > Number(b.capacity ?? 600)) err(ws, `食塩水の量 ${s.amount} がビーカーの目盛り capacity をこえています`);
      // 食塩 ＝ 食塩水 × 濃度
      if ([s.amount, s.pct, s.salt].every((v) => v !== undefined) && !near(s.salt, (s.amount * s.pct) / 100)) err(ws, `ビーカー "${id}"：${s.amount}g の ${s.pct}％ は ${(s.amount * s.pct) / 100}g ですが salt は ${s.salt} です`);
    }
    if (st.mix) {
      // 混ぜる前後で、食塩水の量・食塩の量の合計が変わらないこと。混ぜた後の濃度 ＝ 食塩 ÷ 食塩水
      const { from = [], to } = st.mix;
      if (![...from, to].every((id) => S[id]?.amount !== undefined && S[id]?.salt !== undefined)) { err(ws, 'mix の再生には、混ぜる前後すべてのビーカーの amount と salt が必要です'); continue; }
      const water = from.reduce((a, id) => a + S[id].amount, 0);
      const salt = from.reduce((a, id) => a + S[id].salt, 0);
      if (!near(water, S[to].amount)) err(ws, `食塩水の量の合計 ${water}g が混ぜた後の ${S[to].amount}g と一致しません`);
      if (!near(salt, S[to].salt)) err(ws, `食塩の量の合計 ${salt}g が混ぜた後の ${S[to].salt}g と一致しません`);
      if (S[to].pct !== undefined && !near(S[to].pct, (S[to].salt / S[to].amount) * 100)) err(ws, `混ぜた後の濃度 ${S[to].pct}％ が 食塩÷食塩水 ＝ ${(S[to].salt / S[to].amount) * 100}％ と一致しません`);
    }
  }
}

// 図の数値と正答の対応（vars：どの文字の値か）
function verifyMotion(w, b, sol) {
  if (b.type === 'route') {
    for (const st of b.states ?? []) {
      (st.motion?.legs ?? []).forEach((l, i) => {
        if (l.distanceVar && !near(l.distance, sol[l.distanceVar])) err(`${w} state:${st.id}`, `区間${i + 1}の道のり ${l.distance} が ${l.distanceVar}=${sol[l.distanceVar]} と一致しません`);
        if (l.timeVar && !near(l.distance / l.speed, sol[l.timeVar])) err(`${w} state:${st.id}`, `区間${i + 1}の時間 ${l.distance / l.speed} が ${l.timeVar}=${sol[l.timeVar]} と一致しません`);
      });
    }
  }
  if (b.type === 'beakers') {
    for (const st of b.states ?? []) {
      for (const [id, s] of Object.entries(st.items ?? {})) {
        if (s.amountVar && !near(s.amount, sol[s.amountVar])) err(`${w} state:${st.id}`, `ビーカー "${id}" の量 ${s.amount} が ${s.amountVar}=${sol[s.amountVar]} と一致しません`);
      }
    }
  }
  if (b.type === 'ratio') {
    for (const st of b.states ?? []) {
      for (const [id, s] of Object.entries(st.rows ?? {})) {
        if (s.beforeVar && !near(s.before, sol[s.beforeVar])) err(`${w} state:${st.id}`, `帯 "${id}" の before ${s.before} が ${s.beforeVar}=${sol[s.beforeVar]} と一致しません`);
      }
    }
  }
  if (b.type === 'circle') {
    for (const st of b.states ?? []) {
      for (const [id, v] of Object.entries(st.vars ?? {})) {
        if (!near(st.speeds?.[id], sol[v])) err(`${w} state:${st.id}`, `${id} の速さ ${st.speeds?.[id]} が ${v}=${sol[v]} と一致しません`);
      }
    }
  }
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
  s = unwrap(s, '\\tc', (_c, x) => x);
  s = unwrap(s, '\\text', (_x) => '');
  for (const f of ['\\dfrac', '\\tfrac', '\\frac']) s = unwrap(s, f, (a, b) => `((${a})/(${b}))`);
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
  // 大文字は「整数A」「整数B」のような1文字の数量（check.solution に登録して検算する）
  if (/\\/.test(s) || !/^[0-9a-zA-Z+\-*/().=]*$/.test(s)) return null;
  // 暗黙のかけ算：2x → 2*x, 3(…) → 3*(…), )( → )*(
  s = s.replace(/([0-9a-zA-Z)])(?=[a-zA-Z(])/g, '$1*').replace(/\)(?=[0-9])/g, ')*');
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
  verifyMotion(w, b, sol);
  // 位取り表：状態ごとの式（A=10a+b、A=74 など）を検算する
  if (b.type === 'place') for (const st of b.states ?? []) if (st.tex) verifyRow(`${w} state:${st.id}`, st.tex, sol);
  if (b.type === 'calc') {
    let prevLhs = null;
    for (const r of b.rows) {
      if (r.note || r.head) continue;
      // 文章のセル（例「代金」）は、value（検算用の式。例 "80x"）があればその値として検算する
      const cells = r.cells.map((c) => (typeof c === 'string' ? c : c?.value ?? ''));
      const eq = cells.indexOf('=');
      // 「=」だけのセルがある行は1つの式、そうでなければセルごとの式として扱う。
      // 左辺が空の行（「　= …」と前の行から続く等式）は、前の行の左辺を引き継いで検算する。
      if (eq >= 0) {
        const lhs = cells.slice(0, eq).join(' ').trim();
        if (lhs) prevLhs = lhs;
        verifyRow(w, (lhs || prevLhs || '') + ' ' + cells.slice(eq).join(' '), sol);
      }
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

  const { allBlocks } = checkBody(where, c.statement, c.steps);

  (c.hints ?? []).forEach((h, i) => {
    if (typeof h !== 'string') err(`${where} hint${i + 1}`, 'ヒントは文字列で書いてください');
    else checkText(`${where} hint${i + 1}`, h, new Set());
  });
  const t = c.teacher ?? {};
  if (t.status && t.status !== 'draft') err(where, `teacher.status は draft のみ指定できます: ${t.status}`);
  for (const v of [t.aim, ...[].concat(t.notes ?? []), ...(t.questions ?? []), ...(t.pitfalls ?? []), ...(t.commonErrors ?? []), ...(t.procedure ?? [])]) {
    checkTeacherEntry(`${where} teacher`, v);
  }
  if (c.answer?.tex) renderTex(`${where} answer`, c.answer.tex);
  if (c.edition?.ref) checkText(`${where} ref`, c.edition.ref, new Set());

  if (c.type === 'exercise' && !c.check) err(where, '問題には検算用の check を登録してください');
  if (c.check) {
    checkCheck(where, c.check, allBlocks);
    if (c.answer?.values && JSON.stringify(c.answer.values) !== JSON.stringify(c.check.solution)) {
      err(where, 'answer.values と check.solution が一致しません');
    }
  }
}

// ブロックとステップの整合性（授業解説・スライド・ミスを見破れ！で共通）
function checkBody(where, statement = [], steps = []) {
  const keys = new Set();
  const blockIds = new Set();
  const allBlocks = [...statement, ...steps.flatMap((s) => s.add ?? [])];
  statement.forEach((b) => checkBlock(where, b, keys, blockIds));
  steps.forEach((s) => (s.add ?? []).forEach((b) => checkBlock(`${where} step:${s.id}`, b, keys, blockIds)));

  const hidden = new Set();
  allBlocks.forEach((b) => (b.hide ?? []).forEach((k) => hidden.add(k)));
  const revealed = new Set();
  const stepIds = new Set();
  steps.forEach((s, i) => {
    const w = `${where} step:${s.id ?? i + 1}`;
    if (!s.id) err(w, 'ステップに id がありません');
    if (stepIds.has(s.id)) err(w, 'ステップID重複');
    stepIds.add(s.id);
    if (!s.title) err(w, 'ステップに title がありません');
    else checkText(w, s.title, new Set());
    if (s.comment) checkText(w, s.comment, new Set());
    if (s.teacherNote) checkTeacherEntry(w, s.teacherNote);
    for (const e of s.emphasis ?? []) {
      if (!e.key === !e.keys) err(w, '強調には key か keys のどちらか一方を指定してください');
      for (const k of e.keys ?? [e.key]) if (!keys.has(k)) err(w, `強調キー "${k}" がどの数式・文章にもありません`);
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
    for (const [id, sid] of Object.entries(s.set ?? {})) {
      const b = allBlocks.find((x) => x.id === id);
      if (!b?.states) err(w, `set のブロック "${id}" がないか、状態（states）を持っていません`);
      else if (!b.states.some((x) => x.id === sid)) err(w, `set の状態 "${sid}" がブロック "${id}" にありません`);
    }
  });
  hidden.forEach((k) => { if (!revealed.has(k)) err(where, `hide したキー "${k}" がどのステップでも表示されません`); });

  return { allBlocks, keys };
}

// check：方程式・途中式が解で成り立つか、恒等式、解でない組、画面に表示される式の検算
function checkCheck(where, check, allBlocks = []) {
  const sol = check.solution;
  for (const eq of sol ? [...(check.equations ?? []), ...(check.derived ?? [])] : []) {
    try {
      if (!holds(eq, sol)) err(where, `検算NG: ${eq} は解 ${JSON.stringify(sol)} で成り立ちません`);
    } catch (e) {
      err(where, `検算式を評価できません: ${eq} (${e.message})`);
    }
  }
  // 解でない組は、いずれかの式が成り立たないこと
  for (const bad of check.nonSolutions ?? []) {
    const ok = (check.equations ?? []).every((eq) => holds(eq, bad));
    if (ok) err(where, `nonSolutions の ${JSON.stringify(bad)} がすべての式を満たしています`);
  }
  // 式変形の恒等式：x, y にいろいろな値を入れても成り立つか
  const names = Object.keys(sol ?? { x: 0, y: 0 });
  for (const id of check.identities ?? []) {
    for (let i = 0; i < 6; i++) {
      const pt = Object.fromEntries(names.map((n) => [n, Math.floor(Math.random() * 19) - 9 || 1]));
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
  // 画面に表示される式を検算
  if (sol) allBlocks.forEach((b) => verifyBlock(where, b, sol));
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
const isMini = (p) => /^mini[\\/]/.test(relative(DATA_DIR, p));
const files = walk(DATA_DIR).filter((p) => p.endsWith('.json') && !p.endsWith('catalog.json') && !isMini(p));
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

// ---- 授業ミニコンテンツ ----
// 自動で検証できるのは「構成・参照・数式の構文・check に登録した計算」まで。
// 〇×や3択の正誤判断・解説文の内容は、講師が確認する（status: "draft" の間は「要確認」と表示される）。
const MINI_TYPES = { choice3: 'quiz', mistake: 'quiz', truefalse: 'quiz', column: 'slide', introduction: 'slide' };
const ERROR_TYPES = new Set(['sign', 'calc', 'formula', 'transpose', 'distribute', 'approach', 'other']);
const miniIds = new Set();
const miniStats = { files: 0, autoChecked: 0, manual: [] };

function checkQuestionCheck(where, q) {
  const ch = q.check;
  if (!ch) return false;
  if (ch.values) {
    // 3択：正解の選択肢だけが、すべての式を満たすこと
    for (const [cid, vals] of Object.entries(ch.values)) {
      if (!q.choices?.some((c) => c.id === cid)) err(where, `check.values の選択肢 "${cid}" がありません`);
      const ok = (ch.equations ?? []).every((eq) => holds(eq, vals));
      if (cid === q.answer && !ok) err(where, `正解の選択肢 "${cid}" ${JSON.stringify(vals)} が式を満たしません`);
      if (cid !== q.answer && ok) err(where, `不正解の選択肢 "${cid}" ${JSON.stringify(vals)} も式を満たしています`);
    }
  }
  checkCheck(where, ch, []);
  return true;
}

function checkMini(rel, m) {
  const where = `${rel} ${m.id ?? '(id無し)'}`;
  for (const f of ['id', 'type', 'title', 'unit', 'minutes']) if (m[f] === undefined) err(where, `必須項目 ${f} がありません`);
  const engine = MINI_TYPES[m.type];
  if (!engine) return err(where, `不正なコンテンツ種類: ${m.type}`);
  if (miniIds.has(m.id)) err(where, 'コンテンツIDが重複しています');
  miniIds.add(m.id);
  // 置き場所 mini/<学年>/<章>/<節>/<ID>.json と、unit・id が一致すること
  const [, g, c, s, file] = rel.split('/');
  if (file !== `${m.id}.json`) err(where, `ファイル名を ${m.id}.json にしてください`);
  if (m.unit && (m.unit.grade !== g || m.unit.chapter !== c || m.unit.section !== s)) err(where, `unit が置き場所 ${g}/${c}/${s} と一致しません`);
  const sec = catalog.grades.find((x) => x.id === g)?.chapters.find((x) => x.id === c)?.sections.find((x) => x.id === s);
  if (!sec) err(where, `catalog.json に存在しない単元です: ${g}/${c}/${s}`);
  if (typeof m.minutes !== 'number' || m.minutes <= 0) err(where, 'minutes（想定所要時間・分）を数値で指定してください');
  if (m.difficulty !== undefined && ![1, 2, 3].includes(m.difficulty)) err(where, 'difficulty は 1〜3 で指定してください');
  if (m.status && m.status !== 'draft') err(where, `status は draft のみ指定できます: ${m.status}`);
  if (m.description) checkText(where, m.description, new Set());
  const t = m.teacher ?? {};
  for (const v of [t.aim, ...[].concat(t.notes ?? []), ...(t.questions ?? [])]) checkTeacherEntry(`${where} teacher`, v);

  if (engine === 'quiz') {
    if (!Array.isArray(m.questions) || !m.questions.length) return err(where, 'questions がありません');
    if (m.type !== 'mistake' && (m.questions.length < 3 || m.questions.length > 5)) err(where, `1セット3〜5問にしてください（${m.questions.length}問）`);
    const qids = new Set();
    m.questions.forEach((q, i) => {
      const w = `${where} q:${q.id ?? i + 1}`;
      if (!q.id) err(w, '問題に id がありません');
      if (qids.has(q.id)) err(w, '問題IDが重複しています');
      qids.add(q.id);
      if (!q.prompt) err(w, '問題文（prompt）がありません');
      else checkText(w, q.prompt, new Set());
      if (q.tex) renderTex(w, q.tex);
      for (const n of [].concat(q.teacherNote ?? [])) checkTeacherEntry(w, n);
      let auto = false;
      if (m.type === 'choice3') {
        if (!Array.isArray(q.choices) || q.choices.length !== 3) err(w, '選択肢はちょうど3つにしてください');
        const cids = new Set((q.choices ?? []).map((c) => c.id));
        if (cids.size !== (q.choices ?? []).length) err(w, '選択肢IDが重複しています');
        (q.choices ?? []).forEach((c) => {
          if (!c.id || !c.text) err(w, '選択肢には id と text が必要です');
          else checkText(w, c.text, new Set());
        });
        if (!cids.has(q.answer)) err(w, `正解ID "${q.answer}" が選択肢にありません`);
        auto = checkQuestionCheck(w, q);
      } else if (m.type === 'truefalse') {
        if (!['o', 'x'].includes(q.answer)) err(w, `〇×クイズの answer は "o" か "x" にしてください: ${q.answer}`);
        auto = checkQuestionCheck(w, q);
      } else {
        // ミスを見破れ！：誤答・正答の筆算、誤りの位置（キー）、理由
        if (!ERROR_TYPES.has(q.errorType)) err(w, `不明な誤りの種類: ${q.errorType}`);
        if (!q.reason) err(w, '誤りの理由（reason）がありません');
        else checkText(w, q.reason, new Set());
        if (q.note) checkText(w, q.note, new Set());
        const wrong = { id: 'wrong', type: 'calc', rows: q.wrong?.rows ?? [] };
        const correct = { id: 'correct', type: 'calc', rows: q.correct?.rows ?? [] };
        const wk = new Set();
        const ck = new Set();
        checkBlock(w, wrong, wk, new Set());
        checkBlock(w, correct, ck, new Set());
        if (!q.errorKeys?.length) err(w, '誤りの位置（errorKeys）がありません');
        for (const k of q.errorKeys ?? []) if (!wk.has(k)) err(w, `誤りの位置のキー "${k}" が誤答の式にありません`);
        for (const k of q.correctKeys ?? []) if (!ck.has(k)) err(w, `correctKeys のキー "${k}" が正しい式にありません`);
        for (const k of wk) if (ck.has(k)) err(w, `キー "${k}" が誤答と正答の両方にあります（別のキーにしてください）`);
        if (q.check?.identity) {
          // 式の計算そのもの（例：-2(3y-8) の展開）が題材の場合：
          // 正しい式はどんな値でも成り立ち、誤答の式は成り立たない値があること
          const vars = q.check.vars ?? ['x', 'y'];
          const points = Array.from({ length: 6 }, () => Object.fromEntries(vars.map((v) => [v, Math.floor(Math.random() * 19) - 9 || 1])));
          const failsAt = (block) =>
            points.filter((pt) => {
              const before = errors.length;
              verifyBlock(w, block, pt);
              const bad = errors.length > before;
              errors.length = before;
              return bad;
            }).length;
          if (failsAt(correct)) err(w, '正しい式が恒等的に成り立っていません');
          if (!failsAt(wrong)) err(w, '誤答の式がすべての値で成り立っています（誤りが含まれていません）');
          checkCheck(w, q.check, []);
          auto = true;
        } else if (!q.check?.solution) err(w, 'ミスを見破れ！には check.solution（正しい解）または check.identity が必要です');
        else {
          // 正しい解き方の式はすべて成り立ち、誤答の式は少なくとも1行が成り立たないこと
          checkCheck(w, q.check, [correct, ...(q.tex ? [{ id: 'problem', type: 'math', tex: q.tex }] : [])]);
          if (q.errorType === 'approach') {
            // 方針の誤り：誤答の式そのものには計算ミスがないこと（計算ミスと混同しない）
            verifyBlock(w, wrong, q.check.solution);
          } else {
            const before = errors.length;
            verifyBlock(w, wrong, q.check.solution);
            const failed = errors.length - before;
            errors.length = before;
            if (!failed) err(w, '誤答の式がすべて正しい解で成り立っています（誤りが含まれていません）');
          }
          auto = true;
        }
      }
      if (!q.explanation && m.type !== 'mistake') err(w, '解説（explanation）がありません');
      else if (q.explanation) checkText(w, q.explanation, new Set());
      if (auto) miniStats.autoChecked++;
      else miniStats.manual.push(`${m.id} ${q.id}`);
    });
  } else {
    if (!Array.isArray(m.slides) || !m.slides.length) return err(where, 'slides がありません');
    if (m.slides.length < 3 || m.slides.length > 6) err(where, `スライドは3〜6枚程度にしてください（${m.slides.length}枚）`);
    const sids = new Set();
    m.slides.forEach((sl, i) => {
      const w = `${where} slide:${sl.id ?? i + 1}`;
      if (!sl.id) err(w, 'スライドに id がありません');
      if (sids.has(sl.id)) err(w, 'スライドIDが重複しています');
      sids.add(sl.id);
      if (!sl.title) err(w, 'スライドに title がありません');
      else checkText(w, sl.title, new Set());
      if (!(sl.blocks ?? []).length) err(w, 'スライドに blocks がありません');
      const { allBlocks } = checkBody(w, sl.blocks ?? [], sl.steps ?? []);
      for (const v of [...[].concat(sl.teacher?.notes ?? []), ...(sl.teacher?.questions ?? [])]) checkTeacherEntry(w, v);
      if (sl.check) {
        checkCheck(w, sl.check, allBlocks);
        miniStats.autoChecked++;
      }
    });
    miniStats.manual.push(`${m.id}（スライドの文章）`);
  }
}

for (const p of walk(DATA_DIR).filter((x) => x.endsWith('.json') && isMini(x))) {
  const rel = relative(DATA_DIR, p).replace(/\\/g, '/');
  let m;
  try {
    m = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    err(rel, `JSON構文エラー: ${e.message}`);
    continue;
  }
  checkMini(rel, m);
  miniStats.files++;
}

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
  `教材データ検証OK（${files.length} ファイル / ${count} コンテンツ）　表示式の検算 ${stats.rows} 行・恒等式 ${stats.identities} 件（ミニコンテンツを含む）`,
);
console.log(
  `ミニコンテンツ検証OK（${miniStats.files} 件 / 計算を自動検算した問題・スライド ${miniStats.autoChecked} / 講師の確認が必要 ${miniStats.manual.length}）`,
);
if (miniStats.manual.length) console.log('  講師の確認が必要（自動検算の対象外）: ' + miniStats.manual.join('、'));
