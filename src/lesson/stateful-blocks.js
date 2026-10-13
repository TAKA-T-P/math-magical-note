// 状態を持つ表示ブロック（位取り表・ブロック図）。
// ブロックに states（表示のパターン）を登録し、ステップの set: { ブロックID: 状態ID } で切りかえる。
// 状態は computeView がステップ0から順に求めるので、戻る・全解答・問題モードでも正しい表示になる。
// 進む方向の切りかえのときだけアニメーションする（数字カードの移動・ブロックの長さの変化）。
import { texToHtml, inlineToHtml } from '../math/render.js';
import { MOTION_BLOCKS } from './motion-blocks.js';
import { RATIO_BLOCKS } from './ratio-blocks.js';

export const stateOf = (b, id) => b.states.find((s) => s.id === id) ?? b.states[0];
export const initialState = (b) => b.state ?? b.states[0].id;

// ---- 位取り表・数字カード（place） ----
//   labels[]: 位の名前（左から。例 ["十の位", "一の位"]）
//   cards[]: { id, label, color, key }  数字カード（label は文字 a など。key で強調できる）
//   states[]: { id, order[], values{}, tex }
//     order：左の位から順に置くカードの id（入れかえは order を変えるだけ）
//     values：カードに表示する数（例 { a: "7" }。ないときは label を大きく表示）
//     tex：表の下に表示する式（例 "A=10\\hl{e10a}{a}+b"）
function buildPlace(b) {
  const n = b.labels.length;
  return `<div class="pv-grid" style="grid-template-columns:repeat(${n}, minmax(150px, auto))">
    ${b.labels.map((l) => `<div class="pv-head">${inlineToHtml(l)}</div>`).join('')}
    ${b.labels.map((_, i) => `<div class="pv-slot" data-col="${i}"></div>`).join('')}
  </div>
  <div class="pv-expr"></div>
  ${b.cards
    .map((c) => `<div class="pv-card${c.color ? ' c-' + c.color : ''}${c.key ? ' k-' + c.key : ''}" data-card="${c.id}"></div>`)
    .join('')}`;
}

function applyPlace(el, b, st, play) {
  const cards = new Map([...el.querySelectorAll('.pv-card')].map((c) => [c.dataset.card, c]));
  const slots = [...el.querySelectorAll('.pv-slot')];
  // FLIP：移動前の位置を記録 → 新しい位に置く → 差分だけ戻してから元に戻すアニメーション
  const scale = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
  const before = new Map([...cards].map(([id, c]) => [id, c.isConnected && c.parentElement?.classList.contains('pv-slot') ? c.getBoundingClientRect() : null]));
  for (const c of b.cards) {
    const card = cards.get(c.id);
    const v = st.values?.[c.id];
    // 数が入ったカードは、左上に小さく文字（a など）を残す（label のないカードは数だけ）
    const tag = c.label ? `<span class="pv-tag">${inlineToHtml('$' + c.label + '$')}</span>` : '';
    card.innerHTML = v !== undefined
      ? `<span class="pv-val">${inlineToHtml(String(v))}</span>${tag}`
      : `<span class="pv-val">${inlineToHtml('$' + c.label + '$')}</span>`;
  }
  st.order.forEach((id, i) => slots[i].append(cards.get(id)));
  el.querySelector('.pv-expr').innerHTML = st.tex ? texToHtml(st.tex, true) : '';
  if (!play) return;
  for (const [id, card] of cards) {
    const r0 = before.get(id);
    if (!r0) continue;
    const r1 = card.getBoundingClientRect();
    const dx = (r0.left - r1.left) / scale;
    const dy = (r0.top - r1.top) / scale;
    if (!dx && !dy) continue;
    // 左へ動くカードは上、右へ動くカードは下を通り、2枚が重ならずに入れかわる様子が見えるようにする
    const lift = dx > 0 ? -70 : 70;
    const ms = (parseFloat(getComputedStyle(el).getPropertyValue('--anim')) || 380) * 2;
    card.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px)`, offset: 0.5 },
        { transform: 'none' },
      ],
      { duration: ms, easing: 'ease-in-out' },
    );
  }
}

// ---- ブロック図（bars）：割り算「わられる数 = わる数 × 商 + あまり」など ----
//   total: { text, key, value }  全体（上の かっこ に付ける名前）
//   parts[]: { text, w, color, key, value }  左から並べるブロック（w は長さの比）
//   groups[]: { from, to, text, key }  下の かっこ（parts の番号 from〜to をまとめる）
//   states[]: { id, total, parts, groups }  状態ごとに置きかえる項目（省略した項目はブロックのものを使う）
function buildBars() {
  return '';
}

function applyBars(el, b, st, play) {
  const total = st.total ?? b.total;
  const parts = st.parts ?? b.parts;
  const groups = st.groups ?? b.groups ?? [];
  const cols = parts.map((p) => `${Number(p.w ?? 1)}fr`).join(' ');
  const k = (o) => (o?.key ? ' k-' + o.key : '');
  el.innerHTML = `<div class="bars-grid"${play ? ' data-play' : ''}>
    ${total ? `<div class="bars-total${k(total)}" style="grid-column:1 / ${parts.length + 1}"><span>${inlineToHtml(total.text)}</span><i class="br-top"></i></div>` : ''}
    ${parts.map((p, i) => `<div class="bars-seg${p.color ? ' c-' + p.color : ''}${k(p)}" style="grid-column:${i + 1}">${inlineToHtml(p.text)}</div>`).join('')}
    ${groups.map((g) => `<div class="bars-group${k(g)}" style="grid-column:${g.from + 1} / ${g.to + 2}"><i class="br-bot"></i><span>${inlineToHtml(g.text)}</span></div>`).join('')}
  </div>`;
  const grid = el.firstElementChild;
  // 長さの変化（y,y,y,8 → 20,20,20,8）は、前の比から新しい比へ伸び縮みさせる
  if (play && el.dataset.cols && el.dataset.cols.split(' ').length === parts.length) {
    grid.style.gridTemplateColumns = el.dataset.cols;
    void grid.offsetWidth;
  }
  grid.style.gridTemplateColumns = cols;
  el.dataset.cols = cols;
}

export const STATEFUL = {
  place: { build: buildPlace, apply: applyPlace },
  bars: { build: buildBars, apply: applyBars },
  ...MOTION_BLOCKS, // 線分図 route・円周移動図 circle（motion-blocks.js）
  ...RATIO_BLOCKS, // 割合の帯グラフ ratio・食塩水のビーカー図 beakers（ratio-blocks.js）
};
