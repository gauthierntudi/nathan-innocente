"use client";

import { useEffect, useState } from "react";

import { InvitationPdfFlipbook } from "@/components/save-the-date/invitation-pdf-flipbook";
import type { CeremonyId } from "@/lib/admin/ceremony-types";
import { triggerBlobDownload } from "@/lib/download-file";
import {
  getDressCodeDownloadPath,
  isHonorDressCodeCeremony,
} from "@/lib/dress-code-urls";
import type { GuestCeremonyView } from "@/lib/guest-ceremonies";
import { getInvitationLabel } from "@/lib/invitation-labels";
import { lockBodyScroll } from "@/lib/lock-body-scroll";

const THEME_ACCENT: Record<string, string> = {
  coutumier: "#ddcbb3",
  civile: "#abb9aa",
  religieux: "#abb9aa",
  reception: "#d7a8b8",
};

type GuestDressCodeReaderProps = {
  ceremony: GuestCeremonyView;
  honor?: boolean;
  /** Blob déjà chargé (vignette) — garantit le même fichier à l’ouverture. */
  initialBlob?: Blob | null;
  initialFilename?: string;
  onClose: () => void;
  onViewed?: (ceremonyId: string) => void;
};

export function GuestDressCodeReader({
  ceremony,
  honor = false,
  initialBlob = null,
  initialFilename,
  onClose,
  onViewed,
}: GuestDressCodeReaderProps) {
  const ceremonyId = ceremony.id as CeremonyId;
  const useHonor = honor && isHonorDressCodeCeremony(ceremonyId);
  const label = getInvitationLabel(ceremonyId, ceremony.name);
  const accent = THEME_ACCENT[ceremony.id] ?? "#ddcbb3";

  const [loading, setLoading] = useState(!initialBlob);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(initialBlob);
  const [filename, setFilename] = useState(
    initialFilename ?? "dress-code.pdf",
  );

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

    async function load() {
      // Réutilise le PDF de la vignette si disponible (même fichier honor/standard)
      if (initialBlob) {
        setBlob(initialBlob);
        setFilename(initialFilename ?? "dress-code.pdf");
        setLoading(false);
        setError("");
        onViewed?.(ceremony.id);
        return;
      }

      setLoading(true);
      setError("");
      setBlob(null);

      try {
        const response = await fetch(
          getDressCodeDownloadPath([{ id: ceremonyId }], {
            view: true,
            honorGuest: useHonor,
          }),
          { cache: "no-store" },
        );
        if (!response.ok) {
          if (!cancelled) {
            setError("Impossible de charger le dress code.");
            setLoading(false);
          }
          return;
        }

        const honorHeader = response.headers.get("X-Dress-Code-Honor");
        if (useHonor && honorHeader === "0") {
          console.warn(
            `[dress-code] honor attendu pour ${ceremonyId}, fichier standard reçu`,
          );
        }

        const rawBlob = await response.blob();
        const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
        const headerFilename = response.headers.get("X-Dress-Code-Filename");
        const disposition = response.headers.get("Content-Disposition") ?? "";
        const filenameMatch = disposition.match(
          /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i,
        );
        const resolvedName = decodeURIComponent(
          headerFilename ??
            filenameMatch?.[1] ??
            filenameMatch?.[2] ??
            "dress-code.pdf",
        );

        if (!cancelled) {
          setBlob(pdfBlob);
          setFilename(resolvedName);
          setLoading(false);
          onViewed?.(ceremony.id);
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
  }, [ceremony.id, ceremonyId, initialBlob, initialFilename, onViewed, useHonor]);

  return (
    <div
      className={`invite-reader invite-reader--${ceremony.id}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dress-code-reader-title"
    >
      <div className="invite-reader__veil" aria-hidden />

      <div className="invite-reader__shell">
        <header className="invite-reader__header">
          <div className="invite-reader__heading">
            <p className="invite-reader__eyebrow">
              {useHonor ? "Dress code d'honneur" : "Dress code"}
            </p>
            <h2 id="dress-code-reader-title" className="invite-reader__title">
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
              <p>Chargement du dress code…</p>
            </div>
          ) : null}

          {error ? <p className="invite-flip__error">{error}</p> : null}

          {!loading && blob ? (
            <InvitationPdfFlipbook
              key={`${ceremonyId}-${useHonor ? "honor" : "std"}-${blob.size}`}
              blob={blob}
              title={label}
              accent={accent}
            />
          ) : null}
        </div>

        {!loading && blob ? (
          <footer className="invite-reader__footer">
            <div className="invite-reader__actions">
              <button
                type="button"
                className="invite-card__btn invite-card__btn--yes"
                onClick={() => triggerBlobDownload(blob, filename)}
              >
                Télécharger le PDF
              </button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
