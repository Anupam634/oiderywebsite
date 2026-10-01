import { cache } from 'react';
import type { CategoryNode } from '@store/shared';
import { api } from './api';

/** Category tree for menus; the site still renders (without menus) if the API is briefly down. */
export const getCategories = cache(async (): Promise<CategoryNode[]> => {
  try {
    return await api.categories();
  } catch (e) {
    console.error('categories unavailable', e);
    return [];
  }
});
