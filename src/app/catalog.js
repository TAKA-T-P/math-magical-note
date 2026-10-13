// 教材カタログ（学年→章→節）と、節ごとの教材データの読み込み
import catalog from '../data/catalog.json';

// 節ごとのデータは別チャンクに分割され、開いたときだけ読み込まれる
// 類題は章のフォルダの review/ に節ごとのファイルで置く（例 g2/c2/review/s1.json）
const loaders = import.meta.glob(['../data/*/*/*.json', '../data/*/*/review/*.json'], { import: 'default' });
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
// dataPath は1ファイル、または複数ファイルの配列（類題のように節ごとに分けたもの。順に連結する）。
export async function loadSection(dataPath, edition) {
  if (Array.isArray(dataPath)) return (await Promise.all(dataPath.map((p) => loadSection(p, edition)))).flat();
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

// 類題（kind: "review"）の区分かどうか
export const isReview = (section) => section?.kind === 'review';

// 類題の教材ページの範囲（p.38〜41 など）
export function pageRange(section, edition) {
  const a = pageOf(section, edition);
  const b = section?.pagesEnd?.[edition];
  return b && b !== a ? `${a}〜${b}` : `${a ?? '-'}`;
}

// コンテンツIDから、その教材と節を探す（本編⇔類題の移動先を求めるため。まず同じ章、なければ同じ学年）
export async function findContent(gradeId, chapterId, contentId, edition) {
  const grade = getGrade(gradeId);
  const chapters = [getChapter(gradeId, chapterId), ...(grade?.chapters ?? []).filter((c) => c.id !== chapterId)];
  for (const ch of chapters) {
    for (const sec of ch?.sections ?? []) {
      if (!sec.data) continue;
      const list = await loadSection(sec.data, edition).catch(() => []);
      const c = list.find((x) => x.id === contentId);
      if (c) return { content: c, chapter: ch, section: sec, path: `${gradeId}/${ch.id}/${sec.id}/${encodeURIComponent(c.id)}` };
    }
  }
  return null;
}
