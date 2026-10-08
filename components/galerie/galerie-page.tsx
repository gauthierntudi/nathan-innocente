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
import "@/components/galerie/galerie.css";

type Phase = "gate" | "scan" | "albums" | "photos";

function GalerieContent() {
  const [phase, setPhase] = useState<Phase>("gate");
  const [albums, setAlbums] = useState<MatchedAlbum[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<MatchedAlbum | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  const photos = activeAlbum?.photos ?? [];

  useEffect(() => {
    void fetch("/api/galerie/index", { method: "POST" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const beginScan = useCallback(() => {
    setPhase("scan");
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
          />,
          document.body,
        )
      : null;

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
            setPhase("albums");
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
              {albums.map((album) => (
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
                    <img src={album.cover} alt="" />
                  </span>
                  <span className="galerie-album__meta">
                    <span className="galerie-album__title">{album.title}</span>
                    <span className="galerie-album__count">
                      {album.photos.length === 1
                        ? "1 photo"
                        : `${album.photos.length} photos`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="galerie-results__actions">
            <button
              type="button"
              className="galerie-access"
              onClick={() => {
                setAlbums([]);
                setActiveAlbum(null);
                setViewerIndex(null);
                beginScan();
              }}
            >
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
              {activeAlbum.photos.length === 1
                ? "1 photo où vous apparaissez."
                : `${activeAlbum.photos.length} photos où vous apparaissez.`}
            </p>
          </header>

          <div className="galerie-results__masonry">
            {activeAlbum.photos.map((image, index) => (
              <button
                key={image.src}
                type="button"
                className="galerie-results__item"
                onClick={() => setViewerIndex(index)}
                aria-label={`Voir la photo : ${image.alt}`}
              >
                <img src={image.src} alt={image.alt} />
              </button>
            ))}
          </div>

          <div className="galerie-results__actions">
            <button
              type="button"
              className="galerie-access"
              onClick={() => {
                setAlbums([]);
                setActiveAlbum(null);
                setViewerIndex(null);
                beginScan();
              }}
            >
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
