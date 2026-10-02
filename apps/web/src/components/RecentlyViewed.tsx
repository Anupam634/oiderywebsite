'use client';
import { useRecentlyViewed } from '@/lib/recent';
import { Rail } from './home/Rail';

/** "Recently viewed" for returning shoppers; nothing for new ones (it only appears below the fold, so no jump) */
export function RecentlyViewed({ exclude }: { exclude?: string }) {
  const items = useRecentlyViewed(exclude);
  if (items.length < 2) return null;
  return <Rail title="Recently viewed" sub="Pick up where you left off" items={items} />;
}
