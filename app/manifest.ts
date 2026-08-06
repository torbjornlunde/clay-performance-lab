import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clay Performance Lab",
    short_name: "CPL",
    description: "Performance analysis and training tools for clay target shooters.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#05070b",
    theme_color: "#070a0f",
    icons: [
      { src: "/pwa-icons/v1/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/v1/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/v1/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
