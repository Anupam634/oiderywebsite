/** Size charts, in inches. Keyed by product.sizeGuide. */
export interface SizeGuide {
  columns: string[];
  rows: (string | number)[][];
  note: string;
}

const between = 'Measure around the fullest part of your chest. Between sizes? Pick the bigger one.';

export const SIZE_GUIDES: Record<string, SizeGuide> = {
  tee: { columns: ['Size', 'Chest', 'Length', 'Shoulder'], rows: [['S', 38, 27, 17], ['M', 40, 28, 18], ['L', 42, 29, 19], ['XL', 44, 30, 20], ['XXL', 46, 31, 21]], note: between },
  hoodie: { columns: ['Size', 'Chest', 'Length', 'Sleeve'], rows: [['S', 40, 26, 24], ['M', 42, 27, 24.5], ['L', 44, 28, 25], ['XL', 46, 29, 25.5], ['XXL', 48, 30, 26]], note: between },
  kurta: { columns: ['Size', 'Chest', 'Waist', 'Length'], rows: [['XS', 34, 28, 44], ['S', 36, 30, 44], ['M', 38, 32, 44], ['L', 40, 34, 45], ['XL', 42, 36, 45], ['XXL', 44, 38, 46]], note: between + ' Or choose Custom and we’ll stitch to your measurements.' },
  denim: { columns: ['Size', 'Chest', 'Shoulder', 'Length'], rows: [['S', 38, 16.5, 25], ['M', 40, 17.5, 26], ['L', 42, 18.5, 27], ['XL', 44, 19.5, 28]], note: between },
  lehenga: { columns: ['Size', 'Bust', 'Waist', 'Hip'], rows: [['XS', 32, 26, 35], ['S', 34, 28, 37], ['M', 36, 30, 39], ['L', 38, 32, 41], ['XL', 40, 34, 43]], note: 'Made to measure: after you order, we WhatsApp you for exact measurements. Pick your closest size here.' },
};
