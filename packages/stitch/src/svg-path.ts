/* ---------- SVG path sampling ----------
   In a browser, points come from a hidden <path> probe (getTotalLength / getPointAtLength), created on first
   use. Without a DOM (SSR, tests) a small pure fallback flattens the path (M L H V C S Q T Z, absolute and
   relative; no arcs) and walks it by arc length. */

type Pt = [number, number];

const SVG_NS = 'http://www.w3.org/2000/svg';
let probe: SVGPathElement | null = null;

function getProbe(): SVGPathElement | null {
  if (probe) return probe;
  if (typeof document === 'undefined' || !document.body || typeof document.createElementNS !== 'function') return null;
  const p = document.createElementNS(SVG_NS, 'path'),
    s = document.createElementNS(SVG_NS, 'svg');
  s.setAttribute('width', '0');
  s.setAttribute('height', '0');
  s.setAttribute('aria-hidden', 'true');
  s.style.position = 'absolute';
  s.appendChild(p);
  document.body.appendChild(s);
  probe = p;
  return p;
}

/** n points evenly spaced along an SVG path (by length, starting at the start) */
export function sample(d: string, n: number): Pt[] {
  const p = getProbe();
  if (!p) return samplePathPure(d, n);
  p.setAttribute('d', d);
  const L = p.getTotalLength(),
    o: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const q = p.getPointAtLength((L * k) / n);
    o.push([q.x, q.y]);
  }
  return o;
}

/** a path flattened into polylines (one per subpath) */
function flatten(d: string, steps = 64): Pt[][] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtZzAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const polys: Pt[][] = [];
  let cur: Pt[] = [],
    x = 0,
    y = 0,
    sx = 0,
    sy = 0,
    cmd = '',
    i = 0,
    lcx = 0, // last cubic control point (for S)
    lcy = 0,
    lqx = 0, // last quadratic control point (for T)
    lqy = 0,
    prev = '';
  const isCmd = (t: string) => /^[A-Za-z]$/.test(t);
  const num = () => {
    const t = tokens[i++];
    if (t === undefined || isCmd(t)) throw new Error(`bad path data near token ${i}: ${d}`);
    return parseFloat(t);
  };
  const lineTo = (nx: number, ny: number) => {
    cur.push([nx, ny]);
    x = nx;
    y = ny;
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    const x0 = x,
      y0 = y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps,
        mt = 1 - t;
      cur.push([
        mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * ex,
        mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * ey,
      ]);
    }
    x = ex;
    y = ey;
  };
  const quad = (x1: number, y1: number, ex: number, ey: number) => {
    const x0 = x,
      y0 = y;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps,
        mt = 1 - t;
      cur.push([mt * mt * x0 + 2 * mt * t * x1 + t * t * ex, mt * mt * y0 + 2 * mt * t * y1 + t * t * ey]);
    }
    x = ex;
    y = ey;
  };
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (isCmd(t)) {
      cmd = t;
      i++;
    } else if (!cmd) throw new Error(`path data must start with a command: ${d}`);
    const rel = cmd === cmd.toLowerCase(),
      ox = rel ? x : 0,
      oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        const nx = num() + ox,
          ny = num() + oy;
        if (cur.length > 1) polys.push(cur);
        cur = [[nx, ny]];
        x = sx = nx;
        y = sy = ny;
        cmd = rel ? 'l' : 'L'; // extra pairs after M are line-tos
        break;
      }
      case 'L':
        lineTo(num() + ox, num() + oy);
        break;
      case 'H':
        lineTo(num() + ox, y);
        break;
      case 'V':
        lineTo(x, num() + oy);
        break;
      case 'C': {
        const x1 = num() + ox,
          y1 = num() + oy,
          x2 = num() + ox,
          y2 = num() + oy,
          ex = num() + ox,
          ey = num() + oy;
        cubic(x1, y1, x2, y2, ex, ey);
        lcx = x2;
        lcy = y2;
        break;
      }
      case 'S': {
        const smooth = 'CcSs'.includes(prev),
          x1 = smooth ? 2 * x - lcx : x,
          y1 = smooth ? 2 * y - lcy : y,
          x2 = num() + ox,
          y2 = num() + oy,
          ex = num() + ox,
          ey = num() + oy;
        cubic(x1, y1, x2, y2, ex, ey);
        lcx = x2;
        lcy = y2;
        break;
      }
      case 'Q': {
        const x1 = num() + ox,
          y1 = num() + oy,
          ex = num() + ox,
          ey = num() + oy;
        quad(x1, y1, ex, ey);
        lqx = x1;
        lqy = y1;
        break;
      }
      case 'T': {
        const smooth = 'QqTt'.includes(prev),
          x1 = smooth ? 2 * x - lqx : x,
          y1 = smooth ? 2 * y - lqy : y,
          ex = num() + ox,
          ey = num() + oy;
        quad(x1, y1, ex, ey);
        lqx = x1;
        lqy = y1;
        break;
      }
      case 'Z':
        lineTo(sx, sy);
        if (cur.length > 1) polys.push(cur);
        cur = [[sx, sy]];
        prev = cmd;
        cmd = ''; // Z takes no numbers: the next token must be a command
        continue;
      default:
        throw new Error(`path command "${cmd}" is not supported without a DOM: ${d}`);
    }
    prev = cmd;
  }
  if (cur.length > 1) polys.push(cur);
  return polys;
}

/** pure fallback for sample(): same spacing rule, approximate (flattened) curves */
export function samplePathPure(d: string, n: number): Pt[] {
  const polys = flatten(d),
    segs: Array<[number, number, number, number, number]> = []; // x0 y0 x1 y1 length
  let L = 0;
  for (const poly of polys)
    for (let k = 1; k < poly.length; k++) {
      const [x0, y0] = poly[k - 1]!,
        [x1, y1] = poly[k]!,
        len = Math.hypot(x1 - x0, y1 - y0);
      segs.push([x0, y0, x1, y1, len]);
      L += len;
    }
  const first = polys[0]?.[0] ?? [0, 0],
    o: Pt[] = [];
  for (let k = 0; k < n; k++) {
    let target = (L * k) / n,
      pt: Pt = [first[0], first[1]];
    for (const [x0, y0, x1, y1, len] of segs) {
      if (target <= len) {
        const t = len ? target / len : 0;
        pt = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
        break;
      }
      target -= len;
      pt = [x1, y1];
    }
    o.push(pt);
  }
  return o;
}
