"use client";

import Link from "next/link";
import { useState } from "react";
import Slider, { type CustomArrowProps, type Settings } from "react-slick";

import { AngleLeftIcon, AngleRightIcon } from "@/components/home/icons";
import { heroSlides, padSlideNumber } from "@/lib/home/content";

function SlideArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 1L17 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 1V17H1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SlickPrevArrow({ onClick }: CustomArrowProps) {
  return (
    <button type="button" className="slick-prev" onClick={onClick} aria-label="Slide précédent">
      <AngleLeftIcon />
    </button>
  );
}

function SlickNextArrow({ onClick }: CustomArrowProps) {
  return (
    <button type="button" className="slick-next" onClick={onClick} aria-label="Slide suivant">
      <AngleRightIcon />
    </button>
  );
}

export function HeroSlider() {
  const [mainSlider, setMainSlider] = useState<Slider | null>(null);
  const [navSlider, setNavSlider] = useState<Slider | null>(null);
  const [active, setActive] = useState(0);

  const mainSettings: Settings = {
    slidesToShow: 1,
    slidesToScroll: 1,
    fade: true,
    speed: 1000,
    arrows: true,
    prevArrow: <SlickPrevArrow />,
    nextArrow: <SlickNextArrow />,
    asNavFor: navSlider ?? undefined,
    afterChange: (index) => setActive(index),
  };

  const navSettings: Settings = {
    slidesToShow: 4,
    slidesToScroll: 1,
    arrows: true,
    prevArrow: <SlickPrevArrow />,
    nextArrow: <SlickNextArrow />,
    focusOnSelect: true,
    asNavFor: mainSlider ?? undefined,
    speed: 600,
    centerPadding: "0",
    responsive: [
      { breakpoint: 1600, settings: { slidesToShow: 3 } },
      { breakpoint: 1400, settings: { slidesToShow: 2 } },
      { breakpoint: 1200, settings: { slidesToShow: 2 } },
      { breakpoint: 992, settings: { arrows: false, slidesToShow: 2 } },
    ],
  };

  const activeSlideId = heroSlides[active]?.id ?? "home";

  return (
    <div className="tp-portfolio-11-area fix">
      <div
        className={`tp-portfolio-11-slider-wrap p-relative hero-slider-wrap hero-slider-active--${activeSlideId}`}
      >
        <Slider
          {...mainSettings}
          ref={(slider) => setMainSlider(slider)}
          className="tp-portfolio-11-slider-active"
        >
          {heroSlides.map((slide) => (
            <div key={slide.id}>
              <div
                className={`tp-portfolio-11-slider-bg hero-slide-bg hero-slide-bg--${slide.id} pt-170 pb-150 d-flex align-items-end`}
                style={{ backgroundImage: `url(${slide.image})` }}
              >
                <span className="hero-slide-overlay" aria-hidden />
                <div className="tp-portfolio-11-slider-content">
                  <div className="tp-portfolio-11-slider-link">
                    <Link href={slide.href}>
                      <SlideArrowIcon />
                    </Link>
                  </div>
                  <span className="tp-portfolio-11-slider-subtitle">
                    2026 <br />
                    Wedding
                  </span>
                  <h3 className="tp-portfolio-11-slider-title">
                    <Link href={slide.href}>
                      {slide.titleLines.map((line, index) => (
                        <span key={index} className="hero-slide-title-line">
                          {line}
                        </span>
                      ))}
                    </Link>
                  </h3>
                </div>
              </div>
            </div>
          ))}
        </Slider>

        <div className="dddd" />

        <div className="tp-portfolio-11-slider-nav-wrap z-index-5">
          <div
            className="slides-numbers d-none d-lg-flex d-flex align-items-center"
            style={{ display: "inline-block" }}
          >
            <div className="slider-line" />
            <span className="active">{padSlideNumber(active)}</span>
          </div>
          <Slider
            {...navSettings}
            ref={(slider) => setNavSlider(slider)}
            className="tp-portfolio-11-slider-nav-active d-none d-lg-block"
          >
            {heroSlides.map((slide) => (
              <div key={slide.id}>
                <div className="tp-portfolio-11-slider-nav-item p-relative">
                  <div className={`tp-portfolio-11-slider-nav-thumb hero-slide-nav-thumb hero-slide-nav-thumb--${slide.id}`}>
                    <img src={slide.thumb} alt="" />
                  </div>
                  <div className="tp-portfolio-11-slider-nav-content-wrap">
                    <div className="tp-portfolio-11-slider-nav-content d-flex flex-column justify-content-between">
                      <div className="tp-portfolio-11-slider-nav-year">
                        <span>2026</span>
                      </div>
                      <div className="tp-portfolio-11-slider-nav-tittle-box">
                        <span className="tp-portfolio-11-slider-nav-subtittle">Wedding</span>
                        <h4 className="tp-portfolio-11-slider-nav-tittle">
                          <Link href={slide.href}>{slide.title}</Link>
                        </h4>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </Slider>
        </div>
      </div>
    </div>
  );
}
