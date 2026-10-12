// ミニコンテンツ再生画面の共通の枠（1600×900 ステージ・ヘッダー・操作ボタン・講師用メモ）
import { getGrade, getChapter, getSection } from '../app/catalog.js';
import { navigate } from '../app/router.js';
import { returnFor, markResume } from '../app/session.js';
import { icon } from '../ui/icons.js';
import { teacherPanelHtml } from '../ui/teacher.js';
import { STAGE_W, STAGE_H } from '../ui/stage.js';
import { MINI_TYPES } from './mini-catalog.js';

export function unitLabel(mini) {
  const g = getGrade(mini.unit.grade);
  const ch = getChapter(mini.unit.grade, mini.unit.chapter);
  const s = getSection(mini.unit.grade, mini.unit.chapter, mini.unit.section);
  return [g?.label, ch && `${ch.number} ${ch.title}`, s && `${s.number}`].filter(Boolean).join(' ');
}

export function buildPlayer(root, mini, { toolbarHtml, teacherHtml }) {
  const type = MINI_TYPES[mini.type];
  const viewport = document.createElement('div');
  viewport.className = 'lesson-viewport';
  viewport.innerHTML = `
    <div class="stage mini-stage mini-${mini.type}" style="width:${STAGE_W}px;height:${STAGE_H}px">
      <header class="stage-header">
        <div class="crumbs">
          <span class="mini-type-badge">${icon(type.icon, 22)}${type.label}</span>
          <span class="mini-header-title"></span>
        </div>
        <div class="meta">
          <span class="mini-unit">${unitLabel(mini)}</span>
          <span class="meta-number mini-progress"></span>
        </div>
      </header>
      <main class="stage-body"></main>
      ${teacherPanelHtml(teacherHtml, { draft: mini.status === 'draft', legend: false })}
      <footer class="toolbar">${toolbarHtml}</footer>
    </div>`;
  root.append(viewport);
  const $ = (s) => viewport.querySelector(s);
  $('.mini-header-title').textContent = mini.title;
  return { viewport, stage: $('.stage'), body: $('.stage-body'), toolbar: $('.toolbar'), teacherPanel: $('.teacher-panel'), $ };
}

// 終了：授業画面から起動した場合は、その画面（同じステップ）に戻る。それ以外は単元の一覧へ。
export function exitMini(mini) {
  const to = returnFor(mini.path);
  if (to) {
    markResume(to.replace(/^\/lesson\//, ''));
    navigate(to);
  } else {
    navigate(`/units/${mini.unit.grade}/${mini.unit.chapter}`);
  }
}

export const exitButton = () => `<button class="tbtn" data-action="exit" title="終了して戻る">${icon('exit')}<span>終了</span></button>`;
export const commonRightButtons = () => `
  <button class="tbtn" data-action="teacher" title="講師用メモ">${icon('teacher')}<span>講師</span></button>
  <button class="tbtn" data-action="fullscreen" title="全画面 (F)">${icon('expand')}<span>全画面</span></button>`;

// 表紙（タイトル画面）
export function coverHtml(mini, { count, startHint }) {
  const type = MINI_TYPES[mini.type];
  return `
    <div class="mini-screen mini-cover">
      <div class="mini-cover-icon">${icon(type.icon, 96)}</div>
      <p class="mini-cover-type">${type.label}</p>
      <h1 class="mini-cover-title"></h1>
      ${mini.description ? '<p class="mini-cover-desc"></p>' : ''}
      <p class="mini-cover-meta">
        <span>${count}${type.unit}</span>
        ${mini.minutes ? `<span>約${mini.minutes}分</span>` : ''}
        ${mini.difficulty ? `<span>難易度 ${'★'.repeat(mini.difficulty)}${'☆'.repeat(3 - mini.difficulty)}</span>` : ''}
      </p>
      <p class="mini-cover-hint">${startHint}</p>
    </div>`;
}

export function fillCoverText(body, mini) {
  const h = body.querySelector('.mini-cover-title');
  if (h) h.textContent = mini.title;
  const d = body.querySelector('.mini-cover-desc');
  if (d) d.textContent = mini.description;
}
