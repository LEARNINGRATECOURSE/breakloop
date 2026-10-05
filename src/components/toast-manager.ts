export interface ToastAction {
  label: string;
  action: string;
  primary?: boolean;
}

export interface ToastOptions {
  id: string; // showing a toast with the same id replaces the old one
  title: string;
  body: string;
  actions?: ToastAction[];
  durationMs?: number; // 0 = stay until dismissed
}

const DEFAULT_DURATION_MS = 20000;

/**
 * In-app pop-up notifications, like the corner toasts in Teams or Google Chat.
 * Shown while the page is visible; the OS notification covers the hidden case.
 */
export class ToastManager {
  private container: HTMLElement;
  private timers = new Map<string, { id: number; remaining: number; startedAt: number }>();
  private onAction: (toastId: string, action: string) => void;

  constructor(onAction: (toastId: string, action: string) => void) {
    this.onAction = onAction;
    this.container = document.createElement('div');
    this.container.className = 'toast-stack';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(this.container);

    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const toast = target.closest<HTMLElement>('.toast');
      if (!toast) return;
      const id = toast.dataset.toastId!;
      const button = target.closest<HTMLElement>('[data-toast-action]');
      if (button) this.onAction(id, button.dataset.toastAction!);
      if (button || target.closest('.toast-close')) this.dismiss(id);
    });

    // Pause the auto-dismiss timer while the pointer is over a toast
    this.container.addEventListener('mouseover', (e) => this.pause(e.target as HTMLElement));
    this.container.addEventListener('mouseout', (e) => this.resume(e.target as HTMLElement));
  }

  public show(options: ToastOptions) {
    this.dismiss(options.id);

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.dataset.toastId = options.id;
    toast.setAttribute('role', 'alert');

    const actions = (options.actions ?? [])
      .map(
        (a) =>
          `<button type="button" class="btn btn-small ${a.primary ? 'btn-primary' : 'btn-secondary'}"
            data-toast-action="${a.action}">${escapeHtml(a.label)}</button>`
      )
      .join('');

    toast.innerHTML = `
      <img class="toast-icon" src="/icon-192.png" alt="" width="36" height="36">
      <div class="toast-content">
        <strong class="toast-title">${escapeHtml(options.title)}</strong>
        <p class="toast-body">${escapeHtml(options.body)}</p>
        ${actions ? `<div class="toast-actions">${actions}</div>` : ''}
      </div>
      <button type="button" class="toast-close" aria-label="Dismiss">×</button>
    `;
    this.container.appendChild(toast);

    const duration = options.durationMs ?? DEFAULT_DURATION_MS;
    if (duration > 0) this.startTimer(options.id, duration);
  }

  public dismiss(id: string) {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer.id);
      this.timers.delete(id);
    }
    const toast = this.find(id);
    if (!toast) return;
    toast.classList.add('leaving');
    window.setTimeout(() => toast.remove(), 200);
  }

  private find(id: string): HTMLElement | null {
    return (
      Array.from(this.container.querySelectorAll<HTMLElement>('.toast:not(.leaving)')).find(
        (t) => t.dataset.toastId === id
      ) ?? null
    );
  }

  private startTimer(id: string, ms: number) {
    this.timers.set(id, {
      id: window.setTimeout(() => this.dismiss(id), ms),
      remaining: ms,
      startedAt: Date.now(),
    });
  }

  private pause(target: HTMLElement) {
    const id = target.closest<HTMLElement>('.toast')?.dataset.toastId;
    const timer = id ? this.timers.get(id) : undefined;
    if (!id || !timer || timer.startedAt === 0) return;
    clearTimeout(timer.id);
    timer.remaining -= Date.now() - timer.startedAt;
    timer.startedAt = 0;
  }

  private resume(target: HTMLElement) {
    const id = target.closest<HTMLElement>('.toast')?.dataset.toastId;
    const timer = id ? this.timers.get(id) : undefined;
    if (!id || !timer || timer.startedAt !== 0) return;
    this.startTimer(id, Math.max(2000, timer.remaining));
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
