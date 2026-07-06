import Link from "next/link";

import { footerNav, footerSocial, logos, weddingInfo } from "@/lib/home/content";

export function SiteFooter() {
  return (
    <footer>
      <div className="tp-footer-area black-bg pt-90">
        <div className="container-fluid">
          <div className="tp-footer-wrap">
            <div className="row align-items-end">
              <div className="col-xl-5 col-lg-6">
                <div className="tp-footer-menu menu-anim">
                  <ul className="counter-row tp-text-anim">
                    {footerNav.map((item) => (
                      <li key={item.label} className="active">
                        <Link href={item.href}>{item.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="col-xl-5 col-lg-6">
                <div className="tp-footer-middle-wrap">
                  <div className="tp-footer-content">
                    <h4 className="tp-footer-big-title footer-big-text">wedding</h4>
                  </div>
                  <div className="row">
                    <div className="col-xl-6 col-lg-6 col-md-6">
                      <div className="tp-footer-widget">
                        <h4 className="tp-footer-title tp_fade_bottom">Say hello at:</h4>
                        <div className="tp-footer-widget-info">
                          <div className="tp-footer-widget-info-mail tp_fade_bottom">
                            <a href={`mailto:${weddingInfo.email}`}>{weddingInfo.email}</a>
                          </div>
                          <div className="tp-footer-widget-info-mail tp_fade_bottom">
                            <a href="tel:+243807701007">{weddingInfo.phone}</a>
                          </div>
                          <div className="tp-footer-widget-info-location tp_fade_bottom">
                            <a href="#!" target="_blank" rel="noreferrer">
                              Avenue de Roma 158b, Lisboa <br /> Kinshasa - Gobe
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="col-xl-6 col-lg-6 col-md-6">
                      <div className="tp-footer-widget">
                        <h4 className="tp-footer-title tp_fade_bottom">Stalk us</h4>
                        <ul className="tp-footer-widget-social">
                          {footerSocial.map((item) => (
                            <li key={item} className="tp_fade_bottom">
                              <a href="#">{item}</a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container-fluid">
          <div className="tp-copyright-wrap">
            <div className="row align-items-center">
              <div className="col-xl-6 col-md-4">
                <div className="tp-copyright-logo text-center text-md-start">
                  <a href="#!">
                    <img src={logos.onDark} alt="Nathan & Innocente" />
                  </a>
                </div>
              </div>
              <div className="col-xl-6 col-md-8">
                <div className="tp-copyright-text text-center text-md-end">
                  <p>Copyright © 2026 . All rights reserved.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
