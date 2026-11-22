"use client";

import { useEffect } from "react";

/** Registra o service worker só em produção (em desenvolvimento ele atrapalharia o recarregamento). */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
