import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AstroRestorationResponse } from '../components/SpiritLensSection';
import {
  saveRestoration,
  loadLatestRestoration,
  listRestorationHistory,
  clearRestorations,
  type StoredRestoration,
} from './imageStore';

interface RestorationContextValue {
  latestRestoration: AstroRestorationResponse | null;
  latestCaptureTitle: string;
  storageReady: boolean;
  history: StoredRestoration[];
  handleRestorationComplete: (result: AstroRestorationResponse, captureTitle: string) => void;
  selectHistoryEntry: (entry: StoredRestoration) => void;
  clearHistory: () => Promise<void>;
  refreshHistory: () => Promise<void>;
}

const DEFAULT_TITLE = 'Pillars of Creation (Hubble/JWST)';

const RestorationContext = createContext<RestorationContextValue>({
  latestRestoration: null,
  latestCaptureTitle: DEFAULT_TITLE,
  storageReady: false,
  history: [],
  handleRestorationComplete: () => {},
  selectHistoryEntry: () => {},
  clearHistory: async () => {},
  refreshHistory: async () => {},
});

export const RestorationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [latestRestoration, setLatestRestoration] = useState<AstroRestorationResponse | null>(null);
  const [latestCaptureTitle, setLatestCaptureTitle] = useState<string>(DEFAULT_TITLE);
  const [storageReady, setStorageReady] = useState<boolean>(false);
  const [history, setHistory] = useState<StoredRestoration[]>([]);

  const refreshHistory = useCallback(async () => {
    const items = await listRestorationHistory();
    setHistory(items);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadLatestRestoration(), listRestorationHistory()])
      .then(([rec, histItems]) => {
        if (cancelled) return;
        if (rec && rec.result) {
          setLatestRestoration(rec.result);
          if (rec.captureTitle) {
            setLatestCaptureTitle(rec.captureTitle);
          }
        }
        setHistory(histItems);
        setStorageReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setStorageReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRestorationComplete = useCallback(
    (result: AstroRestorationResponse, captureTitle: string) => {
      setLatestRestoration(result);
      setLatestCaptureTitle(captureTitle);
      void saveRestoration(result, captureTitle).then(() => {
        void refreshHistory();
      });
    },
    [refreshHistory]
  );

  const selectHistoryEntry = useCallback((entry: StoredRestoration) => {
    setLatestRestoration(entry.result);
    setLatestCaptureTitle(entry.captureTitle);
  }, []);

  const clearHistory = useCallback(async () => {
    await clearRestorations();
    setHistory([]);
  }, []);

  return (
    <RestorationContext.Provider
      value={{
        latestRestoration,
        latestCaptureTitle,
        storageReady,
        history,
        handleRestorationComplete,
        selectHistoryEntry,
        clearHistory,
        refreshHistory,
      }}
    >
      {children}
    </RestorationContext.Provider>
  );
};

export function useRestorationState(): RestorationContextValue {
  return useContext(RestorationContext);
}
