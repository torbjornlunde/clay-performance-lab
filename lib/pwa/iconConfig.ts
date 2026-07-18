export type PwaIconKind = "192" | "512" | "maskable" | "apple";

export const PWA_ICON_CONFIG: Record<PwaIconKind, { size: number; safePadding: number }> = {
  "192": { size: 192, safePadding: 16 },
  "512": { size: 512, safePadding: 42 },
  maskable: { size: 512, safePadding: 82 },
  apple: { size: 180, safePadding: 18 },
};

export function getPwaIconConfig(icon: string) {
  if (icon === "192" || icon === "512" || icon === "maskable" || icon === "apple") return PWA_ICON_CONFIG[icon];
  return null;
}
