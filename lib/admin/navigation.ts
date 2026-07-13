"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  isCeremonyId,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";

export const ADMIN_SECTIONS = [
  "overview",
  "guests",
  "ceremonies",
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

export function useAdminNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const section = parseAdminSection(searchParams.get("section"));
  const ceremonyId = parseCeremonyId(searchParams.get("ceremony"));

  const replaceParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setSection = useCallback(
    (next: AdminSection) => {
      const updates: Record<string, string | null> = { section: next };
      if (next !== "ceremonies") {
        updates.ceremony = null;
      }
      replaceParams(updates);
    },
    [replaceParams],
  );

  const setCeremonyId = useCallback(
    (next: CeremonyId) => {
      replaceParams({
        section: "ceremonies",
        ceremony: next,
      });
    },
    [replaceParams],
  );

  return {
    section,
    ceremonyId,
    setSection,
    setCeremonyId,
  };
}
