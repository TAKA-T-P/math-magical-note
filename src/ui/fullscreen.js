export function isFullscreen() {
  return !!document.fullscreenElement;
}

export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // ブラウザの制約で全画面にできない場合は何もしない（F11 での全画面は利用可能）
  }
}
