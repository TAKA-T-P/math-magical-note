// 電子黒板用の手書きレイヤー（Canvas）
//
// ストロークは画面のピクセルではなく「ステージ座標（1600×900）」で保存するため、
// PC と電子黒板で画面サイズが違っても、書いた位置が問題とずれない。
// 手書き内容は授業画面を離れても保持し（メモリ上のみ）、別の問題を開くときに消去するか選べる。

export const STAGE_W = 1600;
export const STAGE_H = 900;

export const PEN_COLORS = { red: '#e0262b', blue: '#1f6fd1', green: '#16924a', black: '#222222', yellow: '#ffd400' };
export const PEN_WIDTHS = { s: 3, m: 6, l: 11 };
const MARKER_SCALE = 4.5;
const ERASER_WIDTH = 46;

// 授業画面をまたいで共有する手書きデータ
export const inkStore = { owner: null, actions: [], redo: [] };

export function inkIsEmpty() {
  const lastClear = inkStore.actions.findLastIndex((a) => a.type === 'clear');
  return !inkStore.actions.slice(lastClear + 1).some((a) => a.type === 'stroke' && a.tool !== 'eraser');
}

export function resetInk(owner) {
  inkStore.owner = owner;
  inkStore.actions = [];
  inkStore.redo = [];
}

function tracePath(ctx, pts) {
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
    return;
  }
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

function drawStroke(ctx, s) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (s.tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = ERASER_WIDTH;
  } else if (s.tool === 'marker') {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = PEN_COLORS[s.color];
    ctx.lineWidth = PEN_WIDTHS[s.width] * MARKER_SCALE;
    ctx.lineCap = 'butt';
  } else {
    ctx.strokeStyle = PEN_COLORS[s.color];
    ctx.lineWidth = PEN_WIDTHS[s.width];
  }
  tracePath(ctx, s.points);
  ctx.stroke();
  ctx.restore();
}

export class InkLayer {
  // canvas: 確定済みの描画 / live: 描画中のストローク（蛍光ペンの重なりムラを防ぐため別キャンバス）
  constructor(canvas, live, { onChange } = {}) {
    this.canvas = canvas;
    this.live = live;
    this.onChange = onChange ?? (() => {});
    this.enabled = false;
    this.tool = 'pen';
    this.color = 'red';
    this.width = 'm';
    this.current = null;
    this.pointerId = null;
    this.raf = 0;

    this.handlers = {
      pointerdown: (e) => this.down(e),
      pointermove: (e) => this.move(e),
      pointerup: (e) => this.up(e),
      pointercancel: (e) => this.up(e),
    };
    for (const [ev, fn] of Object.entries(this.handlers)) canvas.addEventListener(ev, fn);
    this.setEnabled(false);
  }

  destroy() {
    for (const [ev, fn] of Object.entries(this.handlers)) this.canvas.removeEventListener(ev, fn);
    cancelAnimationFrame(this.raf);
  }

  get isDrawing() {
    return this.current !== null;
  }

  setEnabled(on) {
    this.enabled = on;
    this.canvas.classList.toggle('is-active', on);
    if (!on && this.current) this.finish();
  }

  setTool({ tool, color, width }) {
    if (tool) this.tool = tool;
    if (color) this.color = color;
    if (width) this.width = width;
  }

  // ステージの表示倍率に合わせて、キャンバスの解像度を調整する（座標系は 1600×900 のまま）
  resize(scale) {
    const dpr = window.devicePixelRatio || 1;
    const k = scale * dpr;
    for (const c of [this.canvas, this.live]) {
      c.width = Math.round(STAGE_W * k);
      c.height = Math.round(STAGE_H * k);
      c.getContext('2d').setTransform(k, 0, 0, k, 0, 0);
    }
    this.redraw();
  }

  toStage(e) {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * STAGE_W, ((e.clientY - r.top) / r.height) * STAGE_H];
  }

  down(e) {
    if (!this.enabled || this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.current = { type: 'stroke', tool: this.tool, color: this.color, width: this.width, points: [this.toStage(e)] };
    this.schedule();
  }

  move(e) {
    if (e.pointerId !== this.pointerId || !this.current) return;
    const evs = e.getCoalescedEvents?.() ?? [e];
    for (const ev of evs.length ? evs : [e]) this.current.points.push(this.toStage(ev));
    this.schedule();
  }

  up(e) {
    if (e.pointerId !== this.pointerId) return;
    this.finish();
  }

  finish() {
    if (!this.current) return;
    cancelAnimationFrame(this.raf);
    const s = this.current;
    this.current = null;
    this.pointerId = null;
    this.clearCanvas(this.live);
    inkStore.actions.push(s);
    inkStore.redo = [];
    this.redraw();
    this.onChange();
  }

  schedule() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      if (!this.current) return;
      if (this.current.tool === 'eraser') {
        // 消しゴムは確定済みキャンバスに直接適用（同じ経路を何度描いても結果は同じ）
        drawStroke(this.canvas.getContext('2d'), this.current);
      } else {
        this.clearCanvas(this.live);
        drawStroke(this.live.getContext('2d'), this.current);
      }
    });
  }

  clearCanvas(c) {
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
  }

  redraw() {
    this.clearCanvas(this.canvas);
    const ctx = this.canvas.getContext('2d');
    const lastClear = inkStore.actions.findLastIndex((a) => a.type === 'clear');
    for (const a of inkStore.actions.slice(lastClear + 1)) drawStroke(ctx, a);
  }

  undo() {
    const a = inkStore.actions.pop();
    if (!a) return;
    inkStore.redo.push(a);
    this.redraw();
    this.onChange();
  }

  redo() {
    const a = inkStore.redo.pop();
    if (!a) return;
    inkStore.actions.push(a);
    this.redraw();
    this.onChange();
  }

  // 全消去も「元に戻す」で復元できるよう、操作として記録する
  clearAll() {
    if (inkIsEmpty()) return;
    inkStore.actions.push({ type: 'clear' });
    inkStore.redo = [];
    this.redraw();
    this.onChange();
  }
}
