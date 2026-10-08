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
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.5;
const SWIPE_THRESHOLD_PX = 56;
const SWIPE_THRESHOLD_RATIO = 0.18;

type DragMode = "none" | "swipe" | "pan";

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
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const dragRef = useRef<{
    mode: DragMode;
    pointerId: number | null;
    startX: number;
    startY: number;
    lastX: number;
    lastT: number;
    velocityX: number;
    panX: number;
    panY: number;
  }>({
    mode: "none",
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastT: 0,
    velocityX: 0,
    panX: 0,
    panY: 0,
  });

  const showPrev = useCallback(() => {
    if (total === 0) return;
    onIndexChange((index - 1 + total) % total);
  }, [index, onIndexChange, total]);

  const showNext = useCallback(() => {
    if (total === 0) return;
    onIndexChange((index + 1) % total);
  }, [index, onIndexChange, total]);

  const zoomOut = useCallback(() => {
    setZoom((value) => {
      const next = Math.max(ZOOM_MIN, Math.round((value - ZOOM_STEP) * 100) / 100);
      if (next === ZOOM_MIN) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((value) => Math.min(ZOOM_MAX, Math.round((value + ZOOM_STEP) * 100) / 100));
  }, []);

  const toggleExpand = useCallback(async () => {
    const node = rootRef.current;
    if (!node) return;
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
    setPan({ x: 0, y: 0 });
    setDragX(0);
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

  const finishSwipe = useCallback(
    (deltaX: number, velocityX: number) => {
      const width = viewportRef.current?.clientWidth || window.innerWidth;
      const passed =
        Math.abs(deltaX) > Math.max(SWIPE_THRESHOLD_PX, width * SWIPE_THRESHOLD_RATIO) ||
        Math.abs(velocityX) > 0.55;

      setDragging(false);
      setDragX(0);

      if (!passed) return;
      if (deltaX < 0 || velocityX < -0.55) showNext();
      else showPrev();
    },
    [showNext, showPrev],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input")) return;

    dragRef.current = {
      mode: "none",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastT: performance.now(),
      velocityX: 0,
      panX: pan.x,
      panY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    drag.velocityX = (event.clientX - drag.lastX) / dt;
    drag.lastX = event.clientX;
    drag.lastT = now;

    if (drag.mode === "none") {
      if (Math.hypot(dx, dy) < 10) return;
      if (zoomRef.current > 1) {
        drag.mode = "pan";
      } else if (Math.abs(dx) > Math.abs(dy) * 1.15) {
        drag.mode = "swipe";
        setDragging(true);
      } else {
        return;
      }
    }

    if (drag.mode === "swipe") {
      setDragX(dx);
      return;
    }

    if (drag.mode === "pan") {
      setPan({ x: drag.panX + dx, y: drag.panY + dy });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const wasTap = Math.hypot(dx, dy) < 8 && drag.mode === "none";

    if (drag.mode === "swipe") {
      finishSwipe(dx, drag.velocityX);
    } else {
      setDragging(false);
      setDragX(0);
    }

    drag.pointerId = null;
    drag.mode = "none";

    if (wasTap) setChromeVisible((value) => !value);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  };

  const onDoubleClick = () => {
    if (zoom > 1) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoom(2);
      setChromeVisible(false);
    }
  };

  if (!current) return null;

  return (
    <div
      ref={rootRef}
      className={`galerie-lightbox${expanded ? " galerie-lightbox--expanded" : ""}${chromeVisible ? "" : " galerie-lightbox--chrome-hidden"}${dragging ? " galerie-lightbox--dragging" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Visionneuse photos"
    >
      <header className="galerie-lightbox__top">
        <p className="galerie-lightbox__counter" aria-live="polite">
          {index + 1}
          <span className="galerie-lightbox__counter-sep">/</span>
          {total}
        </p>
        <div className="galerie-lightbox__top-actions">
          <button
            type="button"
            className="galerie-lightbox__icon-btn galerie-lightbox__desktop-only"
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
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div
        ref={viewportRef}
        className="galerie-lightbox__viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="galerie-lightbox__track"
          style={{
            width: `${Math.max(total, 1) * 100}%`,
            transform:
              zoom > 1
                ? `translate3d(${(-index / Math.max(total, 1)) * 100}%, 0, 0)`
                : `translate3d(calc(${(-index / Math.max(total, 1)) * 100}% + ${dragging ? dragX : 0}px), 0, 0)`,
            transition: dragging || zoom > 1 ? "none" : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {photos.map((photo, photoIndex) => {
            const distance = Math.min(
              Math.abs(photoIndex - index),
              Math.abs(photoIndex - index + total),
              Math.abs(photoIndex - index - total),
            );
            const near = distance <= 1;
            const active = photoIndex === index;

            return (
              <div
                key={photo.src}
                className={`galerie-lightbox__slide${active ? " galerie-lightbox__slide--active" : ""}`}
                style={{ width: `${100 / Math.max(total, 1)}%` }}
              >
                {near ? (
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    draggable={false}
                    decoding="async"
                    style={
                      active
                        ? {
                            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                            transition: dragging ? "none" : "transform 180ms ease",
                          }
                        : undefined
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="galerie-lightbox__bar">
        <div className="galerie-lightbox__dock">
          <button type="button" className="galerie-lightbox__action" onClick={showPrev}>
            <span className="galerie-lightbox__action-icon" aria-hidden>
              <ChevronLeft size={20} strokeWidth={1.75} />
            </span>
            <span className="galerie-lightbox__action-label">Précédent</span>
          </button>

          <button type="button" className="galerie-lightbox__action" onClick={downloadPhoto}>
            <span className="galerie-lightbox__action-icon" aria-hidden>
              <Download size={18} strokeWidth={1.75} />
            </span>
            <span className="galerie-lightbox__action-label">Télécharger</span>
          </button>

          <div className="galerie-lightbox__zoom" role="group" aria-label="Zoom">
            <button
              type="button"
              className="galerie-lightbox__zoom-btn"
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              aria-label="Zoom arrière"
            >
              <ZoomOut size={16} strokeWidth={1.75} />
            </button>
            <span className="galerie-lightbox__zoom-value">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="galerie-lightbox__zoom-btn"
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              aria-label="Zoom avant"
            >
              <ZoomIn size={16} strokeWidth={1.75} />
            </button>
          </div>

          <button type="button" className="galerie-lightbox__action" onClick={showNext}>
            <span className="galerie-lightbox__action-icon" aria-hidden>
              <ChevronRight size={20} strokeWidth={1.75} />
            </span>
            <span className="galerie-lightbox__action-label">Suivant</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
