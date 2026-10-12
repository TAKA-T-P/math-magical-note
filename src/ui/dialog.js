// 確認ダイアログ。buttons: [{ label, value, primary? }]。Esc で cancelValue を返す。
export function choose({ title, message, buttons, cancelValue = null, vertical = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog' + (vertical ? ' dialog-vertical' : '');
    dlg.innerHTML = `<h2></h2><p></p><div class="dialog-buttons"></div>`;
    dlg.querySelector('h2').textContent = title;
    dlg.querySelector('p').textContent = message;
    const box = dlg.querySelector('.dialog-buttons');
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'btn' + (b.primary ? ' btn-primary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => finish(b.value));
      box.append(btn);
    }
    const finish = (v) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(cancelValue);
    });
    (document.fullscreenElement ?? document.body).append(dlg);
    dlg.showModal();
    box.querySelector('.btn-primary')?.focus();
  });
}
