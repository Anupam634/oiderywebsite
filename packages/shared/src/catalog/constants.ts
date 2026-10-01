/* Filter vocabularies for the shop. Categories themselves live in the database. */
export const PRODUCT_TYPES = ['READY', 'PERSONALISE', 'MADE_TO_ORDER', 'LOGO'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];
export const TYPE_LABEL: Record<ProductType, string> = {
  READY: 'Ready to ship',
  PERSONALISE: 'Personalise it',
  MADE_TO_ORDER: 'Made to order',
  LOGO: 'Your logo',
};

export const OCCASIONS = [
  { key: 'diwali', label: 'Diwali', colour: '#FF8A00' },
  { key: 'rakhi', label: 'Rakhi', colour: '#FF4B2B' },
  { key: 'shaadi', label: 'Shaadi', colour: '#E4007C' },
  { key: 'birthday', label: 'Birthday', colour: '#3D2BD6' },
  { key: 'babyshower', label: 'Baby shower', colour: '#FF78B4' },
  { key: 'housewarming', label: 'Housewarming', colour: '#00A39A' },
  { key: 'corporate', label: 'Corporate gifting', colour: '#7B2CBF' },
] as const;
export type OccasionKey = (typeof OCCASIONS)[number]['key'];

export const COLOUR_FAMILIES = [
  { key: 'red', label: 'Red & maroon', swatch: '#C8102E' },
  { key: 'pink', label: 'Pink', swatch: '#FF4FA3' },
  { key: 'green', label: 'Green', swatch: '#2E8B57' },
  { key: 'blue', label: 'Blue', swatch: '#3559C7' },
  { key: 'neutral', label: 'Ivory & neutral', swatch: '#E9DFCF' },
  { key: 'multi', label: 'Multicolour', swatch: 'conic-gradient(#E4007C,#FF8A00,#FFB300,#5DAA3A,#00A39A,#3D2BD6,#E4007C)' },
] as const;
export type ColourFamily = (typeof COLOUR_FAMILIES)[number]['key'];

/** Price buckets in paise: [key, label, min (inclusive), max (exclusive)] */
export const PRICE_BUCKETS = [
  { key: 'u999', label: 'Under ₹999', min: 0, max: 100_000 },
  { key: 'u1999', label: '₹1,000 – ₹1,999', min: 100_000, max: 200_000 },
  { key: 'u4999', label: '₹2,000 – ₹4,999', min: 200_000, max: 500_000 },
  { key: 'o5000', label: '₹5,000 & above', min: 500_000, max: Number.POSITIVE_INFINITY },
] as const;
export type PriceBucket = (typeof PRICE_BUCKETS)[number]['key'];

export const SORTS = [
  { key: 'popular', label: 'Popularity' },
  { key: 'new', label: 'New arrivals' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'rating', label: 'Customer rating' },
] as const;
export type SortKey = (typeof SORTS)[number]['key'];

/** "4.8★ & above" */
export const TOP_RATED_MIN = 4.8;
export const FREE_SHIPPING_MIN_PAISE = 99_900;
export const GIFT_WRAP_PAISE = 4_900;
