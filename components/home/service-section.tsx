import Link from "next/link";

import { invitationPath, weddingInfo } from "@/lib/home/content";

export function ServiceSection() {
  return (
    <div className="sv-service-area project-panel-area-2">
      <div className="container-fluid p-0">
        <div className="sv-service-item project-panel-2">
          <div className="row g-0">
            <div className="col-xl-6 col-lg-6">
              <div className="sv-service-thumb">
                <img src="/img/service-1.jpg" alt="" />
              </div>
            </div>
            <div className="col-xl-6 col-lg-6">
              <div className="sv-service-content-wrap d-flex align-items-center">
                <div className="sv-service-content">
                  <div className="sv-service-title-box">
                    <span className="sv-service-subtitle">
                      <i>01</i>Wedding
                    </span>
                    <h4 className="sv-service-title">{weddingInfo.date}</h4>
                  </div>
                  <div className="sv-service-space-wrap">
                    <div className="sv-service-text">
                      <p>{weddingInfo.quote}</p>
                    </div>

                    <div className="mt-30 text-start">
                      <Link href={invitationPath} className="tp-btn-white service-confirm-btn">
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
