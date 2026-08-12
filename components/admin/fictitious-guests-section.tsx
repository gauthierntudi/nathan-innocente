"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AdminBusyState } from "@/components/admin/admin-busy-overlay";
import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import type { AdminFictitiousGuest } from "@/lib/admin/fictitious-phone";
import type { AdminGuest } from "@/lib/admin/types";

type FictitiousGuestsSectionProps = {
  busy: boolean;
  active: boolean;
  setBusyState: (state: AdminBusyState) => void;
  onMessage: (message: string) => void;
  onGuestUpdated: (guest: AdminGuest) => void;
};

function ceremonyLabel(id: string) {
  if (!CEREMONY_DEFINITIONS.some((item) => item.id === id)) return id;
  return CEREMONY_DEFINITIONS.find((item) => item.id === id as CeremonyId)?.name ?? id;
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

export function FictitiousGuestsSection({
  busy,
  active,
  setBusyState,
  onMessage,
  onGuestUpdated,
}: FictitiousGuestsSectionProps) {
  const [rows, setRows] = useState<AdminFictitiousGuest[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/fictitious-guests");
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Impossible de charger les numéros fictifs");
        return;
      }
      setRows(data.guests ?? []);
    } catch {
      onMessage("Erreur réseau lors du chargement des numéros fictifs.");
    } finally {
      setLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    if (!active) return;
    void loadRows();
  }, [active, loadRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [row.name, row.phone, row.genre].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search]);

  async function assignRealPhone(row: AdminFictitiousGuest) {
    const phone = (phoneDrafts[row.guestId] ?? "").trim();
    if (!phone) {
      onMessage("Saisissez un numéro réel avant d'enregistrer.");
      return;
    }

    setSavingId(row.guestId);
    setBusyState({
      title: "Assignation du numéro",
      detail: `Mise à jour de ${row.name}…`,
    });

    try {
      const response = await fetch(
        `/api/admin/fictitious-guests/${row.guestId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        },
      );
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Assignation impossible");
        return;
      }

      setRows((current) =>
        current.filter((item) => item.guestId !== row.guestId),
      );
      setPhoneDrafts((current) => {
        const next = { ...current };
        delete next[row.guestId];
        return next;
      });

      if (data.guest) onGuestUpdated(data.guest as AdminGuest);
      onMessage(data.message ?? "Numéro réel assigné");
    } catch {
      onMessage("Erreur réseau lors de l'assignation du numéro.");
    } finally {
      setSavingId(null);
      setBusyState(null);
    }
  }

  const isBusy = busy || loading || savingId !== null;

  return (
    <div className="admin-fictitious">
      <section className="admin-stats" aria-label="Statistiques numéros fictifs">
        <article className="admin-stat">
          <div className="admin-stat__label">Numéros fictifs</div>
          <div className="admin-stat__value">
            {rows.length.toLocaleString("fr-FR")}
          </div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Affichés</div>
          <div className="admin-stat__value">
            {filtered.length.toLocaleString("fr-FR")}
          </div>
        </article>
      </section>

      <section className="admin-panel" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: 0, color: "var(--admin-muted, #5c584f)" }}>
          Invités importés ou ajoutés sans téléphone : un numéro aléatoire{" "}
          <code>+243000XXXXXX</code> leur a été attribué. Assignez un vrai numéro
          pour activer WhatsApp.
        </p>
      </section>

      <section className="admin-table-card">
        <div className="admin-toolbar">
          <div className="admin-toolbar__group">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher nom ou numéro…"
              className="admin-input"
              disabled={isBusy}
            />
          </div>
          <div className="admin-toolbar__group">
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={isBusy}
              onClick={() => void loadRows()}
            >
              {loading ? "Chargement…" : "Actualiser"}
            </button>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>N° fictif</th>
                <th>Convives</th>
                <th>Cérémonies</th>
                <th>Créé</th>
                <th>Assigner un vrai numéro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    {loading
                      ? "Chargement…"
                      : rows.length === 0
                        ? "Aucun invité avec numéro fictif."
                        : "Aucun résultat pour cette recherche."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="admin-table__name">{row.name}</div>
                      <div className="admin-table__phone">{row.genre}</div>
                    </td>
                    <td>
                      <span className="admin-badge admin-badge--warning">
                        {row.phone}
                      </span>
                    </td>
                    <td>{row.numGuests}</td>
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
                    <td>{formatDate(row.createdAt)}</td>
                    <td>
                      <div className="admin-fictitious__assign">
                        <input
                          type="tel"
                          className="admin-input"
                          placeholder="+243…"
                          value={phoneDrafts[row.guestId] ?? ""}
                          disabled={isBusy}
                          onChange={(e) =>
                            setPhoneDrafts((current) => ({
                              ...current,
                              [row.guestId]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="admin-btn admin-btn--primary"
                          disabled={isBusy}
                          onClick={() => void assignRealPhone(row)}
                        >
                          {savingId === row.guestId ? "…" : "Enregistrer"}
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
