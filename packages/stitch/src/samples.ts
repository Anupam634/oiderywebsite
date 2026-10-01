/* ---------- sample logos drawn in code (for trying the logo flow without an upload) ---------- */
import { createCanvas, ctx2d } from './dom';

export type SampleKind = 'chai' | 'mono' | 'team';

export const SAMPLE_NAMES: Readonly<Record<SampleKind, string>> = {
  chai: 'Chai Co. badge (sample)',
  mono: 'R ♥ P monogram (sample)',
  team: 'Team Titans crest (sample)',
};

export const SAMPLE_KINDS = Object.keys(SAMPLE_NAMES) as SampleKind[];

/** the typefaces the sample logos are lettered in; apps that self-host fonts under other names pass those */
export interface SampleFonts {
  display: string;
  serif: string;
  sans: string;
}
const DEFAULT_SAMPLE_FONTS: SampleFonts = { display: '"Archivo Black"', serif: '"Playfair Display"', sans: '"Plus Jakarta Sans"' };

/** a 640 × 640 sample logo; uses Archivo Black, Playfair Display and Plus Jakarta Sans (await fontsLoaded() first) */
export function sampleLogo(kind: SampleKind, fonts: Partial<SampleFonts> = {}): HTMLCanvasElement {
  const F = { ...DEFAULT_SAMPLE_FONTS, ...fonts };
  const c = createCanvas();
  c.width = c.height = 640;
  const x = ctx2d(c);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.textAlign = 'center';
  const circle = (cx: number, cy: number, r: number, f: string) => {
    x.fillStyle = f;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  };
  if (kind === 'chai') {
    circle(320, 320, 304, '#0F766E');
    circle(320, 320, 268, '#FFF3DC');
    circle(320, 320, 250, '#0F766E');
    x.fillStyle = '#FFF3DC';
    x.beginPath();
    x.moveTo(228, 190);
    x.lineTo(372, 190);
    x.quadraticCurveTo(368, 318, 300, 322);
    x.quadraticCurveTo(232, 318, 228, 190);
    x.fill();
    x.strokeStyle = '#FFF3DC';
    x.lineWidth = 16;
    x.beginPath();
    x.arc(378, 236, 30, -1.2, 1.4);
    x.stroke();
    x.fillRect(196, 330, 208, 14);
    x.strokeStyle = '#FF8A00';
    x.lineWidth = 13;
    const steam: Array<[number, number]> = [
      [262, 0],
      [300, -8],
      [338, 0],
    ];
    steam.forEach(([sx, o]) => {
      x.beginPath();
      x.moveTo(sx, 176 + o);
      x.bezierCurveTo(sx - 22, 150 + o, sx + 22, 128 + o, sx, 100 + o);
      x.stroke();
    });
    x.fillStyle = '#FFF3DC';
    x.font = `84px ${F.display}, Impact, sans-serif`;
    x.fillText('CHAI CO.', 320, 452);
    x.fillStyle = '#FF8A00';
    x.font = `800 32px ${F.sans}, sans-serif`;
    x.fillText('EST. 2019 · PUNE', 320, 504);
  } else if (kind === 'mono') {
    x.strokeStyle = '#C99A2E';
    x.lineWidth = 7;
    x.beginPath();
    x.arc(320, 330, 262, Math.PI * 0.62, Math.PI * 1.38);
    x.stroke();
    x.beginPath();
    x.arc(320, 330, 262, -Math.PI * 0.38, Math.PI * 0.38);
    x.stroke();
    x.fillStyle = '#C99A2E';
    for (let i = 0; i < 9; i++) {
      [-1, 1].forEach((sg) => {
        const t = (sg < 0 ? Math.PI * 0.66 : -Math.PI * 0.34) + i * Math.PI * 0.075,
          px = 320 + Math.cos(t) * 262,
          py = 330 + Math.sin(t) * 262;
        x.save();
        x.translate(px, py);
        x.rotate(t + (sg < 0 ? -0.5 : 0.5));
        x.beginPath();
        x.ellipse(0, -16, 9, 20, 0, 0, Math.PI * 2);
        x.fill();
        x.restore();
      });
    }
    x.fillStyle = '#7A1F33';
    x.font = `italic 700 260px ${F.serif}, Georgia, serif`;
    x.fillText('R', 196, 410);
    x.fillText('P', 448, 410);
    x.fillStyle = '#E4007C';
    x.beginPath();
    x.moveTo(322, 352);
    x.bezierCurveTo(262, 312, 262, 248, 302, 244);
    x.bezierCurveTo(314, 243, 320, 252, 322, 262);
    x.bezierCurveTo(324, 252, 330, 243, 342, 244);
    x.bezierCurveTo(382, 248, 382, 312, 322, 352);
    x.fill();
    x.fillStyle = '#7A1F33';
    x.font = `800 30px ${F.sans}, sans-serif`;
    x.fillText('14 · 02 · 2027', 320, 520);
  } else {
    x.fillStyle = '#1B2A55';
    const shield = () => {
      x.beginPath();
      x.moveTo(320, 40);
      x.lineTo(560, 110);
      x.lineTo(548, 330);
      x.quadraticCurveTo(520, 500, 320, 604);
      x.quadraticCurveTo(120, 500, 92, 330);
      x.lineTo(80, 110);
      x.closePath();
    };
    shield();
    x.fill();
    x.strokeStyle = '#FFB300';
    x.lineWidth = 16;
    x.save();
    x.translate(320, 322);
    x.scale(0.88, 0.88);
    x.translate(-320, -322);
    shield();
    x.stroke();
    x.restore();
    x.fillStyle = '#FFB300';
    x.beginPath();
    x.moveTo(350, 120);
    x.lineTo(236, 330);
    x.lineTo(310, 330);
    x.lineTo(286, 468);
    x.lineTo(410, 250);
    x.lineTo(334, 250);
    x.closePath();
    x.fill();
    x.fillStyle = '#FBFBF8';
    x.fillRect(118, 356, 404, 86);
    x.fillStyle = '#1B2A55';
    x.font = `74px ${F.display}, Impact, sans-serif`;
    x.fillText('TITANS', 320, 425);
    x.fillStyle = '#FBFBF8';
    x.font = `800 34px ${F.sans}, sans-serif`;
    x.fillText('TEAM', 320, 122);
  }
  return c;
}
