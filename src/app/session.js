// 授業中の画面切り替え用の一時データ（sessionStorage：タブを閉じると消える）
//
// - 授業画面の表示モード・ステップを保存し、ミニコンテンツから戻ったときに復元する
// - ミニコンテンツの「終了」で戻る先（起動元の授業画面）を覚えておく
// 設定（localStorage）や将来の学習履歴とは別に管理する。

const get = (k) => {
  try {
    return JSON.parse(sessionStorage.getItem(k));
  } catch {
    return null;
  }
};
const set = (k, v) => {
  try {
    if (v == null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, JSON.stringify(v));
  } catch {
    // 保存できなくても動作は続ける
  }
};

export function saveLessonState(path, state) {
  set('mmn.lesson.' + path, state);
}

export function loadLessonState(path) {
  return get('mmn.lesson.' + path);
}

// ミニコンテンツを授業画面から起動するときに呼ぶ
export function launchFromLesson(lessonPath, miniPath) {
  set('mmn.resume', lessonPath);
  set('mmn.return', { mini: miniPath, to: '/lesson/' + lessonPath });
}

// 授業画面を開いたとき、ミニコンテンツから戻ってきた場合だけ true（1回で消える）
export function consumeResume(lessonPath) {
  const r = get('mmn.resume');
  set('mmn.resume', null);
  return r === lessonPath;
}

// ミニコンテンツの戻り先（そのミニコンテンツを授業画面から起動した場合だけ）
export function returnFor(miniPath) {
  const r = get('mmn.return');
  return r?.mini === miniPath ? r.to : null;
}

// 授業画面に戻る直前に、復元の合図を立て直す（ブラウザの「戻る」でも復元されるよう起動時にも立てている）
export function markResume(lessonPath) {
  set('mmn.resume', lessonPath);
}

// 授業画面の「前の問題へ」で移るとき、移り先を最後のページ（全ステップを表示した状態）で開くための合図（1回で消える）
export function enterAtEnd(lessonPath) {
  set('mmn.enterEnd', lessonPath);
}

export function consumeEnterAtEnd(lessonPath) {
  const r = get('mmn.enterEnd');
  set('mmn.enterEnd', null);
  return r === lessonPath;
}

// 本編 → 類題 へ移ったときの戻り先（from：本編のパス，to：類題のパス，edition：教材年度）。
// 類題の画面では「本編に戻る」で from の同じ表示モード・ステップに戻る。関係のない教材を開くと消える。
export function setReviewReturn(ctx) {
  set('mmn.reviewReturn', ctx);
}

export function getReviewReturn() {
  return get('mmn.reviewReturn');
}

export function clearReviewReturn() {
  set('mmn.reviewReturn', null);
}
