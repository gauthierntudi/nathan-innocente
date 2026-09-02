"use client";

import { useCallback, useEffect, useState } from "react";

import {
  isCeremonyId,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";

export const ADMIN_SECTIONS = [
  "overview",
  "guests",
  "convives",
  "compare",
  "fictitious",
  "duplicates",
  "messages",
  "pass",
  "invitations",
  "ceremonies",
  "tables",
  "groups",
  "settings",
] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export function isAdminSection(value: string | null): value is AdminSection {
  return ADMIN_SECTIONS.includes(value as AdminSection);
}

export function parseAdminSection(value: string | null): AdminSection {
  return isAdminSection(value) ? value : "overview";
}

export function parseCeremonyId(value: string | null): CeremonyId {
  return value && isCeremonyId(value) ? value : "coutumier";
}

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
