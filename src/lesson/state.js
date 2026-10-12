// 授業画面の状態（表示モード・ステップ・ヒント）と、その状態で表示すべき内容の計算。
// DOM に依存しない純粋な関数だけを置く（将来の講師用ウィンドウ／家庭学習モードでも共用する）。
//
// 表示モード
//   problem : 問題のみ
//   hint    : 問題＋ヒント（hint 個目まで）
//   explain : 解説をステップ step まで表示（step 0 は問題のみ）
//   all     : 全ステップを一括表示

export const MODES = ['problem', 'hint', 'explain', 'all'];

export function initialState() {
  return { mode: 'problem', step: 0, hint: 0 };
}

export function availableModes(content) {
  const hasSteps = content.steps.length > 0;
  const hasHints = (content.hints ?? []).length > 0;
  return MODES.filter((m) => (m === 'hint' ? hasHints : hasSteps));
}

export function reduce(content, st, action) {
  const N = content.steps.length;
  const H = (content.hints ?? []).length;
  switch (action) {
    case 'next':
      if (st.mode === 'hint') return st.hint < H ? { ...st, hint: st.hint + 1 } : st;
      if (st.mode === 'problem') return N ? { ...st, mode: 'explain', step: 1 } : st;
      if (st.mode === 'explain') return st.step < N ? { ...st, step: st.step + 1 } : st;
      return st;
    case 'prev':
      if (st.mode === 'hint') return st.hint > 1 ? { ...st, hint: st.hint - 1 } : st;
      if (st.mode === 'explain') return st.step > 0 ? { ...st, step: st.step - 1 } : st;
      if (st.mode === 'all') return { ...st, mode: 'explain', step: Math.max(0, N - 1) };
      return st;
    case 'first':
      return N ? { ...st, mode: 'explain', step: 0 } : st;
    case 'last':
      return N ? { ...st, mode: 'all' } : st;
    case 'mode:problem':
      return { ...st, mode: 'problem', step: 0 };
    case 'mode:hint':
      return H ? { ...st, mode: 'hint', hint: Math.max(1, st.hint) } : st;
    case 'mode:explain':
      return N ? { ...st, mode: 'explain', step: st.mode === 'explain' ? st.step : st.mode === 'all' ? N : 0 } : st;
    case 'mode:all':
      return N ? { ...st, mode: 'all' } : st;
    default:
      return st;
  }
}

export function canGo(content, st, action) {
  return reduce(content, st, action) !== st;
}

// 進行度（アニメーションを「進む方向」のときだけ再生するために使う）
export function progressOf(content, st) {
  if (st.mode === 'all') return content.steps.length + 1;
  if (st.mode === 'explain') return st.step;
  if (st.mode === 'hint') return st.hint / 100;
  return 0;
}

// 状態から、表示するブロック・隠すキー・強調・矢印・コメントを求める
export function computeView(content, st) {
  const N = content.steps.length;
  const upto = st.mode === 'all' ? N : st.mode === 'explain' ? st.step : 0;

  const blocks = new Map(); // id -> { block, anim }
  for (const b of content.statement) blocks.set(b.id, { block: b, anim: 'none' });

  const revealed = new Set();
  const persistent = [];
  for (let i = 0; i < upto; i++) {
    const s = content.steps[i];
    for (const id of s.remove ?? []) blocks.delete(id);
    for (const b of s.add ?? []) blocks.set(b.id, { block: b, anim: b.anim ?? s.anim ?? 'fade' });
    for (const k of s.reveal ?? []) revealed.add(k);
    for (const e of s.emphasis ?? []) if (e.persist) persistent.push(e);
  }

  const current = st.mode === 'explain' && upto > 0 ? content.steps[upto - 1] : null;
  const hidden = new Set();
  for (const { block } of blocks.values()) for (const k of block.hide ?? []) if (!revealed.has(k)) hidden.add(k);

  // 後に書いたものが優先されるよう、キーごとに最後の指定を採用する
  const emphasis = new Map();
  for (const e of persistent) emphasis.set(e.key, e);
  if (current) for (const e of current.emphasis ?? []) emphasis.set(e.key, e);

  return {
    mode: st.mode,
    step: upto,
    total: N,
    current,
    blocks,
    hidden,
    emphasis,
    arrows: current?.arrows ?? [],
    comment: current?.comment ?? null,
    hints: st.mode === 'hint' ? (content.hints ?? []).slice(0, st.hint) : [],
  };
}
