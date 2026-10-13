import { texToHtml, inlineToHtml } from '../math/render.js';
import { pageOf } from '../app/catalog.js';
import { STATEFUL, initialState } from './stateful-blocks.js';

// 表示テンプレート（ブロック種別ごと）。新しい種別はここに追加する。
const BLOCK_BUILDERS = {
  text: (b) => `<div class="blk-text">${inlineToHtml(b.text)}</div>`,
  math: (b) => texToHtml(b.tex, true),
  callout: (b) =>
    `${b.title ? `<div class="callout-title">${inlineToHtml(b.title)}</div>` : ''}<div>${inlineToHtml(b.text)}</div>`,
  answer: (b) =>
    `<span class="answer-label">答</span>${b.tex ? texToHtml(b.tex, true) : `<span class="answer-text">${inlineToHtml(b.text)}</span>`}`,
  calc: buildCalc,
  table: buildTable,
  illust: buildIllust,
  // 状態を持つブロック（stateful-blocks.js）。中身は update() で状態に合わせて描く
  place: (b) => STATEFUL.place.build(b),
  bars: (b) => STATEFUL.bars.build(b),
  route: (b) => STATEFUL.route.build(b),
  circle: (b) => STATEFUL.circle.build(b),
  ratio: (b) => STATEFUL.ratio.build(b),
  beakers: (b) => STATEFUL.beakers.build(b),
  // 画像は public/ 以下に置き、相対パスで指定する（GitHub Pages のサブパスでも動くよう先頭に ./ を付ける）
  image: (b) =>
    `<figure><img src="./${encodeURI(b.src)}" alt="${(b.alt ?? '').replace(/"/g, '&quot;')}"${b.height ? ` style="height:${Number(b.height)}px"` : ''}>${
      b.caption ? `<figcaption>${inlineToHtml(b.caption)}</figcaption>` : ''
    }</figure>`,
  pointbox: (b) => `
    <div class="pointbox-legend"><span class="pointbox-tag">ポイント</span>${inlineToHtml(b.title)}</div>
    <ul>
      ${b.items
        .map((it) => {
          const lines = Array.isArray(it.text) ? it.text : [it.text];
          const cls = [it.note && 'is-note', it.strong && 'is-strong', it.bullet === false && 'no-bullet', it.key && 'k-' + it.key]
            .filter(Boolean)
            .join(' ');
          return `<li class="${cls}">${lines
            .map((l, i) => `<span class="line" ${i && it.contIndent ? `style="padding-left:${it.contIndent}em"` : ''}>${inlineToHtml(l)}</span>`)
            .join('')}</li>`;
        })
        .join('')}
    </ul>`,
  'title-card': (b, ctx) => `
    <div class="title-card-chapter"><span class="title-card-num">${ctx.chapter.number}</span>${ctx.chapter.title}</div>
    <ol class="title-card-sections">
      ${ctx.chapter.sections
        .map((s) => `<li><span>${s.number}</span>${s.title}<span class="dots"></span><span>p.${pageOf(s, ctx.edition) ?? '-'}</span></li>`)
        .join('')}
    </ol>`,
};

// 筆算・表（calc）：行ごとに「ラベル」「演算記号」「セル…」を格子状に並べる。
// 同じ列の項・等号が縦にそろい、横線（rule）はラベル列を除いた部分にだけ引かれる。
//   rows[]: { label, op, cells[], key, rule, note, head }（head: 言葉の式などの見出し行。小さい文字で、検算しない）
//     cells の要素は数式（文字列）か { text, value }（文章。value は検算用の式で、表示には使わない）。key を付けると行全体が段階表示・強調の対象になる。
//   align: 列ごとの寄せ "r" | "c" | "l"（省略時は "=" の列を中央、それ以外を右寄せ）
function buildCalc(b) {
  const hasLabel = b.rows.some((r) => r.label);
  const hasOp = b.rows.some((r) => r.op);
  const n = Math.max(...b.rows.map((r) => r.cells.length));
  const align = Array.from({ length: n }, (_, i) =>
    b.align?.[i] ?? (b.rows.some((r) => r.cells[i] === '=') ? 'c' : 'r'),
  );
  const cols = [hasLabel && 'auto', hasOp && 'auto', ...align.map(() => 'auto')].filter(Boolean).join(' ');
  const cell = (c) => (c == null || c === '' ? '' : typeof c === 'object' ? inlineToHtml(c.text) : texToHtml(c));
  const html = b.rows
    .map((r) => {
      const common = [r.key && 'k-' + r.key, r.note && 'is-note', r.head && 'is-head'].filter(Boolean).join(' ');
      const ruled = r.rule ? ' has-rule' : '';
      return [
        hasLabel && `<div class="calc-label ${common}">${r.label ? inlineToHtml(r.label) : ''}</div>`,
        hasOp && `<div class="calc-op ${common}${ruled}">${r.op ? inlineToHtml(r.op) : ''}</div>`,
        ...align.map((a, i) => `<div class="calc-cell a-${a} ${common}${ruled}">${cell(r.cells[i])}</div>`),
      ]
        .filter(Boolean)
        .join('');
    })
    .join('');
  return `<div class="calc-grid" style="grid-template-columns:${cols}">${html}</div>`;
}

// 情報整理テーブル（table）：文章題の数量を表に整理する。
//   head[]: 見出し行のセル。{ text, color } で列の色（例：x の品物は青）を付けられる
//   rows[]: { key, cells[] }。cells の先頭は行見出し。セルは文章（$…$ で数式）か { text, key }
//   キーを付けた行・セルを hide すると、表の枠と行見出しは残して中身だけを隠す（穴あきの表）
function buildTable(b) {
  const cell = (c, tag, extra = '') => {
    const o = c && typeof c === 'object' ? c : { text: c ?? '' };
    const cls = [extra, o.key && 'k-' + o.key, o.color && 'col-' + o.color].filter(Boolean).join(' ');
    return `<${tag} class="${cls}"><span class="cell-in">${inlineToHtml(o.text)}</span></${tag}>`;
  };
  const head = b.head
    ? `<thead><tr>${b.head.map((c, i) => cell(c, 'th', i === 0 ? 'tbl-corner' : '')).join('')}</tr></thead>`
    : '';
  const body = b.rows
    .map((r) => `<tr class="${r.key ? 'k-' + r.key : ''}">${r.cells.map((c, i) => cell(c, i === 0 ? 'th' : 'td', i === 0 ? 'tbl-rowhead' : '')).join('')}</tr>`)
    .join('');
  return `<table>${head}<tbody>${body}</tbody></table>`;
}

// イメージイラスト（illust）：品物の絵・名前・数量などを並べる。絵は public/illust/<asset>.svg（データと分けて管理）。
//   items[]: { asset, name, count, times, color, key, lines[] } または { sep, key }（＋・＝などの記号や文章）
//     count：絵の数（既定 1）。times: true または maxRepeat（既定 8）を超えると、絵1つに「×count」を添える
//     lines：絵の下に出す文章（値段・「何本？」など。[[key|…]] で段階表示・強調できる）
//   height：絵の高さ（px、既定 120）
function buildIllust(b) {
  const h = Number(b.height ?? 120);
  const item = (it) => {
    if (it.sep !== undefined) return `<div class="il-sep${it.key ? ' k-' + it.key : ''}">${inlineToHtml(it.sep)}</div>`;
    const n = it.count ?? 1;
    const img = `<img src="./illust/${encodeURI(it.asset)}.svg" alt="${(it.name ?? '').replace(/"/g, '&quot;')}" style="height:${h}px">`;
    const pics = it.times || n > (b.maxRepeat ?? 8) ? `${img}<span class="il-times">×${n}</span>` : img.repeat(n);
    const cls = ['il-item', it.color && 'c-' + it.color, it.key && 'k-' + it.key].filter(Boolean).join(' ');
    return `<div class="${cls}">
      <div class="il-pics">${pics}</div>
      ${it.name ? `<div class="il-name">${inlineToHtml(it.name)}</div>` : ''}
      ${(it.lines ?? []).map((l) => `<div class="il-line">${inlineToHtml(l)}</div>`).join('')}
    </div>`;
  };
  return `<div class="il-row">${b.items.map(item).join('')}</div>`;
}

const keyClasses = (el) => [...el.classList].filter((c) => c.startsWith('k-')).map((c) => c.slice(2));

export class LessonRenderer {
  constructor(body, ctx) {
    this.body = body;
    this.ctx = ctx;
    this.cache = new Map(); // block id -> element
    this.prevHidden = new Set();
    this.prevEmphasis = new Map();
    body.innerHTML = `
      <div class="area area-top"></div>
      <div class="area area-left"></div>
      <div class="area area-right"></div>
      <div class="area area-full"></div>
      <div class="area area-bottom"><div class="hint-panel"></div><div class="step-comment"></div></div>
      <svg class="arrow-layer" aria-hidden="true"></svg>`;
    this.areas = Object.fromEntries(['top', 'left', 'right', 'full', 'bottom'].map((a) => [a, body.querySelector('.area-' + a)]));
    this.hintPanel = body.querySelector('.hint-panel');
    this.commentEl = body.querySelector('.step-comment');
    this.arrowLayer = body.querySelector('.arrow-layer');
  }

  buildBlock(b) {
    const el = document.createElement('div');
    el.className = `blk blk-${b.type} size-${b.size ?? 'm'}${b.tone ? ' tone-' + b.tone : ''}${b.inline ? ' is-inline' : ''}`;
    el.dataset.block = b.id;
    // width：横に並べる（inline）ブロックの幅（px）。問題文の横にイラストを置くときなど
    if (b.width) el.style.width = `${Number(b.width)}px`;
    el.innerHTML = (BLOCK_BUILDERS[b.type] ?? (() => `<p class="error">未対応のブロック: ${b.type}</p>`))(b, this.ctx);
    return el;
  }

  // forward: 進む方向の変化のときだけアニメーションする
  update(view, { forward, animate }) {
    const play = forward && animate;

    // ブロックの追加・削除（並び順はデータの順）
    const want = new Set(view.blocks.keys());
    for (const [id, el] of this.cache) if (!want.has(id)) el.remove();
    const perArea = { top: [], left: [], right: [], full: [], bottom: [] };
    for (const [id, { block, anim }] of view.blocks) {
      let el = this.cache.get(id);
      if (!el) this.cache.set(id, (el = this.buildBlock(block)));
      const isNew = !el.isConnected;
      perArea[block.area ?? 'top'].push(el);
      el.classList.remove('anim-fade', 'anim-slide-up', 'anim-slide-left');
      if (isNew && play && anim !== 'none') {
        void el.offsetWidth;
        el.classList.add('anim-' + anim);
      }
    }
    for (const [area, els] of Object.entries(perArea)) {
      const host = this.areas[area];
      const anchor = area === 'bottom' ? this.hintPanel : null;
      // すでに正しい位置にある要素は動かさない（入れ直すと CSS の transition の始点が失われる）
      els.forEach((el, i) => {
        const at = host.children[i];
        if (at !== el) host.insertBefore(el, at && at !== anchor ? at : anchor);
      });
    }
    // 状態を持つブロック：ステップの set で指定された状態で描く（キーの処理より前に行う）
    for (const [id, { block }] of view.blocks) {
      if (!block.states) continue;
      const el = this.cache.get(id);
      const sid = view.states?.get(id) ?? initialState(block);
      if (el.dataset.state === sid) continue;
      const st = block.states.find((s) => s.id === sid) ?? block.states[0];
      STATEFUL[block.type].apply(el, block, st, play && el.dataset.state !== undefined);
      el.dataset.state = sid;
    }
    this.body.classList.toggle('has-columns', perArea.left.length + perArea.right.length + perArea.full.length > 0);

    // キー付き要素：表示／非表示と強調
    for (const el of this.body.querySelectorAll('[class^="k-"], [class*=" k-"]')) {
      const keys = keyClasses(el);
      const hidden = keys.some((k) => view.hidden.has(k));
      const wasHidden = keys.some((k) => this.prevHidden.has(k));
      el.classList.toggle('is-hidden', hidden);
      el.classList.remove('reveal-in');
      if (!hidden && wasHidden && play) {
        void el.offsetWidth;
        el.classList.add('reveal-in');
      }

      el.classList.remove('em', 'em-color', 'em-box', 'em-marker', 'em-strike', 'em-dim', 'em-anim', 'em-narrow', 'em-multi');
      const e = keys.map((k) => view.emphasis.get(k)).find(Boolean);
      if (e && !hidden) {
        el.classList.add('em', 'em-' + e.style);
        // 1文字程度の狭い要素は、囲み枠が文字に重ならないよう左右に余裕を持たせる
        if (e.style === 'box' && el.offsetWidth && el.offsetWidth < 40) el.classList.add('em-narrow');
        // 文章題の長い語句など、行をまたぐ文章は行ごとに塗る・囲む
        if (el.classList.contains('kspan') && el.getClientRects().length > 1) el.classList.add('em-multi');
        el.style.setProperty('--em', `var(--c-${e.color ?? 'red'})`);
        const before = keys.map((k) => this.prevEmphasis.get(k)).find(Boolean);
        if (play && (!before || before.style !== e.style || before.color !== e.color)) el.classList.add('em-anim');
      }
    }
    this.prevHidden = view.hidden;
    this.prevEmphasis = view.emphasis;

    // ヒント
    if (view.hints.length < this.hintPanel.children.length) this.hintPanel.replaceChildren();
    for (let i = this.hintPanel.children.length; i < view.hints.length; i++) {
      const div = document.createElement('div');
      div.className = 'hint-item' + (animate ? ' anim-fade' : '');
      div.innerHTML = `<span class="hint-badge">ヒント${i + 1}</span><span>${inlineToHtml(view.hints[i])}</span>`;
      this.hintPanel.append(div);
    }

    // ステップの補足コメント
    const html = view.comment ? inlineToHtml(view.comment) : '';
    if (this.commentEl.dataset.src !== (view.comment ?? '')) {
      this.commentEl.dataset.src = view.comment ?? '';
      this.commentEl.innerHTML = html;
      this.commentEl.classList.remove('anim-fade');
      if (html && play) {
        void this.commentEl.offsetWidth;
        this.commentEl.classList.add('anim-fade');
      }
    }
    this.commentEl.hidden = !html;

    this.pendingArrows = { arrows: view.arrows, play };
    requestAnimationFrame(() => {
      this.drawArrows();
      this.checkOverflow();
    });
  }

  // 16:9 の画面からはみ出していないか（教材データ作成時の確認用）
  checkOverflow() {
    const over = [...Object.values(this.areas)].some((a) => a.scrollHeight > a.clientHeight + 1) ||
      this.body.scrollHeight > this.body.clientHeight + 1;
    this.body.classList.toggle('is-overflow', over);
    if (over) console.warn('授業画面の表示領域から内容がはみ出しています。データの配置（area / inline / size）を見直してください。');
  }

  // 矢印は要素の位置が決まってから描く（ステージの拡大縮小を打ち消して計算）
  drawArrows() {
    const { arrows = [], play = false } = this.pendingArrows ?? {};
    const svg = this.arrowLayer;
    svg.replaceChildren();
    if (!arrows.length) return;
    const base = this.body.getBoundingClientRect();
    const scale = base.width / this.body.offsetWidth || 1;
    const rectOf = (key) => {
      const els = [...this.body.querySelectorAll('.k-' + key)].filter((e) => !e.classList.contains('is-hidden'));
      if (!els.length) return null;
      const rs = els.map((e) => e.getBoundingClientRect());
      const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
      const r = Math.max(...rs.map((x) => x.right)), b = Math.max(...rs.map((x) => x.bottom));
      return { l: (l - base.left) / scale, t: (t - base.top) / scale, r: (r - base.left) / scale, b: (b - base.top) / scale };
    };
    const ns = 'http://www.w3.org/2000/svg';
    for (const a of arrows) {
      const f = rectOf(a.from), t = rectOf(a.to);
      if (!f || !t) continue;
      // 向き：右にある要素へは横向き、真下（横方向に重なる位置）の要素へは上から下へ、それ以外は右から回り込む
      const toRight = t.l > f.r;
      const near = t.l < f.r + 40 && t.r > f.l - 40; // 横方向に重なっている
      const below = !toRight && near && t.t >= f.b - 4;
      const above = !toRight && near && t.b <= f.t + 4;
      let x1, y1, x2, y2, c1x, c1y, c2x, c2y, ang;
      if (below || above) {
        const s = below ? 1 : -1;
        x1 = (f.l + f.r) / 2; y1 = below ? f.b + 6 : f.t - 6;
        x2 = (t.l + t.r) / 2; y2 = below ? t.t - 8 : t.b + 8;
        const dy = Math.max(12, Math.abs(y2 - y1) / 2);
        [c1x, c1y, c2x, c2y] = [x1, y1 + s * dy, x2, y2 - s * dy];
        ang = (s * Math.PI) / 2;
      } else {
        x1 = f.r + 12; y1 = (f.t + f.b) / 2;
        x2 = toRight ? t.l - 14 : (t.l + t.r) / 2;
        y2 = toRight ? (t.t + t.b) / 2 : t.t - 14;
        const dx = Math.max(60, Math.abs(x2 - x1) / 2);
        [c1x, c1y, c2x, c2y] = toRight ? [x1 + dx, y1, x2 - dx, y2] : [x1 + dx, y1, x2, y2 - dx];
        ang = toRight ? 0 : Math.PI / 2;
      }
      const d = `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
      // 短い矢印では矢じりを小さくする
      const hs = Math.min(18, Math.max(9, Math.hypot(x2 - x1, y2 - y1) / 3));
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'arrow' + (play ? ' arrow-anim' : ''));
      g.style.setProperty('--em', `var(--c-${a.color ?? 'red'})`);
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('pathLength', '1');
      g.append(path);
      // 矢じり
      const head = document.createElementNS(ns, 'path');
      const hx = (dx2, dy2) => `${x2 + dx2 * Math.cos(ang) - dy2 * Math.sin(ang)},${y2 + dx2 * Math.sin(ang) + dy2 * Math.cos(ang)}`;
      head.setAttribute('d', `M${hx(-hs, -hs * 0.55)} L${x2},${y2} L${hx(-hs, hs * 0.55)}`);
      head.setAttribute('class', 'arrow-head');
      g.append(head);
      if (a.label) {
        // ベジェ曲線の中点の近く（縦向きなら右横、それ以外は少し上）に置く
        const mx = (x1 + 3 * c1x + 3 * c2x + x2) / 8;
        const my = (y1 + 3 * c1y + 3 * c2y + y2) / 8;
        const text = document.createElementNS(ns, 'text');
        const vertical = below || above;
        text.setAttribute('x', vertical ? mx + 14 : mx);
        text.setAttribute('y', vertical ? my + 8 : my - 16);
        if (vertical) text.style.textAnchor = 'start';
        text.textContent = a.label;
        g.append(text);
      }
      svg.append(g);
    }
  }
}
