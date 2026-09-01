/**
 * Thin wrapper over the native <dialog> element: it already gives us focus
 * trapping, Escape-to-close and inert background content, so this only adds
 * backdrop-click dismissal and open/close animation hooks.
 */
export class Modal {
  /** @param {HTMLDialogElement} dialog */
  constructor(dialog) {
    this.dialog = dialog;
    this.onCloseCallbacks = new Set();

    dialog.addEventListener('click', (event) => {
      // A click that lands on the dialog element itself (not its panel) is a
      // click on the backdrop.
      if (event.target === dialog) this.close();
    });

    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.close();
    });

    for (const button of dialog.querySelectorAll('[data-close-modal]')) {
      button.addEventListener('click', () => this.close());
    }
  }

  get isOpen() {
    return this.dialog.open;
  }

  open() {
    if (this.dialog.open) return;
    this.dialog.showModal();
    this.dialog.classList.remove('modal--closing');
  }

  close() {
    if (!this.dialog.open) return;
    this.dialog.classList.add('modal--closing');
    const finish = () => {
      this.dialog.classList.remove('modal--closing');
      this.dialog.close();
      for (const cb of this.onCloseCallbacks) cb();
    };
    // Wait for the exit animation, but never hang if it does not run.
    const timer = setTimeout(finish, 200);
    this.dialog.addEventListener('animationend', () => {
      clearTimeout(timer);
      finish();
    }, { once: true });
  }

  onClose(callback) {
    this.onCloseCallbacks.add(callback);
  }
}
