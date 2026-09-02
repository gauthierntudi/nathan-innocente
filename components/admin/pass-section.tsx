"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminConfirmModal } from "@/components/admin/admin-confirm-modal";
import type { AdminBusyState } from "@/components/admin/admin-busy-overlay";
import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import {
  getDefaultPassCeremonyId,
  isPassSendEnabledForCeremony,
  PASS_DISABLED_CEREMONY_IDS,
} from "@/lib/admin/pass-config";
import {
  canReceivePassMessage,
  getCeremonyPassSentAt,
  isPassSendCandidate,
  type AdminGuest,
} from "@/lib/admin/types";
import { guestMatchesSearch } from "@/lib/admin/guest-search";

type PassSectionProps = {
  guests: AdminGuest[];
  busy: boolean;
  setBusyState: (state: AdminBusyState) => void;
  onMessage: (message: string) => void;
  onRefresh: () => Promise<void>;
};

type SinglePassConfirm = {
  guest: AdminGuest;
  force: boolean;
};

function ceremonyLabel(ceremonyId: CeremonyId) {
  return (
    CEREMONY_DEFINITIONS.find((item) => item.id === ceremonyId)?.name ??
    ceremonyId
  );
}

function formatPassSentAt(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PassPaginationProps = {
  busy: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
};

function PassPagination({
  busy,
  page,
  pageSize,
  totalItems,
  onPageChange,
}: PassPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  if (totalItems === 0 || totalPages <= 1) return null;

  const rangeStart = (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="admin-pagination">
      <span>
        Affichage {rangeStart}–{rangeEnd} sur {totalItems}
      </span>
      <div className="admin-pagination__controls">
        <button
          type="button"
          disabled={busy || currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
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
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          className="admin-btn admin-btn--secondary"
        >
          Suivant
        </button>
      </div>
    </div>
  );
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalPages,
    currentPage,
    start,
  };
}

export function PassSection({
  guests,
  busy,
  setBusyState,
  onMessage,
  onRefresh,
}: PassSectionProps) {
  const [ceremonyId, setCeremonyId] = useState<CeremonyId>(getDefaultPassCeremonyId);
  const [limit, setLimit] = useState(25);
  const [pageSize, setPageSize] = useState(50);
  const [pendingPage, setPendingPage] = useState(1);
  const [sentPage, setSentPage] = useState(1);
  const [searchPage, setSearchPage] = useState(1);
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [singleConfirm, setSingleConfirm] = useState<SinglePassConfirm | null>(
    null,
  );

  const pendingGuests = useMemo(
    () =>
      guests
        .filter((guest) => canReceivePassMessage(guest, ceremonyId))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [guests, ceremonyId],
  );

  const sentGuests = useMemo(
    () =>
      guests
        .filter(
          (guest) =>
            isPassSendCandidate(guest, ceremonyId) &&
            getCeremonyPassSentAt(guest, ceremonyId) !== null,
        )
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [guests, ceremonyId],
  );

  const statsByCeremony = useMemo(
    () =>
      CEREMONY_DEFINITIONS.map((ceremony) => {
        const totalPasses = guests.filter((guest) =>
          isPassSendCandidate(guest, ceremony.id),
        ).length;
        const pendingPasses = guests.filter((guest) =>
          canReceivePassMessage(guest, ceremony.id),
        ).length;
        return {
          id: ceremony.id,
          name: ceremony.name,
          totalPasses,
          pendingPasses,
          sentPasses: totalPasses - pendingPasses,
        };
      }),
    [guests],
  );

  const ceremonyStats =
    statsByCeremony.find((item) => item.id === ceremonyId) ?? null;

  const searchGuests = useMemo(() => {
    const query = search.trim();
    if (!query) return [];

    return guests
      .filter(
        (guest) =>
          guestMatchesSearch(guest, query) &&
          isPassSendCandidate(guest, ceremonyId),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [guests, ceremonyId, search]);

  const pendingPagination = useMemo(
    () => paginate(pendingGuests, pendingPage, pageSize),
    [pendingGuests, pendingPage, pageSize],
  );

  const sentPagination = useMemo(
    () => paginate(sentGuests, sentPage, pageSize),
    [sentGuests, sentPage, pageSize],
  );

  const searchPagination = useMemo(
    () => paginate(searchGuests, searchPage, pageSize),
    [searchGuests, searchPage, pageSize],
  );

  const sendCount = Math.min(
    Math.max(1, Math.floor(limit)),
    pendingGuests.length,
  );

  const passSendEnabled = isPassSendEnabledForCeremony(ceremonyId);

  useEffect(() => {
    setLimit((current) => {
      if (pendingGuests.length === 0) return current;
      return Math.min(Math.max(1, current), pendingGuests.length);
    });
  }, [pendingGuests.length]);

  useEffect(() => {
    setPendingPage(1);
    setSentPage(1);
    setSearchPage(1);
  }, [ceremonyId, pageSize]);

  useEffect(() => {
    setSearchPage(1);
  }, [search]);

  useEffect(() => {
    setPendingPage((current) =>
      Math.min(current, pendingPagination.totalPages),
    );
  }, [pendingPagination.totalPages]);

  useEffect(() => {
    setSentPage((current) => Math.min(current, sentPagination.totalPages));
  }, [sentPagination.totalPages]);

  useEffect(() => {
    setSearchPage((current) => Math.min(current, searchPagination.totalPages));
  }, [searchPagination.totalPages]);

  function requestSend() {
    if (!passSendEnabled) {
      onMessage("L'envoi de pass est désactivé pour cette cérémonie.");
      return;
    }
    if (pendingGuests.length === 0) {
      onMessage("Tous les pass ont déjà été envoyés pour cette cérémonie.");
      return;
    }
    setConfirmOpen(true);
  }

  async function confirmSend() {
    setConfirmOpen(false);
    setBusyState({
      title: "Envoi pass WhatsApp",
      variant: "whatsapp",
      detail: `Pass pour ${ceremonyLabel(ceremonyId)} (${sendCount} message${sendCount > 1 ? "s" : ""})…`,
    });
    onMessage("");

    try {
      const response = await fetch("/api/admin/whatsapp/pass", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ceremonyId, limit: sendCount }),
      });
      const data = await response.json();
      onMessage(data.message ?? (data.success ? "Pass envoyés" : "Erreur"));
      if (data.success) await onRefresh();
    } catch {
      onMessage("Erreur réseau lors de l'envoi du pass.");
    } finally {
      setBusyState(null);
    }
  }

  function requestSingleSend(guest: AdminGuest, force = false) {
    if (!passSendEnabled) {
      onMessage("L'envoi de pass est désactivé pour cette cérémonie.");
      return;
    }
    setSingleConfirm({ guest, force });
  }

  async function confirmSingleSend() {
    if (!singleConfirm) return;
    const { guest, force } = singleConfirm;
    setSingleConfirm(null);

    setBusyState({
      title: "Envoi pass WhatsApp",
      variant: "whatsapp",
      detail: `${force ? "Renvoi" : "Pass"} pour ${guest.name}…`,
    });
    onMessage("");

    try {
      const response = await fetch("/api/admin/whatsapp/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId: guest.id, ceremonyId, force }),
      });
      const data = await response.json();
      onMessage(data.message ?? (data.success ? "Pass envoyé" : "Erreur"));
      if (data.success) await onRefresh();
    } catch {
      onMessage("Erreur réseau lors de l'envoi du pass.");
    } finally {
      setBusyState(null);
    }
  }

  return (
    <div className="admin-pass admin-messages">
      <AdminConfirmModal
        open={confirmOpen}
        busy={busy}
        eyebrow="Pass d'accès"
        title="Envoyer le pass d'accès ?"
        description={
          <>
            Envoyer le message pass WhatsApp pour{" "}
            <strong>{ceremonyLabel(ceremonyId)}</strong> à{" "}
            <strong>
              {sendCount} pass
            </strong>{" "}
            à envoyer (1 pass = 1 invitation, ordre alphabétique).
            {ceremonyStats && ceremonyStats.sentPasses > 0 ? (
              <>
                {" "}
                {ceremonyStats.sentPasses} pass
                déjà envoyé{ceremonyStats.sentPasses > 1 ? "s" : ""} seront
                ignoré{ceremonyStats.sentPasses > 1 ? "s" : ""}.
              </>
            ) : null}
          </>
        }
        confirmLabel={`Envoyer ${sendCount} pass`}
        onClose={() => {
          if (!busy) setConfirmOpen(false);
        }}
        onConfirm={() => void confirmSend()}
      />

      <AdminConfirmModal
        open={singleConfirm !== null}
        busy={busy}
        eyebrow="Pass d'accès"
        title={
          singleConfirm?.force
            ? "Renvoyer le pass d'accès ?"
            : "Envoyer le pass d'accès ?"
        }
        description={
          singleConfirm ? (
            <>
              {singleConfirm.force ? "Renvoyer" : "Envoyer"} le message pass
              WhatsApp pour <strong>{ceremonyLabel(ceremonyId)}</strong> à{" "}
              <strong>{singleConfirm.guest.name}</strong>
              {singleConfirm.guest.phone ? (
                <>
                  {" "}
                  (<span className="admin-table__phone">
                    {singleConfirm.guest.phone}
                  </span>
                  )
                </>
              ) : null}
              .
            </>
          ) : null
        }
        confirmLabel={
          singleConfirm?.force ? "Renvoyer le pass" : "Envoyer le pass"
        }
        onClose={() => {
          if (!busy) setSingleConfirm(null);
        }}
        onConfirm={() => void confirmSingleSend()}
      />

      <section className="admin-stats" aria-label="Pass par cérémonie">
        {statsByCeremony.map((item) => {
          const disabled = PASS_DISABLED_CEREMONY_IDS.has(item.id);
          return (
            <article
              key={item.id}
              className={`admin-stat${disabled ? " admin-stat--disabled" : ""}`}
            >
              <div className="admin-stat__label">{item.name}</div>
              <div className="admin-stat__value">
                {disabled ? "—" : item.pendingPasses.toLocaleString("fr-FR")}
              </div>
              <div className="admin-messages__pass-preview">
                {disabled ? (
                  "Envoi désactivé"
                ) : (
                  <>
                    {item.sentPasses} pass envoyé{item.sentPasses > 1 ? "s" : ""}{" "}
                    · {item.totalPasses} pass au total
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <p className="admin-messages__pass-preview" style={{ margin: "0 0 1rem" }}>
        1 pass = 1 invitation (fiche invité). Les totaux sont par cérémonie —
        ne pas additionner les cartes si une invitation est sur plusieurs
        cérémonies.
      </p>

      <section className="admin-panel">
        <h2 className="admin-panel__title">Envoi WhatsApp</h2>
        <p className="admin-messages__lead">
          Chaque invitation reçoit au plus un pass par cérémonie (1 pass = 1
          message WhatsApp), qu&apos;elle ait confirmé ou non.
        </p>
        <div className="admin-messages__pass-controls">
          <label className="admin-messages__search">
            <span className="admin-messages__search-label">Cérémonie</span>
            <select
              className="admin-select"
              value={ceremonyId}
              disabled={busy}
              onChange={(e) => setCeremonyId(e.target.value as CeremonyId)}
            >
              {CEREMONY_DEFINITIONS.map((ceremony) => (
                <option
                  key={ceremony.id}
                  value={ceremony.id}
                  disabled={PASS_DISABLED_CEREMONY_IDS.has(ceremony.id)}
                >
                  {ceremony.name}
                  {PASS_DISABLED_CEREMONY_IDS.has(ceremony.id)
                    ? " (désactivé)"
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-messages__search">
            <span className="admin-messages__search-label">
              Nombre à envoyer
            </span>
            <input
              type="number"
              className="admin-field"
              min={1}
              max={Math.max(1, pendingGuests.length)}
              value={limit}
              disabled={busy || pendingGuests.length === 0 || !passSendEnabled}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>
          <label className="admin-messages__search">
            <span className="admin-messages__search-label">Par page</span>
            <select
              className="admin-select"
              value={pageSize}
              disabled={busy}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="admin-messages__pass-meta">
            <span className="admin-badge admin-badge--success">
              {pendingGuests.length} pass en attente
            </span>
            {sentGuests.length > 0 ? (
              <span className="admin-messages__pass-preview">
                {sentGuests.length} pass envoyé
                {sentGuests.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--primary"
            disabled={busy || pendingGuests.length === 0 || limit < 1 || !passSendEnabled}
            onClick={requestSend}
          >
            Envoyer le pass ({sendCount})
          </button>
        </div>
      </section>

      <section className="admin-panel admin-messages__toolbar">
        <h2 className="admin-panel__title">Envoi individuel</h2>
        <p className="admin-messages__lead">
          Recherchez une invitation affectée à {ceremonyLabel(ceremonyId)} et
          envoyez son pass.
        </p>
        <label className="admin-messages__search">
          <span className="admin-messages__search-label">Recherche</span>
          <input
            type="search"
            className="admin-input"
            placeholder="Nom, téléphone, groupe…"
            value={search}
            disabled={busy}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {search.trim() ? (
          searchGuests.length === 0 ? (
            <p className="admin-empty" style={{ marginTop: "1rem" }}>
              Aucune invitation pour {ceremonyLabel(ceremonyId)} ne correspond à
              cette recherche.
            </p>
          ) : (
            <>
            <div className="admin-table-wrap" style={{ marginTop: "1rem" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Téléphone</th>
                    <th>Statut pass</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {searchPagination.items.map((guest) => {
                    const sentAt = getCeremonyPassSentAt(guest, ceremonyId);
                    const canSend = canReceivePassMessage(guest, ceremonyId);
                    return (
                      <tr key={guest.id}>
                        <td className="admin-table__name">{guest.name}</td>
                        <td className="admin-table__phone">{guest.phone}</td>
                        <td>
                          {canSend ? (
                            <span className="admin-badge admin-badge--warning">
                              En attente
                            </span>
                          ) : sentAt ? (
                            <span
                              className="admin-badge admin-badge--success"
                              title={formatPassSentAt(sentAt)}
                            >
                              Envoyé
                            </span>
                          ) : (
                            <span className="admin-badge admin-badge--muted">
                              —
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="admin-table__actions">
                            {canSend ? (
                              <button
                                type="button"
                                className="admin-btn admin-btn--primary"
                                disabled={busy || !passSendEnabled}
                                onClick={() => requestSingleSend(guest)}
                              >
                                Envoyer
                              </button>
                            ) : sentAt ? (
                              <button
                                type="button"
                                className="admin-btn admin-btn--secondary"
                                disabled={busy || !passSendEnabled}
                                onClick={() => requestSingleSend(guest, true)}
                              >
                                Renvoyer
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost"
                                disabled
                              >
                                Indisponible
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PassPagination
              busy={busy}
              page={searchPage}
              pageSize={pageSize}
              totalItems={searchGuests.length}
              onPageChange={setSearchPage}
            />
            </>
          )
        ) : (
          <p className="admin-messages__pass-preview" style={{ marginTop: "0.75rem" }}>
            Saisissez un nom ou un numéro pour afficher les résultats.
          </p>
        )}
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel__title">
          Prochains destinataires
          <span
            className="admin-messages__pass-preview"
            style={{ marginLeft: "0.5rem" }}
          >
            {sendCount} à envoyer · {pendingGuests.length} en attente
          </span>
        </h2>
        <p className="admin-messages__pass-preview" style={{ marginBottom: "0.75rem" }}>
          L&apos;envoi groupé prend les {sendCount} premiers pass de la liste
          (ordre alphabétique). Les lignes surlignées correspondent au prochain
          lot.
        </p>
        {pendingGuests.length === 0 ? (
          <p className="admin-empty">
            Tous les pass ont été envoyés pour {ceremonyLabel(ceremonyId)}.
          </p>
        ) : (
          <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Invitation</th>
                  <th>Téléphone</th>
                </tr>
              </thead>
              <tbody>
                {pendingPagination.items.map((guest, index) => {
                  const globalIndex = pendingPagination.start + index;
                  const inNextBatch = globalIndex < sendCount;
                  return (
                    <tr
                      key={guest.id}
                      className={inNextBatch ? "admin-pass-row--next" : undefined}
                    >
                      <td>{globalIndex + 1}</td>
                      <td className="admin-table__name">{guest.name}</td>
                      <td className="admin-table__phone">{guest.phone}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PassPagination
            busy={busy}
            page={pendingPage}
            pageSize={pageSize}
            totalItems={pendingGuests.length}
            onPageChange={setPendingPage}
          />
          </>
        )}
      </section>

      {sentGuests.length > 0 ? (
        <section className="admin-panel">
          <h2 className="admin-panel__title">
            Déjà envoyés
            <span
              className="admin-messages__pass-preview"
              style={{ marginLeft: "0.5rem" }}
            >
              {sentGuests.length}
            </span>
          </h2>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Téléphone</th>
                  <th>Envoyé le</th>
                </tr>
              </thead>
              <tbody>
                {sentPagination.items.map((guest) => {
                  const sentAt = getCeremonyPassSentAt(guest, ceremonyId);
                  return (
                    <tr key={guest.id}>
                      <td className="admin-table__name">{guest.name}</td>
                      <td className="admin-table__phone">{guest.phone}</td>
                      <td>
                        {sentAt ? formatPassSentAt(sentAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PassPagination
            busy={busy}
            page={sentPage}
            pageSize={pageSize}
            totalItems={sentGuests.length}
            onPageChange={setSentPage}
          />
        </section>
      ) : null}
    </div>
  );
}
