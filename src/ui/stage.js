// 1600×900 の固定ステージを画面に合わせて拡大縮小し、共通設定（表示倍率・アニメーション速度・
// 操作ボタンの自動非表示）と全画面ボタンの表示を管理する。授業画面とミニコンテンツで共用する。
import { getSettings, onSettingsChange, ANIM_MS } from '../app/settings.js';
import { isFullscreen } from './fullscreen.js';
import { icon } from './icons.js';

export const STAGE_W = 1600;
export const STAGE_H = 900;
const AUTO_HIDE_MS = 2500;

// viewport: 画面全体の要素、stage: 1600×900 の要素
// onResize(scale): 拡大率が変わったとき（手書きキャンバスの解像度調整など）
// canIdle(): 操作ボタンを隠してよいか（ツールやパネルを開いている間は隠さない）
export function attachStage(viewport, stage, { onResize = () => {}, canIdle = () => true } = {}) {
  const toolbar = stage.querySelector('.toolbar');
  let scale = 1;

  function fit() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    scale = Math.min(w / STAGE_W, h / STAGE_H);
    stage.style.transform = `translate(${(w - STAGE_W * scale) / 2}px, ${(h - STAGE_H * scale) / 2}px) scale(${scale})`;
    onResize(scale);
  }

  function applySettings(s) {
    stage.style.setProperty('--zoom', s.zoom / 100);
    stage.style.setProperty('--anim', `${ANIM_MS[s.animSpeed] ?? 380}ms`);
    stage.classList.toggle('no-anim', s.animSpeed === 'none');
    stage.classList.toggle('toolbar-auto', s.toolbar === 'auto');
  }

  let idleTimer = 0;
  function wake() {
    toolbar?.classList.remove('is-idle');
    clearTimeout(idleTimer);
    if (getSettings().toolbar === 'auto') {
      idleTimer = setTimeout(() => {
        if (canIdle() && !toolbar?.matches(':hover')) toolbar?.classList.add('is-idle');
      }, AUTO_HIDE_MS);
    }
  }

  function onFullscreen() {
    const btn = stage.querySelector('[data-action="fullscreen"]');
    if (btn) btn.innerHTML = isFullscreen() ? `${icon('shrink')}<span>全画面解除</span>` : `${icon('expand')}<span>全画面</span>`;
  }

  const ro = new ResizeObserver(fit);
  ro.observe(viewport);
  viewport.addEventListener('pointermove', wake);
  viewport.addEventListener('pointerdown', wake);
  document.addEventListener('fullscreenchange', onFullscreen);
  const offSettings = onSettingsChange((s) => {
    applySettings(s);
    wake();
  });

  applySettings(getSettings());
  fit();
  onFullscreen();
  wake();

  return {
    get scale() {
      return scale;
    },
    fit,
    destroy() {
      ro.disconnect();
      clearTimeout(idleTimer);
      document.removeEventListener('fullscreenchange', onFullscreen);
      offSettings();
    },
  };
}

// キー操作を受け付けてよいか（ダイアログ表示中・入力欄の編集中・修飾キー付きは除外）
export function keyAllowed(e) {
  if (document.querySelector('dialog[open]')) return false;
  if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return false;
  return !(e.ctrlKey || e.metaKey || e.altKey);
}
