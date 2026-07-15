"use client";

import { useEffect, useState, type FormEvent } from "react";

type CreateGroupModalProps = {
  open: boolean;
  busy: boolean;
  ceremonyName?: string;
  onClose: () => void;
  onCreate: (payload: { name: string }) => Promise<boolean>;
};

export function CreateGroupModal({
  open,
  busy,
  ceremonyName,
  onClose,
  onCreate,
}: CreateGroupModalProps) {
  const [name, setName] = useState("");
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
      setLocalError("");
    }
  }, [open]);

  if (!open) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Indiquez un nom de groupe");
      return;
    }

    setLocalError("");
    const ok = await onCreate({ name: trimmed });
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
        aria-labelledby="admin-create-group-title"
      >
        <div className="admin-modal__head">
          <div>
            <p className="admin-modal__eyebrow">Groupes</p>
            <h2 id="admin-create-group-title" className="admin-modal__title">
              Créer un groupe
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
          <p className="admin-ceremony-hint">
            Organisez les invités (famille, amis, collègues…) pour suivre et envoyer
            les WhatsApp par lot.
          </p>

          <label className="admin-modal__field">
            <span>Nom du groupe</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Famille bride"
              className="admin-field"
              disabled={busy}
              autoFocus
              required
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
              {busy ? "Création…" : "Créer le groupe"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
