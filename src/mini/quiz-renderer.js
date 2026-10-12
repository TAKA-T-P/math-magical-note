// クイズエンジンの表示（3択・〇×は専用レイアウト、ミスを見破れ！は授業解説エンジンで表示）
import { inlineToHtml, texToHtml } from '../math/render.js';
import { icon } from '../ui/icons.js';
import { LessonRenderer } from '../lesson/renderer.js';
import { computeView } from '../lesson/state.js';
import { coverHtml, fillCoverText } from './player-shell.js';
import { mistakeToContent } from './quiz-state.js';

const NUMS = ['①', '②', '③', '④', '⑤'];
export const TF_CHOICES = [
  { id: 'o', mark: '〇', label: '正しい' },
  { id: 'x', mark: '×', label: '正しくない' },
];

export class QuizRenderer {
  constructor(body, quiz) {
    this.body = body;
    this.quiz = quiz;
    this.index = null;
    this.lesson = null; // ミスを見破れ！用
    this.mistake = null;
  }

  // index が変わったら画面を作り直し、stage の変化は表示の切り替えだけで行う
  update(st, { forward, animate }) {
    const N = this.quiz.questions.length;
    if (st.index !== this.index) {
      this.index = st.index;
      this.lesson = null;
      this.body.className = 'stage-body';
      if (st.index < 0) this.renderCover();
      else if (st.index >= N) this.renderEnd();
      else if (this.quiz.type === 'mistake') this.renderMistake(this.quiz.questions[st.index]);
      else this.renderQuestion(this.quiz.questions[st.index], st.index);
      forward = forward && st.stage === 0;
    }
    if (st.index < 0 || st.index >= N) return;
    if (this.lesson) {
      this.lesson.update(computeView(this.mistake, { mode: 'explain', step: st.stage, hint: 0 }), { forward, animate });
      return;
    }
    const revealed = st.stage > 0;
    const screen = this.body.querySelector('.quiz-screen');
    screen.classList.toggle('is-revealed', revealed);
    screen.classList.toggle('play-anim', revealed && forward && animate);
    this.body.querySelector('.quiz-explain').hidden = !revealed;
  }

  renderCover() {
    this.body.innerHTML = coverHtml(this.quiz, {
      count: this.quiz.questions.length,
      startHint: '「はじめる」または → キーで第1問へ',
    });
    fillCoverText(this.body, this.quiz);
  }

  renderEnd() {
    this.body.innerHTML = `
      <div class="mini-screen mini-end">
        <div class="mini-cover-icon">${icon('check', 96)}</div>
        <h1>おつかれさまでした！</h1>
        <p>全${this.quiz.questions.length}問　終了です。</p>
        <div class="mini-end-buttons">
          <button class="btn btn-xl" data-act="first">${icon('first')}もう一度</button>
          <button class="btn btn-xl btn-primary" data-action="exit">${icon('exit')}終了して戻る</button>
        </div>
      </div>`;
  }

  renderQuestion(q, i) {
    const isTF = this.quiz.type === 'truefalse';
    const choices = isTF ? TF_CHOICES : q.choices;
    const answer = q.answer;
    this.body.innerHTML = `
      <div class="quiz-screen ${isTF ? 'quiz-tf' : 'quiz-choice3'}">
        <div class="quiz-head"><span class="quiz-qnum">第${i + 1}問</span><div class="quiz-prompt">${inlineToHtml(q.prompt)}</div></div>
        ${q.tex ? `<div class="quiz-tex">${texToHtml(q.tex, true)}</div>` : ''}
        <ol class="quiz-choices">
          ${choices
            .map(
              (c, k) => `
            <li class="choice ${c.id === answer ? 'is-answer' : ''}" data-choice="${c.id}">
              <span class="choice-num">${isTF ? c.mark : NUMS[k]}</span>
              <span class="choice-text">${isTF ? c.label : inlineToHtml(c.text)}</span>
              <span class="choice-badge">${icon('check', 30)}正解</span>
            </li>`,
            )
            .join('')}
        </ol>
        <div class="quiz-explain" hidden><span class="quiz-explain-tag">解説</span><div>${inlineToHtml(q.explanation)}</div></div>
      </div>`;
  }

  renderMistake(q) {
    this.mistake = mistakeToContent(q);
    this.body.className = 'stage-body type-exercise';
    this.lesson = new LessonRenderer(this.body, {});
  }

  drawArrows() {
    this.lesson?.drawArrows();
  }
}
