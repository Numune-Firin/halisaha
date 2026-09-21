'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Ekranin sag altinda beliren kisa bildirim.
 *
 * Kaydet'e basildiginda islemin sonucu burada gorunur: yesil ise oldu, kirmizi
 * ise olmadi ve sebebi yaziyor. Hata mesaji sunucudan geldigi gibi gosterilir
 * ("Iptal edilmis hafta icin gelir/gider yazilamaz" gibi), kullanici ne
 * yapmasi gerektigini anlasin diye.
 */

export interface ToastMessage {
  id: number;
  text: string;
  ok: boolean;
}

interface ToastApi {
  show: (text: string, ok?: boolean) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Bildirim gostermek icin. Saglayici yoksa sessizce hicbir sey yapmaz. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  return api ?? { show: () => {} };
}

const VISIBLE_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((text: string, ok = true) => {
    const id = nextId.current++;
    // Ayni anda cok bildirim birikmesin; en fazla son uc tanesi durur
    setItems((list) => [...list.slice(-2), { id, text, ok }]);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end"
      >
        {items.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <button
      type="button"
      onClick={() => onDismiss(toast.id)}
      className={`toast pointer-events-auto ${toast.ok ? 'toast-ok' : 'toast-error'}`}
    >
      <span aria-hidden="true" className="toast-mark">
        {toast.ok ? '✓' : '!'}
      </span>
      <span className="text-left">{toast.text}</span>
    </button>
  );
}
