"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { GalleryImage } from "@/lib/galerie/content";

type GalerieLightboxProps = {
  photos: readonly GalleryImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

export function GalerieLightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: GalerieLightboxProps) {
  const total = photos.length;
  const current = photos[index];
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  const showPrev = useCallback(() => {
    if (total === 0) return;
    onIndexChange((index - 1 + total) % total);
  }, [index, onIndexChange, total]);

  const showNext = useCallback(() => {
    if (total === 0) return;
    onIndexChange((index + 1) % total);
  }, [index, onIndexChange, total]);

  const zoomOut = useCallback(() => {
    setZoom((value) => Math.max(ZOOM_MIN, Math.round((value - ZOOM_STEP) * 100) / 100));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((value) => Math.min(ZOOM_MAX, Math.round((value + ZOOM_STEP) * 100) / 100));
  }, []);

  const toggleExpand = useCallback(async () => {
    const node = viewportRef.current?.closest(".galerie-lightbox");
    if (!node || !(node instanceof HTMLElement)) return;

    try {
      if (!document.fullscreenElement) {
        await node.requestFullscreen();
        setExpanded(true);
      } else {
        await document.exitFullscreen();
        setExpanded(false);
      }
    } catch {
      setExpanded((value) => !value);
    }
  }, []);

  const downloadPhoto = useCallback(async () => {
    if (!current) return;
    try {
      const response = await fetch(current.src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const name = current.src.split("/").pop()?.split("?")[0] || "photo.jpg";
      link.href = url;
      link.download = decodeURIComponent(name);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(current.src, "_blank", "noopener,noreferrer");
    }
  }, [current]);

  useEffect(() => {
    setZoom(1);
  }, [index]);

  useEffect(() => {
    const onFullscreen = () => setExpanded(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") showPrev();
      if (event.key === "ArrowRight") showNext();
      if (event.key === "+" || event.key === "=") zoomIn();
      if (event.key === "-") zoomOut();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, showNext, showPrev, zoomIn, zoomOut]);

  if (!current) return null;

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className={`galerie-lightbox${expanded ? " galerie-lightbox--expanded" : ""}`} role="dialog" aria-modal="true" aria-label="Visionneuse photos">
      <header className="galerie-lightbox__top">
        <p className="galerie-lightbox__label">{current.alt}</p>
        <div className="galerie-lightbox__top-actions">
          <button
            type="button"
            className="galerie-lightbox__icon-btn"
            onClick={toggleExpand}
            aria-label={expanded ? "Quitter le plein écran" : "Plein écran"}
          >
            {expanded ? <Minimize2 size={18} strokeWidth={1.75} /> : <Maximize2 size={18} strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            className="galerie-lightbox__icon-btn"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div
        ref={viewportRef}
        className="galerie-lightbox__viewport"
        onDoubleClick={() => setZoom((value) => (value > 1 ? 1 : 2))}
      >
        <img
          src={current.src}
          alt={current.alt}
          style={{ transform: `scale(${zoom})` }}
          draggable={false}
        />
      </div>

      <footer className="galerie-lightbox__bar">
        <div className="galerie-lightbox__tools">
          <button type="button" className="galerie-lightbox__tool" onClick={downloadPhoto}>
            <Download size={16} strokeWidth={1.75} aria-hidden />
            <span>Télécharger</span>
          </button>
        </div>

        <div className="galerie-lightbox__zoom">
          <button
            type="button"
            className="galerie-lightbox__icon-btn"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom arrière"
          >
            <ZoomOut size={16} strokeWidth={1.75} />
          </button>
          <input
            className="galerie-lightbox__slider"
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Niveau de zoom"
          />
          <button
            type="button"
            className="galerie-lightbox__icon-btn"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom avant"
          >
            <ZoomIn size={16} strokeWidth={1.75} />
          </button>
          <span className="galerie-lightbox__zoom-value">{zoomPercent}%</span>
        </div>

        <div className="galerie-lightbox__pager">
          <span className="galerie-lightbox__counter">
            {index + 1} / {total}
          </span>
          <button
            type="button"
            className="galerie-lightbox__icon-btn"
            onClick={showPrev}
            aria-label="Photo précédente"
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="galerie-lightbox__icon-btn"
            onClick={showNext}
            aria-label="Photo suivante"
          >
            <ChevronRight size={18} strokeWidth={1.75} />
          </button>
        </div>
      </footer>
    </div>
  );
}
