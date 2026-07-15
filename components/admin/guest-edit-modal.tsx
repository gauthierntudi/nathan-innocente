"use client";

import { useEffect, useState, type FormEvent } from "react";

import { CeremonyPicker } from "@/components/admin/ceremony-picker";
import type { CeremonyId } from "@/lib/admin/ceremony-types";
import type { AdminGuest } from "@/lib/admin/types";

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
  }) => Promise<boolean>;
};

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

  useEffect(() => {
    if (!guest) return;
    setName(guest.name);
    setPhone(guest.phone);
    setNumGuests(guest.numGuests);
    setCeremonyIds(guest.ceremonyIds ?? []);
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

  if (!guest) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!guest) return;
    const ok = await onSave({
      guestId: guest.id,
      name: name.trim(),
      phone: phone.trim(),
      numGuests,
      ceremonyIds,
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
        className="admin-modal__panel"
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
