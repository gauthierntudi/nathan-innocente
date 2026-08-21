"use client";

import { PageFlip, type PageFlipEventData } from "page-flip";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import { DressCodePdfPages } from "@/components/save-the-date/dress-code-pdf-pages";
import { getPdfPixelRatio } from "@/lib/pdf-render-quality";

type InvitationPdfFlipbookProps = {
  blob: Blob;
  title: string;
  accent?: string;
  /** Contenu de la dernière page (confirmation RSVP). */
  confirmPage?: ReactNode;
  /** true quand la page de confirmation est affichée. */
  onReachedEndChange?: (reachedEnd: boolean) => void;
  /** Flip impossible → aperçu pages (appareils anciens). */
  onFallbackChange?: (usingFallback: boolean) => void;
};

type RenderedPage = {
  canvas: HTMLCanvasElement;
  cssWidth: number;
  cssHeight: number;
};

type PageFlipInstance = PageFlip;

const FLIP_MAX_DISPLAY_WIDTH = 520;
const FLIP_MIN_DISPLAY_WIDTH = 300;

function measureDisplayWidth(host: HTMLElement): number {
  const parent = host.parentElement;
  const raw =
    host.clientWidth ||
    parent?.clientWidth ||
    Math.min(window.innerWidth - 48, FLIP_MAX_DISPLAY_WIDTH);
  return Math.round(
    Math.min(Math.max(raw, FLIP_MIN_DISPLAY_WIDTH), FLIP_MAX_DISPLAY_WIDTH),
  );
}

function canvasToPngUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("PNG export failed"));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      "image/png",
    );
  });
}

async function renderPdfPages(
  blob: Blob,
  cssWidth: number,
): Promise<RenderedPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await blob.arrayBuffer();
  const pdf = await pdfjs.getDocument({
    data,
    // Better font rendering when available
    isEvalSupported: false,
  }).promise;

  const pages: RenderedPage[] = [];
  // Retina plafonné sur appareils faibles pour limiter la mémoire canvas.
  const pixelRatio = getPdfPixelRatio({ max: 2.5, min: 1 });
  const targetPixelWidth = Math.round(cssWidth * pixelRatio);

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const unscaled = page.getViewport({ scale: 1 });
    // Always paint enough pixels for the CSS size × DPR (no undersampling).
    const scale = targetPixelWidth / unscaled.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      alpha: false,
    });
    if (!context) continue;

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    // pdf.js already antialiases glyphs — keep smoothing on for the raster pass.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport,
      intent: "print",
    }).promise;

    pages.push({
      canvas,
      cssWidth,
      cssHeight: Math.round(cssWidth * (unscaled.height / unscaled.width)),
    });
  }

  return pages;
}

async function createImagePage(
  rendered: RenderedPage,
  title: string,
  index: number,
  total: number,
  objectUrls: string[],
): Promise<HTMLElement> {
  const page = document.createElement("div");
  page.className = "invite-flip__page invite-flip__page--pdf";
  // soft = curl / feuilletage (hard = simple rotateY, sans pli)
  page.dataset.density = "soft";

  const url = await canvasToPngUrl(rendered.canvas);
  objectUrls.push(url);

  const img = document.createElement("img");
  img.src = url;
  img.alt = `${title} — page ${index + 1} sur ${total}`;
  img.draggable = false;
  img.decoding = "async";
  // Intrinsic pixel size (hi-res) + CSS display size → sharp on Retina
  img.width = rendered.canvas.width;
  img.height = rendered.canvas.height;
  img.style.width = "100%";
  img.style.height = "100%";
  page.appendChild(img);

  // Free raster buffer once encoded
  rendered.canvas.width = 0;
  rendered.canvas.height = 0;

  return page;
}

function createConfirmPageHost(): HTMLElement {
  const page = document.createElement("div");
  page.className = "invite-flip__page invite-flip__page--confirm";
  // hard = pas de soft-clip / clone temporaire qui peut vider le HTML React
  page.dataset.density = "hard";
  return page;
}

/**
 * StPageFlip BACK natif = feuilletage faible / hard.
 * On force un soft-curl BACK : la page précédente entre par la gauche
 * (pli à gauche), la courante reste en base jusqu’à la fin.
 */
function patchSymmetricPortraitFlip(pageFlip: PageFlipInstance): void {
  const flagged = pageFlip as PageFlipInstance & { __softFlipPatched?: boolean };
  if (flagged.__softFlipPatched) return;
  flagged.__softFlipPatched = true;

  const BACK = 1;

  type FlipPage = {
    newTemporaryCopy: () => FlipPage;
    hideTemporaryCopy?: () => void;
    setDensity?: (density: "soft" | "hard") => void;
    setDrawingDensity?: (density: "soft" | "hard") => void;
    setOrientation?: (orientation: number) => void;
    setArea?: (area: unknown) => void;
    setPosition?: (pos: unknown) => void;
    setAngle?: (angle: number) => void;
    setHardAngle?: (angle: number) => void;
    getElement?: () => HTMLElement;
    getDrawingDensity?: () => string;
    draw?: (density: unknown) => void;
  };

  const forcePageSoft = (page: FlipPage | null | undefined) => {
    if (!page) return;
    page.setDensity?.("soft");
    page.setDrawingDensity?.("soft");
    const el = page.getElement?.();
    if (el) {
      el.classList.remove("--hard");
      el.classList.add("--soft");
    }
  };

  /** Stub pour Flip.do (setArea) sans clipper la vraie page précédente (déjà rightPage). */
  const peelBottomStub: FlipPage = {
    newTemporaryCopy() {
      return peelBottomStub;
    },
    hideTemporaryCopy() {},
    setDensity() {},
    setDrawingDensity() {},
    setOrientation() {},
    setArea() {},
    setPosition() {},
    setAngle() {},
    setHardAngle() {},
    getDrawingDensity() {
      return "soft";
    },
    getElement() {
      return undefined as unknown as HTMLElement;
    },
    draw() {},
  };

  const collection = pageFlip.getPageCollection() as {
    getCurrentSpreadIndex: () => number;
    getPages: () => FlipPage[];
  };

  const render = pageFlip.getRender() as {
    setFlippingPage: (page: FlipPage | null) => void;
    setBottomPage: (page: FlipPage | null) => void;
    setRightPage: (page: FlipPage | null) => void;
    clearShadow: () => void;
    getRect: () => { pageWidth: number; height: number };
    bottomPage: FlipPage | null;
    flippingPage: FlipPage | null;
    getSettings: () => { startZIndex: number; flippingTime?: number };
    drawBottomPage?: () => void;
    startAnimation: (
      frames: Array<() => void>,
      duration: number,
      onComplete: () => void,
    ) => void;
    finishAnimation: () => void;
  };

  const controller = pageFlip.getFlipController() as {
    start: (pos: { x: number; y: number }) => boolean;
    calc: {
      getDirection: () => number;
      getCorner: () => string;
      getFlippingProgress: () => number;
    } | null;
    flippingPage: FlipPage | null;
    bottomPage: FlipPage | null;
    render: typeof render;
    setState: (state: string) => void;
    reset: () => void;
    animateFlippingTo: (
      start: { x: number; y: number },
      dest: { x: number; y: number },
      isTurned: boolean,
      needReset?: boolean,
    ) => void;
    __peelCurrentBack?: boolean;
    __backFromPage?: FlipPage | null;
    __peelWillTurn?: boolean;
  };

  const originalStart = controller.start.bind(controller);
  const originalAnimate = controller.animateFlippingTo.bind(controller);
  const originalStartAnimation = render.startAnimation.bind(render);

  // Animation retour : durée minimale (évite le snap quand le geste est déjà avancé)
  render.startAnimation = function startAnimationSmooth(
    this: typeof render,
    frames,
    duration,
    onComplete,
  ) {
    let finalDuration = duration;
    let wrappedComplete = onComplete;

    if (controller.__peelCurrentBack) {
      const minMs = this.getSettings().flippingTime ?? 1000;
      finalDuration = Math.max(duration, minMs * 0.9);

      const willTurn = Boolean(controller.__peelWillTurn);

      wrappedComplete = () => {
        if (!willTurn && controller.__peelCurrentBack) {
          // Annulation : la page courante était déjà en rightPage
          controller.__peelCurrentBack = false;
          controller.__backFromPage = null;
          controller.__peelWillTurn = false;
        }
        onComplete();
      };
    }

    return originalStartAnimation.call(this, frames, finalDuration, wrappedComplete);
  };

  controller.start = function startSoftBack(
    this: typeof controller,
    pos: { x: number; y: number },
  ) {
    const ok = originalStart(pos);
    if (!ok || !this.calc) {
      this.__peelCurrentBack = false;
      this.__backFromPage = null;
      this.__peelWillTurn = false;
      return false;
    }

    forcePageSoft(this.flippingPage);
    if (this.bottomPage && this.bottomPage !== this.flippingPage) {
      forcePageSoft(this.bottomPage);
    }

    if (this.calc.getDirection() !== BACK) {
      this.__peelCurrentBack = false;
      this.__backFromPage = null;
      this.__peelWillTurn = false;
      return true;
    }

    const current = collection.getCurrentSpreadIndex();
    const pages = collection.getPages();
    const currentPage = pages[current];
    const previousPage = pages[current - 1];
    if (!currentPage || !previousPage) {
      this.__peelCurrentBack = false;
      this.__peelWillTurn = false;
      return false;
    }

    currentPage.hideTemporaryCopy?.();
    previousPage.hideTemporaryCopy?.();
    forcePageSoft(currentPage);
    forcePageSoft(previousPage);

    // Base = page courante (reste visible sous le feuillet)
    currentPage.setOrientation?.(1);
    this.render.setRightPage(currentPage);

    // Feuille = page précédente, géométrie BACK → pli / ombre à gauche
    this.flippingPage = previousPage;
    forcePageSoft(this.flippingPage);
    this.flippingPage.setOrientation?.(1);
    this.bottomPage = peelBottomStub;

    this.render.setFlippingPage(this.flippingPage);
    this.render.setBottomPage(null);

    this.__peelCurrentBack = true;
    this.__backFromPage = previousPage;
    this.__peelWillTurn = false;

    return true;
  };

  controller.animateFlippingTo = function animateFlippingToSmooth(
    this: typeof controller,
    start,
    dest,
    isTurned,
    needReset = true,
  ) {
    const peelBack = this.__peelCurrentBack;

    if (!peelBack) {
      return originalAnimate.call(this, start, dest, isTurned, needReset);
    }

    const pageWidth = this.render.getRect().pageWidth;
    const smoothDest = isTurned
      ? { x: -pageWidth, y: dest.y }
      : { x: pageWidth, y: dest.y };

    this.__peelWillTurn = isTurned;

    if (isTurned) {
      const restorePrev = pageFlip.turnToPrevPage.bind(pageFlip);

      pageFlip.turnToPrevPage = () => {
        this.render.setFlippingPage(null);
        this.render.setBottomPage(null);
        this.render.clearShadow();
        restorePrev();
        pageFlip.turnToPrevPage = restorePrev;
        this.__peelCurrentBack = false;
        this.__backFromPage = null;
        this.__peelWillTurn = false;
      };
    }

    return originalAnimate.call(this, start, smoothDest, isTurned, needReset);
  };

  // Pendant le peel : previous déjà en rightPage — ne pas redessiner le bottom
  render.drawBottomPage = function drawBottomSafe(this: typeof render) {
    if (this.bottomPage == null) return;
    if (controller.__peelCurrentBack) return;

    forcePageSoft(this.flippingPage);
    forcePageSoft(this.bottomPage);
    const density = this.flippingPage?.getDrawingDensity?.() ?? "soft";
    const el = this.bottomPage.getElement?.();
    if (el) {
      el.style.zIndex = (this.getSettings().startZIndex + 3).toString(10);
    }
    this.bottomPage.draw?.(density);
  };
}

/** Seuil bas pour valider un flip (la lib exige ~50 % sinon ça « rate »). */
const FLIP_COMPLETE_PROGRESS = 16;

/**
 * Bloque flipNext / geste avant au-delà de la dernière page réelle
 * (évite l’effet « encore une feuille » après la fin).
 */
function patchFlipEndGuard(
  pageFlip: PageFlipInstance,
  lastInteractiveIndex: number,
): void {
  const flagged = pageFlip as PageFlipInstance & { __flipEndGuarded?: boolean };
  if (flagged.__flipEndGuarded) return;
  flagged.__flipEndGuarded = true;

  const originalFlipNext = pageFlip.flipNext.bind(pageFlip);
  pageFlip.flipNext = (corner: "top" | "bottom" = "top") => {
    if (pageFlip.getCurrentPageIndex() >= lastInteractiveIndex) return;
    originalFlipNext(corner);
  };

  const controller = pageFlip.getFlipController() as {
    start: (pos: { x: number; y: number }) => boolean;
    calc: { getDirection: () => number } | null;
    reset: () => void;
  };

  const FORWARD = 0;
  const originalStart = controller.start.bind(controller);
  controller.start = function startBounded(
    this: typeof controller,
    pos: { x: number; y: number },
  ) {
    const ok = originalStart(pos);
    if (!ok || !this.calc) return false;

    if (
      this.calc.getDirection() === FORWARD &&
      pageFlip.getCurrentPageIndex() >= lastInteractiveIndex
    ) {
      this.reset();
      return false;
    }

    return true;
  };
}

type FlipBookLockable = PageFlipInstance & { __confirmLocked?: boolean };

function setFlipConfirmLocked(pageFlip: PageFlipInstance, locked: boolean) {
  const book = pageFlip as FlipBookLockable;
  book.__confirmLocked = locked;
  if (!locked) return;

  const render = pageFlip.getRender() as {
    setFlippingPage: (page: unknown) => void;
    setBottomPage: (page: unknown) => void;
    clearShadow: () => void;
    finishAnimation?: () => void;
  };
  const controller = pageFlip.getFlipController() as {
    reset?: () => void;
    setState?: (state: string) => void;
  };

  try {
    render.finishAnimation?.();
    render.setFlippingPage(null);
    render.setBottomPage(null);
    render.clearShadow();
    controller.reset?.();
    controller.setState?.("read");
  } catch {
    // ignore mid-flip cleanup errors
  }

  const ui = pageFlip.getUI() as { touchPoint: unknown };
  ui.touchPoint = null;
}

/**
 * Rend le geste plus permissif : swipe court, coins larges, validation dès ~16 % de pli.
 * Sur la page RSVP, ignore les gestes pour laisser les boutons cliquables (mobile).
 */
function patchFlipSensitivity(pageFlip: PageFlipInstance): void {
  const flagged = pageFlip as FlipBookLockable & { __flipSensitivityPatched?: boolean };
  if (flagged.__flipSensitivityPatched) return;
  flagged.__flipSensitivityPatched = true;

  const ui = pageFlip.getUI() as {
    swipeDistance: number;
    swipeTimeout: number;
    touchPoint: {
      point: { x: number; y: number };
      time: number;
    } | null;
    getMousePos: (x: number, y: number) => { x: number; y: number };
    onTouchEnd: (e: TouchEvent) => void;
    onTouchStart: (e: TouchEvent) => void;
    onTouchMove: (e: TouchEvent) => void;
    onMouseDown: (e: MouseEvent) => void;
    onMouseMove: (e: MouseEvent) => void;
    onMouseUp: (e: MouseEvent) => void;
    distElement?: HTMLElement;
    getDistElement?: () => HTMLElement;
  };

  ui.swipeDistance = 10;
  ui.swipeTimeout = 500;

  function isInteractiveTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return Boolean(
      target.closest(
        "button, a, input, textarea, select, label, .invite-flip__confirm, .invite-flip__confirm-actions",
      ),
    );
  }

  function isLocked() {
    return Boolean(flagged.__confirmLocked);
  }

  const originalTouchStart = ui.onTouchStart.bind(ui);
  const originalMouseDown = ui.onMouseDown.bind(ui);
  const originalTouchMove = ui.onTouchMove.bind(ui);
  const originalMouseMove = ui.onMouseMove.bind(ui);
  const originalMouseUp = ui.onMouseUp.bind(ui);
  const dist = ui.distElement ?? ui.getDistElement?.();

  window.removeEventListener("touchend", ui.onTouchEnd);
  window.removeEventListener("touchmove", ui.onTouchMove);
  window.removeEventListener("mousemove", ui.onMouseMove);
  window.removeEventListener("mouseup", ui.onMouseUp);
  if (dist) {
    dist.removeEventListener("touchstart", ui.onTouchStart);
    dist.removeEventListener("mousedown", ui.onMouseDown);
  }

  ui.onTouchStart = (e: TouchEvent) => {
    if (isLocked() || isInteractiveTarget(e.target)) {
      ui.touchPoint = null;
      return;
    }
    originalTouchStart(e);
  };

  ui.onMouseDown = (e: MouseEvent) => {
    if (isLocked() || isInteractiveTarget(e.target)) return;
    originalMouseDown(e);
  };

  ui.onTouchMove = (e: TouchEvent) => {
    if (isLocked()) return;
    originalTouchMove(e);
  };

  ui.onMouseMove = (e: MouseEvent) => {
    if (isLocked()) return;
    originalMouseMove(e);
  };

  ui.onMouseUp = (e: MouseEvent) => {
    if (isLocked() || isInteractiveTarget(e.target)) return;
    originalMouseUp(e);
  };

  ui.onTouchEnd = (e: TouchEvent) => {
    if (isLocked() || isInteractiveTarget(e.target)) {
      ui.touchPoint = null;
      return;
    }
    if (e.changedTouches.length === 0) return;

    const t = e.changedTouches[0];
    const pos = ui.getMousePos(t.clientX, t.clientY);
    let isSwipe = false;

    if (ui.touchPoint !== null) {
      const dx = pos.x - ui.touchPoint.point.x;
      const distY = Math.abs(pos.y - ui.touchPoint.point.y);
      const elapsed = Date.now() - ui.touchPoint.time;

      if (Math.abs(dx) > 8 && distY < 90 && elapsed < 500) {
        const render = pageFlip.getRender() as {
          getRect: () => { height: number };
        };
        const corner =
          ui.touchPoint.point.y < render.getRect().height / 2 ? "top" : "bottom";
        try {
          if (dx > 0) pageFlip.flipPrev(corner);
          else pageFlip.flipNext(corner);
          isSwipe = true;
        } catch {
          // StPageFlip peut throw si bottomPage/flippingPage invalide mid-gesture
          isSwipe = false;
        }
      }

      ui.touchPoint = null;
    }

    pageFlip.userStop(pos, isSwipe);
  };

  if (dist) {
    dist.addEventListener("touchstart", ui.onTouchStart, { passive: false });
    dist.addEventListener("mousedown", ui.onMouseDown);
  }
  window.addEventListener("touchmove", ui.onTouchMove, { passive: false });
  window.addEventListener("mousemove", ui.onMouseMove);
  window.addEventListener("mouseup", ui.onMouseUp);
  window.addEventListener("touchend", ui.onTouchEnd);

  const controller = pageFlip.getFlipController() as {
    calc: {
      getPosition: () => { x: number; y: number };
      getCorner: () => string;
      getFlippingProgress: () => number;
    } | null;
    render: {
      getRect: () => { pageWidth: number; height: number; width: number };
      convertToBook: (pos: { x: number; y: number }) => { x: number; y: number };
    };
    animateFlippingTo: (
      start: { x: number; y: number },
      end: { x: number; y: number },
      complete: boolean,
    ) => void;
    stopMove: () => void;
    isPointOnCorners: (globalPos: { x: number; y: number }) => boolean;
    getBoundsRect: () => { pageWidth: number; height: number; width: number };
  };

  controller.stopMove = function stopMoveSensitive(this: typeof controller) {
    if (this.calc === null) return;

    const pos = this.calc.getPosition();
    const rect = this.render.getRect();
    const y = this.calc.getCorner() === "bottom" ? rect.height : 0;
    const progress = this.calc.getFlippingProgress();

    const shouldComplete =
      progress >= FLIP_COMPLETE_PROGRESS || pos.x <= rect.pageWidth * 0.72;

    if (shouldComplete) {
      this.animateFlippingTo(pos, { x: -rect.pageWidth, y }, true);
    } else {
      this.animateFlippingTo(pos, { x: rect.pageWidth, y }, false);
    }
  };

  controller.isPointOnCorners = function isPointOnCornersSensitive(
    this: typeof controller,
    globalPos: { x: number; y: number },
  ) {
    const rect = this.getBoundsRect();
    const operatingDistance =
      Math.sqrt(rect.pageWidth ** 2 + rect.height ** 2) / 2.6;
    const bookPos = this.render.convertToBook(globalPos);

    return (
      bookPos.x > 0 &&
      bookPos.y > 0 &&
      bookPos.x < rect.width &&
      bookPos.y < rect.height &&
      (bookPos.x < operatingDistance ||
        bookPos.x > rect.width - operatingDistance) &&
      (bookPos.y < operatingDistance ||
        bookPos.y > rect.height - operatingDistance)
    );
  };
}

export function InvitationPdfFlipbook({
  blob,
  title,
  accent = "#ddcbb3",
  confirmPage,
  onReachedEndChange,
  onFallbackChange,
}: InvitationPdfFlipbookProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pageFlipRef = useRef<PageFlipInstance | null>(null);
  const confirmRootRef = useRef<Root | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const onEndRef = useRef(onReachedEndChange);
  onEndRef.current = onReachedEndChange;
  const onFallbackRef = useRef(onFallbackChange);
  onFallbackRef.current = onFallbackChange;

  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");
  /** Flipbook impossible → pages canvas scroll. */
  const [usePagesFallback, setUsePagesFallback] = useState(false);
  const [pagesFatal, setPagesFatal] = useState(false);
  const hasConfirmPage = Boolean(confirmPage);

  useEffect(() => {
    setUsePagesFallback(false);
    setPagesFatal(false);
    onFallbackRef.current?.(false);
  }, [blob]);

  useEffect(() => {
    if (!usePagesFallback) return;
    onFallbackRef.current?.(true);
    // En mode pages, la confirmation RSVP est visible sous le PDF.
    if (hasConfirmPage) {
      onEndRef.current?.(true);
    }
  }, [usePagesFallback, hasConfirmPage]);

  useEffect(() => {
    if (usePagesFallback) return;

    let cancelled = false;
    let pageFlip: PageFlipInstance | null = null;

    async function load() {
      setRendering(true);
      setError("");
      setPageIndex(0);
      setPageCount(0);
      setPdfPageCount(0);
      onEndRef.current?.(false);

      const host = hostRef.current;
      if (!host) return;

      if (confirmRootRef.current) {
        const previousRoot = confirmRootRef.current;
        confirmRootRef.current = null;
        setTimeout(() => {
          try {
            previousRoot.unmount();
          } catch {
            // already unmounted
          }
        }, 0);
      }
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
      host.replaceChildren();

      try {
        // Stage stays in layout (not display:none) so clientWidth is real.
        const displayWidth = measureDisplayWidth(host);
        const rendered = await renderPdfPages(blob, displayWidth);
        if (cancelled) return;

        if (rendered.length === 0) {
          if (!cancelled) {
            setUsePagesFallback(true);
            setRendering(false);
          }
          return;
        }

        const first = rendered[0];
        const pageWidth = first.cssWidth;
        const pageHeight = first.cssHeight;

        const bookEl = document.createElement("div");
        bookEl.className = "invite-flip__book";
        bookEl.setAttribute("aria-label", title);
        host.appendChild(bookEl);

        const objectUrls: string[] = [];
        const htmlPages: HTMLElement[] = [];
        for (let index = 0; index < rendered.length; index += 1) {
          htmlPages.push(
            await createImagePage(
              rendered[index],
              title,
              index,
              rendered.length,
              objectUrls,
            ),
          );
        }
        if (cancelled) {
          for (const url of objectUrls) URL.revokeObjectURL(url);
          return;
        }
        objectUrlsRef.current = objectUrls;

        let confirmHost: HTMLElement | null = null;
        if (confirmPage) {
          confirmHost = createConfirmPageHost();
          htmlPages.push(confirmHost);
        }

        // Pas de page blanche d’appoint en portrait : elle prenait la place du RSVP
        // (PDF à nb de pages pair → feuille vide au lieu des boutons).

        const confirmPageIndex = confirmHost
          ? htmlPages.indexOf(confirmHost)
          : -1;

        pageFlip = new PageFlip(bookEl, {
          width: pageWidth,
          height: pageHeight,
          // fixed = no upscaling beyond the resolution we painted
          size: "fixed",
          minWidth: pageWidth,
          maxWidth: pageWidth,
          minHeight: pageHeight,
          maxHeight: pageHeight,
          drawShadow: false,
          flippingTime: 1000,
          usePortrait: true,
          startZIndex: 0,
          autoSize: true,
          maxShadowOpacity: 0,
          // false = pas de couverture "hard" : feuilletage soft dès la 1re page
          showCover: false,
          mobileScrollSupport: false,
          // Seuil bas : swipe court suffit (complété aussi par patchFlipSensitivity)
          swipeDistance: 10,
          clickEventForward: true,
          useMouseEvents: true,
          showPageCorners: true,
          disableFlipByClick: false,
        });

        const totalPages = htmlPages.length;
        const pdfCount = rendered.length;
        const lastInteractiveIndex =
          confirmPageIndex >= 0 ? confirmPageIndex : pdfCount - 1;

        const forceSoftDensity = () => {
          if (!pageFlip) return;
          const count = pageFlip.getPageCount();
          for (let i = 0; i < count; i += 1) {
            // La page RSVP reste en hard (contenu HTML interactif)
            if (confirmPageIndex >= 0 && i === confirmPageIndex) continue;
            try {
              const page = pageFlip.getPage(i) as {
                setDensity: (d: "soft" | "hard") => void;
                setDrawingDensity?: (d: "soft" | "hard") => void;
                getElement?: () => HTMLElement;
              };
              page.setDensity("soft");
              page.setDrawingDensity?.("soft");
              const el = page.getElement?.();
              if (el) {
                el.classList.remove("--hard");
                el.classList.add("--soft");
              }
            } catch {
              // ignore invalid page
            }
          }

          if (confirmPageIndex >= 0) {
            try {
              const confirmFlipPage = pageFlip.getPage(confirmPageIndex) as {
                setDensity: (d: "soft" | "hard") => void;
                setDrawingDensity?: (d: "soft" | "hard") => void;
                getElement?: () => HTMLElement;
              };
              confirmFlipPage.setDensity("hard");
              confirmFlipPage.setDrawingDensity?.("hard");
              const el = confirmFlipPage.getElement?.();
              if (el) {
                el.classList.remove("--soft");
                el.classList.add("--hard");
              }
            } catch {
              // ignore
            }
          }
        };

        const syncEnd = (index: number) => {
          setPageIndex(index);
          const atConfirm =
            confirmPageIndex >= 0
              ? index >= confirmPageIndex
              : index >= pdfCount - 1;
          // Sur la page RSVP : coupe les gestes StPageFlip (sinon boutons morts sur mobile)
          if (pageFlip && confirmPageIndex >= 0) {
            setFlipConfirmLocked(pageFlip, index >= confirmPageIndex);
          }
          onEndRef.current?.(atConfirm);
        };

        pageFlip.on("flip", (event: PageFlipEventData) => {
          let index = typeof event.data === "number" ? event.data : 0;
          // Ne jamais s’arrêter après la page RSVP
          if (confirmPageIndex >= 0 && index > confirmPageIndex) {
            pageFlip?.turnToPage(confirmPageIndex);
            index = confirmPageIndex;
          } else if (confirmPageIndex < 0 && index >= pdfCount) {
            pageFlip?.turnToPage(pdfCount - 1);
            index = pdfCount - 1;
          }
          syncEnd(index);
        });

        pageFlip.on("changeOrientation", () => {
          forceSoftDensity();
        });

        pageFlip.on("changeState", (event: PageFlipEventData) => {
          // Empêche la lib de repasser en "hard" pendant le geste
          if (
            event.data === "flipping" ||
            event.data === "user_fold" ||
            event.data === "fold_corner"
          ) {
            forceSoftDensity();
          }
        });

        pageFlip.on("init", (event: PageFlipEventData) => {
          forceSoftDensity();
          const index =
            event.data && typeof event.data === "object" && "page" in event.data
              ? Number(event.data.page) || 0
              : 0;
          setPageCount(lastInteractiveIndex + 1);
          syncEnd(index);
        });

        pageFlip.loadFromHTML(htmlPages);
        forceSoftDensity();
        patchSymmetricPortraitFlip(pageFlip);
        patchFlipSensitivity(pageFlip);
        patchFlipEndGuard(pageFlip, lastInteractiveIndex);
        pageFlipRef.current = pageFlip;
        setPdfPageCount(pdfCount);
        // Compteur / nav : pages interactives (PDF + RSVP), sans la page blanche d’appoint
        setPageCount(lastInteractiveIndex + 1);

        if (confirmHost && confirmPage) {
          const root = createRoot(confirmHost);
          confirmRootRef.current = root;
          root.render(confirmPage);
        }

        setRendering(false);
      } catch (renderError) {
        console.error("Invitation PDF flipbook", renderError);
        if (!cancelled) {
          // Flip / hi-res échoué → aperçu pages simple (pdf.js canvas scroll).
          setUsePagesFallback(true);
          setError("");
          setRendering(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      pageFlipRef.current = null;
      const confirmRoot = confirmRootRef.current;
      confirmRootRef.current = null;
      // Defer nested root unmount so it does not run mid-React render.
      if (confirmRoot) {
        setTimeout(() => {
          try {
            confirmRoot.unmount();
          } catch {
            // already unmounted
          }
        }, 0);
      }
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
      try {
        pageFlip?.destroy();
      } catch {
        // PageFlip may already have removed the node
      }
      pageFlip = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob, title, hasConfirmPage, usePagesFallback]);

  useEffect(() => {
    if (!confirmRootRef.current || !confirmPage || usePagesFallback) return;
    confirmRootRef.current.render(confirmPage);
  }, [confirmPage, usePagesFallback]);

  function goNext() {
    const flip = pageFlipRef.current;
    if (!flip) return;
    if (flip.getCurrentPageIndex() >= pageCount - 1) return;
    flip.flipNext("top");
  }

  function goPrev() {
    pageFlipRef.current?.flipPrev("top");
  }

  const atConfirmPage =
    hasConfirmPage && pageIndex >= pageCount - 1 && pageCount > 0;
  const atLastPage = pageIndex >= pageCount - 1 && pageCount > 0;
  const displayCounter = hasConfirmPage
    ? `${Math.min(pageIndex + 1, pdfPageCount)} / ${pdfPageCount}${atConfirmPage ? " · RSVP" : ""}`
    : `${Math.min(pageIndex + 1, pageCount)} / ${pageCount}`;

  if (usePagesFallback) {
    return (
      <div
        className={`invite-flip invite-flip--pages-fallback${hasConfirmPage ? " invite-flip--at-confirm" : ""}`}
        style={{ ["--invite-flip-accent" as string]: accent }}
      >
        <p className="invite-flip__fallback-note">
          Aperçu simplifié (appareil ou navigateur limité)
        </p>
        <DressCodePdfPages
          blob={blob}
          title={title}
          onFatalError={() => setPagesFatal(true)}
        />
        {pagesFatal ? (
          <p className="invite-flip__error">
            Aperçu indisponible. Utilisez Télécharger.
          </p>
        ) : null}
        {confirmPage ? (
          <div className="invite-flip__fallback-confirm">{confirmPage}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`invite-flip${atConfirmPage ? " invite-flip--at-confirm" : ""}`}
      style={{ ["--invite-flip-accent" as string]: accent }}
    >
      {rendering ? (
        <div className="invite-flip__loading" role="status">
          <span
            className="invitation-rsvp__spinner invitation-rsvp__spinner--dark"
            aria-hidden
          />
          <p>Ouverture de l’invitation…</p>
        </div>
      ) : null}

      {error ? <p className="invite-flip__error">{error}</p> : null}

      <div
        ref={hostRef}
        className={`invite-flip__stage${rendering || error ? " invite-flip__stage--loading" : ""}`}
        aria-hidden={rendering || Boolean(error)}
      />

      {!rendering && pageCount > 1 ? (
        <div className="invite-flip__controls">
          <button
            type="button"
            className="invite-flip__nav"
            onClick={goPrev}
            disabled={pageIndex <= 0}
            aria-label="Page précédente"
          >
            ←
          </button>
          <p className="invite-flip__counter">{displayCounter}</p>
          <button
            type="button"
            className="invite-flip__nav"
            onClick={goNext}
            disabled={atLastPage}
            aria-label="Page suivante"
          >
            →
          </button>
        </div>
      ) : null}

      {!rendering && pageCount > 1 && hasConfirmPage && !atConfirmPage ? (
        <p className="invite-flip__hint">
          Tournez les pages jusqu’à la fin pour confirmer
        </p>
      ) : null}
    </div>
  );
}
