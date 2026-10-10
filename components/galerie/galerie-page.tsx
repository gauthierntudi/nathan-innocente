"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { FaceScan } from "@/components/galerie/face-scan";
import { GalerieLightbox } from "@/components/galerie/galerie-lightbox";
import { GalerieWall } from "@/components/galerie/galerie-wall";
import { HomeUiProvider } from "@/components/home/home-ui-context";
import { OffcanvasMenu } from "@/components/home/offcanvas-menu";
import { Preloader } from "@/components/home/preloader";
import { SiteHeader } from "@/components/home/site-header";
import type { MatchedAlbum } from "@/lib/galerie/content";
import {
  clearGalerieSession,
  loadGalerieSession,
  saveGalerieSession,
} from "@/lib/galerie/session";
import "@/components/galerie/galerie.css";

type Phase = "gate" | "scan" | "albums" | "photos";

function GalerieContent() {
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("gate");
  const [albums, setAlbums] = useState<MatchedAlbum[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<MatchedAlbum | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [brokenSrcs, setBrokenSrcs] = useState<Set<string>>(() => new Set());

  const photos = (activeAlbum?.photos ?? []).filter((photo) => !brokenSrcs.has(photo.src));

  useEffect(() => {
    const saved = loadGalerieSession();
    if (saved) {
      setAlbums(saved.albums);
      setBrokenSrcs(new Set(saved.brokenSrcs));
      const active =
        saved.activeAlbumId != null
          ? saved.albums.find((album) => album.id === saved.activeAlbumId) ?? null
          : null;
      if (saved.phase === "photos" && active) {
        setActiveAlbum(active);
        setPhase("photos");
      } else {
        setActiveAlbum(null);
        setPhase("albums");
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void fetch("/api/galerie/index", { method: "POST" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (phase !== "albums" && phase !== "photos") return;
    saveGalerieSession({
      phase,
      albums,
      activeAlbumId: activeAlbum?.id ?? null,
      brokenSrcs: [...brokenSrcs],
    });
  }, [ready, phase, albums, activeAlbum, brokenSrcs]);

  useEffect(() => {
    if (viewerIndex == null) return;
    if (photos.length === 0) {
      setViewerIndex(null);
      return;
    }
    if (viewerIndex >= photos.length) {
      setViewerIndex(photos.length - 1);
    }
  }, [photos.length, viewerIndex]);

  const beginScan = useCallback(() => {
    clearGalerieSession();
    setAlbums([]);
    setActiveAlbum(null);
    setViewerIndex(null);
    setBrokenSrcs(new Set());
    setPhase("scan");
  }, []);

  const markBroken = useCallback((src: string) => {
    setBrokenSrcs((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  }, []);

  const closeViewer = useCallback(() => setViewerIndex(null), []);
  const immersive = phase === "gate" || phase === "scan";

  const lightbox =
    portalReady && viewerIndex != null && photos.length > 0
      ? createPortal(
          <GalerieLightbox
            photos={photos}
            index={viewerIndex}
            onClose={closeViewer}
            onIndexChange={setViewerIndex}
            onImageError={markBroken}
          />,
          document.body,
        )
      : null;

  if (!ready) {
    return (
      <div id="body" className="home-theme galerie-page galerie-page--immersive">
        <Preloader />
      </div>
    );
  }

  return (
    <div
      id="body"
      className={`home-theme galerie-page${immersive ? " galerie-page--immersive" : ""}`}
    >
      <Preloader />
      <OffcanvasMenu />
      <SiteHeader tone={immersive ? "dark" : "light"} />

      {phase === "gate" ? <GalerieWall onAccess={beginScan} /> : null}

      {phase === "scan" ? (
        <FaceScan
          onCancel={() => setPhase("gate")}
          onMatched={(matched) => {
            setAlbums(matched);
            setActiveAlbum(null);
            setViewerIndex(null);
            setBrokenSrcs(new Set());
            setPhase("albums");
            saveGalerieSession({
              phase: "albums",
              albums: matched,
              activeAlbumId: null,
              brokenSrcs: [],
            });
          }}
        />
      ) : null}

      {phase === "albums" ? (
        <main className="galerie-results">
          <header className="galerie-results__hero">
            <p className="galerie-results__eyebrow">Nathan & Innocente · 2026</p>
            <h1 className="galerie-results__title">Vos albums</h1>
            <p className="galerie-results__lead">
              {albums.length === 0
                ? "Aucun album ne contient ce visage."
                : albums.length === 1
                  ? "1 album où vous apparaissez."
                  : `${albums.length} albums où vous apparaissez.`}
            </p>
          </header>

          {albums.length > 0 ? (
            <div className="galerie-albums">
              {albums.map((album) => {
                const coverSrc = brokenSrcs.has(album.cover)
                  ? album.photos.find((photo) => !brokenSrcs.has(photo.src))?.src
                  : album.cover;
                const visibleCount = album.photos.filter((photo) => !brokenSrcs.has(photo.src)).length;
                return (
                  <button
                    key={album.id}
                    type="button"
                    className="galerie-album"
                    onClick={() => {
                      setActiveAlbum(album);
                      setViewerIndex(null);
                      setPhase("photos");
                    }}
                  >
                    <span className="galerie-album__media">
                      {coverSrc ? (
                        <img
                          src={coverSrc}
                          alt=""
                          onLoad={(event) => {
                            event.currentTarget.classList.add("is-loaded");
                          }}
                          onError={() => markBroken(coverSrc)}
                        />
                      ) : null}
                    </span>
                    <span className="galerie-album__meta">
                      <span className="galerie-album__title">{album.title}</span>
                      <span className="galerie-album__count">
                        {visibleCount === 1
                          ? "1 photo"
                          : `${visibleCount} photos`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="galerie-results__actions">
            <button type="button" className="galerie-access" onClick={beginScan}>
              Scanner à nouveau
            </button>
          </div>
        </main>
      ) : null}

      {phase === "photos" && activeAlbum ? (
        <main className="galerie-results">
          <header className="galerie-results__hero">
            <button
              type="button"
              className="galerie-results__back"
              onClick={() => {
                setActiveAlbum(null);
                setViewerIndex(null);
                setPhase("albums");
              }}
            >
              ← Albums
            </button>
            <p className="galerie-results__eyebrow">Nathan & Innocente · 2026</p>
            <h1 className="galerie-results__title">{activeAlbum.title}</h1>
            <p className="galerie-results__lead">
              {photos.length === 0
                ? "Aucune photo disponible pour le moment."
                : photos.length === 1
                  ? "1 photo où vous apparaissez."
                  : `${photos.length} photos où vous apparaissez.`}
            </p>
          </header>

          {photos.length > 0 ? (
            <div className="galerie-results__masonry">
              {photos.map((image, index) => (
                <button
                  key={image.src}
                  type="button"
                  className="galerie-results__item"
                  onClick={() => setViewerIndex(index)}
                  aria-label={`Voir la photo : ${image.alt}`}
                >
                  <img
                    src={image.src}
                    alt={image.alt}
                    onLoad={(event) => {
                      event.currentTarget.classList.add("is-loaded");
                    }}
                    onError={() => markBroken(image.src)}
                  />
                </button>
              ))}
            </div>
          ) : null}

          <div className="galerie-results__actions">
            <button type="button" className="galerie-access" onClick={beginScan}>
              Scanner à nouveau
            </button>
          </div>
        </main>
      ) : null}

      {lightbox}
    </div>
  );
}

export function GaleriePage() {
  return (
    <HomeUiProvider>
      <GalerieContent />
    </HomeUiProvider>
  );
}
