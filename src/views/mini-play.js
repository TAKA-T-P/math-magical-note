// #/mini/play/<学年>/<章>/<節>/<ID> … 種類に応じてクイズ／スライドの再生画面を開く
import { getMini, MINI_TYPES } from '../mini/mini-catalog.js';
import { mountMiniQuiz } from './mini-quiz.js';
import { mountMiniSlide } from './mini-slide.js';

export function mountMiniPlay(root, params) {
  const mini = getMini(params.grade, params.chapter, params.section, decodeURIComponent(params.id));
  if (!mini) {
    root.innerHTML = `<div class="page"><p>ミニコンテンツが見つかりません。</p><a class="btn" href="#/mini">ミニコンテンツへ</a></div>`;
    return;
  }
  return MINI_TYPES[mini.type].engine === 'quiz' ? mountMiniQuiz(root, mini) : mountMiniSlide(root, mini);
}
