"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

import { DualCubeSection } from "@/components/home/dual-cube-section";
import { ParallaxBanner } from "@/components/home/parallax-banner";
import { HomeUiProvider } from "@/components/home/home-ui-context";
import { HeroSlider } from "@/components/home/hero-slider";
import { OffcanvasMenu } from "@/components/home/offcanvas-menu";
import { Preloader } from "@/components/home/preloader";
import { ServiceSection } from "@/components/home/service-section";
import { SiteFooter } from "@/components/home/site-footer";
import { SiteHeader } from "@/components/home/site-header";

gsap.registerPlugin(ScrollTrigger, useGSAP);

function HomePageContent() {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      gsap.set(".tp_fade_bottom", { y: 100, opacity: 0 });
      gsap.utils.toArray<HTMLElement>(".tp_fade_bottom").forEach((item) => {
        gsap.to(item, {
          y: 0,
          opacity: 1,
          ease: "power2.out",
          duration: 1.5,
          scrollTrigger: {
            trigger: item,
            start: "top center+=400",
          },
        });
      });

      ScrollTrigger.matchMedia({
        "(min-width: 991px)": () => {
          document.querySelectorAll(".project-panel-2").forEach((section) => {
            gsap.to(section, {
              scrollTrigger: {
                trigger: section,
                pin: section,
                scrub: 1,
                start: "top top",
                end: "bottom 100%",
                endTrigger: ".project-panel-area-2",
                pinSpacing: false,
              },
            });
          });
        },
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} id="body" className="home-theme tp-smooth-scroll">
      <Preloader />
      <OffcanvasMenu />
      <SiteHeader />
      <main>
        <HeroSlider />
        <ServiceSection />
        <DualCubeSection />
        <ParallaxBanner />
      </main>
      <SiteFooter />
    </div>
  );
}

export function HomePage() {
  return (
    <HomeUiProvider>
      <HomePageContent />
    </HomeUiProvider>
  );
}
