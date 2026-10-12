// ハッシュ方式のルーター（GitHub Pages 等の静的ホスティングでも再読み込みで壊れない）
//   #/                         ホーム
//   #/units/g2/c2              章・節・教材の選択
//   #/lesson/g2/c2/s1/<id>     授業画面
//   #/settings                 設定
//   #/help                     ヘルプ

const routes = [];
let unmountCurrent = null;
let root = null;

export function route(pattern, mount) {
  routes.push({ pattern, mount });
}

export function navigate(path) {
  location.hash = '#' + path;
}

export function currentPath() {
  return decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
}

function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const r of routes) {
    const pp = r.pattern.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    if (pp.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = parts[i]), true) : p === parts[i]))) {
      return { mount: r.mount, params };
    }
  }
  return null;
}

async function render() {
  const path = currentPath();
  const m = match(path) ?? match('/');
  if (unmountCurrent) unmountCurrent();
  unmountCurrent = null;
  root.replaceChildren();
  root.scrollTop = 0;
  window.scrollTo(0, 0);
  unmountCurrent = (await m.mount(root, m.params)) ?? null;
}

export function startRouter(el) {
  root = el;
  window.addEventListener('hashchange', render);
  render();
}
