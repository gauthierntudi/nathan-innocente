"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { HomeUiProvider } from "@/components/home/home-ui-context";
import { OffcanvasMenu } from "@/components/home/offcanvas-menu";
import { Preloader } from "@/components/home/preloader";
import { SiteHeader } from "@/components/home/site-header";
import { homePath } from "@/lib/home/content";
import "@/components/notre-univers/notre-univers.css";

gsap.registerPlugin(useGSAP);

const HERO_SLIDES = [
  "/img/0T8A5173.jpg",
  "/img/0T8A5252.jpg",
  "/img/LUK_0750.jpg",
] as const;

const SLIDE_INTERVAL_MS = 5500;

const INTRO_PARAGRAPHS = [
  "Chaque histoire d'amour est unique. La nôtre est celle de deux destinées que Dieu a réunies.",
  "Nous sommes heureux de vous compter parmi les personnes qui partageront ce moment précieux. Retrouvez ici toutes les informations sur nos célébrations, ainsi que les photos et vidéos qui en garderont le souvenir.",
  "Merci de faire partie de notre histoire.",
] as const;

function NotreUniversContent() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % HERO_SLIDES.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useGSAP(
    (_context, contextSafe) => {
      const root = rootRef.current;
      if (!root) return;

      const targets = gsap.utils.toArray<HTMLElement>(".nu-enter", root);
      if (!targets.length) return;

      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (prefersReduced) {
        gsap.set(targets, { opacity: 1, clearProps: "transform" });
        return;
      }

      gsap.set(targets, { opacity: 0, y: 26 });

      const playEntrance = contextSafe(() => {
        gsap.to(targets, {
          opacity: 1,
          y: 0,
          duration: 0.78,
          stagger: 0.11,
          ease: "power3.out",
          delay: 0.12,
          clearProps: "transform",
        });
      });

      const loading = document.getElementById("loading");
      if (!loading) {
        playEntrance();
        return;
      }

      const observer = new MutationObserver(() => {
        if (!document.getElementById("loading")) {
          observer.disconnect();
          playEntrance();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      return () => observer.disconnect();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} id="body" className="home-theme nu-page">
      <Preloader />
      <OffcanvasMenu />
      <SiteHeader />

      <main className="nu-main">
        <section className="nu-hero" aria-labelledby="nu-hero-title">
          <div className="nu-hero__media" aria-hidden>
            {HERO_SLIDES.map((src, index) => (
              <div
                key={src}
                className={`nu-hero__bg${index === activeSlide ? " nu-hero__bg--active" : ""}`}
                style={{ backgroundImage: `url("${src}")` }}
              />
            ))}
            <div className="nu-hero__veil" />
          </div>

          <div className="nu-hero__content">
            <div className="nu-hero__scroll">
              <header className="nu-hero__header">
                <h1 id="nu-hero-title" className="nu-hero__title nu-enter">
                  Notre Univers
                </h1>
                <span className="nu-hero__rule nu-enter" aria-hidden />
              </header>

              <div className="nu-hero__body">
                {INTRO_PARAGRAPHS.map((paragraph) => (
                  <p key={paragraph.slice(0, 36)} className="nu-enter">
                    {paragraph}
                  </p>
                ))}
              </div>

              <footer className="nu-hero__signoff">
                <p className="nu-hero__closing nu-enter">
                  Avec toute notre affection,
                </p>
                <p className="nu-hero__signature nu-enter">
                  Innocente &amp; Nathan
                </p>
                <p className="nu-hero__tagline nu-enter">
                  The Samunas To Eternity
                </p>
              </footer>
            </div>

            <div className="nu-hero__cta nu-enter">
              <Link href={homePath} className="nu-btn">
                Entrer dans notre histoire
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function NotreUniversPage() {
  return (
    <HomeUiProvider>
      <NotreUniversContent />
    </HomeUiProvider>
  );
}
