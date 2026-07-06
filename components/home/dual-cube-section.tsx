"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useMemo, useRef } from "react";

import { dualCubeFaces } from "@/lib/home/content";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type CubeFaces = (typeof dualCubeFaces)[keyof typeof dualCubeFaces];
type FaceKey = keyof CubeFaces;

const FACE_KEYS: FaceKey[] = ["front", "top", "back", "side", "bottom"];

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededMonoFaces(seed: string): Set<FaceKey> {
  let state = hashString(seed);
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const shuffled = [...FACE_KEYS];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(next() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  const monoCount = 1 + Math.floor(next() * FACE_KEYS.length);
  return new Set(shuffled.slice(0, monoCount));
}

function monoSeed(variant: "left" | "right", faces: CubeFaces) {
  return `${variant}:${faces.front}|${faces.top}|${faces.side}|${faces.back}|${faces.bottom}`;
}

type CubeProps = {
  faces: CubeFaces;
  variant: "left" | "right";
  monoFaces: Set<FaceKey>;
};

function faceClass(key: FaceKey, positionClass: string, monoFaces: Set<FaceKey>) {
  return [
    "dual-cube__face",
    positionClass,
    monoFaces.has(key) ? "dual-cube__face--mono" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function Cube({ faces, variant, monoFaces }: CubeProps) {
  const sideFace = variant === "left" ? "right" : "left";

  return (
    <div className={`dual-cube dual-cube--${variant}`}>
      <div className={faceClass("front", "dual-cube__face--front", monoFaces)} style={{ backgroundImage: `url(${faces.front})` }} />
      <div className={faceClass("top", "dual-cube__face--top", monoFaces)} style={{ backgroundImage: `url(${faces.top})` }} />
      <div className={faceClass("back", "dual-cube__face--back", monoFaces)} style={{ backgroundImage: `url(${faces.back})` }} />
      <div
        className={faceClass("side", `dual-cube__face--${sideFace}`, monoFaces)}
        style={{ backgroundImage: `url(${faces.side})` }}
      />
      <div
        className={faceClass("bottom", "dual-cube__face--bottom", monoFaces)}
        style={{ backgroundImage: `url(${faces.bottom})` }}
      />
    </div>
  );
}

export function DualCubeSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const leftCubeRef = useRef<HTMLDivElement>(null);
  const rightCubeRef = useRef<HTMLDivElement>(null);
  const leftMonoFaces = useMemo(
    () => seededMonoFaces(monoSeed("left", dualCubeFaces.left)),
    [],
  );
  const rightMonoFaces = useMemo(
    () => seededMonoFaces(monoSeed("right", dualCubeFaces.right)),
    [],
  );

  useGSAP(
    () => {
      const section = sectionRef.current;
      const leftCube = leftCubeRef.current;
      const rightCube = rightCubeRef.current;
      if (!section || !leftCube || !rightCube) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set([leftCube, rightCube], { clearProps: "transform" });
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const SCROLL_ROTATION_MULTIPLIER = 4;
        const ROTATION_DEGREES = 360 * SCROLL_ROTATION_MULTIPLIER;
        const scrollConfig = {
          trigger: section,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.85,
          invalidateOnRefresh: true,
        };

        gsap.set(leftCube, {
          transformOrigin: "100% 50%",
          transformPerspective: 1100,
          rotateX: 0,
          rotateY: 0,
          force3D: true,
        });
        gsap.set(rightCube, {
          transformOrigin: "0% 50%",
          transformPerspective: 1100,
          rotateX: 0,
          rotateY: 0,
          force3D: true,
        });

        gsap.fromTo(
          leftCube,
          { rotateX: 0 },
          {
            rotateX: -ROTATION_DEGREES,
            ease: "none",
            force3D: true,
            scrollTrigger: { ...scrollConfig },
          },
        );

        gsap.fromTo(
          rightCube,
          { rotateX: 0 },
          {
            rotateX: ROTATION_DEGREES,
            ease: "none",
            force3D: true,
            scrollTrigger: { ...scrollConfig },
          },
        );
      });

      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <div className="dual-cube-section-outer">
      <div className="dual-cube-section__name dual-cube-section__name--left">
        <span>Nathan</span>
      </div>

      <section ref={sectionRef} className="dual-cube-section" aria-label="Nathan et Innocente">
        <div className="dual-cube-section__panel dual-cube-section__panel--left" />
        <div className="dual-cube-section__panel dual-cube-section__panel--right" />

        <div className="dual-cube-section__stage">
          <div className="dual-cube-section__cubes">
            <div ref={leftCubeRef} className="dual-cube-section__cube dual-cube-section__cube--left">
              <Cube faces={dualCubeFaces.left} variant="left" monoFaces={leftMonoFaces} />
            </div>
            <div ref={rightCubeRef} className="dual-cube-section__cube dual-cube-section__cube--right">
              <Cube faces={dualCubeFaces.right} variant="right" monoFaces={rightMonoFaces} />
            </div>
          </div>
        </div>
      </section>

      <div className="dual-cube-section__name dual-cube-section__name--right">
        <span>Innocente</span>
      </div>
    </div>
  );
}
