import './styles/base.css';
import './styles/pages.css';
import './styles/lesson.css';
import './styles/mini.css';
import { route, startRouter } from './app/router.js';
import { mountHome } from './views/home.js';
import { mountUnits } from './views/units.js';
import { mountLesson } from './views/lesson.js';
import { mountSettings } from './views/settings.js';
import { mountHelp } from './views/help.js';
import { mountMiniHome, mountMiniList } from './views/mini-home.js';
import { mountMiniPlay } from './views/mini-play.js';

route('/', mountHome);
route('/units/:grade/:chapter', mountUnits);
route('/lesson/:grade/:chapter/:section/:id', mountLesson);
route('/mini', mountMiniHome);
route('/mini/t/:type', mountMiniList);
route('/mini/play/:grade/:chapter/:section/:id', mountMiniPlay);
route('/settings', mountSettings);
route('/help', mountHelp);

startRouter(document.getElementById('app'));

// 本番ビルドではオフライン用にリソースをキャッシュする
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
