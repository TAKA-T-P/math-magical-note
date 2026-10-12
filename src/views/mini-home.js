// 授業ミニコンテンツのメニュー（#/mini）と、種類ごとの一覧（#/mini/t/<種類>）
import { catalog, getGrade } from '../app/catalog.js';
import { getSettings, updateSettings } from '../app/settings.js';
import { icon } from '../ui/icons.js';
import { MINI_TYPES, MINI_ORDER, miniByType, miniByUnit } from '../mini/mini-catalog.js';
import { miniCardHtml } from '../mini/mini-card.js';

export function mountMiniHome(root) {
  const page = document.createElement('div');
  page.className = 'page mini-home';
  root.append(page);

  function render() {
    const s = getSettings();
    const grade = getGrade(s.grade)?.enabled ? getGrade(s.grade) : catalog.grades.find((g) => g.enabled);
    page.innerHTML = `
      <header class="page-header">
        <a class="btn btn-ghost" href="#/">${icon('home')}ホーム</a>
        <div>
          <p class="muted">授業の最初・途中・最後に使える短いコンテンツ</p>
          <h1>${icon('sparkle', 30)} 授業ミニコンテンツ</h1>
        </div>
      </header>

      <section class="panel">
        <h2>種類から選ぶ</h2>
        <div class="mini-type-grid">
          ${MINI_ORDER.map((t) => {
            const type = MINI_TYPES[t];
            const n = miniByType(t).length;
            return `<a class="mini-type-card mini-${t} ${n ? '' : 'is-disabled'}" ${n ? `href="#/mini/t/${t}"` : 'aria-disabled="true"'}>
              <span class="mini-type-icon">${icon(type.icon, 44)}</span>
              <span class="mini-type-name">${type.label}</span>
              <span class="mini-type-desc">${type.desc}</span>
              <span class="mini-type-count">${n ? `${n}件` : '準備中'}</span>
            </a>`;
          }).join('')}
        </div>
      </section>

      <section class="panel">
        <h2>単元から選ぶ</h2>
        <div class="grade-tabs" role="tablist">
          ${catalog.grades
            .map(
              (g) => `<button role="tab" class="grade-tab ${g.id === grade.id ? 'is-active' : ''}" data-grade="${g.id}"
                ${g.enabled ? '' : 'disabled'} aria-selected="${g.id === grade.id}">${g.label}${g.enabled ? '' : '<small>準備中</small>'}</button>`,
            )
            .join('')}
        </div>
        <div class="chapter-grid">
          ${grade.chapters
            .map((ch) => {
              const n = miniByUnit(grade.id, ch.id).length;
              return `<a class="chapter-card ${n ? '' : 'is-disabled'}" ${n ? `href="#/units/${grade.id}/${ch.id}"` : 'aria-disabled="true"'}>
                <span class="chapter-num">${ch.number}</span>
                <span class="chapter-title">${ch.title}</span>
                <span class="chapter-meta">${n ? `ミニコンテンツ ${n}件` : '準備中'}</span>
              </a>`;
            })
            .join('')}
        </div>
      </section>`;
  }

  page.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-grade]');
    if (tab) {
      updateSettings({ grade: tab.dataset.grade });
      render();
    }
  });
  render();
}

export function mountMiniList(root, { type }) {
  const page = document.createElement('div');
  page.className = 'page mini-list';
  root.append(page);
  const t = MINI_TYPES[type];
  if (!t) {
    page.innerHTML = `<p>種類が見つかりません。</p><a class="btn" href="#/mini">ミニコンテンツへ</a>`;
    return;
  }
  const items = miniByType(type);
  page.innerHTML = `
    <header class="page-header">
      <a class="btn btn-ghost" href="#/mini">${icon('prev')}ミニコンテンツ</a>
      <div>
        <p class="muted">${t.desc}</p>
        <h1 class="mini-${type}"><span class="mini-title-icon">${icon(t.icon, 34)}</span>${t.label}</h1>
      </div>
    </header>
    <section class="panel">
      ${items.length ? `<div class="mini-card-grid">${items.map((c) => miniCardHtml(c)).join('')}</div>` : '<p class="muted">準備中です。</p>'}
    </section>`;
}
