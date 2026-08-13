"use client";

import { useMemo, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import type { AdminBusyState } from "@/components/admin/admin-busy-overlay";
import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import type { AdminGuest, AdminGuestCeremonyStatus } from "@/lib/admin/types";
import { getInvitationCeremonyStatuses } from "@/lib/admin/types";

type InvitationRow = {
  key: string;
  guestId: string;
  guestName: string;
  phone: string;
  ceremonyId: CeremonyId;
  availability: boolean | null;
  confirmedGuests: number;
  numGuests: number;
  dressCodeDownloadedAt: string | null;
};

type InvitationGuestGroup = {
  guestId: string;
  guestName: string;
  phone: string;
  rows: InvitationRow[];
};

type InvitationsSectionProps = {
  guests: AdminGuest[];
  busy: boolean;
  setBusyState: (state: AdminBusyState) => void;
  onMessage: (message: string) => void;
  onGuestUpdated: (guest: AdminGuest) => void;
};

function ceremonyName(ceremonyId: CeremonyId) {
  return (
    CEREMONY_DEFINITIONS.find((item) => item.id === ceremonyId)?.name ??
    ceremonyId
  );
}

function canResetStatus(status: Pick<
  AdminGuestCeremonyStatus,
  "availability" | "confirmedGuests" | "dressCodeDownloadedAt"
>) {
  return (
    status.availability !== null ||
    status.confirmedGuests > 0 ||
    status.dressCodeDownloadedAt !== null
  );
}

function buildRows(guests: AdminGuest[]): InvitationRow[] {
  const rows: InvitationRow[] = [];

  for (const guest of guests) {
    for (const status of getInvitationCeremonyStatuses(guest)) {
      rows.push({
        key: `${guest.id}:${status.ceremonyId}`,
        guestId: guest.id,
        guestName: guest.name,
        phone: guest.phone,
        ceremonyId: status.ceremonyId,
        availability: status.availability,
        confirmedGuests: status.confirmedGuests,
        numGuests: status.numGuests,
        dressCodeDownloadedAt: status.dressCodeDownloadedAt,
      });
    }
  }

  return rows.sort((a, b) => {
    const byName = a.guestName.localeCompare(b.guestName, "fr");
    if (byName !== 0) return byName;
    return a.ceremonyId.localeCompare(b.ceremonyId);
  });
}

function groupRowsByGuest(rows: InvitationRow[]): InvitationGuestGroup[] {
  const map = new Map<string, InvitationGuestGroup>();

  for (const row of rows) {
    const existing = map.get(row.guestId);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    map.set(row.guestId, {
      guestId: row.guestId,
      guestName: row.guestName,
      phone: row.phone,
      rows: [row],
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.guestName.localeCompare(b.guestName, "fr"),
  );
}

function statusBadge(row: InvitationRow) {
  if (row.availability === null) {
    return <span className="admin-badge admin-badge--muted">En attente</span>;
  }
  if (row.availability) {
    return (
      <span className="admin-badge admin-badge--success">
        Oui ({row.confirmedGuests}/{row.numGuests})
      </span>
    );
  }
  return <span className="admin-badge admin-badge--danger">Non</span>;
}

function groupSummaryBadges(group: InvitationGuestGroup) {
  const yes = group.rows.filter((row) => row.availability === true).length;
  const no = group.rows.filter((row) => row.availability === false).length;
  const pending = group.rows.filter((row) => row.availability === null).length;

  return (
    <div className="admin-invitations__group-badges">
      <span className="admin-badge admin-badge--muted">
        {group.rows.length} cérémonie{group.rows.length > 1 ? "s" : ""}
      </span>
      {yes > 0 ? (
        <span className="admin-badge admin-badge--success">Oui {yes}</span>
      ) : null}
      {no > 0 ? (
        <span className="admin-badge admin-badge--danger">Non {no}</span>
      ) : null}
      {pending > 0 ? (
        <span className="admin-badge admin-badge--muted">Attente {pending}</span>
      ) : null}
    </div>
  );
}

export function InvitationsSection({
  guests,
  busy,
  setBusyState,
  onMessage,
  onGuestUpdated,
}: InvitationsSectionProps) {
  const [search, setSearch] = useState("");
  const [ceremonyFilter, setCeremonyFilter] = useState<"all" | CeremonyId>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "yes" | "no" | "pending">(
    "all",
  );
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [resetTarget, setResetTarget] = useState<InvitationRow | null>(null);

  const rows = useMemo(() => buildRows(guests), [guests]);

  const stats = useMemo(() => {
    const byCeremony = CEREMONY_DEFINITIONS.map((ceremony) => {
      const items = rows.filter((row) => row.ceremonyId === ceremony.id);
      return {
        id: ceremony.id,
        name: ceremony.name,
        total: items.length,
        yes: items.filter((row) => row.availability === true).length,
        no: items.filter((row) => row.availability === false).length,
        pending: items.filter((row) => row.availability === null).length,
        confirmedSeats: items
          .filter((row) => row.availability === true)
          .reduce((sum, row) => sum + row.confirmedGuests, 0),
      };
    }).filter((item) => item.total > 0);

    return {
      total: rows.length,
      yes: rows.filter((row) => row.availability === true).length,
      no: rows.filter((row) => row.availability === false).length,
      pending: rows.filter((row) => row.availability === null).length,
      confirmedSeats: rows
        .filter((row) => row.availability === true)
        .reduce((sum, row) => sum + row.confirmedGuests, 0),
      byCeremony,
    };
  }, [rows]);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filteredRows = rows.filter((row) => {
      if (ceremonyFilter !== "all" && row.ceremonyId !== ceremonyFilter) {
        return false;
      }

      if (statusFilter === "yes" && row.availability !== true) return false;
      if (statusFilter === "no" && row.availability !== false) return false;
      if (statusFilter === "pending" && row.availability !== null) return false;

      if (!query) return true;
      return (
        row.guestName.toLowerCase().includes(query) ||
        row.phone.toLowerCase().includes(query) ||
        ceremonyName(row.ceremonyId).toLowerCase().includes(query)
      );
    });

    return groupRowsByGuest(filteredRows);
  }, [rows, search, ceremonyFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageGroups = filteredGroups.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  async function confirmResetInvitation() {
    if (!resetTarget) return;
    const row = resetTarget;
    setResetTarget(null);

    setBusyState({
      title: "Réinitialisation",
      detail: `Reset de ${row.guestName}…`,
    });
    onMessage("");

    try {
      const response = await fetch("/api/admin/invitations/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: row.guestId,
          ceremonyId: row.ceremonyId,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        onMessage(data.message ?? "Réinitialisation impossible");
        return;
      }
      onGuestUpdated(data.guest as AdminGuest);
      onMessage(data.message);
    } catch {
      onMessage("Erreur réseau lors de la réinitialisation.");
    } finally {
      setBusyState(null);
    }
  }

  return (
    <div className="admin-invitations">
      <AdminConfirmModal
        open={resetTarget !== null}
        busy={busy}
        eyebrow="Invitations"
        title="Réinitialiser la confirmation ?"
        description={
          resetTarget ? (
            <>
              Remettre en attente la réponse de{" "}
              <strong>{resetTarget.guestName}</strong> pour{" "}
              <strong>{ceremonyName(resetTarget.ceremonyId)}</strong>.
              L&apos;invité pourra répondre à nouveau.
            </>
          ) : null
        }
        confirmLabel="Réinitialiser"
        tone="danger"
        onClose={() => {
          if (!busy) setResetTarget(null);
        }}
        onConfirm={() => void confirmResetInvitation()}
      />
      <section className="admin-stats" aria-label="Statistiques des invitations">
        <article className="admin-stat">
          <div className="admin-stat__label">Invitations</div>
          <div className="admin-stat__value">{stats.total.toLocaleString("fr-FR")}</div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Confirmées (oui)</div>
          <div className="admin-stat__value">{stats.yes.toLocaleString("fr-FR")}</div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Déclinées</div>
          <div className="admin-stat__value">{stats.no.toLocaleString("fr-FR")}</div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">En attente</div>
          <div className="admin-stat__value">
            {stats.pending.toLocaleString("fr-FR")}
          </div>
        </article>
        <article className="admin-stat">
          <div className="admin-stat__label">Places confirmées</div>
          <div className="admin-stat__value">
            {stats.confirmedSeats.toLocaleString("fr-FR")}
          </div>
        </article>
      </section>

      {stats.byCeremony.length > 0 ? (
        <section
          className="admin-invitations__by-ceremony"
          aria-label="Détail par cérémonie"
        >
          {stats.byCeremony.map((item) => (
            <article key={item.id} className="admin-panel admin-invitations__card">
              <h2 className="admin-panel__title">{item.name}</h2>
              <p className="admin-invitations__card-meta">
                {item.total} invitation{item.total > 1 ? "s" : ""} ·{" "}
                {item.confirmedSeats} place{item.confirmedSeats > 1 ? "s" : ""}{" "}
                confirmée{item.confirmedSeats > 1 ? "s" : ""}
              </p>
              <div className="admin-invitations__card-stats">
                <span className="admin-badge admin-badge--success">
                  Oui {item.yes}
                </span>
                <span className="admin-badge admin-badge--danger">Non {item.no}</span>
                <span className="admin-badge admin-badge--muted">
                  Attente {item.pending}
                </span>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="admin-table-card">
        <div className="admin-toolbar">
          <div className="admin-toolbar__group">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher nom, téléphone, cérémonie…"
              className="admin-field"
              style={{ minWidth: "14rem", flex: "1 1 14rem" }}
            />
            <select
              value={ceremonyFilter}
              onChange={(e) => {
                setCeremonyFilter(e.target.value as "all" | CeremonyId);
                setPage(1);
              }}
              className="admin-select"
              style={{ width: "auto", minWidth: "12rem" }}
            >
              <option value="all">Toutes les cérémonies</option>
              {CEREMONY_DEFINITIONS.map((ceremony) => (
                <option key={ceremony.id} value={ceremony.id}>
                  {ceremony.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(
                  e.target.value as "all" | "yes" | "no" | "pending",
                );
                setPage(1);
              }}
              className="admin-select"
              style={{ width: "auto", minWidth: "11rem" }}
            >
              <option value="all">Statut: Tous</option>
              <option value="yes">Confirmé (oui)</option>
              <option value="no">Décliné</option>
              <option value="pending">En attente</option>
            </select>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="admin-select"
              style={{ width: "auto", minWidth: "7rem" }}
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
          <div className="admin-toolbar__group admin-toolbar__group--actions">
            <p className="admin-toolbar__count">
              {filteredGroups.length.toLocaleString("fr-FR")} invité
              {filteredGroups.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {pageGroups.length === 0 ? (
          <p className="admin-empty">
            Aucun invité avec invitation activée à afficher.
          </p>
        ) : (
          <div className="admin-invitations__groups">
            {pageGroups.map((group) => (
              <details key={group.guestId} className="admin-invitations__group">
                <summary className="admin-invitations__group-summary">
                  <div className="admin-invitations__group-identity">
                    <strong>{group.guestName}</strong>
                    <span className="admin-table__phone">{group.phone}</span>
                  </div>
                  {groupSummaryBadges(group)}
                </summary>
                <div className="admin-invitations__group-body">
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Cérémonie</th>
                          <th>Statut</th>
                          <th>Convives</th>
                          <th>Dress code</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.key}>
                            <td>{ceremonyName(row.ceremonyId)}</td>
                            <td>{statusBadge(row)}</td>
                            <td>
                              {row.availability === true
                                ? `${row.confirmedGuests} / ${row.numGuests}`
                                : `— / ${row.numGuests}`}
                            </td>
                            <td>
                              {row.dressCodeDownloadedAt ? (
                                <span className="admin-badge admin-badge--success">
                                  OK
                                </span>
                              ) : (
                                <span className="admin-badge admin-badge--muted">
                                  Non
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost"
                                disabled={busy || !canResetStatus(row)}
                                onClick={() => setResetTarget(row)}
                                title={
                                  canResetStatus(row)
                                    ? "Remettre l'invitation en attente"
                                    : "Rien à réinitialiser"
                                }
                              >
                                Reset
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="admin-pagination">
            <button
              type="button"
              disabled={busy || currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="admin-btn admin-btn--secondary"
            >
              Précédent
            </button>
            <span>
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={busy || currentPage >= totalPages}
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
              className="admin-btn admin-btn--secondary"
            >
              Suivant
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
