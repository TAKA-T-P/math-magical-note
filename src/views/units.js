import { getChapter, getGrade, loadSection, pageOf, TYPE_LABELS, contentLabel } from '../app/catalog.js';
import { getSettings } from '../app/settings.js';
import { inlineToHtml } from '../math/render.js';
import { icon } from '../ui/icons.js';

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

  page.innerHTML = `
    <header class="page-header">
      <a class="btn btn-ghost" href="#/">${icon('home')}ホーム</a>
      <div>
        <p class="muted">${grade.title}（${edition}年度版）</p>
        <h1>${chapter.number}　${chapter.title}</h1>
      </div>
    </header>
    <ol class="section-list">
      ${chapter.sections
        .map(
          (s) => `
        <li class="section-item ${s.data ? '' : 'is-disabled'}" data-section="${s.id}">
          <div class="section-head">
            <span class="section-num">${s.number}</span>
            <span class="section-title">${s.title}</span>
            <span class="page-badge">p.${pageOf(s, edition) ?? '-'}</span>
            ${s.data ? '' : '<span class="muted">準備中</span>'}
          </div>
          ${s.data ? '<div class="content-grid"><p class="muted">読み込み中…</p></div>' : ''}
        </li>`,
        )
        .join('')}
    </ol>
  `;

  for (const s of chapter.sections.filter((x) => x.data)) {
    const grid = page.querySelector(`[data-section="${s.id}"] .content-grid`);
    try {
      const contents = await loadSection(s.data, edition);
      grid.innerHTML = contents.length
        ? contents
            .map(
              (c) => `
          <a class="content-card type-${c.type}" href="#/lesson/${gradeId}/${chapterId}/${s.id}/${encodeURIComponent(c.id)}">
            <span class="content-type">${TYPE_LABELS[c.type] ?? c.type}</span>
            <span class="content-num">${inlineToHtml(contentLabel(c))}</span>
            <span class="content-title">${inlineToHtml(c.title)}</span>
            <span class="content-meta">
              <span class="page-badge">p.${c.edition.page}</span>
              ${(c.edition.tags ?? []).map((t) => `<span class="tag">${t}</span>`).join('')}
              ${c.steps.length ? `<span class="muted">${c.steps.length}ステップ</span>` : ''}
            </span>
          </a>`,
            )
            .join('')
        : '<p class="muted">この年度のデータはまだありません。</p>';
    } catch (e) {
      grid.innerHTML = `<p class="error">読み込みに失敗しました：${e.message}</p>`;
    }
  }
}
