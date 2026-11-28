export const DEFAULT_ACCENT = "#527448";

export function accentRgb(color: string | null | undefined): [number, number, number] {
  const hex = color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_ACCENT;
  return [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}

export function readableAccentText(rgb: number[]): string {
  const [r, g, b] = rgb.map(channel => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722 > 0.179 ? "0 0 0" : "255 255 255";
}

export function hexFromHsl(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  return "#" + [0, 8, 4].map(n => {
    const k = (n + hue / 30) % 12;
    const channel = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(channel * 255).toString(16).padStart(2, "0");
  }).join("");
}

export function hslFromHex(hex: string): [number, number, number] {
  const [r, g, b] = accentRgb(hex).map(value => value / 255);
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const delta = max - min;
  const lightness = (min + max) / 2;
  if (!delta) return [0, 0, lightness * 100];
  const hue = max === r ? (g - b) / delta : max === g ? 2 + (b - r) / delta : 4 + (r - g) / delta;
  return [(hue * 60 + 360) % 360, (delta / (1 - Math.abs(2 * lightness - 1))) * 100, lightness * 100];
}
