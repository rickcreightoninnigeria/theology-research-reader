// Error log and reporting (ported from the Bible Study Reader, rewritten as an ES module).
// The log keeps the last few errors in localStorage so the diagnostics page can show them. It never stores user content.
// Everything it draws uses textContent, never innerHTML.

export const ERROR_LOG_KEY = 'cl_error_log';
export const ERROR_LOG_MAX = 20;

function safeStorage(storage) {
  return storage ?? (typeof localStorage === 'undefined' ? null : localStorage);
}

/** Makes an error log over a storage object (localStorage in the app, a fake in tests). */
export function createErrorLog({ storage, now = () => new Date().toISOString(), max = ERROR_LOG_MAX } = {}) {
  const store = safeStorage(storage);

  function read() {
    try {
      const list = JSON.parse(store?.getItem(ERROR_LOG_KEY) ?? '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function write(list) {
    try {
      store?.setItem(ERROR_LOG_KEY, JSON.stringify(list.slice(-max)));
    } catch {
      // Storage full or blocked: the log is a convenience, never a reason to fail again.
    }
  }

  return {
    list: read,
    clear() {
      try {
        store?.removeItem(ERROR_LOG_KEY);
      } catch {
        // ignore
      }
    },
    /** Records an error. `context` says where it happened ("download", "render"…); the message is trimmed. */
    record(error, context = '') {
      const message = String(error?.message ?? error ?? 'Unknown error').slice(0, 300);
      const entry = {
        at: now(),
        context: String(context).slice(0, 60),
        name: String(error?.name ?? 'Error').slice(0, 60),
        message,
      };
      write([...read(), entry]);
      return entry;
    },
  };
}

/** Installs the window handlers for uncaught errors and rejected promises. `onError(entry)` may show a banner. */
export function installGlobalHandlers(target, log, onError = () => {}) {
  target.addEventListener('error', (event) => onError(log.record(event.error ?? event.message, 'uncaught')));
  target.addEventListener('unhandledrejection', (event) => onError(log.record(event.reason, 'promise')));
}

/** A dismissible banner for the latest error, built with textContent only. */
export function showErrorBanner(doc, entry, { text, dismissLabel }) {
  let banner = doc.getElementById('error-banner');
  if (banner === null) {
    banner = doc.createElement('div');
    banner.id = 'error-banner';
    banner.setAttribute('role', 'alert');
    doc.body.prepend(banner);
  }
  banner.replaceChildren();
  const message = doc.createElement('span');
  message.textContent = `${text} (${entry.context || entry.name})`;
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = dismissLabel;
  button.addEventListener('click', () => banner.remove());
  banner.append(message, button);
  return banner;
}
