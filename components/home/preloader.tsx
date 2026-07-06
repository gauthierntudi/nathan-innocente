"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef, useState } from "react";

import { preparePathStroke, WeddingHeartsSvg } from "@/components/home/wedding-hearts-svg";

export function Preloader() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const leftHeartRef = useRef<SVGPathElement>(null);
  const rightHeartRef = useRef<SVGPathElement>(null);
  const [hidden, setHidden] = useState(false);
  const exitStartedRef = useRef(false);
  const pageLoadedRef = useRef(false);
  const minTimeReachedRef = useRef(false);

  useGSAP(
    () => {
      const leftHeart = leftHeartRef.current;
      const rightHeart = rightHeartRef.current;
      if (!leftHeart || !rightHeart || !wrapRef.current) return;

      preparePathStroke(leftHeart);
      preparePathStroke(rightHeart);

      gsap.set([leftHeart, rightHeart], { opacity: 0.3 });
      gsap.set(".wedding-loader-heart--left", { transformOrigin: "72px 44px", scale: 0.92 });
      gsap.set(".wedding-loader-heart--right", { transformOrigin: "128px 44px", scale: 0.92 });

      gsap
        .timeline({ defaults: { ease: "power3.out" } })
        .to([leftHeart, rightHeart], { opacity: 1, duration: 0.35 })
        .to(leftHeart, { strokeDashoffset: 0, duration: 1.15, ease: "power2.inOut" }, 0.08)
        .to(rightHeart, { strokeDashoffset: 0, duration: 1.15, ease: "power2.inOut" }, 0.32)
        .to(
          [leftHeart, rightHeart],
          { fillOpacity: 1, duration: 0.65, ease: "power2.out" },
          0.85,
        )
        .to(
          ".wedding-loader-heart--left",
          { scale: 1, duration: 0.55, ease: "back.out(2.2)" },
          0.95,
        )
        .to(
          ".wedding-loader-heart--right",
          { scale: 1, duration: 0.55, ease: "back.out(2.2)" },
          1.05,
        )
        .to(
          ".wedding-loader-spark",
          { scale: 1, opacity: 1, duration: 0.4, stagger: 0.07, ease: "back.out(2)" },
          1.15,
        )
        .from(".wedding-loader-names span", { y: 26, opacity: 0, duration: 0.7, stagger: 0.1 }, 1.2)
        .from(".wedding-loader-amp", { scale: 0, opacity: 0, duration: 0.45, ease: "back.out(3)" }, 1.3)
        .from(".wedding-loader-date", { y: 14, opacity: 0, duration: 0.5 }, 1.38)
        .from(".wedding-loader-progress", { scaleX: 0, duration: 1, ease: "power1.inOut" }, 1.15);
    },
    { scope: wrapRef },
  );

  useEffect(() => {
    const runExit = () => {
      if (exitStartedRef.current || !pageLoadedRef.current || !minTimeReachedRef.current) return;
      exitStartedRef.current = true;

      const wrap = wrapRef.current;
      const content = contentRef.current;
      if (!wrap || !content) {
        setHidden(true);
        return;
      }

      gsap
        .timeline({ onComplete: () => setHidden(true) })
        .to(content, { y: -20, opacity: 0, duration: 0.45, ease: "power2.in" })
        .to(wrap, { yPercent: -100, duration: 0.95, ease: "power4.inOut" }, "-=0.08");
    };

    const markLoaded = () => {
      pageLoadedRef.current = true;
      runExit();
    };

    if (document.readyState === "complete") {
      markLoaded();
    } else {
      window.addEventListener("load", markLoaded);
    }

    const minTimer = window.setTimeout(() => {
      minTimeReachedRef.current = true;
      runExit();
    }, 2600);

    return () => {
      window.removeEventListener("load", markLoaded);
      window.clearTimeout(minTimer);
    };
  }, []);

  if (hidden) return null;

  return (
    <div id="loading" ref={wrapRef} className="wedding-preloader" aria-live="polite" aria-busy="true">
      <div ref={contentRef} className="wedding-preloader-inner">
        <div className="wedding-loader-hearts-wrap">
          <span className="wedding-loader-spark wedding-loader-spark-1" aria-hidden />
          <span className="wedding-loader-spark wedding-loader-spark-2" aria-hidden />
          <span className="wedding-loader-spark wedding-loader-spark-3" aria-hidden />

          <WeddingHeartsSvg leftHeartRef={leftHeartRef} rightHeartRef={rightHeartRef} />
        </div>

        <p className="wedding-loader-names">
          <span>Nathan</span>
          <span className="wedding-loader-amp">&</span>
          <span>Innocente</span>
        </p>

        <p className="wedding-loader-date">Wedding · 2026</p>

        <div className="wedding-loader-progress-track" aria-hidden>
          <div className="wedding-loader-progress" />
        </div>
      </div>
    </div>
  );
}
