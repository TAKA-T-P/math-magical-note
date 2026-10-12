import { catalog } from '../app/catalog.js';
import { getSettings, updateSettings, resetSettings } from '../app/settings.js';
import { icon } from '../ui/icons.js';

const FIELDS = [
  { key: 'edition', label: '教材年度', options: catalog.editions.map((e) => [e, `${e}年度版`]) },
  {
    key: 'animSpeed',
    label: 'アニメーション速度',
    options: [['none', 'なし'], ['fast', '速い'], ['normal', '標準'], ['slow', '遅い']],
  },
  { key: 'zoom', label: '授業画面の表示倍率', options: [80, 90, 100, 110, 120, 135].map((z) => [z, `${z}%`]), number: true },
  {
    key: 'toolbar',
    label: '操作ボタンの表示',
    options: [['show', '常に表示'], ['auto', '操作しないときは隠す']],
  },
  {
    key: 'inkOnSwitch',
    label: '別の問題に移るときの手書き',
    options: [['ask', '毎回たずねる'], ['clear', '自動で消去'], ['keep', '残す']],
  },
];

export function mountSettings(root) {
  const page = document.createElement('div');
  page.className = 'page settings';
  root.append(page);

  function render() {
    const s = getSettings();
    page.innerHTML = `
      <header class="page-header">
        <button class="btn btn-ghost" data-action="back">${icon('prev')}戻る</button>
        <h1>設定</h1>
      </header>
      <form class="panel settings-form">
        ${FIELDS.map(
          (f) => `
          <fieldset>
            <legend>${f.label}</legend>
            <div class="seg">
              ${f.options
                .map(
                  ([v, l]) => `<label><input type="radio" name="${f.key}" value="${v}" ${String(s[f.key]) === String(v) ? 'checked' : ''}><span>${l}</span></label>`,
                )
                .join('')}
            </div>
          </fieldset>`,
        ).join('')}
        <p class="muted">設定はこのブラウザに保存され、再読み込みしても保持されます。ペンの色・太さは授業画面で選んだものが保存されます。</p>
        <button type="button" class="btn" data-action="reset">設定を初期値に戻す</button>
      </form>
    `;
  }

  page.addEventListener('change', (e) => {
    const f = FIELDS.find((x) => x.key === e.target.name);
    if (f) updateSettings({ [f.key]: f.number ? Number(e.target.value) : e.target.value });
  });
  page.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a === 'back') history.length > 1 ? history.back() : (location.hash = '#/');
    if (a === 'reset') {
      resetSettings();
      render();
    }
  });
  render();
}
