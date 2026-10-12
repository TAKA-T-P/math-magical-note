// アプリ設定（ブラウザの localStorage に保存）
//
// 将来の家庭学習モードの「学習履歴」は別キー（mmn.history.v1 など）で管理し、
// この設定データとは混ぜない。

const KEY = 'mmn.settings.v1';

export const DEFAULT_SETTINGS = {
  edition: '2026', // 教材年度
  grade: 'g2', // ホームで選択中の学年
  animSpeed: 'normal', // none | fast | normal | slow
  zoom: 100, // 授業画面の表示倍率（%）
  toolbar: 'show', // show | auto（操作が無いと自動で隠す）
  inkOnSwitch: 'ask', // 別の問題に移るときの手書き: ask | keep | clear
  pen: { color: 'red', width: 'm', tool: 'pen' },
  last: null, // 最後に開いた教材 { path, label, sub }
  recent: [], // 最近開いた教材（最大5件）
};

const listeners = new Set();
let current = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const saved = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_SETTINGS), ...saved, pen: { ...DEFAULT_SETTINGS.pen, ...saved.pen } };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // プライベートモード等で保存できなくても動作は続ける
  }
}

export function getSettings() {
  return current;
}

export function updateSettings(patch) {
  current = { ...current, ...patch };
  save();
  listeners.forEach((fn) => fn(current));
}

export function resetSettings() {
  const { last, recent } = current;
  current = { ...structuredClone(DEFAULT_SETTINGS), last, recent };
  save();
  listeners.forEach((fn) => fn(current));
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function recordOpened(entry) {
  const recent = [entry, ...current.recent.filter((r) => r.path !== entry.path)].slice(0, 5);
  updateSettings({ last: entry, recent });
}

export const ANIM_MS = { none: 0, fast: 180, normal: 380, slow: 700 };
