export type NormalizedCrop = { x: number; y: number; width: number; height: number; mode?: "full" | "crop" };
export type PixelCrop = { sx: number; sy: number; sw: number; sh: number };
const MIN_CROP_SIZE = 0.02;
export function clampCrop(crop: NormalizedCrop): NormalizedCrop {
  const requestedWidth = Number.isFinite(crop.width) ? crop.width : 1;
  const requestedHeight = Number.isFinite(crop.height) ? crop.height : 1;
  const width = Math.min(1, Math.max(MIN_CROP_SIZE, requestedWidth));
  const height = Math.min(1, Math.max(MIN_CROP_SIZE, requestedHeight));
  const x = Math.min(1 - width, Math.max(0, Number.isFinite(crop.x) ? crop.x : 0));
  const y = Math.min(1 - height, Math.max(0, Number.isFinite(crop.y) ? crop.y : 0));
  const full = x === 0 && y === 0 && width === 1 && height === 1;
  return { x, y, width, height, mode: crop.mode || (full ? "full" : "crop") };
}
export const fullImageCrop: NormalizedCrop = { x: 0, y: 0, width: 1, height: 1, mode: "full" };
export function isFullImageCrop(crop?: NormalizedCrop | null) { if (!crop) return true; const c = clampCrop(crop); return c.x === 0 && c.y === 0 && c.width === 1 && c.height === 1; }
export function cropToPercent(crop: NormalizedCrop) { const c = clampCrop(crop); return { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.width * 100}%`, height: `${c.height * 100}%` }; }
export function cropFromDrag(startX: number, startY: number, currentX: number, currentY: number): NormalizedCrop {
  const x1 = Math.min(startX, currentX), y1 = Math.min(startY, currentY);
  const x2 = Math.max(startX, currentX), y2 = Math.max(startY, currentY);
  return clampCrop({ x: x1, y: y1, width: x2 - x1, height: y2 - y1, mode: "crop" });
}
export function displayedPointToCrop(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">) {
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height))),
  };
}
export function cropToNaturalPixels(crop: NormalizedCrop, naturalWidth: number, naturalHeight: number): PixelCrop | null {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth < 1 || naturalHeight < 1) return null;
  const c = clampCrop(crop);
  const sx = Math.min(naturalWidth - 1, Math.max(0, Math.floor(c.x * naturalWidth)));
  const sy = Math.min(naturalHeight - 1, Math.max(0, Math.floor(c.y * naturalHeight)));
  const maxWidth = naturalWidth - sx;
  const maxHeight = naturalHeight - sy;
  const sw = Math.min(maxWidth, Math.max(1, Math.round(c.width * naturalWidth)));
  const sh = Math.min(maxHeight, Math.max(1, Math.round(c.height * naturalHeight)));
  if (sw < 1 || sh < 1) return null;
  return { sx, sy, sw, sh };
}
export function moveCrop(crop: NormalizedCrop, dx: number, dy: number) { const c = clampCrop(crop); return clampCrop({ ...c, x: c.x + dx, y: c.y + dy, mode: "crop" }); }
export function resizeCrop(crop: NormalizedCrop, edge: "nw" | "ne" | "sw" | "se", dx: number, dy: number) {
  const c = clampCrop(crop);
  let { x, y, width, height } = c;
  if (edge.includes("n")) { y += dy; height -= dy; } else height += dy;
  if (edge.includes("w")) { x += dx; width -= dx; } else width += dx;
  return clampCrop({ x, y, width, height, mode: "crop" });
}
export async function renderCropBlob(image: Blob, crop: NormalizedCrop): Promise<Blob> {
  const bmp = await createImageBitmap(image);
  try {
    const pixels = cropToNaturalPixels(crop, bmp.width, bmp.height);
    if (!pixels) throw new Error("Could not prepare crop.");
    const { sx, sy, sw, sh } = pixels;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(2200, sw);
    canvas.height = Math.max(1, Math.round(sh * (canvas.width / sw)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare crop.");
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.84));
    if (!blob) throw new Error("Could not prepare crop.");
    return blob;
  } finally {
    bmp.close?.();
  }
}
export async function fingerprintCrop(blob: Blob) { const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()); return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join(""); }
export function sameCrop(a?: NormalizedCrop | null, b?: NormalizedCrop | null) { const ca = clampCrop(a || fullImageCrop), cb = clampCrop(b || fullImageCrop); return ["x", "y", "width", "height"].every((k) => Math.abs((ca as any)[k] - (cb as any)[k]) < 0.0001); }
