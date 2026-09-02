"use client";

import { useCallback, useEffect, useState } from "react";

import { type CeremonyId } from "@/lib/admin/ceremony-types";
import {
  parseAdminSection,
  parseCeremonyId,
  type AdminSection,
} from "@/lib/admin/navigation-shared";

export {
  ADMIN_SECTIONS,
  isAdminSection,
  parseAdminSection,
  parseCeremonyId,
  type AdminSection,
} from "@/lib/admin/navigation-shared";

type AdminNavigationOptions = {
  initialSection?: AdminSection;
  initialCeremonyId?: CeremonyId;
};

function readNavigationFromLocation() {
  if (typeof window === "undefined") {
    return {
      section: "overview" as AdminSection,
      ceremonyId: "coutumier" as CeremonyId,
    };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    section: parseAdminSection(params.get("section")),
    ceremonyId: parseCeremonyId(params.get("ceremony")),
  };
}

export function useAdminNavigation(options: AdminNavigationOptions = {}) {
  const [section, setSectionState] = useState<AdminSection>(
    () => options.initialSection ?? readNavigationFromLocation().section,
  );
  const [ceremonyId, setCeremonyIdState] = useState<CeremonyId>(
    () => options.initialCeremonyId ?? readNavigationFromLocation().ceremonyId,
  );

  useEffect(() => {
    function syncFromUrl() {
      const next = readNavigationFromLocation();
      setSectionState(next.section);
      setCeremonyIdState(next.ceremonyId);
    }

    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const replaceParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );

    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }

    const query = params.toString();
    const pathname =
      typeof window !== "undefined" ? window.location.pathname : "/admin";
    const nextUrl = query ? `${pathname}?${query}` : pathname;

    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", nextUrl);
    }

    setSectionState(parseAdminSection(params.get("section")));
    setCeremonyIdState(parseCeremonyId(params.get("ceremony")));
  }, []);

  const setSection = useCallback(
    (next: AdminSection) => {
      const updates: Record<string, string | null> = { section: next };
      if (!["ceremonies", "tables", "groups"].includes(next)) {
        updates.ceremony = null;
      }
      replaceParams(updates);
    },
    [replaceParams],
  );

  const setCeremonyId = useCallback(
    (next: CeremonyId) => {
      const ceremoniesSection: AdminSection =
        section === "tables" || section === "groups" ? section : "ceremonies";
      replaceParams({
        section: ceremoniesSection,
        ceremony: next,
      });
    },
    [replaceParams, section],
  );

  return {
    section,
    ceremonyId,
    setSection,
    setCeremonyId,
  };
}
