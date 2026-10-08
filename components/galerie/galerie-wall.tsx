"use client";

import { useEffect, useState } from "react";

import { galleryWallImages } from "@/lib/galerie/content";

const COLUMN_SPEEDS = ["46s", "62s", "38s", "54s"];

type WallImage = (typeof galleryWallImages)[number];

function splitColumns(images: readonly WallImage[], count: number) {
  const columns: WallImage[][] = Array.from({ length: count }, () => []);
  images.forEach((image, index) => {
    columns[index % count].push(image);
  });
  return columns;
}

export function GalerieWall({ onAccess }: { onAccess: () => void }) {
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 800px)");
    const apply = () => setColumnCount(media.matches ? 4 : 2);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const columns = splitColumns(galleryWallImages, columnCount);

  return (
    <div className="galerie-gate">
      <div className="galerie-wall" aria-hidden>
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="galerie-col">
            <div
              className={`galerie-col__track${columnIndex % 2 === 1 ? " galerie-col__track--reverse" : ""}`}
              style={{ animationDuration: COLUMN_SPEEDS[columnIndex] ?? "48s" }}
            >
              {[0, 1].map((copy) => (
                <div key={copy} className="galerie-col__set">
                  {column.map((image) => (
                    <img
                      key={`${copy}-${image.src}`}
                      src={image.src}
                      alt=""
                      draggable={false}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="galerie-gate__veil">
        <p className="galerie-gate__line">Retrouvez vos photos</p>
        <button type="button" className="galerie-access" onClick={onAccess}>
          Accéder
        </button>
      </div>
    </div>
  );
}
