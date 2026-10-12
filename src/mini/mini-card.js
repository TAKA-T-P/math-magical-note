// ミニコンテンツのカード（一覧・単元選択画面で共用）
import { icon } from '../ui/icons.js';
import { MINI_TYPES, countOf, miniHref } from './mini-catalog.js';
import { unitLabel } from './player-shell.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function miniCardHtml(c, { showUnit = true } = {}) {
  const type = MINI_TYPES[c.type];
  return `
    <a class="mini-card mini-${c.type}" href="${miniHref(c)}">
      <span class="mini-card-type">${icon(type.icon, 22)}${type.label}</span>
      <span class="mini-card-title">${esc(c.title)}</span>
      ${c.description ? `<span class="mini-card-desc">${esc(c.description)}</span>` : ''}
      <span class="mini-card-meta">
        ${showUnit ? `<span>${esc(unitLabel(c))}</span>` : ''}
        <span>${countOf(c)}${type.unit}</span>
        ${c.minutes ? `<span>約${c.minutes}分</span>` : ''}
        ${c.status === 'draft' ? '<span class="tag tag-warn">要確認</span>' : ''}
      </span>
    </a>`;
}
