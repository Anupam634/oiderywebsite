'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { AdminDashboard } from '@store/shared';
import { adminApi, setAdmin, useAdmin } from '@/lib/admin-api';
import { Bag, Box, Close, Gear, Grid, Home, Logo, Logout, Menu, Needle, Star, Tag, Users } from '../icons';

const NAV: { href: string; label: string; icon: ReactNode; count?: (d: AdminDashboard['todo']) => number }[] = [
  { href: '/admin', label: 'Dashboard', icon: <Home /> },
  { href: '/admin/orders', label: 'Orders', icon: <Bag />, count: (t) => t.toShip },
  { href: '/admin/production', label: 'Production', icon: <Needle />, count: (t) => t.proofsToMake + t.changesRequested },
  { href: '/admin/products', label: 'Products', icon: <Box /> },
  { href: '/admin/categories', label: 'Categories', icon: <Grid /> },
  { href: '/admin/coupons', label: 'Coupons', icon: <Tag /> },
  { href: '/admin/reviews', label: 'Reviews', icon: <Star />, count: (t) => t.reviewsToCheck },
  { href: '/admin/customers', label: 'Customers', icon: <Users /> },
  { href: '/admin/settings', label: 'Settings', icon: <Gear /> },
];

/** Sidebar layout for the studio admin; sends anyone not logged in to /admin/login. */
export function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const me = useAdmin();
  const [todo, setTodo] = useState<AdminDashboard['todo'] | null>(null);
  const [open, setOpen] = useState(false);
  const bare = path === '/admin/login' || path.endsWith('/slip');

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!bare && me === null) router.replace(`/admin/login?next=${encodeURIComponent(path)}`);
  }, [me, bare, path, router]);
  useEffect(() => {
    if (!me || bare) return;
    const load = () => adminApi.dashboard().then((d) => setTodo(d.todo), () => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [me, bare, path]);

  if (bare) return <>{children}</>;
  if (!me) return <div className="adm" aria-busy="true" />;
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  return (
    <div className={`adm${open ? ' menu-open' : ''}`}>
      <aside className="side" aria-label="Admin menu">
        <Link className="brand" href="/admin"><Logo /><span>taanka<small>Studio admin</small></span></Link>
        <nav className="nav">
          {NAV.map((n) => {
            const c = todo && n.count ? n.count(todo) : 0;
            return (
              <Link key={n.href} href={n.href} className={active(n.href) ? 'on' : ''}>
                {n.icon}
                {n.label}
                {c > 0 && <b>{c}</b>}
              </Link>
            );
          })}
        </nav>
        <div className="who">
          <b>{me.name}</b>
          <span>{me.role === 'OWNER' ? 'Owner' : 'Staff'} · {me.email}</span>
          <div>
            <button type="button" onClick={async () => { await adminApi.logout().catch(() => undefined); setAdmin(null); router.replace('/admin/login'); }}>
              <Logout style={{ width: 15, height: 15, display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Log out
            </button>
          </div>
          <Link href="/" style={{ display: 'block', marginTop: 10, color: '#CFC6DD', fontWeight: 700 }}>View the shop ↗</Link>
        </div>
      </aside>
      <div>
        <div className="topbar">
          <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <Close /> : <Menu />}</button>
          taanka studio admin
        </div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
