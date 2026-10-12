// ツールチップ：[data-tip] を持つ要素にマウスを合わせる（またはキーボードで選ぶ）と、
// その要素の中の .tip-content（画面上は隠してある）の内容を、枠に入れて表示する。
// 表示位置は要素の下（入らなければ上）で、画面の左右からはみ出さないように調整する。

export function attachTooltips(root) {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let current = null;
  let timer = 0;

  function show(el) {
    const content = el.querySelector('.tip-content');
    if (!content) return;
    current = el;
    tip.innerHTML = content.innerHTML;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const margin = 8;
    let left = Math.min(Math.max(margin, r.left), window.innerWidth - t.width - margin);
    let top = r.bottom + 6;
    if (top + t.height > window.innerHeight - margin) top = Math.max(margin, r.top - t.height - 6);
    tip.style.left = `${left + window.scrollX}px`;
    tip.style.top = `${top + window.scrollY}px`;
  }

  function hide() {
    clearTimeout(timer);
    current = null;
    tip.hidden = true;
  }

  const enter = (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el || el === current) return;
    clearTimeout(timer);
    timer = setTimeout(() => show(el), e.type === 'focusin' ? 0 : 250);
  };
  const leave = (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hide();
  };

  root.addEventListener('mouseover', enter);
  root.addEventListener('mouseout', leave);
  root.addEventListener('focusin', enter);
  root.addEventListener('focusout', leave);
  window.addEventListener('scroll', hide, { passive: true });

  return () => {
    hide();
    tip.remove();
    window.removeEventListener('scroll', hide);
  };
}
