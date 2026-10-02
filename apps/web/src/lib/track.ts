'use client';

/* Shop analytics: Meta Pixel (Instagram/Facebook ads) and Google Analytics 4. Both are off unless their IDs
   are set at build time (NEXT_PUBLIC_META_PIXEL_ID, NEXT_PUBLIC_GA_ID). Calls are queued until the libraries
   load (components/Analytics.tsx loads them after the page is idle), and never throw.
   Private pages (account, proofs, admin, login) are never reported: their addresses can hold order numbers
   or secret proof links. */

export const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';
export const ANALYTICS_ON = !!(PIXEL_ID || GA_ID);

type Fn = ((...args: unknown[]) => void) & { queue?: unknown[]; callMethod?: (...a: unknown[]) => void; push?: unknown; loaded?: boolean; version?: string };
declare global {
  interface Window {
    fbq?: Fn;
    _fbq?: Fn;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export interface TrackItem {
  /** product slug (or "studio-…" for design-studio pieces): the same id a product feed would use */
  id: string;
  name: string;
  pricePaise: number;
  qty: number;
}

const PRIVATE = /^\/(admin|account|proof|login)(\/|$)/;
const rupees = (paise: number) => Math.round(paise) / 100;

let ready = false;
/** create the queues and initialise both tools once, before any event */
function init(): boolean {
  if (typeof window === 'undefined' || !ANALYTICS_ON) return false;
  if (ready) return true;
  ready = true;
  if (PIXEL_ID && !window.fbq) {
    // Meta's standard queue stub; fbevents.js replays the queue when it loads
    const q: Fn = function (...args: unknown[]) {
      if (q.callMethod) q.callMethod(...args);
      else q.queue!.push(args);
    };
    q.queue = [];
    q.push = q;
    q.loaded = true;
    q.version = '2.0';
    window.fbq = q;
    window._fbq = q;
    q('set', 'autoConfig', false, PIXEL_ID); // no automatic button/form scraping
    q('init', PIXEL_ID);
  }
  if (GA_ID && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    // gtag.js reads the arguments objects pushed here
    window.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { send_page_view: false });
  }
  return true;
}

function fb(event: string, data: Record<string, unknown>, eventID?: string) {
  if (PIXEL_ID && window.fbq) window.fbq('track', event, data, eventID ? { eventID } : undefined);
}
function ga(event: string, data: Record<string, unknown>) {
  if (GA_ID && window.gtag) window.gtag('event', event, data);
}
function safely(run: () => void) {
  try {
    if (init()) run();
  } catch {
    /* analytics must never break the shop */
  }
}
const gaItem = (i: TrackItem) => ({ item_id: i.id, item_name: i.name, price: rupees(i.pricePaise), quantity: i.qty });
const value = (items: TrackItem[]) => items.reduce((s, i) => s + i.pricePaise * i.qty, 0);

export const track = {
  /** on every route change. Private pages send nothing, and Google's automatic events (scrolls, clicks) are
      told the page is "/private" so a proof link or order number never reaches it */
  pageView(path: string) {
    const hidden = PRIVATE.test(path);
    safely(() => {
      const where = location.origin + (hidden ? '/private' : path);
      if (GA_ID && window.gtag) window.gtag('set', { page_location: where, page_title: hidden ? 'Private page' : document.title });
      if (hidden) return;
      fb('PageView', {});
      ga('page_view', { page_location: where, page_title: document.title });
    });
  },
  viewItem(item: TrackItem) {
    safely(() => {
      fb('ViewContent', { content_ids: [item.id], content_type: 'product', content_name: item.name, value: rupees(item.pricePaise), currency: 'INR' });
      ga('view_item', { currency: 'INR', value: rupees(item.pricePaise), items: [gaItem(item)] });
    });
  },
  addToCart(item: TrackItem) {
    safely(() => {
      const v = rupees(item.pricePaise * item.qty);
      fb('AddToCart', { content_ids: [item.id], content_type: 'product', content_name: item.name, value: v, currency: 'INR', contents: [{ id: item.id, quantity: item.qty }] });
      ga('add_to_cart', { currency: 'INR', value: v, items: [gaItem(item)] });
    });
  },
  beginCheckout(items: TrackItem[], totalPaise: number) {
    if (!items.length) return;
    safely(() => {
      fb('InitiateCheckout', { content_ids: items.map((i) => i.id), content_type: 'product', num_items: items.reduce((s, i) => s + i.qty, 0), value: rupees(totalPaise), currency: 'INR' });
      ga('begin_checkout', { currency: 'INR', value: rupees(totalPaise || value(items)), items: items.map(gaItem) });
    });
  },
  /** once per order (the order number doubles as the event id, so a server-side copy can be de-duplicated later) */
  purchase(order: { number: string; totalPaise: number; shippingPaise: number; couponCode: string | null; items: TrackItem[] }) {
    safely(() => {
      const key = `tracked-${order.number}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
      } catch {
        /* storage blocked: send anyway */
      }
      fb('Purchase', { content_ids: order.items.map((i) => i.id), content_type: 'product', contents: order.items.map((i) => ({ id: i.id, quantity: i.qty })), value: rupees(order.totalPaise), currency: 'INR' }, order.number);
      ga('purchase', {
        transaction_id: order.number,
        currency: 'INR',
        value: rupees(order.totalPaise),
        shipping: rupees(order.shippingPaise),
        ...(order.couponCode ? { coupon: order.couponCode } : {}),
        items: order.items.map(gaItem),
      });
    });
  },
};
