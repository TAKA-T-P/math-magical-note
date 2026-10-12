import { icon } from '../ui/icons.js';

const TIMER_LABEL = '10秒';

const KEYS = [
  ['→ / Space / PageDown', '次のステップ'],
  ['← / PageUp', '前のステップ'],
  ['Home', '問題の最初へ'],
  ['End', '全解答を表示'],
  ['F', '全画面の切り替え'],
  ['Esc', '全画面の解除・開いているツールを閉じる'],
];

export function mountHelp(root) {
  const page = document.createElement('div');
  page.className = 'page help';
  page.innerHTML = `
    <header class="page-header">
      <button class="btn btn-ghost" data-action="back">${icon('prev')}戻る</button>
      <h1>ヘルプ</h1>
    </header>
    <section class="panel">
      <h2>授業の進め方</h2>
      <ol class="help-list">
        <li>ホームで学年・章を選び、節の中のポイントや問題を選びます。</li>
        <li>授業画面の下部で「問題／ヒント／解説／全解答」を切り替えます。</li>
        <li>「次へ」またはキーボードの → で、解説を1ステップずつ表示します。</li>
        <li>「手書き」をONにすると、画面に直接書き込めます。OFFにすると書いた内容は残したまま通常操作に戻ります。</li>
        <li>「講師」ボタンで、指導のねらい・発問例・つまずきポイントを表示します（生徒に見せる前に閉じてください）。</li>
      </ol>
    </section>
    <section class="panel">
      <h2>キーボード操作</h2>
      <table class="key-table">
        ${KEYS.map(([k, d]) => `<tr><th>${k.split(' / ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</th><td>${d}</td></tr>`).join('')}
      </table>
      <p class="muted">手書き中や入力欄の編集中は、キー操作は反応しません。プレゼン用リモコン（PageUp/PageDown）でも操作できます。</p>
    </section>
    <section class="panel">
      <h2>授業ミニコンテンツ</h2>
      <ol class="help-list">
        <li>ホームの「授業ミニコンテンツ」から種類や単元を選ぶか、章の一覧・授業画面の「ミニ」ボタンから開きます。</li>
        <li>クイズでは、→ で次の問題へ進んでも正解は表示されません。正解は「正解発表」ボタンか <kbd>Enter</kbd> で発表します（<kbd>Backspace</kbd> で1つ戻す）。</li>
        <li>「${TIMER_LABEL}」ボタンで考える時間のカウントダウンを表示できます（時間がきても正解は自動で出ません）。</li>
        <li>スライドは → / ← で、段階表示とスライドを順に進めます。</li>
        <li>「終了」を押すと、授業画面から開いた場合はその問題の同じステップに戻ります。</li>
      </ol>
    </section>
  `;
  page.querySelector('[data-action="back"]').addEventListener('click', () =>
    history.length > 1 ? history.back() : (location.hash = '#/'),
  );
  root.append(page);
}
