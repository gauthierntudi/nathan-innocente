"use client";

import { useEffect, useMemo, useState } from "react";

import type { CeremonyBoard, CeremonyId } from "@/lib/admin/ceremony-types";
import { CEREMONY_DEFINITIONS } from "@/lib/admin/ceremony-types";

type GroupChoice = {
  id: string;
  name: string;
  ceremonyId: CeremonyId;
  ceremonyName: string;
  count: number;
};

type GroupExportPickerProps = {
  open: boolean;
  onClose: () => void;
  ceremonyId?: CeremonyId | null;
  groups?: GroupChoice[];
};

function ceremonyShortName(ceremonyId: CeremonyId) {
  return (
    CEREMONY_DEFINITIONS.find((item) => item.id === ceremonyId)?.name ??
    ceremonyId
  );
}

export function GroupExportPicker({
  open,
  onClose,
  ceremonyId = null,
  groups,
}: GroupExportPickerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [boardGroups, setBoardGroups] = useState<GroupChoice[]>([]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || groups) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    fetch("/api/admin/ceremonies")
      .then((response) => response.json())
      .then((data: CeremonyBoard & { success?: boolean; message?: string }) => {
        if (cancelled) return;
        if (data.success === false) {
          setError(data.message ?? "Impossible de charger les groupes");
          return;
        }
        const next: GroupChoice[] = [];
        for (const ceremony of data.ceremonies ?? []) {
          for (const group of ceremony.groups ?? []) {
            next.push({
              id: group.id,
              name: group.name,
              ceremonyId: ceremony.id,
              ceremonyName: ceremony.name,
              count: group.assignments.length,
            });
          }
        }
        setBoardGroups(next);
      })
      .catch(() => {
        if (!cancelled) setError("Erreur réseau lors du chargement des groupes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, groups]);

  const choices = groups ?? boardGroups;
  const filtered = useMemo(
    () =>
      ceremonyId
        ? choices.filter((item) => item.ceremonyId === ceremonyId)
        : choices,
    [choices, ceremonyId],
  );

  const byCeremony = useMemo(() => {
    const map = new Map<CeremonyId, GroupChoice[]>();
    for (const group of filtered) {
      const list = map.get(group.ceremonyId) ?? [];
      list.push(group);
      map.set(group.ceremonyId, list);
    }
    return CEREMONY_DEFINITIONS.filter((definition) =>
      map.has(definition.id),
    ).map((definition) => ({
      id: definition.id,
      name: definition.name,
      groups: map.get(definition.id) ?? [],
    }));
  }, [filtered]);

  if (!open) return null;

  return (
    <div className="admin-modal admin-confirm-modal" role="presentation">
      <button
        type="button"
        className="admin-modal__backdrop"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className="admin-modal__panel admin-confirm-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-export-title"
      >
        <div className="admin-modal__head">
          <div>
            <p className="admin-modal__eyebrow">Export Excel</p>
            <h2 id="group-export-title" className="admin-modal__title">
              Télécharger par groupe
            </h2>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>

        <p className="admin-confirm-modal__text">
          Cliquez sur un groupe pour télécharger sa liste.
        </p>

        {loading ? (
          <p className="admin-empty">Chargement des groupes…</p>
        ) : error ? (
          <p className="admin-empty">{error}</p>
        ) : byCeremony.length === 0 ? (
          <p className="admin-empty">Aucun groupe à exporter.</p>
        ) : (
          <div className="admin-group-export">
            {byCeremony.map((ceremony) => (
              <section key={ceremony.id} className="admin-group-export__section">
                <div className="admin-group-export__head">
                  <h3>{ceremony.name}</h3>
                  <a
                    href={`/api/admin/export/excel/ceremonies?ceremony=${ceremony.id}&by=groups`}
                    className="admin-btn admin-btn--ghost"
                    onClick={onClose}
                  >
                    Tous les groupes
                  </a>
                </div>
                <ul className="admin-group-export__list">
                  {ceremony.groups.map((group) => (
                    <li key={group.id}>
                      <a
                        href={`/api/admin/export/excel/ceremonies?group=${group.id}`}
                        className="admin-group-export__item"
                        onClick={onClose}
                      >
                        <span>{group.name}</span>
                        <span>
                          {group.count} invité{group.count > 1 ? "s" : ""}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {ceremonyId ? (
          <p className="admin-ceremony-hint">
            Cérémonie affichée : {ceremonyShortName(ceremonyId)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
