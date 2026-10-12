// スライドの再生画面（数学ミニコラム・導入トーク）
import { getSettings } from '../app/settings.js';
import { icon } from '../ui/icons.js';
import { toggleFullscreen } from '../ui/fullscreen.js';
import { attachStage, keyAllowed } from '../ui/stage.js';
import { teacherEntry, teacherSection } from '../ui/teacher.js';
import { buildPlayer, exitMini, exitButton, commonRightButtons } from '../mini/player-shell.js';
import { initialSlideState, slideReduce, canSlide, slideToContent } from '../mini/slide-state.js';
import { LessonRenderer } from '../lesson/renderer.js';
import { computeView } from '../lesson/state.js';

export function mountMiniSlide(root, deck) {
  // ミニコンテンツは教材に記載のない独自コンテンツ。status（draft）を講師用メモの表示にも反映する
  const t = { ...deck.teacher, status: deck.status };
  const S = deck.slides.length;
  const p = buildPlayer(root, deck, {
    toolbarHtml: `
      <div class="tb-group">
        ${exitButton()}
        <button class="tbtn" data-act="first" title="最初に戻る (Home)">${icon('first')}<span>最初</span></button>
        <button class="tbtn" data-act="prev" title="前へ (←)">${icon('prev')}<span>前へ</span></button>
        <div class="step-info"><span class="step-count"></span><span class="step-title"></span></div>
        <button class="tbtn tbtn-next" data-act="next" title="次へ (→ / Space)">${icon('next')}<span>次へ</span></button>
      </div>
      <div class="tb-group slide-dots" aria-hidden="true">
        ${deck.slides.map((_, i) => `<span class="slide-dot" data-dot="${i}"></span>`).join('')}
      </div>
      <div class="tb-group">${commonRightButtons()}</div>`,
    teacherHtml: `
      ${teacherSection('ねらい', t?.aim, t)}
      ${teacherSection('進め方', t?.notes, t)}
      <div class="teacher-slide"></div>`,
  });
  const { body, toolbar, teacherPanel, $ } = p;

  let st = initialSlideState();
  let renderer = null;
  let shownSlide = -1;
  let content = null;

  function update(forward) {
    const slide = deck.slides[st.slide];
    if (st.slide !== shownSlide) {
      shownSlide = st.slide;
      content = slideToContent(slide);
      body.className = 'stage-body slide-body';
      renderer = new LessonRenderer(body, {}); // スライドごとに作り直す（ブロックIDはスライド内で一意）
      forward = forward && st.step === 0;
    }
    const view = computeView(content, { mode: 'explain', step: st.step, hint: 0 });
    renderer.update(view, { forward, animate: getSettings().animSpeed !== 'none' });

    const K = content.steps.length;
    $('.mini-progress').textContent = `${st.slide + 1} / ${S}`;
    $('.step-count').textContent = `スライド ${st.slide + 1} / ${S}`;
    $('.step-title').innerHTML = K ? `表示 ${st.step} / ${K}` : '';
    for (const act of ['first', 'prev', 'next']) toolbar.querySelector(`[data-act="${act}"]`).disabled = !canSlide(deck, st, act);
    // 最後まで進んだら「終了」を目立たせる
    toolbar.querySelector('[data-action="exit"]').classList.toggle('is-active', !canSlide(deck, st, 'next'));
    toolbar.querySelectorAll('[data-dot]').forEach((d) => d.classList.toggle('is-active', Number(d.dataset.dot) === st.slide));

    // 講師用メモ：このスライドの説明例・発問例と、このステップのメモ
    const st8 = slide.teacher;
    $('.teacher-slide').innerHTML =
      teacherSection(`スライド${st.slide + 1}の説明例`, st8?.notes, { status: deck.status }) +
      teacherSection(`スライド${st.slide + 1}の発問例`, st8?.questions, { status: deck.status });
    const note = view.current?.teacherNote;
    $('.teacher-step').innerHTML = note
      ? `<div class="teacher-note"><span class="tag">このステップ</span>${teacherEntry(note, { status: deck.status })}</div>`
      : '';
  }

  function dispatch(action) {
    const next = slideReduce(deck, st, action);
    if (next === st) return;
    const forward = next.slide > st.slide || (next.slide === st.slide && next.step > st.step);
    st = next;
    update(forward);
  }

  function setTeacher(open) {
    teacherPanel.hidden = !open;
    toolbar.querySelector('[data-action="teacher"]').classList.toggle('is-active', open);
  }

  p.viewport.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el || el.disabled) return;
    el.blur();
    const d = el.dataset;
    if (d.act) dispatch(d.act);
    else if (d.action === 'exit') exitMini(deck);
    else if (d.action === 'teacher') setTeacher(teacherPanel.hidden);
    else if (d.action === 'fullscreen') toggleFullscreen();
  });

  function onKey(e) {
    if (!keyAllowed(e)) return;
    const map = { ArrowRight: 'next', ' ': 'next', PageDown: 'next', ArrowLeft: 'prev', PageUp: 'prev', Home: 'first' };
    if (map[e.key]) {
      e.preventDefault();
      if (!e.repeat) dispatch(map[e.key]);
    } else if (e.key === 'End') {
      e.preventDefault();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.key === 'Escape') {
      setTeacher(false);
    }
  }
  window.addEventListener('keydown', onKey);

  const stageCtl = attachStage(p.viewport, p.stage, {
    onResize: () => renderer?.drawArrows(),
    canIdle: () => teacherPanel.hidden,
  });
  update(false);

  return () => {
    stageCtl.destroy();
    window.removeEventListener('keydown', onKey);
  };
}
