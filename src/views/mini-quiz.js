// クイズの再生画面（3択ウォームアップ・ミスを見破れ！・数学〇×クイズ）
import { getSettings } from '../app/settings.js';
import { icon } from '../ui/icons.js';
import { toggleFullscreen } from '../ui/fullscreen.js';
import { attachStage, keyAllowed } from '../ui/stage.js';
import { teacherEntry, teacherSection } from '../ui/teacher.js';
import { buildPlayer, exitMini, exitButton, commonRightButtons } from '../mini/player-shell.js';
import { initialQuizState, quizReduce, canQuiz, stagesOf } from '../mini/quiz-state.js';
import { QuizRenderer } from '../mini/quiz-renderer.js';

const TIMER_SECONDS = 10;

export function mountMiniQuiz(root, quiz) {
  // ミニコンテンツは教材に記載のない独自コンテンツ。status（draft）を講師用メモの表示にも反映する
  const t = { ...quiz.teacher, status: quiz.status };
  const stages = stagesOf(quiz);
  const p = buildPlayer(root, quiz, {
    toolbarHtml: `
      <div class="tb-group">
        ${exitButton()}
        <button class="tbtn" data-act="first" title="最初に戻る (Home)">${icon('first')}<span>最初</span></button>
        <button class="tbtn" data-act="prev" title="前の問題 (←)">${icon('prev')}<span>前の問題</span></button>
        <div class="step-info"><span class="step-count"></span><span class="step-title"></span></div>
        <button class="tbtn tbtn-next" data-act="next" title="次の問題 (→ / Space)">${icon('next')}<span class="next-label">次の問題</span></button>
      </div>
      <div class="tb-group">
        <button class="tbtn tbtn-reveal" data-act="reveal" title="正解発表 (Enter)">${icon('check')}<span class="reveal-label">正解発表</span></button>
        <button class="tbtn" data-act="unreveal" title="発表を1つ戻す (Backspace)">${icon('undo')}<span>戻す</span></button>
      </div>
      <div class="tb-group">
        <button class="tbtn" data-action="timer" title="考える時間（${TIMER_SECONDS}秒）。時間がきても正解は自動で表示されません">${icon('timer')}<span>${TIMER_SECONDS}秒</span></button>
        ${commonRightButtons()}
      </div>`,
    teacherHtml: `
      ${teacherSection('ねらい', t?.aim, t)}
      ${teacherSection('進め方', t?.notes, t)}
      ${teacherSection('発問例', t?.questions, t)}`,
  });
  const { body, toolbar, teacherPanel, $ } = p;
  p.stage.insertAdjacentHTML('beforeend', '<div class="quiz-timer" hidden></div>');

  const renderer = new QuizRenderer(body, quiz);
  let st = initialQuizState();
  const N = quiz.questions.length;

  function update(forward) {
    renderer.update(st, { forward, animate: getSettings().animSpeed !== 'none' });
    const onQ = st.index >= 0 && st.index < N;
    $('.mini-progress').textContent = onQ ? `第${st.index + 1}問 / ${N}` : '';
    $('.step-count').textContent = st.index < 0 ? 'タイトル' : st.index >= N ? '終了' : `第${st.index + 1}問 / ${N}`;
    $('.step-title').textContent = onQ ? (st.stage === 0 ? '考える時間' : stages[st.stage - 1].label) : '';
    $('.next-label').textContent = st.index < 0 ? 'はじめる' : st.index === N - 1 ? '終了画面へ' : '次の問題';
    $('.reveal-label').textContent = onQ && st.stage < stages.length ? stages[st.stage].label : stages[stages.length - 1].label;
    for (const act of ['first', 'prev', 'next', 'reveal', 'unreveal']) {
      const b = toolbar.querySelector(`[data-act="${act}"]`);
      if (b) b.disabled = !canQuiz(quiz, st, act);
    }
    // 講師用メモ：今の問題のメモ
    const q = onQ ? quiz.questions[st.index] : null;
    const notes = q ? [].concat(q.teacherNote ?? []) : [];
    $('.teacher-step').innerHTML = notes.length
      ? `<div class="teacher-note"><span class="tag">この問題</span><ul>${notes.map((n) => `<li>${teacherEntry(n, { status: quiz.status })}</li>`).join('')}</ul></div>`
      : '';
    if (!onQ || st.stage > 0) stopTimer();
  }

  function dispatch(action) {
    const next = quizReduce(quiz, st, action);
    if (next === st) return;
    const forward = next.index > st.index || (next.index === st.index && next.stage > st.stage);
    st = next;
    update(forward);
  }

  // 考える時間のカウントダウン（終わっても正解は表示しない）
  let timer = 0;
  function stopTimer() {
    clearInterval(timer);
    timer = 0;
    $('.quiz-timer').hidden = true;
    toolbar.querySelector('[data-action="timer"]').classList.remove('is-active');
  }
  function toggleTimer() {
    if (timer) return stopTimer();
    if (!(st.index >= 0 && st.index < N)) return;
    let left = TIMER_SECONDS;
    const el = $('.quiz-timer');
    el.hidden = false;
    el.classList.remove('is-done');
    el.textContent = left;
    toolbar.querySelector('[data-action="timer"]').classList.add('is-active');
    timer = setInterval(() => {
      left--;
      if (left > 0) el.textContent = left;
      else {
        clearInterval(timer);
        timer = 0;
        el.textContent = '時間です';
        el.classList.add('is-done');
        setTimeout(() => { if (!timer) el.hidden = true; }, 2500);
        toolbar.querySelector('[data-action="timer"]').classList.remove('is-active');
      }
    }, 1000);
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
    else if (d.action === 'exit') exitMini(quiz);
    else if (d.action === 'teacher') setTeacher(teacherPanel.hidden);
    else if (d.action === 'fullscreen') toggleFullscreen();
    else if (d.action === 'timer') toggleTimer();
  });

  // → / Space / PageDown は次の問題へ進むだけ。正解発表は Enter（またはボタン）で行う。
  function onKey(e) {
    if (!keyAllowed(e)) return;
    const map = {
      ArrowRight: 'next', ' ': 'next', PageDown: 'next',
      ArrowLeft: 'prev', PageUp: 'prev',
      Home: 'first', Enter: 'reveal', Backspace: 'unreveal',
    };
    if (map[e.key]) {
      e.preventDefault();
      if (!e.repeat) dispatch(map[e.key]);
    } else if (e.key === 'End') {
      e.preventDefault(); // 授業画面の「全解答」に相当する操作はクイズでは使わない
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.key === 'Escape') {
      setTeacher(false);
      stopTimer();
    }
  }
  window.addEventListener('keydown', onKey);

  const stageCtl = attachStage(p.viewport, p.stage, {
    onResize: () => renderer.drawArrows(),
    canIdle: () => teacherPanel.hidden,
  });
  update(false);

  return () => {
    stopTimer();
    stageCtl.destroy();
    window.removeEventListener('keydown', onKey);
  };
}
