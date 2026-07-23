"use client";

import { useEffect } from "react";

import { DressCodePdfPages } from "@/components/save-the-date/dress-code-pdf-pages";
import {
  Download,
  INVITATION_ICON_PROPS,
} from "@/components/save-the-date/invitation-icons";
import { triggerBlobDownload } from "@/lib/download-file";

type GuestDressCodePreviewModalProps = {
  open: boolean;
  loading: boolean;
  title: string;
  filename: string;
  objectUrl: string | null;
  blob: Blob | null;
  honor?: boolean;
  onClose: () => void;
};

export function GuestDressCodePreviewModal({
  open,
  loading,
  title,
  filename,
  blob,
  honor = false,
  onClose,
}: GuestDressCodePreviewModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleDownload() {
    if (!blob) return;
    triggerBlobDownload(blob, filename || "dress-code.pdf");
  }

  return (
    <div
      className="invitation-pdf"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invitation-pdf-title"
    >
      <div className="invitation-pdf__veil" aria-hidden />

      <div className="invitation-pdf__shell">
        <header className="invitation-pdf__header">
          <div className="invitation-pdf__heading">
            <p className="invitation-pdf__eyebrow">
              {honor ? "Dress code d'honneur" : "Dress code"}
            </p>
            <h2 id="invitation-pdf-title" className="invitation-pdf__title">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="invitation-pdf__close"
            onClick={onClose}
            aria-label="Fermer"
          >
            Fermer
          </button>
        </header>

        <div className="invitation-pdf__stage">
          {loading || !blob ? (
            <div className="invitation-pdf__loading" role="status">
              <span className="invitation-rsvp__spinner invitation-rsvp__spinner--dark" aria-hidden />
              <p>Chargement du dress code…</p>
            </div>
          ) : (
            <DressCodePdfPages blob={blob} title={title} />
          )}
        </div>

        <div className="invitation-pdf__footer">
          <button
            type="button"
            className="invitation-pdf__download"
            disabled={loading || !blob}
            onClick={handleDownload}
          >
            Télécharger
            <Download {...INVITATION_ICON_PROPS} />
          </button>
        </div>
      </div>
    </div>
  );
}
