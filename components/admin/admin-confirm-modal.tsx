"use client";

import { useEffect, type ReactNode } from "react";

type AdminConfirmModalProps = {
  open: boolean;
  busy?: boolean;
  eyebrow?: string;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style du bouton de confirmation */
  tone?: "primary" | "danger";
  onClose: () => void;
  onConfirm: () => void;
};

export function AdminConfirmModal({
  open,
  busy = false,
  eyebrow = "Confirmation",
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  tone = "primary",
  onClose,
  onConfirm,
}: AdminConfirmModalProps) {
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

  if (!open) return null;

  return (
    <div className="admin-modal admin-confirm-modal" role="presentation">
      <button
        type="button"
        className="admin-modal__backdrop"
        aria-label="Fermer"
        disabled={busy}
        onClick={onClose}
      />

      <div
        className="admin-modal__panel admin-confirm-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-desc"
      >
        <div className="admin-modal__head">
          <div>
            <p className="admin-modal__eyebrow">{eyebrow}</p>
            <h2 id="admin-confirm-title" className="admin-modal__title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={busy}
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <p id="admin-confirm-desc" className="admin-confirm-modal__text">
          {description}
        </p>

        <div className="admin-modal__actions">
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              tone === "danger"
                ? "admin-btn admin-btn--danger"
                : "admin-btn admin-btn--primary"
            }
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "En cours…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
