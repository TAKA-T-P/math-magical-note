// クイズエンジンの状態（3択ウォームアップ・ミスを見破れ！・数学〇×クイズ共通）。DOM に依存しない。
//
//   index : -1 = タイトル画面, 0〜N-1 = 問題, N = 終了画面
//   stage : 0 = 出題中（生徒が考える時間）, 1〜 = 発表の段階
//
// 「次へ」（→ / Space / PageDown）は次の問題へ進むだけで、正解は表示しない。
// 正解の発表（reveal）は講師が別の操作（ボタン / Enter）で行う。

// ミスを見破れ！の発表段階：ミス発見 → 正しい解き方 → なぜまちがい？
export const MISTAKE_STAGES = [
  { id: 'spot', label: 'ミス発見' },
  { id: 'fix', label: '正しい解き方' },
  { id: 'explain', label: 'なぜまちがい？' },
];
const ANSWER_STAGES = [{ id: 'answer', label: '正解発表' }];

export function stagesOf(quiz) {
  return quiz.type === 'mistake' ? MISTAKE_STAGES : ANSWER_STAGES;
}

export function initialQuizState() {
  return { index: -1, stage: 0 };
}

export function quizReduce(quiz, st, action) {
  const N = quiz.questions.length;
  const onQuestion = st.index >= 0 && st.index < N;
  switch (action) {
    case 'next':
      return st.index < N ? { index: st.index + 1, stage: 0 } : st;
    case 'prev':
      return st.index > -1 ? { index: st.index - 1, stage: 0 } : st;
    case 'first':
      return st.index !== -1 || st.stage ? { index: -1, stage: 0 } : st;
    case 'reveal':
      return onQuestion && st.stage < stagesOf(quiz).length ? { ...st, stage: st.stage + 1 } : st;
    case 'unreveal':
      return onQuestion && st.stage > 0 ? { ...st, stage: st.stage - 1 } : st;
    default:
      return st;
  }
}

export function canQuiz(quiz, st, action) {
  return quizReduce(quiz, st, action) !== st;
}

// ミスを見破れ！の1問を、授業解説エンジン（lesson/state.js の computeView と LessonRenderer）で
// 表示できる「コンテンツ」の形に変換する。誤りの位置は数式キー（\hl）で指定し、既存の強調表示を使う。
export const ERROR_TYPES = {
  sign: '符号ミス',
  calc: '計算ミス',
  formula: '公式の誤用',
  transpose: '移項ミス',
  distribute: '分配法則のミス',
  approach: '方針の誤り', // 式の計算は正しいが、求めるもの・解き方の方針をまちがえている
  other: 'その他',
};

export function mistakeToContent(q) {
  const typeLabel = q.errorLabel ?? ERROR_TYPES[q.errorType] ?? 'その他';
  return {
    statement: [
      { id: 'prompt', type: 'text', area: 'top', text: q.prompt },
      ...(q.tex ? [{ id: 'problem', type: 'math', area: 'top', size: 'l', tex: q.tex }] : []),
      { id: 'wrong-label', type: 'text', area: 'left', tone: 'ng', text: q.wrong.label ?? 'まちがいのある解答' },
      { id: 'wrong', type: 'calc', area: 'left', size: 'l', rows: q.wrong.rows, align: q.wrong.align },
    ],
    steps: [
      {
        id: 'spot',
        title: 'ミス発見',
        emphasis: q.errorKeys.map((key) => ({ key, style: 'box', color: 'red', persist: true })),
        comment: `ミスはここ！（**${typeLabel}**）`,
      },
      {
        id: 'fix',
        title: '正しい解き方',
        add: [
          { id: 'correct-label', type: 'text', area: 'right', tone: 'ok', text: q.correct.label ?? '正しい解き方' },
          { id: 'correct', type: 'calc', area: 'right', size: 'l', rows: q.correct.rows, align: q.correct.align },
        ],
        emphasis: (q.correctKeys ?? []).map((key) => ({ key, style: 'box', color: 'blue', persist: true })),
        comment: `ミスはここ！（**${typeLabel}**）`,
      },
      {
        id: 'explain',
        title: 'なぜまちがい？',
        comment: [q.reason, q.note].filter(Boolean).join('\n'),
      },
    ],
  };
}
