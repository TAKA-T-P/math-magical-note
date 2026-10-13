// 割合の文章題の図（状態を持つブロック）：割合の帯グラフ ratio・食塩水のビーカー図 beakers。
// 数値の整合性（増減後の割合、食塩＝食塩水×濃度、混ぜる前後の保存）は validator が確かめる。
import { inlineToHtml } from '../math/render.js';
import { attachPlayer, controls, fmt } from './motion-blocks.js';

const span = (o, cls) => (o ? `<span class="${cls}${o.key ? ' k-' + o.key : ''}">${inlineToHtml(o.text)}</span>` : '');

// ---- 割合の帯グラフ（ratio） ----
//   max：目盛りの最大（％。既定 120）。すべての行で同じ目盛りを使い、100％の位置に基準線を引く
//   rows[]: { id, label: { text, key }, color }  帯（男子・女子 など）
//   states[]: { id, rows: { <row id>: { pct, rate, base, delta, result } } }
//     pct：増減後の割合（％）。100 より大きい部分は「増えた分」、小さい部分は「減った分」（点線）で表す
//     rate：増減の割合（0.08 など。pct = 100(1+rate) を validator が確認）
//     base / delta / result：帯の中・増減部分・右はしの文章（{ text, key }）
//   note：図の下の注意（「それぞれの昨年を100％とした図」など）
// 帯の長さは CSS の transition で伸び縮みする（進む方向のときだけ。戻るときは直接その状態を描く）。
function buildRatio() {
  return '';
}

function applyRatio(el, b, st, play) {
  const max = Number(b.max ?? 120);
  const W = Number(b.width ?? 640);
  const pctW = (v) => `${(v / max) * 100}%`;
  if (!el.querySelector('.rt')) {
    el.innerHTML = `<div class="rt" style="width:${W}px">
      ${b.rows
        .map(
          (r) => `<div class="rt-row" data-row="${r.id}">
            <div class="rt-label">${span(r.label, 'rt-name c-' + (r.color ?? 'blue'))}</div>
            <div class="rt-track">
              <div class="rt-ref" style="left:${pctW(100)}"></div>
              <div class="rt-base c-${r.color ?? 'blue'}"><span class="rt-in"></span></div>
              <div class="rt-inc"><span class="rt-in"></span></div>
              <div class="rt-dec"><span class="rt-in"></span></div>
            </div>
            <div class="rt-result"></div>
          </div>`,
        )
        .join('')}
      <div class="rt-axis"><span style="left:0">0％</span><span style="left:${pctW(100)}">100％</span></div>
    </div>
    <div class="rt-note"></div>`;
  }
  // 進む方向は帯をなめらかに伸び縮みさせ，戻る・全解答などでは一瞬でその状態にする
  if (!play) el.classList.add('rt-instant');
  for (const r of b.rows) {
    const s = st.rows?.[r.id] ?? { pct: 100 };
    const pct = Number(s.pct ?? 100);
    const row = el.querySelector(`[data-row="${r.id}"]`);
    const base = row.querySelector('.rt-base');
    const inc = row.querySelector('.rt-inc');
    const dec = row.querySelector('.rt-dec');
    base.style.width = pctW(Math.min(pct, 100));
    inc.style.left = pctW(100);
    inc.style.width = pctW(Math.max(0, pct - 100));
    dec.style.left = pctW(pct);
    dec.style.width = pctW(Math.max(0, 100 - pct));
    base.querySelector('.rt-in').innerHTML = span(s.base, 'rt-t');
    inc.querySelector('.rt-in').innerHTML = pct > 100 ? span(s.delta, 'rt-t') : '';
    dec.querySelector('.rt-in').innerHTML = pct < 100 ? span(s.delta, 'rt-t') : '';
    row.querySelector('.rt-result').innerHTML = span(s.result, 'rt-t');
  }
  if (!play) {
    void el.offsetWidth;
    el.classList.remove('rt-instant');
  }
  const note = st.note ?? b.note;
  el.querySelector('.rt-note').innerHTML = note ? inlineToHtml(note) : '';
}

// ---- 食塩水のビーカー図（beakers） ----
//   capacity：ビーカー1つ分の量（液面の高さの目盛り。すべてのビーカーで共通）、unknownLevel：量が未知のときの液面（0〜1）
//   items[]: { id, name, color, tint }  ビーカー（tint は液の色の濃さ 0〜1。色は模式的で、濃度は必ず数値で書く）
//   between：ビーカーのあいだの記号（例 ["＋", "→"]）、note：図の下の注意
//   states[]: { id, items: { <id>: { amount, pct, salt, water, conc, saltText, ghost } }, mix }
//     amount / pct / salt：数値（g・％・g）。amount があるときだけ液面を量に合わせる（未知のうちは unknownLevel で同じ高さ）
//     water / conc / saltText：ビーカーの下に出す文章（{ text, key }）。ghost: true は空のビーカー（点線）
//     mix: { from: ["A","B"], to: "M", secondsPerUnit }  混ぜる様子を再生（量・食塩の合計は保存される）
const BEAKER_W = 150;

// height：ビーカーの高さ（px、既定 170）
function beakerSvg(item, level, tint, BEAKER_H = 170) {
  const x0 = 22, x1 = BEAKER_W - 22, top = 18, bot = BEAKER_H - 8;
  const h = Math.max(0, Math.min(1, level)) * (bot - top - 10);
  const y = bot - h;
  return `<svg class="bk-svg" width="${BEAKER_W}" height="${BEAKER_H}">
    <rect class="bk-liquid c-${item.color ?? 'blue'}" x="${x0 + 3}" y="${y}" width="${x1 - x0 - 6}" height="${Math.max(0, bot - y - 3)}" rx="6" style="opacity:${0.25 + 0.6 * tint}"/>
    <path class="bk-glass" d="M${x0 - 8},${top} H${x0} V${bot - 12} q0,12 12,12 H${x1 - 12} q12,0 12,-12 V${top} H${x1 + 8}"/>
  </svg>`;
}

function buildBeakers() {
  return '';
}

function applyBeakers(el, b, st) {
  const cap = Number(b.capacity ?? 600);
  const unknown = Number(b.unknownLevel ?? 0.45);
  const items = b.items;
  const S = (id) => st.items?.[id] ?? {};
  const levelOf = (id) => (S(id).ghost ? 0 : S(id).amount !== undefined ? S(id).amount / cap : unknown);
  const between = b.between ?? [];
  el.innerHTML = `<div class="bk-row">
      ${items
        .map((it, i) => {
          const s = S(it.id);
          return `${i ? `<div class="bk-op">${inlineToHtml(between[i - 1] ?? '')}</div>` : ''}
          <div class="bk-item${s.ghost ? ' is-ghost' : ''}" data-item="${it.id}">
            ${beakerSvg(it, levelOf(it.id), Number(it.tint ?? 0.5), Number(b.height ?? 170))}
            <div class="bk-name c-${it.color ?? 'blue'}">${inlineToHtml(it.name)}</div>
            <div class="bk-line">${span(s.conc, 'bk-conc')}</div>
            <div class="bk-line">${span(s.water, 'bk-water')}</div>
            <div class="bk-line bk-saltline">${span(s.saltText, 'bk-salttext')}</div>
          </div>`;
        })
        .join('')}
    </div>
    ${b.note ? `<div class="bk-note">${inlineToHtml(b.note)}</div>` : ''}
    ${st.mix ? `<div class="bk-read"></div>${controls('')}` : ''}`;
  if (!st.mix) return;

  // 混ぜる様子：混ぜる割合 t（0→1）に比例して、A・B から減った量と食塩がそのまま混合後に入る
  const { from, to } = st.mix;
  const read = el.querySelector('.bk-read');
  const setLevel = (id, amount) => {
    const it = items.find((x) => x.id === id);
    const svg = el.querySelector(`[data-item="${id}"] .bk-svg`);
    svg.outerHTML = beakerSvg(it, amount / cap, Number(it.tint ?? 0.5), Number(b.height ?? 170));
  };
  const totalWater = from.reduce((a, id) => a + S(id).amount, 0);
  const totalSalt = from.reduce((a, id) => a + S(id).salt, 0);
  attachPlayer(el, {
    duration: 1,
    secondsPerUnit: st.mix.seconds ?? 4,
    clock: (t) => (t >= 1 ? '混ぜ終わり' : t > 0 ? `混ぜている… ${Math.round(t * 100)}％` : '混ぜる前'),
    draw: (t) => {
      from.forEach((id) => setLevel(id, S(id).amount * (1 - t)));
      setLevel(to, totalWater * t);
      el.querySelector(`[data-item="${to}"]`).classList.toggle('is-ghost', t === 0);
      const w = from.map((id) => S(id).amount * (1 - t));
      const s = from.map((id) => S(id).salt * (1 - t));
      const mw = totalWater * t;
      const ms = totalSalt * t;
      read.innerHTML = `<span>食塩水：${from.map((id, i) => `${id} ${fmt(w[i])}g`).join('，')}，混ぜた後 ${fmt(mw)}g → 合計 <b>${fmt(w.reduce((a, v) => a + v, 0) + mw)}g</b></span>
        <span>食塩：${from.map((id, i) => `${id} ${fmt(s[i])}g`).join('，')}，混ぜた後 ${fmt(ms)}g → 合計 <b>${fmt(s.reduce((a, v) => a + v, 0) + ms)}g</b></span>
        ${t > 0 ? `<span>混ぜた後の濃度 ${fmt(ms)}÷${fmt(mw)}＝<b>${fmt((ms / mw) * 100)}％</b></span>` : ''}`;
    },
  });
}

export const RATIO_BLOCKS = {
  ratio: { build: buildRatio, apply: applyRatio },
  beakers: { build: buildBeakers, apply: applyBeakers },
};
