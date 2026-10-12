// 教材カタログ（学年→章→節）と、節ごとの教材データの読み込み
import catalog from '../data/catalog.json';

// 節ごとのデータは別チャンクに分割され、開いたときだけ読み込まれる
const loaders = import.meta.glob('../data/*/*/*.json', { import: 'default' });
const cache = new Map();

export { catalog };

export function getGrade(gradeId) {
  return catalog.grades.find((g) => g.id === gradeId);
}

export function getChapter(gradeId, chapterId) {
  return getGrade(gradeId)?.chapters.find((c) => c.id === chapterId);
}

export function getSection(gradeId, chapterId, sectionId) {
  return getChapter(gradeId, chapterId)?.sections.find((s) => s.id === sectionId);
}

export function pageOf(item, edition) {
  return item?.pages?.[edition] ?? item?.editions?.[edition]?.page ?? null;
}

// 節のデータを読み込み、指定年度に対応するコンテンツだけを返す。
// 同じ id で内容の版（rev）が複数ある場合は、その年度を editions に持つものを使う。
export async function loadSection(dataPath, edition) {
  if (!cache.has(dataPath)) {
    const loader = loaders[`../data/${dataPath}.json`];
    if (!loader) throw new Error(`教材データが見つかりません: ${dataPath}`);
    cache.set(dataPath, loader());
  }
  const unit = await cache.get(dataPath);
  return unit.contents
    .filter((c) => c.editions?.[edition])
    .map((c) => ({ ...c, edition: c.editions[edition] }));
}

export const TYPE_LABELS = {
  title: '章タイトル',
  point: 'ポイント',
  exercise: '問題',
  similar: '類題',
  advanced: '発展',
  lab: '実験',
};

export function contentLabel(content) {
  return content.edition?.number ?? content.title;
}
