"use client";

import { useEffect, useState, type FormEvent } from "react";

type CreateTableModalProps = {
  open: boolean;
  busy: boolean;
  ceremonyName?: string;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    capacity: number | null;
  }) => Promise<boolean>;
};

export function CreateTableModal({
  open,
  busy,
  ceremonyName,
  onClose,
  onCreate,
}: CreateTableModalProps) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;

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
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) {
      setName("");
      setCapacity("");
      setLocalError("");
    }
  }, [open]);

  if (!open) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Indiquez un nom de table");
      return;
    }

    const capacityValue = capacity.trim()
      ? Number(capacity)
      : null;
    if (capacityValue !== null && (!Number.isFinite(capacityValue) || capacityValue < 1)) {
      setLocalError("La capacité doit être un nombre positif");
      return;
    }

    setLocalError("");
    const ok = await onCreate({
      name: trimmed,
      capacity: capacityValue,
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
        aria-labelledby="admin-create-table-title"
      >
        <div className="admin-modal__head">
          <div>
            <p className="admin-modal__eyebrow">Tables</p>
            <h2 id="admin-create-table-title" className="admin-modal__title">
              Créer une table
            </h2>
            {ceremonyName ? (
              <p className="admin-modal__hint">{ceremonyName}</p>
            ) : null}
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

        <form className="admin-modal__form" onSubmit={onSubmit}>
          <label className="admin-modal__field">
            <span>Nom de la table</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Table 1"
              className="admin-field"
              disabled={busy}
              autoFocus
              required
            />
          </label>

          <label className="admin-modal__field">
            <span>Capacité (optionnel)</span>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="Nombre de places"
              className="admin-field"
              disabled={busy}
            />
          </label>

          {localError ? <p className="admin-modal__error">{localError}</p> : null}

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
              disabled={busy || !name.trim()}
            >
              {busy ? "Création…" : "Créer la table"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
