/* Line icons (24px grid, currentColor). */
import type { SVGProps } from 'react';

const make = (d: string, extra: SVGProps<SVGSVGElement> = {}) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra} {...props} dangerouslySetInnerHTML={{ __html: d }} />
    );
  };

export const Heart = make('<path d="M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 4.8 6.4 4.5c2-.2 3.9.9 5.6 3 1.7-2.1 3.6-3.2 5.6-3 3.4.3 5.2 3.8 3.6 6.9C19 15.6 12 20 12 20z"/>');
export const Lens = make('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M11 8v6M8 11h6"/>');
export const Plus = make('<path d="M12 5v14M5 12h14"/>');
export const Spark = make('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>');
export const Bag = make('<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 016 0V8"/>');
export const Search = make('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>');
export const User = make('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>');
export const Menu = make('<path d="M4 7h16M4 12h16M4 17h10"/>');
export const Close = make('<path d="M6 6l12 12M18 6L6 18"/>');
export const Arrow = make('<path d="M5 12h14M13 6l6 6-6 6"/>');
export const ChevronLeft = make('<path d="M15 5l-7 7 7 7"/>');
export const ChevronRight = make('<path d="M9 5l7 7-7 7"/>');
export const ChevronDown = make('<path d="M6 9l6 6 6-6"/>');
export const Check = make('<path d="M5 12.5l4.5 4.5L19 7"/>');
export const Truck = make('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>');
export const Info = make('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>');
export const Shield = make('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>');
export const Swap = make('<path d="M4 9h13l-3-3M20 15H7l3 3"/>');
export const Cash = make('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>');
export const Eye = make('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>');
export const Chat = make('<path d="M20 11.5a8.5 8.5 0 01-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1120 11.5z"/>');
export const Tag = make('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>');
export const Upi = make('<path d="M4 17L10 5M10 17l6-12M16 17l4-8"/>');
export const Gift = make('<rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M12 9v11M3.5 13h17M12 9C9 9 7 7.8 7 6.2S8.6 4 10 5.2 12 9 12 9s.6-2.6 2-3.8S17 4.6 17 6.2 15 9 12 9z"/>');
export const Home = make('<path d="M4 10.5L12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>');
export const Grid = make('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="3.5"/><rect x="4" y="13" width="7" height="7" rx="3.5"/><rect x="13" y="13" width="7" height="7" rx="2"/>');
export const Lock = make('<rect x="5" y="10" width="14" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 018 0V10"/>');
export const Card = make('<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>');
export const Bank = make('<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>');
export const Wallet = make('<path d="M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M4 7l11-3v3M16 13.5h2"/>');
export const Gear = make('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>');
export const Box = make('<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>');
export const Star = make('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>');
export const Users = make('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.6 3.6-5.5 6.5-5.5s5.5 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.8c1.8.8 3 2.5 3.5 5.2"/>');
export const Needle = make('<path d="M20 4L7 17"/><path d="M17.5 3.5a2 2 0 013 3"/><path d="M7 17l-3 3"/><path d="M4 9c2 0 3.5 1.2 3.5 3S6 15 4 15"/>');
export const Logout = make('<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 16l4-4-4-4M14 12H4"/>');
export const SparkFill = make('<path d="M12 2l2.2 6.6L21 10l-6.8 1.6L12 18l-2.2-6.4L3 10l6.8-1.4z"/>', { fill: 'currentColor', stroke: 'none' });

export function Logo() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF2E93" />
          <stop offset=".55" stopColor="#FF8A00" />
          <stop offset="1" stopColor="#FFB300" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="21.5" r="15.5" fill="none" stroke="url(#lg)" strokeWidth="5" />
      <path d="M10.5 24q4.75-9 9.5 0t9.5 0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="3.4 2.6" />
      <rect x="16.5" y="1.5" width="7" height="6.5" rx="2" fill="currentColor" />
    </svg>
  );
}
