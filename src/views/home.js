import { catalog, getGrade, pageOf } from '../app/catalog.js';
import { getSettings, updateSettings } from '../app/settings.js';
import { navigate } from '../app/router.js';
import { icon } from '../ui/icons.js';
import { miniAll } from '../mini/mini-catalog.js';

export function mountHome(root) {
  const page = document.createElement('div');
  page.className = 'page home';
  root.append(page);

  function render() {
    const s = getSettings();
    const grade = getGrade(s.grade)?.enabled ? getGrade(s.grade) : catalog.grades.find((g) => g.enabled);

    page.innerHTML = `
      <header class="home-hero">
        <img class="home-logo" src="./icon.svg" alt="">
        <div>
          <p class="home-sub">KECゼミナール 数学科 授業支援</p>
          <h1>動く魔法のノート</h1>
        </div>
        <nav class="home-links">
          <a class="btn btn-ghost" href="#/settings">${icon('settings')}設定</a>
          <a class="btn btn-ghost" href="#/help">${icon('help')}ヘルプ</a>
        </nav>
      </header>

      <section class="home-menu">
        <div class="menu-card menu-note">
          <span class="menu-icon">${icon('book', 44)}</span>
          <div class="menu-text">
            <h2>魔法のノート</h2>
            <p>教材の問題・ポイントを、段階的に解説します。</p>
            <button class="btn btn-primary btn-xl" data-action="start">${icon('play')}授業モード開始</button>
            <p class="muted">${s.last ? `前回：${esc(s.last.sub)} ${esc(s.last.label)}` : '下の一覧から学年と章を選んで始めます'}</p>
          </div>
        </div>
        <a class="menu-card menu-mini" href="#/mini">
          <span class="menu-icon">${icon('sparkle', 44)}</span>
          <div class="menu-text">
            <h2>授業ミニコンテンツ</h2>
            <p>3択ウォームアップ・ミスを見破れ！・数学〇×クイズ・数学ミニコラム・導入トーク</p>
            <span class="btn btn-xl menu-open">${icon('next')}開く（${miniAll().length}件）</span>
          </div>
        </a>
      </section>

      <section class="panel">
        <h2>学年を選ぶ</h2>
        <div class="grade-tabs" role="tablist">
          ${catalog.grades
            .map(
              (g) => `<button role="tab" class="grade-tab ${g.id === grade.id ? 'is-active' : ''}" data-grade="${g.id}"
                ${g.enabled ? '' : 'disabled'} aria-selected="${g.id === grade.id}">${g.label}${g.enabled ? '' : '<small>準備中</small>'}</button>`,
            )
            .join('')}
        </div>
        <h2>章を選ぶ <small class="muted">${grade.title}（${s.edition}年度版）</small></h2>
        <div class="chapter-grid">
          ${grade.chapters
            .map((ch) => {
              const ready = ch.sections.some((sec) => sec.data);
              return `<a class="chapter-card ${ready ? '' : 'is-disabled'}" ${ready ? `href="#/units/${grade.id}/${ch.id}"` : 'aria-disabled="true"'}>
                <span class="chapter-num">${ch.number}</span>
                <span class="chapter-title">${ch.title}</span>
                <span class="chapter-meta">p.${pageOf(ch, s.edition) ?? '-'}〜 ${ready ? '' : '・準備中'}</span>
              </a>`;
            })
            .join('')}
        </div>
      </section>

      ${
        s.recent.length
          ? `<section class="panel">
              <h2>最近開いた単元</h2>
              <ul class="recent-list">
                ${s.recent.map((r) => `<li><a href="#/lesson/${r.path}"><span class="muted">${esc(r.sub)}</span> ${esc(r.label)}</a></li>`).join('')}
              </ul>
            </section>`
          : ''
      }
    `;
  }

  page.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-grade]');
    if (tab) {
      updateSettings({ grade: tab.dataset.grade });
      render();
      return;
    }
    if (e.target.closest('[data-action="start"]')) {
      const s = getSettings();
      if (s.last) return navigate('/lesson/' + s.last.path);
      const g = catalog.grades.find((x) => x.enabled);
      const ch = g.chapters.find((c) => c.sections.some((sec) => sec.data));
      navigate(`/units/${g.id}/${ch.id}`);
    }
  });

  render();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}
