// 速さの文章題の図（状態を持つブロック）：線分図 route・円周移動図 circle。
// 位置の計算は motion.js（DOM非依存）で行い、ここでは描画と再生ボタンだけを扱う。
//
// 再生は講師がボタンで行う（ステップを進めても自動では動かない）。ステップを変えて状態が変わると、
// 再生は止まり、その状態の最初の場面に戻る。画面を離れる（要素が外れる）と再生ループも止まる。
import { inlineToHtml } from '../math/render.js';
import { routeTimeline, routeDistanceAt, circleAt, dirsOf } from './motion.js';

const SVG = 'http://www.w3.org/2000/svg';
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const label = (o, cls, style) =>
  o ? `<div class="mv-label ${cls}${o.key ? ' k-' + o.key : ''}" style="${style}">${inlineToHtml(o.text)}</div>` : '';
const fmt = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1));

// ---- 再生の共通部品（▶ 再生 / ⏸ 一時停止 / ⟲ 最初から） ----
// duration：再生する時間（問題の単位。例 4 時間）、secondsPerUnit：その1単位を何秒で再生するか
function attachPlayer(el, { duration, secondsPerUnit, timeUnit, draw }) {
  const ctrl = el.querySelector('.mv-ctrl');
  const btn = ctrl.querySelector('[data-mv=play]');
  const clock = ctrl.querySelector('.mv-clock');
  let t = 0;
  let running = false;
  let last = 0;
  const show = () => {
    draw(t);
    clock.textContent = `経過時間 ${fmt(t)} ${timeUnit}`;
    btn.textContent = running ? '⏸ 一時停止' : t >= duration ? '▶ もう一度' : t > 0 ? '▶ 続きから' : '▶ 再生';
  };
  const tick = (now) => {
    if (!running) return;
    if (!el.isConnected) return void (running = false); // 別の問題・画面へ移ったら止める
    t = Math.min(duration, t + (now - last) / 1000 / secondsPerUnit);
    last = now;
    if (t >= duration) running = false;
    show();
    if (running) requestAnimationFrame(tick);
  };
  btn.addEventListener('click', (e) => {
    e.currentTarget.blur(); // Space キー（次のステップ）がボタンに奪われないように
    if (running) running = false;
    else {
      if (t >= duration) t = 0;
      running = true;
      last = performance.now();
      requestAnimationFrame(tick);
    }
    show();
  });
  ctrl.querySelector('[data-mv=reset]').addEventListener('click', (e) => {
    e.currentTarget.blur();
    running = false;
    t = 0;
    show();
  });
  // 手書き・ステップ送りのキー操作がボタンのクリックとして扱われないよう、押下を外に伝えない
  ctrl.addEventListener('pointerdown', (e) => e.stopPropagation());
  show();
}

const controls = (scale) => `<div class="mv-ctrl">
  <button type="button" class="mv-btn" data-mv="play"></button>
  <button type="button" class="mv-btn" data-mv="reset">⟲ 最初から</button>
  <span class="mv-clock"></span><span class="mv-scale">${scale}</span></div>`;

// ---- 線分図（route） ----
//   points[]: { text, key }  左から並ぶ地点（A・B・C、家・駅 など）
//   segments[]: { w, top[], bottom[], key }  地点のあいだの区間。w は長さの比、top / bottom は区間の上下の文章（{ text, key }）
//   total: { text, key }  全体の上のかっこ、side: { text, key }  右はしの文章（合計時間など）
//   icon: 移動する人の絵（public/illust/<icon>.svg）、note: 図の下の注意（「長さは実際の比ではない」など）
//   states[]: { id, segments, total, side, note, motion }  motion: { legs[{ distance, speed, icon }], expect{ time, distance }, timeUnit, secondsPerUnit, scaleText }
//     motion のある状態だけ再生ボタンを出す。区間の長さ w は道のりに比例させる（validator が確認）
function buildRoute() {
  return '';
}

function applyRoute(el, b, st) {
  const segs = st.segments ?? b.segments;
  const total = st.total ?? b.total;
  const side = st.side ?? b.side;
  const note = st.note ?? b.note;
  const motion = st.motion;
  const W = Number(b.width ?? 680);
  const sideW = side ? 150 : 0;
  const x0 = 34;
  const L = W - x0 * 2 - sideW;
  const sumW = segs.reduce((a, s) => a + Number(s.w ?? 1), 0);
  const xs = [x0];
  segs.forEach((s) => xs.push(xs.at(-1) + (Number(s.w ?? 1) / sumW) * L));
  const nBottom = Math.max(1, ...segs.map((s) => list(s.bottom).length));
  const lineY = total ? 128 : 96;
  const H = lineY + 14 + nBottom * 36;
  const points = b.points
    .map((p, i) => label(p, 'mv-point', `left:${xs[i]}px;top:${lineY - 74}px`))
    .join('');
  const segLabels = segs
    .map((s, i) => {
      const cx = (xs[i] + xs[i + 1]) / 2;
      return [
        ...list(s.top).map((o) => label(o, 'mv-top', `left:${cx}px;top:${lineY - 38}px`)),
        ...list(s.bottom).map((o, j) => label(o, 'mv-bottom', `left:${cx}px;top:${lineY + 22 + j * 36}px`)),
      ].join('');
    })
    .join('');
  el.innerHTML = `<div class="mv-route" style="width:${W}px;height:${H}px">
      <svg class="mv-svg" width="${W}" height="${H}">
        ${total ? `<path class="mv-brace" d="M${xs[0]},${lineY - 74} q0,-26 26,-26 H${xs.at(-1) - 26} q26,0 26,26"/>` : ''}
        <line class="mv-line" x1="${xs[0]}" y1="${lineY}" x2="${xs.at(-1)}" y2="${lineY}"/>
        ${segs.map((s, i) => `<line class="mv-seg${s.key ? ' k-' + s.key : ''}" x1="${xs[i]}" y1="${lineY}" x2="${xs[i + 1]}" y2="${lineY}"/>`).join('')}
        ${xs.map((x) => `<line class="mv-tick" x1="${x}" y1="${lineY - 12}" x2="${x}" y2="${lineY + 12}"/>`).join('')}
      </svg>
      ${total ? label(total, 'mv-total', `left:${(xs[0] + xs.at(-1)) / 2}px;top:${lineY - 112}px`) : ''}
      ${points}${segLabels}
      ${side ? label(side, 'mv-side', `left:${xs.at(-1) + 24}px;top:${lineY - 18}px`) : ''}
      ${motion && b.icon ? `<img class="mv-icon" src="./illust/${encodeURI(b.icon)}.svg" alt="移動する人" style="left:${xs[0]}px;top:${lineY - 4}px">` : ''}
    </div>
    ${note ? `<div class="mv-note">${inlineToHtml(note)}</div>` : ''}
    ${motion ? controls(motion.scaleText ?? '') : ''}`;
  if (!motion) return;
  const tl = routeTimeline(motion.legs);
  const icon = el.querySelector('.mv-icon');
  attachPlayer(el, {
    duration: tl.total,
    secondsPerUnit: motion.secondsPerUnit ?? 1,
    timeUnit: motion.timeUnit ?? '',
    // 図の長さは道のりに比例しているので、進んだ道のりの割合をそのまま横の位置にする
    draw: (t) => {
      icon.style.left = `${xs[0] + (routeDistanceAt(tl, t) / tl.distance) * (xs.at(-1) - xs[0])}px`;
      // 区間ごとに絵を変える（歩く → 走る など。legs[].icon）
      const leg = motion.legs[Math.max(0, tl.legs.findIndex((l) => t <= l.t1))] ?? motion.legs.at(-1);
      const src = `./illust/${encodeURI(leg.icon ?? b.icon)}.svg`;
      if (icon.getAttribute('src') !== src) icon.setAttribute('src', src);
    },
  });
}

// ---- 円周移動図（circle） ----
//   length：1周の長さ、size：図の大きさ（px）、center：中の文字（「池」）、lengthLabel：{ text, key }（「1周 2400m」）
//   runners[]: { id, name, color }  走る人（名前は1文字で円の中に表示する）
//   states[]: { id, mode: "opposite" | "same", view: "schematic" | "play", caption, ... }
//     schematic（模式図）：frac（出会う位置・妹の進んだ割合の目安。実際の比ではない）、labels: { <runner id>: {text,key}, rel: {text,key} }
//     play（実際の数値で再生）：speeds: { <runner id>: 速さ }, until（出会う／追いぬく時刻）, timeUnit, secondsPerUnit, unit（「m」）
//   向きは motion.js の dirsOf（反対方向は1人目が反時計回り・2人目が時計回り、同じ方向は2人とも反時計回り）

function buildCircle() {
  return '';
}

function applyCircle(el, b, st) {
  const S = Number(b.size ?? 280);
  const c = S / 2;
  const R = S * 0.33;
  const dirs = dirsOf(st.mode);
  const [ra, rb] = b.runners;
  const pt = (frac, dir, r = R) => {
    const th = -Math.PI / 2 + dir * frac * 2 * Math.PI;
    return [c + r * Math.cos(th), c + r * Math.sin(th)];
  };
  // 出発点から dir の向きに frac 周ぶんの弧（frac ≥ 1 は1周分の円）
  const arc = (frac, dir, r) => {
    if (frac >= 0.999) return `M${c},${c - r} a${r},${r} 0 1,1 0,${2 * r} a${r},${r} 0 1,1 0,${-2 * r}`;
    const [x, y] = pt(frac, dir, r);
    return `M${c},${c - r} A${r},${r} 0 ${frac > 0.5 ? 1 : 0},${dir > 0 ? 1 : 0} ${x},${y}`;
  };
  // らせん：1周より多く進んだ道のり（同じ方向で兄が妹より1周多く進む様子）
  const spiral = (laps, dir, r0, r1) => {
    const pts = [];
    for (let s = 0; s <= laps + 1e-9; s += 0.01) {
      const [x, y] = pt(s, dir, r0 + ((r1 - r0) * s) / laps);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return `M${pts.join(' L')}`;
  };
  const runnerDot = (r, [x, y], cls = '') =>
    `<g class="mv-runner c-${r.color}${cls}" transform="translate(${x},${y})"><circle r="15"/><text dy="6">${r.name}</text></g>`;

  let svg = '';
  let html = '';
  const lab = (o, [x, y], cls = '') => label(o, 'mv-clabel' + cls, `left:${x}px;top:${y}px`);
  if (st.view === 'schematic') {
    const f = Number(st.frac ?? 0.6);
    const L = st.labels ?? {};
    if (st.mode === 'opposite') {
      // 兄は反時計回りに f 周、妹は時計回りに 1-f 周 → 出会う（2人の道のりの和＝1周）
      svg += `<path class="mv-trail c-${ra.color}" d="${arc(f, dirs[0], R + 12)}"/>`;
      svg += `<path class="mv-trail dashed c-${rb.color}" d="${arc(1 - f, dirs[1], R - 12)}"/>`;
      const meet = pt(f, dirs[0]);
      svg += `<path class="mv-meet" d="M${meet[0] - 10},${meet[1] - 10} l20,20 m0,-20 l-20,20"/>`;
      html += lab(L[ra.id], pt(f / 2, dirs[0], R + 46)) + lab(L[rb.id], pt((1 - f) / 2, dirs[1], R + 46));
      html += lab(L.meet, [meet[0], meet[1] + 34]);
    } else {
      // 妹は f 周、兄は 1+f 周（らせん）→ 兄が妹を追いぬく（2人の道のりの差＝1周）
      svg += `<path class="mv-trail dashed c-${rb.color}" d="${arc(f, dirs[1], R - 12)}"/>`;
      svg += `<path class="mv-trail c-${ra.color}" d="${spiral(1 + f, dirs[0], R + 8, R + 26)}"/>`;
      const meet = pt(f, dirs[0]);
      svg += `<path class="mv-meet" d="M${meet[0] - 10},${meet[1] - 10} l20,20 m0,-20 l-20,20"/>`;
      // 兄（外側のらせん）は右側，妹（内側の弧）は弧の外側，追いぬく位置は円の外に名前を置く
      html += lab(L[ra.id], pt(0.75, dirs[0], R + 50)) + lab(L[rb.id], pt(f / 2, dirs[1], R + 50));
      html += lab(L.meet, pt(f, dirs[0], R + 56));
    }
    html += label({ text: 'スタート' }, 'mv-clabel mv-startlabel', `left:${c}px;top:${c - R - 26}px`);
  }
  el.innerHTML = `<div class="mv-circle" style="width:${S}px;height:${S}px">
      <svg class="mv-svg" width="${S}" height="${S}">
        <circle class="mv-track" cx="${c}" cy="${c}" r="${R}"/>
        <circle class="mv-pond" cx="${c}" cy="${c}" r="${R - 26}"/>
        <line class="mv-start" x1="${c}" y1="${c - R - 10}" x2="${c}" y2="${c - R + 10}"/>
        <g class="mv-dyn">${svg}</g>
      </svg>
      <div class="mv-center">${inlineToHtml(b.center ?? '')}</div>
      ${b.lengthLabel ? label(b.lengthLabel, 'mv-length', `left:${c}px;top:${c + 26}px`) : ''}
      <div class="mv-dynhtml">${html}</div>
    </div>
    ${st.caption ? `<div class="mv-caption">${inlineToHtml(st.caption)}</div>` : ''}
    ${st.view === 'play' ? `<div class="mv-read"></div>${controls(st.scaleText ?? '')}` : ''}`;
  el.style.width = `${S}px`; // 2つの図を横に並べられるよう，ブロックの幅を図に合わせる
  if (st.view !== 'play') return;

  // 実際の速さで再生：位置は motion.js の circleAt（速さ×時間）で求める
  const course = { length: b.length, runners: b.runners.map((r, i) => ({ id: r.id, speed: st.speeds[r.id], dir: dirs[i] })) };
  const dyn = el.querySelector('.mv-dyn');
  const read = el.querySelector('.mv-read');
  const unit = st.unit ?? '';
  const until = Number(st.until);
  attachPlayer(el, {
    duration: until,
    secondsPerUnit: st.secondsPerUnit ?? 0.5,
    timeUnit: st.timeUnit ?? '',
    draw: (t) => {
      const pos = circleAt(course, t);
      const done = t >= until - 1e-9;
      // 今の周で進んだ弧（何周目かは文字で表示）
      dyn.innerHTML =
        b.runners
          .map((r, i) => {
            const p = pos[i];
            const inLap = p.dist / b.length - p.laps;
            const rr = i === 0 ? R + 12 : R - 12;
            return inLap > 0.001 ? `<path class="mv-trail${i ? ' dashed' : ''} c-${r.color}" d="${arc(inLap, dirs[i], rr)}"/>` : '';
          })
          .join('') +
        b.runners.map((r, i) => runnerDot(r, pt(pos[i].dist / b.length, dirs[i]), done ? ' is-done' : '')).join('');
      const [pa, pb] = pos;
      const rel = st.mode === 'opposite'
        ? `2人の道のりの和 ${fmt(pa.dist + pb.dist)}${unit}`
        : `2人の道のりの差 ${fmt(pa.dist - pb.dist)}${unit}`;
      read.innerHTML = `<span class="c-${ra.color}">${ra.name} ${fmt(pa.dist)}${unit}</span>
        <span class="c-${rb.color}">${rb.name} ${fmt(pb.dist)}${unit}</span>
        <strong>${rel}</strong>${done ? `<em>${st.mode === 'opposite' ? '出会った！' : 'はじめて追いぬいた！'}</em>` : ''}`;
    },
  });
}

export const MOTION_BLOCKS = {
  route: { build: buildRoute, apply: applyRoute },
  circle: { build: buildCircle, apply: applyCircle },
};
