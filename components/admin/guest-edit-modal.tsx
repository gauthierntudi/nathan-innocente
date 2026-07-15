"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { CeremonyPicker } from "@/components/admin/ceremony-picker";
import {
  CEREMONY_DEFINITIONS,
  type CeremonyId,
} from "@/lib/admin/ceremony-types";
import type { AdminGuest, AdminGuestCeremonyStatus } from "@/lib/admin/types";

type GuestEditModalProps = {
  guest: AdminGuest | null;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: {
    guestId: string;
    name: string;
    phone: string;
    numGuests: number;
    ceremonyIds: CeremonyId[];
    resetCeremonyIds: CeremonyId[];
  }) => Promise<boolean>;
};

function ceremonyName(ceremonyId: CeremonyId) {
  return (
    CEREMONY_DEFINITIONS.find((item) => item.id === ceremonyId)?.name ??
    ceremonyId
  );
}

function statusLabel(status: AdminGuestCeremonyStatus) {
  if (status.availability === null) {
    return status.dressCodeDownloadedAt
      ? "En attente (dress code téléchargé)"
      : "En attente";
  }
  if (status.availability) {
    const dress = status.dressCodeDownloadedAt ? " · dress code OK" : "";
    return `Confirmé (${status.confirmedGuests})${dress}`;
  }
  return "Décliné";
}

function canResetStatus(status: AdminGuestCeremonyStatus) {
  return (
    status.availability !== null ||
    status.confirmedGuests > 0 ||
    status.dressCodeDownloadedAt !== null
  );
}

export function GuestEditModal({
  guest,
  busy,
  onClose,
  onSave,
}: GuestEditModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [numGuests, setNumGuests] = useState(1);
  const [ceremonyIds, setCeremonyIds] = useState<CeremonyId[]>([]);
  const [resetCeremonyIds, setResetCeremonyIds] = useState<CeremonyId[]>([]);

  useEffect(() => {
    if (!guest) return;
    setName(guest.name);
    setPhone(guest.phone);
    setNumGuests(guest.numGuests);
    setCeremonyIds(guest.ceremonyIds ?? []);
    setResetCeremonyIds([]);
  }, [guest]);

  useEffect(() => {
    if (!guest) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [guest, busy, onClose]);

  const resettableStatuses = useMemo(() => {
    if (!guest) return [];
    return (guest.ceremonyStatuses ?? []).filter(
      (status) =>
        ceremonyIds.includes(status.ceremonyId) && canResetStatus(status),
    );
  }, [guest, ceremonyIds]);

  if (!guest) return null;

  function toggleReset(ceremonyId: CeremonyId, checked: boolean) {
    if (checked) {
      setResetCeremonyIds((current) => [
        ...new Set([...current, ceremonyId]),
      ]);
      return;
    }
    setResetCeremonyIds((current) =>
      current.filter((id) => id !== ceremonyId),
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!guest) return;
    const ok = await onSave({
      guestId: guest.id,
      name: name.trim(),
      phone: phone.trim(),
      numGuests,
      ceremonyIds,
      resetCeremonyIds: resetCeremonyIds.filter((id) =>
        ceremonyIds.includes(id),
      ),
    });
    if (ok) onClose();
  }

  return (
    <div className="admin-modal" role="presentation">
      <button
        type="button"
        className="admin-modal__backdrop"
        aria-label="Fermer"
        disabled={busy}
        onClick={onClose}
      />

      <div
        className="admin-modal__panel admin-modal__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-guest-edit-title"
      >
        <div className="admin-modal__head">
          <div>
            <p className="admin-modal__eyebrow">Modifier</p>
            <h2 id="admin-guest-edit-title" className="admin-modal__title">
              {guest.name}
            </h2>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={busy}
            onClick={onClose}
          >
            Fermer
          </button>
        </div>

        <form className="admin-modal__form" onSubmit={(e) => void handleSubmit(e)}>
          <label className="admin-modal__field">
            <span>Nom complet</span>
            <input
              type="text"
              className="admin-field"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label className="admin-modal__field">
            <span>Téléphone</span>
            <input
              type="tel"
              className="admin-field"
              value={phone}
              disabled={busy}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="+243..."
            />
          </label>

          <label className="admin-modal__field">
            <span>Nombre de convives</span>
            <input
              type="number"
              className="admin-field"
              min={1}
              max={50}
              value={numGuests}
              disabled={busy}
              onChange={(e) => setNumGuests(Number(e.target.value))}
              required
            />
          </label>

          <CeremonyPicker
            value={ceremonyIds}
            disabled={busy}
            onChange={setCeremonyIds}
          />

          {resettableStatuses.length > 0 ? (
            <fieldset className="admin-ceremony-reset">
              <legend>Réinitialiser les confirmations</legend>
              <p className="admin-ceremony-reset__hint">
                Remet la réponse RSVP et le téléchargement dress code à zéro
                pour les cérémonies cochées.
              </p>
              <div className="admin-ceremony-reset__list">
                {resettableStatuses.map((status) => (
                  <label
                    key={status.ceremonyId}
                    className="admin-ceremony-reset__item"
                  >
                    <input
                      type="checkbox"
                      checked={resetCeremonyIds.includes(status.ceremonyId)}
                      disabled={busy}
                      onChange={(e) =>
                        toggleReset(status.ceremonyId, e.target.checked)
                      }
                    />
                    <span className="admin-ceremony-reset__copy">
                      <strong>{ceremonyName(status.ceremonyId)}</strong>
                      <em>{statusLabel(status)}</em>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="admin-modal__actions">
            <button
              type="button"
              className="admin-btn admin-btn--secondary"
              disabled={busy}
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={busy || !name.trim() || !phone.trim() || numGuests < 1}
            >
              {busy ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
