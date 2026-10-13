// 移動のデータ計算（DOM に依存しない）。線分図・円周移動図の表示と、validator の検算で共用する。
// 将来ダイヤグラム（時間と位置のグラフ）を追加するときも、ここで求めた位置をそのまま使う。

// ---- 線分上の移動 ----
// legs: [{ distance, speed }]（区間ごとの道のりと速さ。単位はそろえておく）
// 戻り値: { total: 合計時間, distance: 合計の道のり, legs: [{ t0, t1, d0, d1, speed }] }
export function routeTimeline(legs) {
  let t = 0;
  let d = 0;
  const out = legs.map((l) => {
    const dt = l.distance / l.speed;
    const leg = { t0: t, t1: t + dt, d0: d, d1: d + l.distance, speed: l.speed };
    t += dt;
    d += l.distance;
    return leg;
  });
  return { total: t, distance: d, legs: out };
}

// 時刻 t に、出発点から進んだ道のり
export function routeDistanceAt(tl, t) {
  if (t <= 0) return 0;
  for (const l of tl.legs) if (t <= l.t1) return l.d0 + (t - l.t0) * l.speed;
  return tl.distance;
}

// ---- 円周上の移動 ----
// 向き：反対方向は1人目が反時計回り・2人目が時計回り、同じ方向は2人とも反時計回り（教材の図に合わせる）
export const dirsOf = (mode) => (mode === 'opposite' ? [-1, 1] : [-1, -1]);

// course: { length, runners: [{ id, speed, dir }] }（dir: 1＝時計回り，-1＝反時計回り）
// 時刻 t の各人の道のりと、出発点から時計回りに測った位置（0〜1：1周に対する割合）
export function circleAt(course, t) {
  return course.runners.map((r) => {
    const dist = r.speed * t;
    const frac = (((r.dir * dist) / course.length) % 1 + 1) % 1;
    return { id: r.id, dist, frac, laps: Math.floor(dist / course.length) };
  });
}

// 2人が「出会う／追いつく」までの時間を、式を使わずに少しずつ時間を進めて求める（検算用）。
// 2人の位置の差（1周に対する割合）が 0 に戻った最初の時刻を返す。
export function firstCoincidence(course, { step = 0.001, max = 1000 } = {}) {
  const [a, b] = course.runners;
  const gap = (t) => {
    const d = ((a.dir * a.speed - b.dir * b.speed) * t) / course.length; // 位置の差（周）
    return d - Math.round(d);
  };
  let prev = gap(step);
  for (let t = 2 * step; t <= max; t += step) {
    const g = gap(t);
    // 差の小数部分が符号を変えた（整数周をまたいだ）ところ
    if (Math.abs(g) < 1e-9 || (Math.sign(g) !== Math.sign(prev) && Math.abs(g - prev) < 0.5)) return Math.round(t / step) * step;
    prev = g;
  }
  return null;
}
