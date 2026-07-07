"use client";

import Link from "next/link";

import { useHomeUi } from "@/components/home/home-ui-context";
import { footerNav, logos, weddingInfo } from "@/lib/home/content";

const galleryImages = ["/img/03.jpg", "/img/02.jpg", "/img/08.jpg", "/img/06.jpg"];

export function OffcanvasMenu() {
  const { offcanvasOpen, closeOffcanvas } = useHomeUi();

  return (
    <>
      <div className={`tp-offcanvas-area${offcanvasOpen ? " opened" : ""}`}>
        <div className="tp-offcanvas-wrapper">
          <div className="tp-offcanvas-top d-flex align-items-center justify-content-between">
            <div className="tp-offcanvas-logo">
              <Link href="/home" onClick={closeOffcanvas}>
                <img className="logo-1" src={logos.onLight} alt="Nathan & Innocente" />
              </Link>
            </div>
            <div className="tp-offcanvas-close">
              <button type="button" className="tp-offcanvas-close-btn" onClick={closeOffcanvas} aria-label="Fermer">
                <svg width="37" height="38" viewBox="0 0 37 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M9.19141 9.80762L27.5762 28.1924"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9.19141 28.1924L27.5762 9.80761"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="tp-offcanvas-main">
            <div className="tp-offcanvas-content">
              <h3 className="tp-offcanvas-title">Le Grand Jour!</h3>
              <p>Ce jour symbolise notre engagement mutuel et le début de notre vie commune</p>
            </div>
            <div className="tp-offcanvas-gallery">
              <div className="row gx-2">
                {galleryImages.map((src) => (
                  <div key={src} className="col-md-3 col-3">
                    <div className="tp-offcanvas-gallery-img fix">
                      <a href="#!">
                        <img src={src} alt="" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="tp-main-menu-mobile">
              <nav className="tp-main-menu-content">
                <ul>
                  {footerNav.map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} onClick={closeOffcanvas}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
            <div className="tp-offcanvas-contact">
              <h3 className="tp-offcanvas-title sm">Information</h3>
              <ul>
                <li>
                  <a href={`tel:${weddingInfo.phone.replace(/\s/g, "")}`}>{weddingInfo.phone}</a>
                </li>
                <li>
                  <a href={`mailto:${weddingInfo.email}`}>{weddingInfo.email}</a>
                </li>
                <li>
                  <a href="#!">
                    {weddingInfo.address.split("\n").map((line, index) => (
                      <span key={line}>
                        {index > 0 ? <br /> : null}
                        {line}
                      </span>
                    ))}
                  </a>
                </li>
              </ul>
            </div>
            <div className="tp-offcanvas-social">
              <h3 className="tp-offcanvas-title sm">Suivez nous sur</h3>
              <ul>
                <li>
                  <a href="#!" aria-label="Pinterest">
                    <i className="bi bi-pinterest" />
                  </a>
                </li>
                <li>
                  <a href="#!" aria-label="Instagram">
                    <i className="bi bi-instagram" />
                  </a>
                </li>
                <li>
                  <a href="#!" aria-label="Behance">
                    <i className="bi bi-behance" />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div
        className={`body-overlay${offcanvasOpen ? " opened" : ""}`}
        onClick={closeOffcanvas}
        onKeyDown={(event) => event.key === "Escape" && closeOffcanvas()}
        role="presentation"
      />
    </>
  );
}
