import { ImageResponse } from "next/og";
import { getPwaIconConfig } from "@/lib/pwa/iconConfig";
import { CPL_APPROVED_ICON_PATH, CPL_APPROVED_ICON_VIEW_BOX } from "@/lib/pwa/approvedIconArtwork";

export const runtime = "edge";

export function GET(_request: Request, { params }: { params: Promise<{ icon: string }> }) {
  return params.then(({ icon }) => {
    const config = getPwaIconConfig(icon);
    if (!config) return new Response("Not found", { status: 404 });

    const { size, safePadding } = config;
    const innerSize = size - safePadding * 2;

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#030405",
          }}
        >
          <svg
            width={innerSize}
            height={innerSize}
            viewBox={CPL_APPROVED_ICON_VIEW_BOX}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="cplGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7b4a05" />
                <stop offset="0.22" stopColor="#d89b2b" />
                <stop offset="0.48" stopColor="#fff0a0" />
                <stop offset="0.7" stopColor="#c47d12" />
                <stop offset="1" stopColor="#6a3b00" />
              </linearGradient>
            </defs>
            <path d={CPL_APPROVED_ICON_PATH} fill="url(#cplGold)" fillRule="evenodd" />
          </svg>
        </div>
      ),
      {
        width: size,
        height: size,
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      },
    );
  });
}
