"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { useRef } from "react";

import { invitationPath, parallaxBanner } from "@/lib/home/content";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const BANNER_IMAGE = "/img/3.jpg";

export function ParallaxBanner() {
  const areaRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const area = areaRef.current;
      const media = mediaRef.current;
      if (!area || !media) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(media, { clearProps: "all" });
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          media,
          {
            backgroundPosition: "50% 22%",
            scale: 1.1,
          },
          {
            backgroundPosition: "50% 78%",
            scale: 1,
            ease: "none",
            scrollTrigger: {
              trigger: area,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.85,
            },
          },
        );
      });

      return () => mm.revert();
    },
    { scope: areaRef },
  );

  return (
    <div ref={areaRef} className="tp-shop-banner-area parallax-banner-area">
      <div
        ref={mediaRef}
        className="parallax-banner__media"
        role="img"
        aria-label=""
        style={{ backgroundImage: `url(${BANNER_IMAGE})` }}
      />
      <div className="parallax-banner__overlay" aria-hidden="true" />
      <div className="parallax-banner__content">
        <div className="parallax-banner__cta">
          <p className="parallax-banner__phrase">{parallaxBanner.phrase}</p>
          <Link href={invitationPath} className="tp-btn-white service-confirm-btn parallax-banner__btn">
          Accéder à mon invitation
          <span aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 9L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 1H9V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </Link>
        </div>
      </div>
    </div>
  );
}
