// スライドエンジンの状態（数学ミニコラム・導入トーク共通）。DOM に依存しない。
//
//   slide : 表示中のスライド番号（0〜）
//   step  : そのスライド内の段階表示の位置（0 = 最初の状態）
//
// 各スライドは授業解説と同じ「ブロック＋ステップ」で書けるので、表示は lesson/state.js の
// computeView と LessonRenderer をそのまま使う（強調・段階表示・矢印・コメントが使える）。

export function initialSlideState() {
  return { slide: 0, step: 0 };
}

const stepsOf = (deck, i) => deck.slides[i]?.steps?.length ?? 0;

export function slideReduce(deck, st, action) {
  const S = deck.slides.length;
  switch (action) {
    case 'next':
      if (st.step < stepsOf(deck, st.slide)) return { ...st, step: st.step + 1 };
      return st.slide < S - 1 ? { slide: st.slide + 1, step: 0 } : st;
    case 'prev':
      if (st.step > 0) return { ...st, step: st.step - 1 };
      // 前のスライドには、段階表示をすべて終えた状態で戻る
      return st.slide > 0 ? { slide: st.slide - 1, step: stepsOf(deck, st.slide - 1) } : st;
    case 'first':
      return st.slide || st.step ? { slide: 0, step: 0 } : st;
    default:
      return st;
  }
}

export function canSlide(deck, st, action) {
  return slideReduce(deck, st, action) !== st;
}

// スライド1枚を、授業解説エンジンで表示できる「コンテンツ」の形にする。
// スライドの見出しは、先頭の見出しブロックとして自動で追加する。
export function slideToContent(slide) {
  return {
    statement: [{ id: '__title', type: 'text', area: 'top', tone: 'heading', text: slide.title }, ...(slide.blocks ?? [])],
    steps: slide.steps ?? [],
    hints: [],
  };
}
