"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

type GalerieImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: string;
  /** Appelé seulement quand tous les essais ont échoué. */
  onFailed?: () => void;
};

/** Une coupure réseau ou un 429 R2 ne doit pas faire disparaître la photo. */
export function GalerieImage({ src, alt, onFailed, ...props }: GalerieImageProps) {
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const url = attempt === 0 ? src : `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}`;

  return (
    <img
      {...props}
      src={url}
      alt={alt}
      onError={() => {
        if (attempt >= MAX_RETRIES) {
          onFailed?.();
          return;
        }
        timer.current = window.setTimeout(
          () => setAttempt((value) => value + 1),
          RETRY_DELAY_MS * (attempt + 1),
        );
      }}
    />
  );
}
