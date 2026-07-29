"use client";

import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";

import { InvitationPdfFlipbook } from "@/components/save-the-date/invitation-pdf-flipbook";
import type { CeremonyId } from "@/lib/admin/ceremony-types";
import { triggerBlobDownload } from "@/lib/download-file";
import type { GuestCeremonyView } from "@/lib/guest-ceremonies";
import { getInvitationLabel } from "@/lib/invitation-labels";
import {
  getInvitationDownloadPath,
  getInvitationFilename,
} from "@/lib/invitation-urls";
import { lockBodyScroll } from "@/lib/lock-body-scroll";

const THEME_ACCENT: Record<string, string> = {
  coutumier: "#ddcbb3",
  civile: "#abb9aa",
  religieux: "#abb9aa",
  reception: "#d7a8b8",
};

type GuestInvitationReaderProps = {
  ceremony: GuestCeremonyView;
  confirming: boolean;
  declining: boolean;
  onClose: () => void;
  onConfirmYes: () => void;
  onConfirmNo: () => void;
  onAddToCalendar: () => void;
};

export function GuestInvitationReader({
  ceremony,
  confirming,
  declining,
  onClose,
  onConfirmYes,
  onConfirmNo,
  onAddToCalendar,
}: GuestInvitationReaderProps) {
  const ceremonyId = ceremony.id as CeremonyId;
  const label = getInvitationLabel(ceremonyId, ceremony.name);
  const accent = THEME_ACCENT[ceremony.id] ?? "#ddcbb3";
  const filename = getInvitationFilename(ceremonyId) ?? "invitation.pdf";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const unlock = lockBodyScroll();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      unlock();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const path = getInvitationDownloadPath(ceremonyId, { view: true });

    async function load() {
      setLoading(true);
      setError("");
      setBlob(null);

      if (!path) {
        setError("Invitation indisponible pour cette cérémonie.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setError("Impossible de charger l’invitation.");
            setLoading(false);
          }
          return;
        }

        const rawBlob = await response.blob();
        const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
        if (!cancelled) {
          setBlob(pdfBlob);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Erreur réseau lors du chargement.");
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [ceremonyId]);

  const handleDownload = useCallback(() => {
    if (!blob) return;
    triggerBlobDownload(blob, filename);
  }, [blob, filename]);

  const stopFlipGesture = useCallback((event: SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const confirmPage = useMemo(
    () => (
      <div
        className="invite-flip__confirm"
        onPointerDown={stopFlipGesture}
        onTouchStart={stopFlipGesture}
        onMouseDown={stopFlipGesture}
        onClick={stopFlipGesture}
      >
        <p className="invite-flip__confirm-eyebrow">Réponse</p>
        <h3 className="invite-flip__confirm-title">
          Confirmez-vous votre présence ?
        </h3>
        <p className="invite-flip__confirm-lead">
          {label}
        </p>
        <div className="invite-flip__confirm-actions">
          <button
            type="button"
            className="invite-card__btn invite-card__btn--yes"
            onClick={onConfirmYes}
            disabled={confirming || ceremony.availability === true}
          >
            {confirming ? (
              <>
                <span className="invitation-rsvp__spinner invitation-rsvp__spinner--dark" aria-hidden />
                Confirmation…
              </>
            ) : (
              "Oui, je confirme"
            )}
          </button>
          <button
            type="button"
            className="invite-card__btn invite-card__btn--no"
            onClick={onConfirmNo}
            disabled={declining || ceremony.availability === false}
          >
            {declining ? (
              <>
                <span className="invitation-rsvp__spinner" aria-hidden />
                Enregistrement…
              </>
            ) : (
              "Non, je ne pourrai pas"
            )}
          </button>
          <button
            type="button"
            className="invite-card__btn invite-card__btn--ghost"
            onClick={handleDownload}
            disabled={!blob}
          >
            Télécharger le PDF
          </button>
          <button
            type="button"
            className="invite-card__btn invite-card__btn--ghost"
            onClick={onAddToCalendar}
          >
            Ajouter au calendrier
          </button>
        </div>
      </div>
    ),
    [
      blob,
      ceremony.availability,
      confirming,
      declining,
      handleDownload,
      label,
      onAddToCalendar,
      onConfirmNo,
      onConfirmYes,
      stopFlipGesture,
    ],
  );

  return (
    <div
      className={`invite-reader invite-reader--${ceremony.id}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-reader-title"
    >
      <div className="invite-reader__veil" aria-hidden />

      <div className="invite-reader__shell">
        <header className="invite-reader__header">
          <div className="invite-reader__heading">
            <p className="invite-reader__eyebrow">Invitation</p>
            <h2 id="invite-reader-title" className="invite-reader__title">
              {label}
            </h2>
          </div>
          <button
            type="button"
            className="invite-reader__close"
            onClick={onClose}
            aria-label="Fermer"
          >
            Fermer
          </button>
        </header>

        <div className="invite-reader__stage">
          {loading ? (
            <div className="invite-flip__loading" role="status">
              <span
                className="invitation-rsvp__spinner invitation-rsvp__spinner--dark"
                aria-hidden
              />
              <p>Chargement de l’invitation…</p>
            </div>
          ) : null}

          {error ? <p className="invite-flip__error">{error}</p> : null}

          {!loading && blob ? (
            <InvitationPdfFlipbook
              blob={blob}
              title={label}
              accent={accent}
              confirmPage={confirmPage}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
