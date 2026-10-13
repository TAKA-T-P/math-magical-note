import { getChapter, getGrade, loadSection, pageOf, TYPE_LABELS, contentLabel, isReview, pageRange } from '../app/catalog.js';
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
// links：本編⇔類題の対応（{ label, href }[]。ツールチップに表示）
function contentCardHtml(c, href, links = []) {
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
        ${links.length ? `<span class="tip-desc">${c.type === 'similar' ? '本編' : '類題'}：${links.map((l) => inlineToHtml(l.label)).join('，')}</span>` : ''}
      </span>
    </a>`;
}

// 類題のカード：カードの下に、対応する本編の問題へのリンクを付ける
function reviewCardHtml(c, href, links) {
  return `<div class="review-card">
    ${contentCardHtml(c, href, links)}
    ${links.map((l) => `<a class="orig-link" href="${l.href}" title="本編の ${l.label.replace(/"/g, '')} を開く">本編 ${inlineToHtml(l.label)}</a>`).join('')}
  </div>`;
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
            <span class="page-badge">p.${isReview(s) ? pageRange(s, edition) : pageOf(s, edition) ?? '-'}</span>
            <span class="section-count muted">${has ? (minis.length ? `ミニ ${minis.length}` : '') : '準備中'}</span>
          </summary>
          ${s.data ? `<h3 class="group-label">${icon(isReview(s) ? 'practice' : 'book', 18)}${isReview(s) ? '類題（各節の本編の問題に対応）' : '魔法のノート'}</h3><div class="content-grid"><p class="muted">読み込み中…</p></div>` : ''}
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

  // 本編・類題の対応を表示するため、章の全教材を先に読み込んで ID → 番号・リンク の表をつくる
  const loaded = new Map();
  const byId = new Map();
  for (const s of chapter.sections.filter((x) => x.data)) {
    const list = await loadSection(s.data, edition).catch((e) => e);
    loaded.set(s.id, list);
    if (Array.isArray(list)) for (const c of list) byId.set(c.id, { label: contentLabel(c), href: `#/lesson/${gradeId}/${chapterId}/${s.id}/${encodeURIComponent(c.id)}` });
  }
  const linksOf = (c) => [...(c.related?.similar ?? []), ...(c.related?.original ?? [])].map((id) => byId.get(id)).filter(Boolean);

  for (const s of chapter.sections.filter((x) => x.data)) {
    const item = page.querySelector(`[data-section="${s.id}"]`);
    const grid = item.querySelector('.content-grid');
    try {
      const contents = loaded.get(s.id);
      if (contents instanceof Error) throw contents;
      const hrefOf = (c) => `#/lesson/${gradeId}/${chapterId}/${s.id}/${encodeURIComponent(c.id)}`;
      if (isReview(s)) {
        // 類題は節ごとにまとめて表示する（教材の掲載順）
        const groups = [...new Set(contents.map((c) => c.group))];
        grid.outerHTML = groups
          .map((g) => {
            const sec = chapter.sections.find((x) => x.id === g);
            return `<h4 class="review-group">${sec ? `${sec.number}　${sec.title}` : g}</h4>
              <div class="content-grid">${contents.filter((c) => c.group === g).map((c) => reviewCardHtml(c, hrefOf(c), linksOf(c))).join('')}</div>`;
          })
          .join('');
      } else {
        grid.innerHTML = contents.length
          ? contents.map((c) => contentCardHtml(c, hrefOf(c), linksOf(c))).join('')
          : '<p class="muted">この年度のデータはまだありません。</p>';
      }
      const count = item.querySelector('.section-count');
      const minis = miniByUnit(gradeId, chapterId, s.id).length;
      count.textContent = [`教材 ${contents.length}`, minis ? `ミニ ${minis}` : ''].filter(Boolean).join('・');
    } catch (e) {
      grid.innerHTML = `<p class="error">読み込みに失敗しました：${e.message}</p>`;
    }
  }

  return detachTips;
}
