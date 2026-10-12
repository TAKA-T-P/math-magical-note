import { texToHtml, inlineToHtml } from '../math/render.js';
import { pageOf } from '../app/catalog.js';

// 表示テンプレート（ブロック種別ごと）。新しい種別はここに追加する。
const BLOCK_BUILDERS = {
  text: (b) => `<div class="blk-text">${inlineToHtml(b.text)}</div>`,
  math: (b) => texToHtml(b.tex, true),
  callout: (b) =>
    `${b.title ? `<div class="callout-title">${inlineToHtml(b.title)}</div>` : ''}<div>${inlineToHtml(b.text)}</div>`,
  answer: (b) =>
    `<span class="answer-label">答</span>${b.tex ? texToHtml(b.tex, true) : `<span class="answer-text">${inlineToHtml(b.text)}</span>`}`,
  calc: buildCalc,
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
//   rows[]: { label, op, cells[], key, rule, note }
//     cells の要素は数式（文字列）か { text }（文章）。key を付けると行全体が段階表示・強調の対象になる。
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
      const common = [r.key && 'k-' + r.key, r.note && 'is-note'].filter(Boolean).join(' ');
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
      els.forEach((el) => host.insertBefore(el, anchor));
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

      el.classList.remove('em', 'em-color', 'em-box', 'em-marker', 'em-strike', 'em-dim', 'em-anim');
      const e = keys.map((k) => view.emphasis.get(k)).find(Boolean);
      if (e && !hidden) {
        el.classList.add('em', 'em-' + e.style);
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
      const x1 = f.r + 12, y1 = (f.t + f.b) / 2;
      const toRight = t.l > f.r;
      const x2 = toRight ? t.l - 14 : (t.l + t.r) / 2;
      const y2 = toRight ? (t.t + t.b) / 2 : t.t - 14;
      const dx = Math.max(60, Math.abs(x2 - x1) / 2);
      const d = toRight
        ? `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
        : `M${x1},${y1} C${x1 + dx},${y1} ${x2},${y2 - dx} ${x2},${y2}`;
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'arrow' + (play ? ' arrow-anim' : ''));
      g.style.setProperty('--em', `var(--c-${a.color ?? 'red'})`);
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('pathLength', '1');
      g.append(path);
      // 矢じり
      const ang = toRight ? 0 : Math.PI / 2;
      const head = document.createElementNS(ns, 'path');
      const hx = (dx2, dy2) => `${x2 + dx2 * Math.cos(ang) - dy2 * Math.sin(ang)},${y2 + dx2 * Math.sin(ang) + dy2 * Math.cos(ang)}`;
      head.setAttribute('d', `M${hx(-18, -10)} L${x2},${y2} L${hx(-18, 10)}`);
      head.setAttribute('class', 'arrow-head');
      g.append(head);
      if (a.label) {
        // ベジェ曲線の中点の少し上に置く
        const [c1x, c1y, c2x, c2y] = toRight ? [x1 + dx, y1, x2 - dx, y2] : [x1 + dx, y1, x2, y2 - dx];
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('x', (x1 + 3 * c1x + 3 * c2x + x2) / 8);
        text.setAttribute('y', (y1 + 3 * c1y + 3 * c2y + y2) / 8 - 16);
        text.textContent = a.label;
        g.append(text);
      }
      svg.append(g);
    }
  }
}
