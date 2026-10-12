// 授業ミニコンテンツの種類と一覧
//
// データは src/data/mini/<学年>/<章>/<節>/<コンテンツID>.json に1件ずつ置く。
// 学年・章・節は教材（catalog.json）と同じIDを使い、置き場所（パス）から決まる。
// 1件あたり数KBと小さいため、一覧表示のためにまとめて読み込む。

const modules = import.meta.glob('../data/mini/*/*/*/*.json', { eager: true, import: 'default' });

// 種類ごとの表示名・エンジン・説明。種類を増やすときはここと validator に追加する。
export const MINI_TYPES = {
  choice3: { label: '3択ウォームアップ', engine: 'quiz', icon: 'choice3', desc: '前回の内容を3択で思い出そう', unit: '問' },
  mistake: { label: 'ミスを見破れ！', engine: 'quiz', icon: 'mistake', desc: 'まちがいを探して、正しい考え方を確かめる', unit: '問' },
  truefalse: { label: '数学〇×クイズ', engine: 'quiz', icon: 'truefalse', desc: '用語や性質を〇か×かで判断する', unit: '問' },
  column: { label: '数学ミニコラム', engine: 'slide', icon: 'column', desc: '数学の雑学や身近な活用を紹介する', unit: '枚' },
  introduction: { label: '導入トーク', engine: 'slide', icon: 'intro', desc: '身近な疑問から新しい単元へつなげる', unit: '枚' },
};
export const MINI_ORDER = ['choice3', 'mistake', 'truefalse', 'column', 'introduction'];

const all = Object.entries(modules)
  .map(([p, c]) => {
    const [, grade, chapter, section] = p.match(/data\/mini\/([^/]+)\/([^/]+)\/([^/]+)\//);
    return { ...c, unit: { grade, chapter, section }, path: `${grade}/${chapter}/${section}/${c.id}` };
  })
  .sort((a, b) => MINI_ORDER.indexOf(a.type) - MINI_ORDER.indexOf(b.type) || a.title.localeCompare(b.title, 'ja'));

export function miniAll() {
  return all;
}

export function miniByType(type) {
  return all.filter((c) => c.type === type);
}

export function miniByUnit(grade, chapter, section) {
  return all.filter((c) => c.unit.grade === grade && c.unit.chapter === chapter && (!section || c.unit.section === section));
}

export function getMini(grade, chapter, section, id) {
  return all.find((c) => c.path === `${grade}/${chapter}/${section}/${id}`);
}

// 問題数またはスライド枚数
export function countOf(c) {
  return (c.questions ?? c.slides ?? []).length;
}

export function miniHref(c) {
  return `#/mini/play/${c.path.split('/').map(encodeURIComponent).join('/')}`;
}
