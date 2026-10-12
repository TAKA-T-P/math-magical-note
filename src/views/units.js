import { getChapter, getGrade, loadSection, pageOf, TYPE_LABELS, contentLabel } from '../app/catalog.js';
import { getSettings } from '../app/settings.js';
import { inlineToHtml } from '../math/render.js';
import { icon } from '../ui/icons.js';
import { attachTooltips } from '../ui/tooltip.js';
import { miniByUnit } from '../mini/mini-catalog.js';
import { miniCardHtml } from '../mini/mini-card.js';

// 節の開閉状態（このブラウザだけに保存する。保存できなくても動作には影響しない）
const FOLD_KEY = 'mmn.units.closed';
const loadClosed = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLD_KEY)) ?? []);
  } catch {
    return new Set();
  }
};
const saveClosed = (set) => {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify([...set]));
  } catch {
    // 保存できなくてもよい
  }
};

// 教材のカード：問題番号と短い単元名だけを表示し、詳しい情報はツールチップに入れる
function contentCardHtml(c, href) {
  const tags = c.edition.tags ?? [];
  return `
    <a class="content-card type-${c.type}" href="${href}" data-tip>
      <span class="content-num">${inlineToHtml(contentLabel(c))}</span>
      <span class="content-title">${inlineToHtml(c.title)}</span>
      <span class="tip-content">
        <span class="tip-type">${TYPE_LABELS[c.type] ?? c.type}</span>
        <strong class="tip-title">${inlineToHtml(contentLabel(c))}　${inlineToHtml(c.title)}</strong>
        <span class="tip-meta">
          <span class="page-badge">p.${c.edition.page}</span>
          ${tags.map((t) => `<span class="tag">${t}</span>`).join('')}
          ${c.steps.length ? `<span>${c.steps.length}ステップ</span>` : ''}
          ${(c.hints ?? []).length ? `<span>ヒント${c.hints.length}</span>` : ''}
        </span>
        ${c.edition.ref ? `<span class="tip-desc">対応：${inlineToHtml(c.edition.ref)}</span>` : ''}
      </span>
    </a>`;
}

// 章 → 節 → 教材（ポイント・問題）の選択画面
export async function mountUnits(root, { grade: gradeId, chapter: chapterId }) {
  const { edition } = getSettings();
  const grade = getGrade(gradeId);
  const chapter = getChapter(gradeId, chapterId);
  const page = document.createElement('div');
  page.className = 'page units';
  root.append(page);

  if (!chapter) {
    page.innerHTML = `<p>章が見つかりません。</p><a class="btn" href="#/">ホームへ</a>`;
    return;
  }

  const closed = loadClosed();
  const keyOf = (s) => `${gradeId}/${chapterId}/${s.id}`;

  page.innerHTML = `
    <header class="page-header">
      <a class="btn btn-ghost" href="#/">${icon('home')}ホーム</a>
      <div>
        <p class="muted">${grade.title}（${edition}年度版）</p>
        <h1>${chapter.number}　${chapter.title}</h1>
      </div>
      <div class="fold-all">
        <button class="btn btn-ghost" data-fold="open">すべて開く</button>
        <button class="btn btn-ghost" data-fold="close">すべて閉じる</button>
      </div>
    </header>
    <div class="section-list">
      ${chapter.sections
        .map((s) => {
          const minis = miniByUnit(gradeId, chapterId, s.id);
          const has = !!s.data || minis.length > 0;
          return `
        <details class="section-item ${has ? '' : 'is-disabled'}" data-section="${s.id}" ${has && !closed.has(keyOf(s)) ? 'open' : ''}>
          <summary class="section-head">
            <span class="fold-mark" aria-hidden="true">${icon('next', 18)}</span>
            <span class="section-num">${s.number}</span>
            <span class="section-title">${s.title}</span>
            <span class="page-badge">p.${pageOf(s, edition) ?? '-'}</span>
            <span class="section-count muted">${has ? (minis.length ? `ミニ ${minis.length}` : '') : '準備中'}</span>
          </summary>
          ${s.data ? `<h3 class="group-label">${icon('book', 18)}魔法のノート</h3><div class="content-grid"><p class="muted">読み込み中…</p></div>` : ''}
          ${minis.length ? `<h3 class="group-label">${icon('sparkle', 18)}授業ミニコンテンツ</h3><div class="mini-card-grid">${minis.map((c) => miniCardHtml(c, { showUnit: false })).join('')}</div>` : ''}
        </details>`;
        })
        .join('')}
    </div>
  `;

  // 開閉を記憶する
  page.addEventListener(
    'toggle',
    (e) => {
      const d = e.target.closest?.('details[data-section]');
      if (!d) return;
      const k = `${gradeId}/${chapterId}/${d.dataset.section}`;
      if (d.open) closed.delete(k);
      else closed.add(k);
      saveClosed(closed);
    },
    true,
  );
  page.querySelector('.fold-all').addEventListener('click', (e) => {
    const mode = e.target.closest('[data-fold]')?.dataset.fold;
    if (!mode) return;
    page.querySelectorAll('details.section-item:not(.is-disabled)').forEach((d) => (d.open = mode === 'open'));
  });
  const detachTips = attachTooltips(page);

  for (const s of chapter.sections.filter((x) => x.data)) {
    const item = page.querySelector(`[data-section="${s.id}"]`);
    const grid = item.querySelector('.content-grid');
    try {
      const contents = await loadSection(s.data, edition);
      grid.innerHTML = contents.length
        ? contents.map((c) => contentCardHtml(c, `#/lesson/${gradeId}/${chapterId}/${s.id}/${encodeURIComponent(c.id)}`)).join('')
        : '<p class="muted">この年度のデータはまだありません。</p>';
      const count = item.querySelector('.section-count');
      const minis = miniByUnit(gradeId, chapterId, s.id).length;
      count.textContent = [`教材 ${contents.length}`, minis ? `ミニ ${minis}` : ''].filter(Boolean).join('・');
    } catch (e) {
      grid.innerHTML = `<p class="error">読み込みに失敗しました：${e.message}</p>`;
    }
  }

  return detachTips;
}
