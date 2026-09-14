type Listener = () => void;

const sessionExpiredListeners = new Set<Listener>();

/** Fired after tokens are cleared on unrecoverable 401. */
export function emitSessionExpired(): void {
  for (const listener of sessionExpiredListeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

export function onSessionExpired(listener: Listener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}
