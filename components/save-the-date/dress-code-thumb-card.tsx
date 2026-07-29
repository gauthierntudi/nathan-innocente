"use client";

import { useEffect, useRef, useState } from "react";

import type { CeremonyId } from "@/lib/admin/ceremony-types";
import {
  getDressCodeDownloadPath,
  isHonorDressCodeCeremony,
} from "@/lib/dress-code-urls";
import type { GuestCeremonyView } from "@/lib/guest-ceremonies";
import { getInvitationLabel } from "@/lib/invitation-labels";

type DressCodeThumbOpenPayload = {
  ceremonyId: string;
  blob: Blob | null;
  filename: string;
};

type DressCodeThumbCardProps = {
  ceremony: GuestCeremonyView;
  honorGuest?: boolean;
  onOpen: (payload: DressCodeThumbOpenPayload) => void;
};

type ThumbResult = {
  url: string;
  width: number;
  height: number;
};

const THUMB_WIDTH = 280;
const THUMB_DPR = 2;

async function renderFirstPageThumb(blob: Blob): Promise<ThumbResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
  }).promise;
  const page = await pdf.getPage(1);
  const unscaled = page.getViewport({ scale: 1 });
  const scale = (THUMB_WIDTH * THUMB_DPR) / unscaled.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Canvas unavailable");
  }

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  const url = await new Promise<string>((resolve, reject) => {
    canvas.toBlob(
      (thumbBlob) => {
        if (!thumbBlob) {
          reject(new Error("Thumb export failed"));
          return;
        }
        resolve(URL.createObjectURL(thumbBlob));
      },
      "image/jpeg",
      0.86,
    );
  });

  return {
    url,
    width: unscaled.width,
    height: unscaled.height,
  };
}

export function DressCodeThumbCard({
  ceremony,
  honorGuest = false,
  onOpen,
}: DressCodeThumbCardProps) {
  const ceremonyId = ceremony.id as CeremonyId;
  const useHonor =
    honorGuest && isHonorDressCodeCeremony(ceremonyId);
  const label = getInvitationLabel(ceremonyId, ceremony.name);
  const [thumb, setThumb] = useState<ThumbResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const pdfBlobRef = useRef<Blob | null>(null);
  const filenameRef = useRef("dress-code.pdf");

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      setLoading(true);
      setFailed(false);
      setThumb(null);
      pdfBlobRef.current = null;

      try {
        const response = await fetch(
          getDressCodeDownloadPath([{ id: ceremonyId }], {
            view: true,
            honorGuest: useHonor,
          }),
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error("Dress code fetch failed");
        }

        const headerFilename = response.headers.get("X-Dress-Code-Filename");
        const honorHeader = response.headers.get("X-Dress-Code-Honor");
        if (useHonor && honorHeader === "0") {
          console.warn(
            `[dress-code] honor attendu pour ${ceremonyId}, fichier standard reçu`,
          );
        }

        const raw = await response.blob();
        const pdfBlob = new Blob([raw], { type: "application/pdf" });
        const result = await renderFirstPageThumb(pdfBlob);
        if (cancelled) {
          URL.revokeObjectURL(result.url);
          return;
        }
        objectUrl = result.url;
        pdfBlobRef.current = pdfBlob;
        filenameRef.current = decodeURIComponent(
          headerFilename ?? "dress-code.pdf",
        );
        setThumb(result);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ceremonyId, useHonor]);

  return (
    <button
      type="button"
      className={`invite-dresscode-thumb invite-dresscode-thumb--${ceremony.id}${thumb ? " invite-dresscode-thumb--ready" : ""}`}
      onClick={() =>
        onOpen({
          ceremonyId: ceremony.id,
          blob: pdfBlobRef.current,
          filename: filenameRef.current,
        })
      }
    >
      <span
        className="invite-dresscode-thumb__preview"
        style={
          thumb && thumb.width > 0 && thumb.height > 0
            ? { aspectRatio: `${thumb.width} / ${thumb.height}` }
            : undefined
        }
        aria-hidden
      >
        {thumb ? (
          <img
            className="invite-dresscode-thumb__img"
            src={thumb.url}
            alt=""
            width={Math.round(thumb.width)}
            height={Math.round(thumb.height)}
            draggable={false}
          />
        ) : null}

        {loading ? (
          <span className="invite-dresscode-thumb__skeleton" role="status">
            <span
              className="invitation-rsvp__spinner invitation-rsvp__spinner--dark"
              aria-hidden
            />
          </span>
        ) : null}

        {failed && !thumb ? (
          <span className="invite-dresscode-thumb__fallback">PDF</span>
        ) : null}
      </span>

      <span className="invite-dresscode-thumb__meta">
        <span className="invite-dresscode-thumb__eyebrow">
          {useHonor ? "Dress code d'honneur" : "Dress code"}
        </span>
        <span className="invite-dresscode-thumb__title">{label}</span>
        <span className="invite-dresscode-thumb__cta">Ouvrir en Flip</span>
      </span>
    </button>
  );
}
