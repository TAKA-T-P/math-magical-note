// ミニコンテンツのカード（一覧・単元選択画面で共用）
// カードには種類のアイコンとタイトルだけを表示し、詳しい情報はツールチップ（.tip-content）に入れる。
import { icon } from '../ui/icons.js';
import { MINI_TYPES, countOf, miniHref } from './mini-catalog.js';
import { unitLabel } from './player-shell.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function miniCardHtml(c, { showUnit = true } = {}) {
  const type = MINI_TYPES[c.type];
  return `
    <a class="mini-card mini-${c.type}" href="${miniHref(c)}" data-tip>
      <span class="mini-card-icon" aria-hidden="true">${icon(type.icon, 22)}</span>
      <span class="mini-card-main">
        <span class="mini-card-type">${type.label}</span>
        <span class="mini-card-title">${esc(c.title)}</span>
      </span>
      ${c.status === 'draft' ? '<span class="draft-dot" title="要確認"></span>' : ''}
      <span class="tip-content">
        <span class="tip-type mini-${c.type}">${type.label}</span>
        <strong class="tip-title">${esc(c.title)}</strong>
        ${c.description ? `<span class="tip-desc">${esc(c.description)}</span>` : ''}
        <span class="tip-meta">
          ${showUnit ? `<span>${esc(unitLabel(c))}</span>` : ''}
          <span>${countOf(c)}${type.unit}</span>
          ${c.minutes ? `<span>約${c.minutes}分</span>` : ''}
          ${c.status === 'draft' ? '<span class="tag tag-warn">要確認（下書き）</span>' : ''}
        </span>
      </span>
    </a>`;
}
