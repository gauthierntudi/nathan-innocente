declare module "page-flip" {
  export type PageFlipCorner = "top" | "bottom";
  export type PageFlipOrientation = "portrait" | "landscape";

  export type PageFlipEventData = {
    data: number | string | { page: number; mode: PageFlipOrientation } | null;
    object: PageFlip;
  };

  export type PageFlipSettings = {
    width: number;
    height: number;
    size?: "fixed" | "stretch";
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    startPage?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    swipeDistance?: number;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
  };

  export class PageFlip {
    constructor(element: HTMLElement, settings: PageFlipSettings);
    loadFromImages(images: string[]): void;
    loadFromHTML(items: HTMLElement[] | NodeListOf<HTMLElement>): void;
    on(event: string, callback: (event: PageFlipEventData) => void): this;
    off(event: string): void;
    flipNext(corner?: PageFlipCorner): void;
    flipPrev(corner?: PageFlipCorner): void;
    flip(pageNum: number, corner?: PageFlipCorner): void;
    turnToPage(pageNum: number): void;
    turnToNextPage(): void;
    turnToPrevPage(): void;
    getPageCount(): number;
    getCurrentPageIndex(): number;
    getPage(pageIndex: number): { setDensity: (density: "soft" | "hard") => void };
    getPageCollection(): unknown;
    getRender(): unknown;
    getUI(): unknown;
    getFlipController(): unknown;
    getOrientation(): PageFlipOrientation;
    userStop(pos: { x: number; y: number }, isSwipe?: boolean): void;
    destroy(): void;
  }
}
