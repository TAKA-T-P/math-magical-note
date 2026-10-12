import { getGrade, getChapter, getSection, loadSection, contentLabel } from '../app/catalog.js';
import { getSettings, updateSettings, recordOpened, onSettingsChange, ANIM_MS } from '../app/settings.js';
import { inlineToHtml } from '../math/render.js';
import { icon } from '../ui/icons.js';
import { choose } from '../ui/dialog.js';
import { toggleFullscreen, isFullscreen } from '../ui/fullscreen.js';
import { initialState, reduce, canGo, computeView, availableModes, progressOf } from '../lesson/state.js';
import { LessonRenderer } from '../lesson/renderer.js';
import { InkLayer, inkStore, inkIsEmpty, resetInk, PEN_COLORS, STAGE_W, STAGE_H } from '../lesson/ink.js';

const MODE_LABELS = { problem: '問題', hint: 'ヒント', explain: '解説', all: '全解答' };
const COLOR_LABELS = { red: '赤', blue: '青', green: '緑', black: '黒', yellow: '黄' };
const WIDTH_LABELS = { s: '細', m: '中', l: '太' };
const AUTO_HIDE_MS = 2500;

export async function mountLesson(root, params) {
  const id = decodeURIComponent(params.id);
  const path = `${params.grade}/${params.chapter}/${params.section}/${params.id}`;
  const settings = getSettings();
  const grade = getGrade(params.grade);
  const chapter = getChapter(params.grade, params.chapter);
  const section = getSection(params.grade, params.chapter, params.section);

  let contents = [];
  try {
    contents = section?.data ? await loadSection(section.data, settings.edition) : [];
  } catch (e) {
    console.error(e);
  }
  const index = contents.findIndex((c) => c.id === id);
  const content = contents[index];
  if (!content) {
    root.innerHTML = `<div class="page"><p>教材が見つかりません（${settings.edition}年度版）。</p><a class="btn" href="#/">ホームへ</a></div>`;
    return;
  }
  const unitsPath = `/units/${params.grade}/${params.chapter}`;
  const sub = `${grade.label} ${chapter.number} ${section.number}`;
  recordOpened({ path, label: `${contentLabel(content)} ${content.title}`.replace(/\$/g, ''), sub });

  const modes = availableModes(content);
  const prevContent = contents[index - 1];
  const nextContent = contents[index + 1];
  const contentHref = (c) => `#/lesson/${params.grade}/${params.chapter}/${params.section}/${encodeURIComponent(c.id)}`;
  const t = content.teacher;

  // ---- DOM ----
  const viewport = document.createElement('div');
  viewport.className = 'lesson-viewport';
  viewport.innerHTML = `
    <div class="stage" style="width:${STAGE_W}px;height:${STAGE_H}px">
      <header class="stage-header">
        <div class="crumbs">
          <span>${grade.title}</span><span class="sep">›</span>
          <span>${chapter.number} ${chapter.title}</span><span class="sep">›</span>
          <span>${section.number} ${section.title}</span>
        </div>
        <div class="meta">
          ${(content.edition.tags ?? []).map((x) => `<span class="tag">${x}</span>`).join('')}
          <span class="meta-number">${inlineToHtml(contentLabel(content))}</span>
          <span class="meta-page">p.${content.edition.page}</span>
          <nav class="content-nav">
            ${prevContent ? `<a class="hbtn" href="${contentHref(prevContent)}" title="前の項目：${contentLabel(prevContent)}">${icon('prev', 20)}</a>` : ''}
            ${nextContent ? `<a class="hbtn" href="${contentHref(nextContent)}" title="次の項目：${contentLabel(nextContent)}">${icon('next', 20)}</a>` : ''}
          </nav>
        </div>
      </header>
      <main class="stage-body type-${content.type}"></main>
      <canvas class="ink-canvas"></canvas>
      <canvas class="ink-live"></canvas>

      <div class="ink-palette" hidden>
        <div class="pal-group">
          ${Object.keys(PEN_COLORS)
            .map((c) => `<button class="swatch" data-color="${c}" style="--sw:${PEN_COLORS[c]}" title="${COLOR_LABELS[c]}" aria-label="${COLOR_LABELS[c]}"></button>`)
            .join('')}
        </div>
        <div class="pal-group">
          <button class="tbtn" data-tool="pen">${icon('pen')}<span>ペン</span></button>
          <button class="tbtn" data-tool="marker">${icon('marker')}<span>蛍光</span></button>
          <button class="tbtn" data-tool="eraser">${icon('eraser')}<span>消しゴム</span></button>
        </div>
        <div class="pal-group">
          ${Object.entries(WIDTH_LABELS)
            .map(([w, l]) => `<button class="tbtn width-btn" data-width="${w}"><i style="--w:${{ s: 4, m: 8, l: 14 }[w]}px"></i><span>${l}</span></button>`)
            .join('')}
        </div>
        <div class="pal-group">
          <button class="tbtn" data-ink="undo">${icon('undo')}<span>戻す</span></button>
          <button class="tbtn" data-ink="redo">${icon('redo')}<span>やり直し</span></button>
          <button class="tbtn" data-ink="clear">${icon('trash')}<span>全消去</span></button>
        </div>
      </div>

      <aside class="teacher-panel" hidden aria-label="講師用情報">
        <div class="teacher-head">
          <strong>講師用メモ</strong><span class="muted">（生徒に見せない）</span>
          ${t?.status === 'draft' ? '<span class="tag tag-warn">下書き・要確認</span>' : ''}
          <button class="hbtn" data-action="teacher" aria-label="閉じる">${icon('close', 20)}</button>
        </div>
        <div class="teacher-step"></div>
        <div class="teacher-body">
          ${teacherSection('指導のねらい', t?.aim)}
          ${teacherSection('発問例', t?.questions)}
          ${teacherSection('つまずきやすいポイント', t?.pitfalls)}
          ${teacherSection('よくある誤答', t?.commonErrors)}
          ${teacherSection('補足説明', t?.notes)}
          ${teacherSection('推奨する解説手順', t?.procedure, true)}
          ${t ? '' : '<p class="muted">この教材には講師用情報が登録されていません。</p>'}
        </div>
      </aside>

      <footer class="toolbar">
        <div class="tb-group">
          <a class="tbtn" href="#${unitsPath}" title="問題一覧へ戻る">${icon('list')}<span>一覧</span></a>
          <button class="tbtn" data-act="first" title="最初に戻る (Home)">${icon('first')}<span>最初</span></button>
          <button class="tbtn" data-act="prev" title="前のステップ (←)">${icon('prev')}<span>前へ</span></button>
          <div class="step-info"><span class="step-count"></span><span class="step-title"></span></div>
          <button class="tbtn tbtn-next" data-act="next" title="次のステップ (→ / Space)">${icon('next')}<span>次へ</span></button>
        </div>
        <div class="tb-group mode-tabs" role="tablist">
          ${modes.map((m) => `<button class="mode-tab" role="tab" data-mode="${m}">${MODE_LABELS[m]}</button>`).join('')}
        </div>
        <div class="tb-group">
          <button class="tbtn" data-action="ink" title="手書き">${icon('pen')}<span>手書き</span></button>
          <button class="tbtn" data-action="teacher" title="講師用メモ">${icon('teacher')}<span>講師</span></button>
          <button class="tbtn" data-action="fullscreen" title="全画面 (F)">${icon('expand')}<span>全画面</span></button>
          <a class="tbtn" href="#/settings" title="設定">${icon('settings')}<span>設定</span></a>
        </div>
      </footer>
    </div>`;
  root.append(viewport);

  const $ = (s) => viewport.querySelector(s);
  const stage = $('.stage');
  stage.classList.toggle('no-steps', content.steps.length === 0);
  const body = $('.stage-body');
  const toolbar = $('.toolbar');
  const palette = $('.ink-palette');
  const teacherPanel = $('.teacher-panel');

  // ---- 16:9 ステージを画面に合わせて拡大縮小 ----
  let scale = 1;
  const ink = new InkLayer($('.ink-canvas'), $('.ink-live'), { onChange: syncInkButtons });
  function fit() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    scale = Math.min(w / STAGE_W, h / STAGE_H);
    stage.style.transform = `translate(${(w - STAGE_W * scale) / 2}px, ${(h - STAGE_H * scale) / 2}px) scale(${scale})`;
    ink.resize(scale);
    renderer.drawArrows();
  }

  function applySettings(s) {
    stage.style.setProperty('--zoom', s.zoom / 100);
    stage.style.setProperty('--anim', `${ANIM_MS[s.animSpeed] ?? 380}ms`);
    stage.classList.toggle('no-anim', s.animSpeed === 'none');
    stage.classList.toggle('toolbar-auto', s.toolbar === 'auto');
  }
  applySettings(settings);

  // ---- 解説の表示 ----
  const renderer = new LessonRenderer(body, { chapter, edition: settings.edition });
  let st = initialState();

  function update(forward) {
    const view = computeView(content, st);
    renderer.update(view, { forward, animate: getSettings().animSpeed !== 'none' });

    const N = content.steps.length;
    $('.step-count').textContent =
      st.mode === 'explain' ? `${st.step} / ${N}` : st.mode === 'hint' ? `ヒント ${st.hint}/${content.hints.length}` : MODE_LABELS[st.mode] ?? '';
    $('.step-title').innerHTML =
      st.mode === 'explain' ? (view.current ? inlineToHtml(view.current.title) : '問題') : st.mode === 'all' ? 'すべての解説' : '';
    for (const act of ['first', 'prev', 'next']) toolbar.querySelector(`[data-act="${act}"]`).disabled = !canGo(content, st, act);
    for (const tab of toolbar.querySelectorAll('[data-mode]')) {
      const on = tab.dataset.mode === st.mode;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on);
    }
    const note = view.current?.teacherNote;
    $('.teacher-step').innerHTML = note
      ? `<div class="teacher-note"><span class="tag">このステップ</span>${inlineToHtml(note)}</div>`
      : '';
  }

  function dispatch(action) {
    const next = reduce(content, st, action);
    if (next === st) return;
    const forward = progressOf(content, next) > progressOf(content, st);
    st = next;
    update(forward);
  }

  // ---- 手書き ----
  const pen = { ...settings.pen };
  ink.setTool(pen);
  function setInkMode(on) {
    ink.setEnabled(on);
    palette.hidden = !on;
    toolbar.querySelector('[data-action="ink"]').classList.toggle('is-active', on);
    syncInkButtons();
  }
  function syncInkButtons() {
    for (const b of palette.querySelectorAll('[data-color]')) b.classList.toggle('is-active', b.dataset.color === pen.color);
    for (const b of palette.querySelectorAll('[data-tool]')) b.classList.toggle('is-active', b.dataset.tool === pen.tool);
    for (const b of palette.querySelectorAll('[data-width]')) b.classList.toggle('is-active', b.dataset.width === pen.width);
    palette.querySelector('[data-ink="undo"]').disabled = !inkStore.actions.length;
    palette.querySelector('[data-ink="redo"]').disabled = !inkStore.redo.length;
    palette.querySelector('[data-ink="clear"]').disabled = inkIsEmpty();
  }
  function setPen(patch) {
    Object.assign(pen, patch);
    // 色を選んだら消しゴムからペンに戻す
    if (patch.color && pen.tool === 'eraser') pen.tool = 'pen';
    ink.setTool(pen);
    updateSettings({ pen: { ...pen } });
    syncInkButtons();
  }

  function setTeacher(open) {
    teacherPanel.hidden = !open;
    toolbar.querySelector('[data-action="teacher"]').classList.toggle('is-active', open);
  }

  // ---- 操作 ----
  viewport.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el || el.disabled) return;
    // ボタンにフォーカスが残ると Space キーで再度押されてしまうため外す
    el.blur();
    const d = el.dataset;
    if (d.act) dispatch(d.act);
    else if (d.mode) dispatch('mode:' + d.mode);
    else if (d.color) setPen({ color: d.color });
    else if (d.tool) setPen({ tool: d.tool });
    else if (d.width) setPen({ width: d.width });
    else if (d.ink) ink[d.ink === 'clear' ? 'clearAll' : d.ink]();
    else if (d.action === 'ink') setInkMode(!ink.enabled);
    else if (d.action === 'teacher') setTeacher(teacherPanel.hidden);
    else if (d.action === 'fullscreen') toggleFullscreen();
  });

  function onKey(e) {
    if (document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (ink.isDrawing || e.ctrlKey || e.metaKey || e.altKey) return;
    const map = {
      ArrowRight: 'next', ' ': 'next', PageDown: 'next',
      ArrowLeft: 'prev', PageUp: 'prev',
      Home: 'first', End: 'last',
    };
    if (map[e.key]) {
      e.preventDefault();
      if (!e.repeat) dispatch(map[e.key]);
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.key === 'Escape') {
      setInkMode(false);
      setTeacher(false);
    }
  }

  // 操作ボタンの自動非表示
  let idleTimer = 0;
  function wake() {
    toolbar.classList.remove('is-idle');
    clearTimeout(idleTimer);
    if (getSettings().toolbar === 'auto') {
      idleTimer = setTimeout(() => {
        if (!ink.enabled && teacherPanel.hidden && !toolbar.matches(':hover')) toolbar.classList.add('is-idle');
      }, AUTO_HIDE_MS);
    }
  }

  function onFullscreen() {
    const btn = toolbar.querySelector('[data-action="fullscreen"]');
    btn.innerHTML = isFullscreen() ? `${icon('shrink')}<span>全画面解除</span>` : `${icon('expand')}<span>全画面</span>`;
  }

  const ro = new ResizeObserver(fit);
  ro.observe(viewport);
  window.addEventListener('keydown', onKey);
  viewport.addEventListener('pointermove', wake);
  viewport.addEventListener('pointerdown', wake);
  document.addEventListener('fullscreenchange', onFullscreen);
  const offSettings = onSettingsChange((s) => {
    applySettings(s);
    wake();
  });

  fit();
  update(false);
  onFullscreen();
  wake();
  syncInkButtons();

  // 別の問題の手書きが残っている場合の扱い
  if (inkStore.owner !== path) {
    if (!inkIsEmpty()) {
      let action = getSettings().inkOnSwitch;
      if (action === 'ask') {
        action = await choose({
          title: '手書きの内容',
          message: '前に開いていた教材の手書きが残っています。消去しますか？',
          buttons: [
            { label: '残す', value: 'keep' },
            { label: '消去する', value: 'clear', primary: true },
          ],
          cancelValue: 'keep',
        });
      }
      if (action === 'clear') resetInk(path);
      ink.redraw();
      syncInkButtons();
    }
    inkStore.owner = path;
  }

  return () => {
    ro.disconnect();
    ink.destroy();
    clearTimeout(idleTimer);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFullscreen);
    offSettings();
  };
}

function teacherSection(title, value, ordered = false) {
  if (!value || (Array.isArray(value) && !value.length)) return '';
  const tag = ordered ? 'ol' : 'ul';
  const inner = Array.isArray(value)
    ? `<${tag}>${value.map((v) => `<li>${inlineToHtml(v)}</li>`).join('')}</${tag}>`
    : `<p>${inlineToHtml(value)}</p>`;
  return `<section><h3>${title}</h3>${inner}</section>`;
}

