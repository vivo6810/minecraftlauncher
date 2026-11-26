let cachedSteveDataUrl: string | null = null;

/**
 * Generates an authentic 64x64 Minecraft Steve skin PNG Data URL entirely offline.
 * Covers all standard 64x64 UV faces (head, torso, right/left arms, right/left legs)
 * in Steve's original colors so the 3D character renders Steve by default with zero network dependency.
 */
export function getDefaultSteveSkinDataUrl(): string {
  if (cachedSteveDataUrl) return cachedSteveDataUrl;
  if (typeof document === "undefined") return "";

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.clearRect(0, 0, 64, 64);

  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  // --- HEAD (8x8x8 at UV 0,0) ---
  // Top & Bottom
  px(8, 0, 8, 8, "#2F2118");
  px(16, 0, 8, 8, "#A8795E");
  // Right, Front, Left, Back base skin
  px(0, 8, 32, 8, "#B58468");
  // Hair across Right (0..8), Front (8..16), Left (16..24), Back (24..32)
  px(0, 8, 8, 3, "#2F2118");
  px(0, 11, 3, 2, "#2F2118"); // right sideburn
  px(8, 8, 8, 2, "#2F2118");
  px(8, 10, 1, 1, "#2F2118");
  px(15, 10, 1, 1, "#2F2118");
  px(16, 8, 8, 3, "#2F2118");
  px(21, 11, 3, 2, "#2F2118"); // left sideburn
  px(24, 8, 8, 6, "#2F2118"); // back hair
  // Subtle hair texture highlights
  px(10, 8, 2, 1, "#3B291E");
  px(13, 9, 2, 1, "#3B291E");
  px(26, 9, 3, 2, "#3B291E");

  // Front face features (x=8..16, y=8..16)
  // Eyes
  px(9, 12, 1, 1, "#FFFFFF");
  px(10, 12, 1, 1, "#493B7F");
  px(13, 12, 1, 1, "#493B7F");
  px(14, 12, 1, 1, "#FFFFFF");
  // Nose
  px(11, 13, 2, 1, "#9C694C");
  // Iconic Steve mouth / beard
  px(10, 14, 4, 1, "#6B442E");
  px(10, 15, 1, 1, "#593825");
  px(13, 15, 1, 1, "#593825");
  px(11, 15, 2, 1, "#7B4F36");

  // --- TORSO (8x12x4 at UV 16,16) ---
  px(20, 16, 8, 4, "#009E9E"); // top shoulder
  px(22, 17, 4, 2, "#A8795E"); // neck opening
  px(28, 16, 8, 4, "#3B3799"); // bottom waist
  px(16, 20, 24, 12, "#00AAAA"); // right, front, left, back cyan shirt
  // V-neck skin on front torso
  px(23, 20, 2, 2, "#B58468");
  px(23, 22, 2, 1, "#9C694C");
  // Subtle shirt shading
  px(16, 20, 4, 12, "#009595");
  px(28, 20, 4, 12, "#009595");
  // Shirt hem / untucked corner
  px(20, 31, 3, 1, "#3B3799");

  // --- HELPER FOR ARMS (4x12x4) ---
  const drawSteveArm = (ox: number, oy: number) => {
    px(ox + 4, oy, 4, 4, "#009E9E"); // shoulder top
    px(ox + 8, oy, 4, 4, "#A8795E"); // hand bottom
    // Short cyan sleeve (top 4px)
    px(ox, oy + 4, 16, 4, "#00AAAA");
    px(ox, oy + 4, 4, 4, "#009595");
    // Forearm skin (lower 8px)
    px(ox, oy + 8, 16, 8, "#B58468");
    px(ox, oy + 8, 4, 8, "#A6775C");
  };
  drawSteveArm(40, 16); // Right arm
  drawSteveArm(32, 48); // Left arm

  // --- HELPER FOR LEGS (4x12x4) ---
  const drawSteveLeg = (ox: number, oy: number) => {
    px(ox + 4, oy, 4, 4, "#332F88"); // hip top
    px(ox + 8, oy, 4, 4, "#525252"); // shoe sole
    // Indigo jeans (top 10px)
    px(ox, oy + 4, 16, 10, "#3B3799");
    px(ox, oy + 4, 4, 10, "#332F88");
    // Grey shoes (bottom 2px)
    px(ox, oy + 14, 16, 2, "#686868");
  };
  drawSteveLeg(0, 16); // Right leg
  drawSteveLeg(16, 48); // Left leg

  cachedSteveDataUrl = canvas.toDataURL("image/png");
  return cachedSteveDataUrl;
}
