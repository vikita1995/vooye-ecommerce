"use client";

import { useSyncExternalStore } from "react";

const STORAGE_EVENT = "vooye-storage";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(STORAGE_EVENT, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(STORAGE_EVENT, callback);
  };
}

function getServerSnapshot() {
  return null;
}

export function useBrowserStorage(key: string) {
  const getSnapshot = () => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}