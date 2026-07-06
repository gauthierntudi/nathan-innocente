"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useHomeUi } from "@/components/home/home-ui-context";
import { footerNav, logos } from "@/lib/home/content";

export function SiteHeader() {
  const { openOffcanvas } = useHomeUi();
  const [sticky, setSticky] = useState(false);

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
        className={`tp-header-4-area tp-header-4-mob-space tp-transparent z-index-5${sticky ? " header-sticky" : ""}`}
      >
        <div className="container">
          <div className="row align-items-center">
            <div className="col-xl-2 col-lg-2 col-6">
              <div className="tp-header-logo">
                <Link className="logo-1" href="/">
                  <img src={logos.onDark} alt="Nathan & Innocente" />
                </Link>
                <Link className="logo-2" href="/">
                  <img src={logos.onDark} alt="Nathan & Innocente" />
                </Link>
              </div>
            </div>
            <div className="col-xl-8 col-lg-9 d-none d-xl-block">
              <div className="tp-header-menu header-main-menu text-center">
                <nav className="tp-main-menu-content">
                  <ul>
                    {footerNav.map((item) => (
                      <li key={item.label}>
                        <Link href={item.href} className="text-white">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>
            <div className="col-xl-2 col-lg col-6">
              <div className="tp-header-10-menubar text-end">
                <button type="button" className="tp-offcanvas-open-btn" onClick={openOffcanvas} aria-label="Menu">
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
