"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import type { AdminBusyState } from "@/components/admin/admin-busy-overlay";
import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import type { AdminGuestDuplicate } from "@/lib/admin/guest-duplicates";
import type { AdminGuest } from "@/lib/admin/types";

type DuplicatesSectionProps = {
  busy: boolean;
  active: boolean;
  setBusyState: (state: AdminBusyState) => void;
  onMessage: (message: string) => void;
  onGuestUpdated: (guest: AdminGuest) => void;
};

type PendingAction = {
  id: string;
  action: "merge" | "replace_name" | "dismiss";
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone: "primary" | "danger";
};

function ceremonyLabel(id: CeremonyId) {
  return CEREMONY_DEFINITIONS.find((item) => item.id === id)?.name ?? id;
}

function formatCeremonies(ids: CeremonyId[]) {
  if (ids.length === 0) return "Aucune";
  return ids.map(ceremonyLabel).join(", ");
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DuplicatesSection({
  busy,
  active,
  setBusyState,
  onMessage,
  onGuestUpdated,
}: DuplicatesSectionProps) {
  const [duplicates, setDuplicates] = useState<AdminGuestDuplicate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [resolving, setResolving] = useState(false);

  const loadDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/duplicates");
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Impossible de charger les doublons");
        return;
      }
      setDuplicates(data.duplicates ?? []);
    } catch {
      onMessage("Erreur réseau lors du chargement des doublons.");
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    if (!active) return;
    void loadDuplicates();
  }, [active, loadDuplicates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return duplicates;
    return duplicates.filter((row) => {
      const haystack = [
        row.name,
        row.phone,
        row.guest.name,
        row.guest.phone,
        row.genre,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [duplicates, search]);

  async function runResolve(action: PendingAction) {
    setResolving(true);
    setBusyState({
      title: "Traitement du doublon",
      detail: action.title,
    });

    try {
      const response = await fetch(`/api/admin/duplicates/${action.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.action }),
      });
      const data = await response.json();

      if (!data.success) {
        onMessage(data.message ?? "Action impossible");
        return;
      }

      setDuplicates((current) =>
        current.filter((item) => item.id !== action.id),
      );

      if (data.guest) {
        onGuestUpdated(data.guest as AdminGuest);
      }

      onMessage(data.message ?? "Doublon traité");
      setPending(null);
    } catch {
      onMessage("Erreur réseau lors du traitement du doublon.");
    } finally {
      setResolving(false);
      setBusyState(null);
    }
  }

  const isBusy = busy || resolving || loading;

  return (
    <div className="admin-duplicates">
      <AdminConfirmModal
        open={Boolean(pending)}
        busy={resolving}
        eyebrow="Doublons"
        title={pending?.title ?? ""}
        description={pending?.description ?? ""}
        confirmLabel={pending?.confirmLabel}
        tone={pending?.tone}
        onClose={() => {
          if (!resolving) setPending(null);
        }}
        onConfirm={() => {
          if (pending) void runResolve(pending);
        }}
      />

      <section className="admin-stats" aria-label="Statistiques doublons">
        <article className="admin-stat">
          <div className="admin-stat__label">Doublons</div>
          <div className="admin-stat__value">
            {duplicates.length.toLocaleString("fr-FR")}
          </div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Affichés</div>
          <div className="admin-stat__value">
            {filtered.length.toLocaleString("fr-FR")}
          </div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Téléphones concernés</div>
          <div className="admin-stat__value">
            {new Set(duplicates.map((row) => row.phone)).size.toLocaleString(
              "fr-FR",
            )}
          </div>
        </article>
      </section>

      <section className="admin-panel" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: 0, color: "var(--admin-muted, #5c584f)" }}>
          Même téléphone qu&apos;un invité, mais un nom sans mot en commun.
          Fusionnez les cérémonies, remplacez le nom principal, ou ignorez le
          doublon.
        </p>
      </section>

      <section className="admin-table-card">
        <div className="admin-toolbar">
          <div className="admin-toolbar__group">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher nom ou téléphone…"
              className="admin-input"
              disabled={isBusy}
            />
          </div>
          <div className="admin-toolbar__group">
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={isBusy}
              onClick={() => void loadDuplicates()}
            >
              {loading ? "Chargement…" : "Actualiser"}
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Doublon (import)</th>
                <th>Invité principal</th>
                <th>Téléphone</th>
                <th>Cérémonies doublon</th>
                <th>Détecté</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    {loading
                      ? "Chargement des doublons…"
                      : duplicates.length === 0
                        ? "Aucun doublon pour le moment."
                        : "Aucun résultat pour cette recherche."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="admin-table__name">{row.name}</div>
                      <div className="admin-table__phone">
                        {row.genre} · {row.numGuests} convive
                        {row.numGuests > 1 ? "s" : ""}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table__name">{row.guest.name}</div>
                      <div className="admin-table__phone">
                        {formatCeremonies(row.guest.ceremonyIds)}
                      </div>
                    </td>
                    <td>
                      <span className="admin-table__phone">{row.phone}</span>
                    </td>
                    <td>
                      <div className="admin-duplicates__ceremonies">
                        {row.ceremonyIds.length === 0 ? (
                          <span className="admin-badge admin-badge--muted">
                            Aucune
                          </span>
                        ) : (
                          row.ceremonyIds.map((id) => (
                            <span
                              key={id}
                              className="admin-badge admin-badge--info"
                            >
                              {ceremonyLabel(id)}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td>{formatDate(row.updatedAt)}</td>
                    <td>
                      <div className="admin-table__actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn--primary"
                          disabled={isBusy}
                          onClick={() =>
                            setPending({
                              id: row.id,
                              action: "merge",
                              title: "Fusionner vers l'invité ?",
                              description: (
                                <>
                                  Les cérémonies et convives de « {row.name} »
                                  seront ajoutés à « {row.guest.name} ». Le
                                  doublon sera ensuite supprimé. Le nom de
                                  l&apos;invité principal reste « {row.guest.name} ».
                                </>
                              ),
                              confirmLabel: "Fusionner",
                              tone: "primary",
                            })
                          }
                        >
                          Fusionner
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--secondary"
                          disabled={isBusy}
                          onClick={() =>
                            setPending({
                              id: row.id,
                              action: "replace_name",
                              title: "Remplacer le nom de l'invité ?",
                              description: (
                                <>
                                  L&apos;invité principal passera de «{" "}
                                  {row.guest.name} » à « {row.name} », avec
                                  fusion des cérémonies. Le doublon sera
                                  supprimé.
                                </>
                              ),
                              confirmLabel: "Remplacer le nom",
                              tone: "primary",
                            })
                          }
                        >
                          Remplacer nom
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger"
                          disabled={isBusy}
                          onClick={() =>
                            setPending({
                              id: row.id,
                              action: "dismiss",
                              title: "Supprimer ce doublon ?",
                              description: (
                                <>
                                  « {row.name} » sera retiré de la table
                                  doublons. L&apos;invité « {row.guest.name} »
                                  ne sera pas modifié.
                                </>
                              ),
                              confirmLabel: "Supprimer",
                              tone: "danger",
                            })
                          }
                        >
                          Ignorer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
