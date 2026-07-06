import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#212121",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
