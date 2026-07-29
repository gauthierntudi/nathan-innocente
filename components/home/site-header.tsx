"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useHomeUi } from "@/components/home/home-ui-context";
import { homePath, logos } from "@/lib/home/content";

type SiteHeaderProps = {
  /** dark = logo clair (fond sombre), light = logo sombre (fond clair) */
  tone?: "dark" | "light";
};

export function SiteHeader({ tone = "dark" }: SiteHeaderProps) {
  const { openOffcanvas } = useHomeUi();
  const [sticky, setSticky] = useState(false);
  const logoSrc = tone === "light" ? logos.onLight : logos.onDark;

  useEffect(() => {
    const onScroll = () => setSticky(window.scrollY >= 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header>
      <div
        id="header-sticky"
        className={`tp-header-4-area tp-header-4-mob-space tp-transparent z-index-5${sticky ? " header-sticky" : ""}${tone === "light" ? " tp-header--light" : ""}`}
      >
        <div className="container">
          <div className="row align-items-center">
            <div className="col-6">
              <div className="tp-header-logo">
                <Link className="logo-1" href={homePath}>
                  <img src={logoSrc} alt="Nathan & Innocente" />
                </Link>
                <Link className="logo-2" href={homePath}>
                  <img src={logoSrc} alt="Nathan & Innocente" />
                </Link>
              </div>
            </div>
            <div className="col-6">
              <div className="tp-header-10-menubar text-end">
                <button
                  type="button"
                  className="tp-offcanvas-open-btn"
                  onClick={openOffcanvas}
                  aria-label="Menu"
                >
                  <span />
                  <span />
                  <span />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
