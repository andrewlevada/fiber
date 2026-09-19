import sharp from "sharp";

/** Chrome extension icon sizes (toolbar, management page, store listing). */
export const ICON_SIZES = [16, 32, 48, 128] as const;

export const ICONS_DIR = "icons";

export function iconManifest(): Record<string, string> {
  return Object.fromEntries(
    ICON_SIZES.map((size) => [String(size), `${ICONS_DIR}/icon-${size}.png`]),
  );
}

export async function generateIcons(
  sourcePath: string,
): Promise<Map<(typeof ICON_SIZES)[number], Buffer>> {
  const icons = new Map<(typeof ICON_SIZES)[number], Buffer>();

  for (const size of ICON_SIZES) {
    const buffer = await sharp(sourcePath)
      .resize(size, size, { fit: "cover" })
      .png()
      .toBuffer();
    icons.set(size, buffer);
  }

  return icons;
}
