"use client";

import { useEffect, useState } from "react";

type GuestConfirmBottomSheetProps = {
  open: boolean;
  numGuests: number;
  confirming: boolean;
  onClose: () => void;
  onConfirm: (confirmedGuests: number) => void;
};

function guestLabel(count: number) {
  return count > 1 ? "convives" : "convive";
}

export function GuestConfirmBottomSheet({
  open,
  numGuests,
  confirming,
  onClose,
  onConfirm,
}: GuestConfirmBottomSheetProps) {
  const [selectedCount, setSelectedCount] = useState(numGuests);

  useEffect(() => {
    if (open) {
      setSelectedCount(numGuests);
    }
  }, [open, numGuests]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !confirming) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, confirming, onClose]);

  if (!open) return null;

  function decrease() {
    setSelectedCount((current) => Math.max(1, current - 1));
  }

  function increase() {
    setSelectedCount((current) => Math.min(numGuests, current + 1));
  }

  return (
    <div className="invitation-sheet" role="presentation">
      <button
        type="button"
        className="invitation-sheet__backdrop"
        aria-label="Fermer"
        disabled={confirming}
        onClick={onClose}
      />

      <div
        className="invitation-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invitation-sheet-title"
      >
        <div className="invitation-sheet__handle" aria-hidden />

        <h2 id="invitation-sheet-title" className="invitation-sheet__title">
          Combien de convives confirmez-vous ?
        </h2>
        <p className="invitation-sheet__lead">
          Votre invitation compte jusqu&apos;à{" "}
          <strong>
            {numGuests} {guestLabel(numGuests)}
          </strong>
          .
        </p>

        <div className="invitation-sheet__stepper" aria-label="Nombre de convives">
          <button
            type="button"
            className="invitation-sheet__stepper-btn"
            disabled={confirming || selectedCount <= 1}
            onClick={decrease}
            aria-label="Diminuer le nombre de convives"
          >
            −
          </button>

          <div className="invitation-sheet__stepper-value">
            <span className="invitation-sheet__stepper-count">{selectedCount}</span>
            <span className="invitation-sheet__stepper-label">{guestLabel(selectedCount)}</span>
          </div>

          <button
            type="button"
            className="invitation-sheet__stepper-btn"
            disabled={confirming || selectedCount >= numGuests}
            onClick={increase}
            aria-label="Augmenter le nombre de convives"
          >
            +
          </button>
        </div>

        <div className="invitation-sheet__actions">
          <button
            type="button"
            className="invitation-rsvp__btn invitation-rsvp__btn--confirm"
            disabled={confirming}
            onClick={() => onConfirm(selectedCount)}
          >
            {confirming ? (
              <>
                <span className="invitation-rsvp__spinner" aria-hidden />
                Confirmation...
              </>
            ) : (
              `Confirmer ${selectedCount} ${guestLabel(selectedCount)}`
            )}
          </button>

          <button
            type="button"
            className="invitation-sheet__cancel"
            disabled={confirming}
            onClick={onClose}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
