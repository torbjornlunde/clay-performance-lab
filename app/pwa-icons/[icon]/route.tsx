import { ImageResponse } from "next/og";
import { getPwaIconConfig } from "@/lib/pwa/iconConfig";

export const runtime = "edge";

export function GET(_request: Request, { params }: { params: Promise<{ icon: string }> }) {
  return params.then(({ icon }) => {
    const config = getPwaIconConfig(icon);
    if (!config) return new Response("Not found", { status: 404 });

    const { size, safePadding } = config;
    const innerSize = size - safePadding * 2;
    const ringWidth = Math.max(6, Math.round(size * 0.035));
    const monogramSize = Math.round(size * 0.38);
    const subtitleSize = Math.round(size * 0.08);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(180deg, #05070b 0%, #0d141d 100%)",
          }}
        >
          <div
            style={{
              width: innerSize,
              height: innerSize,
              borderRadius: Math.round(innerSize * 0.24),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `${ringWidth}px solid #d8a53a`,
              background: "radial-gradient(circle at 50% 38%, rgba(245, 207, 106, 0.18), transparent 48%), #0d141d",
              boxShadow: `inset 0 0 0 ${Math.max(2, Math.round(size * 0.01))}px rgba(247, 250, 252, 0.06)`,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(size * 0.015) }}>
              <div style={{ display: "flex", alignItems: "baseline", letterSpacing: Math.round(size * -0.035) }}>
                <span style={{ color: "#f7fafc", fontSize: monogramSize, fontWeight: 900, lineHeight: 0.88 }}>C</span>
                <span style={{ color: "#f5cf6a", fontSize: monogramSize, fontWeight: 900, lineHeight: 0.88 }}>P</span>
              </div>
              <div
                style={{
                  width: Math.round(innerSize * 0.56),
                  height: Math.max(4, Math.round(size * 0.025)),
                  borderRadius: 999,
                  background: "linear-gradient(90deg, transparent, #d8a53a 22%, #f5cf6a 50%, #d8a53a 78%, transparent)",
                }}
              />
              <div style={{ color: "rgba(245, 207, 106, 0.72)", fontSize: subtitleSize, fontWeight: 800, letterSpacing: Math.round(size * 0.006) }}>LAB</div>
            </div>
          </div>
        </div>
      ),
      { width: size, height: size },
    );
  });
}
