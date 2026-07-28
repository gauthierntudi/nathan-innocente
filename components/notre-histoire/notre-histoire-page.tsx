"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { HomeUiProvider } from "@/components/home/home-ui-context";
import { OffcanvasMenu } from "@/components/home/offcanvas-menu";
import { Preloader } from "@/components/home/preloader";
import { SiteHeader } from "@/components/home/site-header";
import { invitationPath } from "@/lib/home/content";
import {
  storySlides,
  type StorySlide,
} from "@/lib/notre-histoire/content";
import "@/components/notre-histoire/notre-histoire.css";

gsap.registerPlugin(useGSAP);

const SWIPE_THRESHOLD = 48;
const SLIDE_STORAGE_KEY = "notre-histoire-slide";

type GallerySlideData = Extract<StorySlide, { kind: "gallery" }>;

function GallerySlide({ slide }: { slide: GallerySlideData }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointerStartX = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);
  const lockAxis = useRef<"x" | "y" | null>(null);
  const dragXRef = useRef(0);

  const open = viewerIndex != null;
  const totalImages = slide.images.length;

  const closeViewer = useCallback(() => {
    setViewerIndex(null);
    setDragX(0);
    setDragging(false);
    pointerStartX.current = null;
    pointerStartY.current = null;
    lockAxis.current = null;
    dragXRef.current = 0;
  }, []);

  const showPrev = useCallback(() => {
    setViewerIndex((current) => {
      if (current == null) return current;
      return (current - 1 + totalImages) % totalImages;
    });
  }, [totalImages]);

  const showNext = useCallback(() => {
    setViewerIndex((current) => {
      if (current == null) return current;
      return (current + 1) % totalImages;
    });
  }, [totalImages]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        showPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        showNext();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeViewer, open, showNext, showPrev]);

  const onLightboxPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    pointerStartX.current = event.clientX;
    pointerStartY.current = event.clientY;
    lockAxis.current = null;
    dragXRef.current = 0;
    setDragging(true);
    setDragX(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onLightboxPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartX.current == null || pointerStartY.current == null) return;

    const dx = event.clientX - pointerStartX.current;
    const dy = event.clientY - pointerStartY.current;

    if (!lockAxis.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      lockAxis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }

    if (lockAxis.current !== "x") return;

    dragXRef.current = dx;
    setDragX(dx);
  };

  const onLightboxPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartX.current == null) return;

    const dx = dragXRef.current;
    const axis = lockAxis.current;
    const threshold = Math.min(72, window.innerWidth * 0.18);

    pointerStartX.current = null;
    pointerStartY.current = null;
    lockAxis.current = null;
    dragXRef.current = 0;
    setDragging(false);
    setDragX(0);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    if (axis !== "x") return;
    if (dx <= -threshold) showNext();
    else if (dx >= threshold) showPrev();
  };

  const lightbox =
    portalReady && open && viewerIndex != null
      ? createPortal(
          <div
            className="nh-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Visionneuse photos"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="nh-lightbox__close"
              onClick={closeViewer}
              aria-label="Fermer"
            >
              Fermer
            </button>

            <div
              className="nh-lightbox__viewport"
              onPointerDown={onLightboxPointerDown}
              onPointerMove={onLightboxPointerMove}
              onPointerUp={onLightboxPointerUp}
              onPointerCancel={onLightboxPointerUp}
            >
              <div
                className={`nh-lightbox__track${dragging ? " nh-lightbox__track--dragging" : ""}`}
                style={{
                  transform: `translate3d(calc(${-viewerIndex * 100}% + ${dragX}px), 0, 0)`,
                }}
              >
                {slide.images.map((image) => (
                  <figure key={image.src} className="nh-lightbox__slide">
                    <img src={image.src} alt={image.alt} draggable={false} />
                  </figure>
                ))}
              </div>
            </div>

            <div className="nh-lightbox__chrome">
              <button
                type="button"
                className="nh-lightbox__nav nh-lightbox__nav--prev"
                onClick={showPrev}
                aria-label="Photo précédente"
              >
                ‹
              </button>
              <p className="nh-lightbox__counter">
                {viewerIndex + 1} / {totalImages}
              </p>
              <button
                type="button"
                className="nh-lightbox__nav nh-lightbox__nav--next"
                onClick={showNext}
                aria-label="Photo suivante"
              >
                ›
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="nh-slide__inner nh-slide__inner--gallery">
        {slide.chapter ? (
          <p className="nh-kicker nh-enter">{slide.chapter}</p>
        ) : null}
        <h2 className="nh-title nh-title--section nh-enter">{slide.title}</h2>
        <span className="nh-rule nh-enter" aria-hidden />
        <p className="nh-gallery-lead nh-enter">{slide.lead}</p>
        <div className="nh-gallery">
          {slide.images.slice(0, 4).map((image, index) => {
            const extraCount = Math.max(0, totalImages - 4);
            const showMore = index === 3 && extraCount > 0;

            return (
              <button
                key={image.src}
                type="button"
                className="nh-gallery__item nh-enter"
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setViewerIndex(index);
                }}
                aria-label={
                  showMore
                    ? `Voir la galerie, ${extraCount} photos supplémentaires`
                    : `Voir la photo : ${image.alt}`
                }
              >
                <img src={image.src} alt={image.alt} loading="lazy" />
                {showMore ? (
                  <span className="nh-gallery__more" aria-hidden>
                    +{extraCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {lightbox}
    </>
  );
}

function getSlideIndexById(id: string) {
  if (id === "rencontre") {
    return storySlides.findIndex((slide) => slide.id === "rencontre-avant");
  }
  if (id === "amour") {
    return storySlides.findIndex((slide) => slide.id === "amour-amis");
  }
  const index = storySlides.findIndex((slide) => slide.id === id);
  return index >= 0 ? index : 0;
}

function isKnownSlideId(id: string) {
  if (id === "rencontre" || id === "amour") return true;
  return storySlides.some((slide) => slide.id === id);
}

function readStoredSlideIndex() {
  if (typeof window === "undefined") return 0;

  const hashId = window.location.hash.replace(/^#/, "");
  if (hashId && isKnownSlideId(hashId)) {
    return getSlideIndexById(hashId);
  }

  try {
    const storedId = window.localStorage.getItem(SLIDE_STORAGE_KEY);
    if (storedId && isKnownSlideId(storedId)) {
      return getSlideIndexById(storedId);
    }
  } catch {
    // ignore storage access errors
  }

  return 0;
}

function persistSlideIndex(index: number) {
  const slide = storySlides[index];
  if (!slide || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(SLIDE_STORAGE_KEY, slide.id);
  } catch {
    // ignore storage access errors
  }

  const nextHash = `#${slide.id}`;
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
  }
}

function splitMasonryColumns(images: readonly string[], columns = 3) {
  const cols: string[][] = Array.from({ length: columns }, () => []);
  images.forEach((src, index) => {
    cols[index % columns]?.push(src);
  });
  return cols;
}

function MasonryLayer({
  columns,
  tone,
}: {
  columns: string[][];
  tone: "grey" | "color";
}) {
  return (
    <div className={`nh-masonry nh-masonry--${tone}`}>
      {columns.map((column, colIndex) => {
        const loop = [...column, ...column];
        return (
          <div
            key={`${tone}-col-${colIndex}`}
            className={`nh-masonry__col nh-masonry__col--${colIndex + 1}`}
          >
            <div className="nh-masonry__rail">
              {loop.map((src, imageIndex) => (
                <figure
                  key={`${tone}-${src}-${imageIndex}`}
                  className={`nh-masonry__item nh-masonry__item--${(imageIndex % 3) + 1}`}
                >
                  <img
                    src={src}
                    alt=""
                    loading={imageIndex < 4 ? "eager" : "lazy"}
                  />
                </figure>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IntroMasonry({ images }: { images: readonly string[] }) {
  const columns = splitMasonryColumns(images, 3);

  return (
    <div className="nh-masonry-stack" aria-hidden>
      <MasonryLayer columns={columns} tone="grey" />
      <MasonryLayer columns={columns} tone="color" />
    </div>
  );
}

type ClosingSlideData = Extract<StorySlide, { kind: "closing" }>;

function ClosingSlide({
  slide,
  active,
}: {
  slide: ClosingSlideData;
  active: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (active) {
      const play = video.play();
      if (play && typeof play.catch === "function") {
        play.catch(() => {
          // Autoplay may be blocked until user gesture; muted should allow it.
        });
      }
      return;
    }

    video.pause();
  }, [active]);

  return (
    <>
      <div className="nh-closing-media" aria-hidden>
        <video
          ref={videoRef}
          className="nh-closing-media__video"
          src={slide.videoUrl}
          muted
          playsInline
          loop
          preload="metadata"
          autoPlay={active}
        />
        <div className="nh-closing-media__veil" />
      </div>

      <div className="nh-slide__inner nh-slide__inner--closing">
        <h2 className="nh-title nh-title--section nh-enter">{slide.title}</h2>
        <span className="nh-rule nh-enter" aria-hidden />
        <div className="nh-body">
          {slide.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="nh-enter">
              {paragraph}
            </p>
          ))}
          <p className="nh-thanks nh-enter">{slide.thanks}</p>
        </div>
        <div className="nh-closing-cta nh-enter">
          <Link href={invitationPath} className="nh-btn">
            Accéder à mon Invitation
          </Link>
        </div>
      </div>
    </>
  );
}

function SlideContent({
  slide,
  active,
}: {
  slide: StorySlide;
  active: boolean;
}) {
  switch (slide.kind) {
    case "intro":
      return (
        <>
          <IntroMasonry images={slide.masonryImages} />
          <div className="nh-slide__veil" aria-hidden />
          <div className="nh-slide__inner nh-slide__inner--intro">
            {slide.kicker ? (
              <p className="nh-kicker nh-enter">{slide.kicker}</p>
            ) : null}
            <h2 className="nh-title nh-title--section nh-enter">{slide.title}</h2>
            <span className="nh-rule nh-enter" aria-hidden />
            <div className="nh-body">
              {slide.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="nh-enter">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </>
      );

    case "scene":
      return (
        <>
          <div
            className={`nh-scene-media${slide.imageSecondary ? " nh-scene-media--split" : ""}${
              slide.tone === "greyscale" ? " nh-scene-media--greyscale" : ""
            }`}
            aria-hidden
          >
            {slide.imageSecondary ? (
              <>
                <div
                  className="nh-scene-media__half nh-scene-media__half--left"
                  style={{ backgroundImage: `url("${slide.image}")` }}
                />
                <div
                  className="nh-scene-media__half nh-scene-media__half--right"
                  style={{ backgroundImage: `url("${slide.imageSecondary}")` }}
                />
              </>
            ) : (
              <div
                className="nh-scene-media__full"
                style={{ backgroundImage: `url("${slide.image}")` }}
              />
            )}
            <div className="nh-scene-media__veil" />
          </div>

          <div className="nh-slide__inner nh-slide__inner--scene">
            <div className="nh-scene-meta nh-enter">
              <p className="nh-kicker">{slide.chapter}</p>
              <span className="nh-scene-step">{slide.step}</span>
            </div>
            {slide.place ? (
              <p className="nh-scene-place nh-enter">{slide.place}</p>
            ) : null}
            <h2 className="nh-title nh-title--scene nh-enter">{slide.title}</h2>
            <span className="nh-rule nh-enter" aria-hidden />
            <p className="nh-scene-body nh-enter">{slide.body}</p>
          </div>
        </>
      );

    case "reflection":
      return (
        <>
          <div className="nh-reflection-media" aria-hidden>
            <div
              className="nh-reflection-media__image"
              style={{ backgroundImage: `url("${slide.image}")` }}
            />
            <div className="nh-reflection-media__veil" />
            <div className="nh-reflection-media__glow" />
          </div>

          <div className="nh-slide__inner nh-slide__inner--reflection">
            <p className="nh-kicker nh-enter">{slide.chapter}</p>
            <h2 className="nh-title nh-title--reflection nh-enter">
              {slide.title}
            </h2>
            <span className="nh-rule nh-enter" aria-hidden />
            {slide.highlight ? (
              <blockquote className="nh-reflection-quote nh-enter">
                <p>{slide.highlight}</p>
              </blockquote>
            ) : null}
            <div className="nh-reflection-body">
              {slide.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="nh-enter">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </>
      );

    case "text":
      return (
        <div className="nh-slide__inner">
          {slide.kicker ? (
            <p className="nh-kicker nh-enter">{slide.kicker}</p>
          ) : null}
          <h2 className="nh-title nh-title--section nh-enter">{slide.title}</h2>
          <span className="nh-rule nh-enter" aria-hidden />
          <div className="nh-body">
            {slide.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} className="nh-enter">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      );

    case "moments":
      return (
        <div className="nh-slide__inner">
          <h2 className="nh-title nh-title--section nh-enter">{slide.title}</h2>
          <span className="nh-rule nh-enter" aria-hidden />
          <div className="nh-moments">
            {slide.moments.map((moment) => (
              <article key={moment.label} className="nh-moment nh-enter">
                <h3 className="nh-moment__label">{moment.label}</h3>
                <p className="nh-moment__body">{moment.body}</p>
              </article>
            ))}
          </div>
        </div>
      );

    case "gallery":
      return <GallerySlide slide={slide} />;

    case "closing":
      return <ClosingSlide slide={slide} active={active} />;
  }
}

function NotreHistoireContent() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const animatingRef = useRef(false);
  const pointerStartX = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);
  const lockAxis = useRef<"x" | "y" | null>(null);

  const [index, setIndex] = useState(0);
  const total = storySlides.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;

  const animateEntrance = useCallback((slideEl: Element | null) => {
    if (!slideEl) return;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const targets = slideEl.querySelectorAll(".nh-enter");
    if (!targets.length) return;

    if (prefersReduced) {
      gsap.set(targets, { opacity: 1, clearProps: "transform" });
      return;
    }

    gsap.fromTo(
      targets,
      { opacity: 0, y: 22 },
      {
        opacity: 1,
        y: 0,
        duration: 0.62,
        stagger: 0.07,
        ease: "power3.out",
        clearProps: "transform",
      },
    );
  }, []);

  const goTo = useCallback(
    (nextIndex: number) => {
      const track = trackRef.current;
      if (!track || animatingRef.current) return;

      const clamped = Math.max(0, Math.min(total - 1, nextIndex));
      if (clamped === indexRef.current) return;

      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      animatingRef.current = true;
      indexRef.current = clamped;
      setIndex(clamped);
      persistSlideIndex(clamped);

      const duration = prefersReduced ? 0 : 0.55;

      gsap.to(track, {
        xPercent: -clamped * 100,
        duration,
        ease: "power3.inOut",
        onComplete: () => {
          animatingRef.current = false;
          const slideEl = track.children[clamped] ?? null;
          animateEntrance(slideEl);
        },
      });
    },
    [animateEntrance, total],
  );

  useGSAP(
    () => {
      const track = trackRef.current;
      if (!track) return;

      const initialIndex = readStoredSlideIndex();
      indexRef.current = initialIndex;
      setIndex(initialIndex);
      persistSlideIndex(initialIndex);

      gsap.set(track, { xPercent: -initialIndex * 100 });

      const activeSlide = track.children[initialIndex] ?? null;
      const loading = document.getElementById("loading");

      const play = () => animateEntrance(activeSlide);

      if (!loading) {
        play();
        return;
      }

      const observer = new MutationObserver(() => {
        if (!document.getElementById("loading")) {
          observer.disconnect();
          play();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
    { scope: rootRef, dependencies: [animateEntrance, total] },
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (document.querySelector(".nh-lightbox")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        goTo(indexRef.current + 1);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        goTo(indexRef.current - 1);
      }
    };

    const onHashChange = () => {
      const hashId = window.location.hash.replace(/^#/, "");
      if (!hashId || !isKnownSlideId(hashId)) return;
      goTo(getSlideIndexById(hashId));
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [goTo]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerStartX.current = event.clientX;
    pointerStartY.current = event.clientY;
    lockAxis.current = null;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartX.current == null || pointerStartY.current == null) return;

    const dx = event.clientX - pointerStartX.current;
    const dy = event.clientY - pointerStartY.current;

    if (!lockAxis.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      lockAxis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartX.current == null) return;

    const dx = event.clientX - pointerStartX.current;
    const axis = lockAxis.current;
    pointerStartX.current = null;
    pointerStartY.current = null;
    lockAxis.current = null;

    if (axis !== "x") return;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    if (dx < 0) goTo(indexRef.current + 1);
    else goTo(indexRef.current - 1);
  };

  return (
    <div ref={rootRef} id="body" className="home-theme nh-page">
      <Preloader />
      <OffcanvasMenu />
      <SiteHeader />

      <div className="nh-bg" aria-hidden>
        <div className="nh-bg__grain" />
      </div>

      <main className="nh-main">
        <div
          className="nh-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div ref={trackRef} className="nh-track">
            {storySlides.map((slide, slideIndex) => (
              <section
                key={slide.id}
                className={`nh-slide${
                  slide.kind === "intro"
                    ? " nh-slide--intro"
                    : slide.kind === "scene"
                      ? " nh-slide--scene"
                      : slide.kind === "reflection"
                        ? " nh-slide--reflection"
                        : slide.kind === "gallery"
                          ? " nh-slide--gallery"
                          : slide.kind === "closing"
                            ? " nh-slide--closing"
                            : ""
                }`}
                aria-hidden={slideIndex !== index}
                aria-label={slide.title}
              >
                <SlideContent slide={slide} active={slideIndex === index} />
              </section>
            ))}
          </div>
        </div>

        <div className="nh-controls">
          <button
            type="button"
            className="nh-nav-btn"
            onClick={() => goTo(index - 1)}
            disabled={isFirst}
          >
            Précédent
          </button>

          <div className="nh-dots" role="tablist" aria-label="Chapitres">
            {storySlides.map((slide, slideIndex) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={slideIndex === index}
                aria-label={`Aller au chapitre ${slideIndex + 1}`}
                className={`nh-dot${slideIndex === index ? " nh-dot--active" : ""}`}
                onClick={() => goTo(slideIndex)}
              />
            ))}
          </div>

          {!isLast ? (
            <button
              type="button"
              className="nh-nav-btn nh-nav-btn--next"
              onClick={() => goTo(index + 1)}
            >
              Suivant
            </button>
          ) : (
            <span className="nh-nav-btn nh-nav-btn--spacer" aria-hidden />
          )}
        </div>
      </main>
    </div>
  );
}

export function NotreHistoirePage() {
  return (
    <HomeUiProvider>
      <NotreHistoireContent />
    </HomeUiProvider>
  );
}
