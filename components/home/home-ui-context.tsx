"use client";

import { createContext, useCallback, useContext, useState } from "react";

type HomeUiContextValue = {
  offcanvasOpen: boolean;
  openOffcanvas: () => void;
  closeOffcanvas: () => void;
};

const HomeUiContext = createContext<HomeUiContextValue | null>(null);

export function HomeUiProvider({ children }: { children: React.ReactNode }) {
  const [offcanvasOpen, setOffcanvasOpen] = useState(false);
  const openOffcanvas = useCallback(() => setOffcanvasOpen(true), []);
  const closeOffcanvas = useCallback(() => setOffcanvasOpen(false), []);

  return (
    <HomeUiContext.Provider value={{ offcanvasOpen, openOffcanvas, closeOffcanvas }}>
      {children}
    </HomeUiContext.Provider>
  );
}

export function useHomeUi() {
  const context = useContext(HomeUiContext);
  if (!context) {
    throw new Error("useHomeUi must be used within HomeUiProvider");
  }
  return context;
}
