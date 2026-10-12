// 講師用メモの表示（授業画面・ミニコンテンツで共用）
import { inlineToHtml } from '../math/render.js';
import { icon } from './icons.js';

// 講師向け情報の1項目。文字列、または { text, source: "material" | "draft" }。
// source を省略した項目は teacher.status に従う（status: "draft" なら提案扱い）。
export function sourceOf(entry, t) {
  return (typeof entry === 'object' && entry.source) || (t?.status === 'draft' ? 'draft' : 'material');
}

export function teacherEntry(entry, t) {
  const text = typeof entry === 'object' ? entry.text : entry;
  const src = sourceOf(entry, t);
  return `<span class="src src-${src}">${src === 'material' ? '教材' : '提案'}</span>${inlineToHtml(text)}`;
}

export function hasDraft(entries, t) {
  return entries.filter(Boolean).some((e) => sourceOf(e, t) === 'draft');
}

export function teacherSection(title, value, t, ordered = false) {
  if (!value || (Array.isArray(value) && !value.length)) return '';
  const tag = ordered ? 'ol' : 'ul';
  const inner = Array.isArray(value)
    ? `<${tag}>${value.map((v) => `<li>${teacherEntry(v, t)}</li>`).join('')}</${tag}>`
    : `<p>${teacherEntry(value, t)}</p>`;
  return `<section><h3>${title}</h3>${inner}</section>`;
}

// パネルの枠。本文（bodyHtml）と、ステップごとに差し替える欄（.teacher-step）を持つ
export function teacherPanelHtml(bodyHtml, { draft = false, legend = true } = {}) {
  return `
    <aside class="teacher-panel" hidden aria-label="講師用情報">
      <div class="teacher-head">
        <strong>講師用メモ</strong><span class="muted">（生徒に見せない）</span>
        ${draft ? '<span class="tag tag-warn">要確認あり</span>' : ''}
        <button class="hbtn" data-action="teacher" aria-label="閉じる">${icon('close', 20)}</button>
      </div>
      ${legend ? '<p class="teacher-legend"><span class="src src-material">教材</span>本編・指導書に記載　<span class="src src-draft">提案</span>教材にない補足（下書き）</p>' : ''}
      <div class="teacher-step"></div>
      <div class="teacher-body">${bodyHtml}</div>
    </aside>`;
}
