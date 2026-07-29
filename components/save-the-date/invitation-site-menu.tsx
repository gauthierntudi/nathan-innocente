"use client";

import { useEffect } from "react";

import { HomeUiProvider, useHomeUi } from "@/components/home/home-ui-context";
import { OffcanvasMenu } from "@/components/home/offcanvas-menu";
import { lockBodyScroll } from "@/lib/lock-body-scroll";

function InvitationMenuToggle() {
  const { offcanvasOpen, openOffcanvas } = useHomeUi();

  useEffect(() => {
    if (!offcanvasOpen) return;
    return lockBodyScroll();
  }, [offcanvasOpen]);

  return (
    <button
      type="button"
      className="invitation-menu-toggle"
      onClick={openOffcanvas}
      aria-label="Menu"
      aria-expanded={offcanvasOpen}
    >
      <span />
      <span />
      <span />
    </button>
  );
}

/** Hamburger de fin de parcours → sidebar principal du site (OffcanvasMenu). */
export function InvitationSiteMenu() {
  return (
    <HomeUiProvider>
      <OffcanvasMenu />
      <InvitationMenuToggle />
    </HomeUiProvider>
  );
}
