"use client";

import { useEffect, useRef, useState } from "react";

import { getPdfPixelRatio } from "@/lib/pdf-render-quality";

type DressCodePdfPagesProps = {
  blob: Blob;
  title: string;
  /** Appelé si le rendu pages échoue aussi (dernier recours = télécharger). */
  onFatalError?: () => void;
};

export function DressCodePdfPages({
  blob,
  title,
  onFatalError,
}: DressCodePdfPagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onFatalRef = useRef(onFatalError);
  onFatalRef.current = onFatalError;
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      setRendering(true);
      setError("");
      setPageCount(0);

      const container = containerRef.current;
      if (!container) return;
      container.replaceChildren();

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const data = await blob.arrayBuffer();
        const pdf = await pdfjs.getDocument({
          data,
          isEvalSupported: false,
        }).promise;
        if (cancelled) return;

        setPageCount(pdf.numPages);
        const maxWidth = Math.min(
          container.clientWidth || window.innerWidth - 32,
          900,
        );
        const outputScale = getPdfPixelRatio({ max: 2, min: 1 });

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNumber);
          const unscaled = page.getViewport({ scale: 1 });
          const scale = maxWidth / unscaled.width;
          const viewport = page.getViewport({
            scale: Math.min(Math.max(scale, 0.85), 2),
          });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) continue;

          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          // Largeur d'affichage uniquement — la hauteur suit le ratio du canvas
          // (évite l'étirement si le CSS force width: 100%).
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "invitation-pdf__page";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${title} — page ${pageNumber}`);

          context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, viewport.width, viewport.height);

          await page.render({
            canvasContext: context,
            viewport,
          }).promise;

          if (cancelled) return;
          container.appendChild(canvas);
        }
      } catch (renderError) {
        console.error("Dress code PDF render", renderError);
        if (!cancelled) {
          setError("Aperçu indisponible sur cet appareil. Utilisez Télécharger.");
          onFatalRef.current?.();
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    void renderPdf();

    return () => {
      cancelled = true;
    };
  }, [blob, title]);

  return (
    <div className="invitation-pdf__pages-wrap">
      {rendering ? (
        <div
          className="invitation-pdf__loading invitation-pdf__loading--overlay"
          role="status"
        >
          <span
            className="invitation-rsvp__spinner invitation-rsvp__spinner--dark"
            aria-hidden
          />
          <p>Préparation de l’aperçu…</p>
        </div>
      ) : null}

      {error ? <p className="invitation-pdf__error">{error}</p> : null}

      <div
        ref={containerRef}
        className="invitation-pdf__pages"
        data-pages={pageCount || undefined}
      />
    </div>
  );
}
