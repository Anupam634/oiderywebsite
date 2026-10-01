import Link from 'next/link';

export const POLICY_LINKS = [
  ['/policies/shipping', 'Shipping policy'],
  ['/policies/refunds', 'Returns, refunds & cancellations'],
  ['/policies/terms', 'Terms of use'],
  ['/policies/privacy', 'Privacy policy'],
  ['/contact', 'Contact us'],
] as const;

export function PolicyNav({ current }: { current: string }) {
  return (
    <nav aria-label="Policies">
      {POLICY_LINKS.map(([href, label]) => (
        <Link key={href} href={href} className={href.endsWith(`/${current}`) ? 'on' : ''}>{label}</Link>
      ))}
    </nav>
  );
}
