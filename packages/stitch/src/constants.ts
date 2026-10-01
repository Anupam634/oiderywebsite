/* ---------- renderer constants (same numbers as the prototype engine) ---------- */

/** satin stitch angle for thread slot i (cycled), radians */
export const ANG: readonly number[] = [35, -40, 80, -8, 58, -66].map((d) => (d * Math.PI) / 180);
/** how far fabric folds push the design around (photo px per unit of brightness slope) */
export const DISP = 22;
/** light direction for the satin sheen (radians) */
export const LIGHT = -0.8;
/** output canvas size of renderTo / snapshot (the garment photos are 900 × 1125) */
export const OUT_W = 900;
export const OUT_H = 1125;
/** stitch-map size limit: designs are scaled to fit this many px before analysis */
export const MAX_DESIGN_PX = 440;
