"use client";

import { useEffect } from "react";

type WhatsAppBulkConfirmModalProps = {
  open: boolean;
  busy: boolean;
  count: number;
  mode: "all" | "selection";
  ceremonyName?: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function WhatsAppBulkConfirmModal({
  open,
  busy,
  count,
  mode,
  ceremonyName,
  onClose,
  onConfirm,
}: WhatsAppBulkConfirmModalProps) {
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

  const isAll = mode === "all";

  return (
    <div className="admin-modal admin-wa-confirm" role="presentation">
      <button
        type="button"
        className="admin-modal__backdrop"
        aria-label="Fermer"
        disabled={busy}
        onClick={onClose}
      />

      <div
        className="admin-modal__panel admin-wa-confirm__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-wa-confirm-title"
      >
        <div className="admin-wa-confirm__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </div>

        <p className="admin-modal__eyebrow">WhatsApp</p>
        <h2 id="admin-wa-confirm-title" className="admin-wa-confirm__title">
          {isAll ? "Envoyer à tous les invités affectés ?" : "Envoyer à la sélection ?"}
        </h2>

        <div className="admin-wa-confirm__count" aria-hidden="true">
          <span className="admin-wa-confirm__count-value">{count}</span>
          <span className="admin-wa-confirm__count-label">
            destinataire{count > 1 ? "s" : ""}
          </span>
        </div>

        <p className="admin-wa-confirm__text">
          {isAll ? (
            <>
              Vous allez envoyer le message WhatsApp de la cérémonie
              {ceremonyName ? (
                <>
                  {" "}
                  <strong>{ceremonyName}</strong>
                </>
              ) : null}{" "}
              à <strong>{count}</strong> invité{count > 1 ? "s" : ""} affecté
              {count > 1 ? "s" : ""}. L&apos;envoi se fera un par un avec suivi
              de progression.
            </>
          ) : (
            <>
              Vous allez envoyer le message WhatsApp à{" "}
              <strong>{count}</strong> invité{count > 1 ? "s" : ""} sélectionné
              {count > 1 ? "s" : ""}
              {ceremonyName ? (
                <>
                  {" "}
                  pour <strong>{ceremonyName}</strong>
                </>
              ) : null}
              .
            </>
          )}
        </p>

        <div className="admin-wa-confirm__actions">
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={busy}
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="admin-btn admin-wa-confirm__submit"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Envoi en cours…" : `Confirmer l'envoi (${count})`}
          </button>
        </div>
      </div>
    </div>
  );
}
