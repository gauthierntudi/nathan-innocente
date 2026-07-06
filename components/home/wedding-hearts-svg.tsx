"use client";

import { forwardRef } from "react";

/** Classic heart shape — left & right, slightly overlapping. */
export const LEFT_HEART =
  "M 72 74 C 72 74 46 54 46 36 C 46 22 58 12 72 22 C 86 12 98 22 98 36 C 98 54 72 74 72 74 Z";

export const RIGHT_HEART =
  "M 128 74 C 128 74 102 54 102 36 C 102 22 114 12 128 22 C 142 12 154 22 154 36 C 154 54 128 74 128 74 Z";

export const WeddingHeartsSvg = forwardRef<
  SVGSVGElement,
  {
    leftHeartRef: React.RefObject<SVGPathElement | null>;
    rightHeartRef: React.RefObject<SVGPathElement | null>;
  }
>(function WeddingHeartsSvg({ leftHeartRef, rightHeartRef }, ref) {
  return (
    <svg
      ref={ref}
      className="wedding-loader-hearts"
      viewBox="0 0 200 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <filter id="wedding-heart-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#ddcbb3" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter="url(#wedding-heart-glow)">
        <path
          ref={leftHeartRef}
          className="wedding-loader-heart wedding-loader-heart--left"
          d={LEFT_HEART}
          transform="rotate(-10 72 44)"
        />
        <path
          ref={rightHeartRef}
          className="wedding-loader-heart wedding-loader-heart--right"
          d={RIGHT_HEART}
          transform="rotate(10 128 44)"
        />
      </g>
    </svg>
  );
});

export function preparePathStroke(path: SVGPathElement | null) {
  if (!path) return 0;
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length}`;
  path.style.strokeDashoffset = `${length}`;
  return length;
}
