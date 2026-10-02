#!/usr/bin/env python3
"""Builds assets/pincodes.tsv (pincode -> city, state) for the pincode lookup (GET /v1/pincodes/:pin).

Source: India Post's All India Pincode Directory (Department of Posts, published on data.gov.in under the
Government Open Data License - India), as packaged in the npm module `india-pincode` (165,627 post offices).
Run it again only to refresh the data:  python3 apps/api/scripts/build-pincodes.py

Per pincode: the state and district most of its post offices belong to (head and sub offices count more than
branch offices). The city is the district name, with metro districts given their city name (Mumbai Suburban ->
Mumbai, Bengaluru Urban -> Bengaluru, Delhi's districts -> Delhi or New Delhi).
"""
import collections
import gzip
import hashlib
import io
import json
import os
import re
import tarfile
import urllib.request

PACKAGE = 'https://registry.npmjs.org/india-pincode/-/india-pincode-2.5.9.tgz'
SHA256 = '08476bb0c6cbd497e16ea721ac17e640df1a512abde3ea81cdf0bcc0364157fb'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'pincodes.tsv')
CHECKOUT_TS = os.path.join(HERE, '..', '..', '..', 'packages', 'shared', 'src', 'checkout.ts')

CITY_ALIASES = {
    'MUMBAI SUBURBAN': 'Mumbai', 'BENGALURU URBAN': 'Bengaluru', 'BENGALURU': 'Bengaluru', 'PONDICHERRY': 'Puducherry',
    'LAKSHADWEEP DISTRICT': 'Lakshadweep', 'LEH LADAKH': 'Leh', 'KAMRUP METRO': 'Guwahati', 'AHMADABAD': 'Ahmedabad',
    'Y.S.R.': 'Kadapa', 'S.A.S NAGAR': 'Mohali', '24 PARAGANAS NORTH': 'North 24 Parganas',
    '24 PARAGANAS SOUTH': 'South 24 Parganas',
}
WEIGHT = {'HO': 3, 'PO': 2, 'SO': 2, 'BO': 1}


def title(s: str) -> str:
    words = re.split(r'(\s+|-)', s.strip().lower())
    small = {'and', 'of', 'the'}
    def one(i, w):
        if re.fullmatch(r'([a-z]\.)+[a-z]?', w):  # initials like S.A.S.
            return w.upper()
        return w if i and w in small else w[:1].upper() + w[1:]
    return re.sub(r'\s+', ' ', ''.join(one(i, w) for i, w in enumerate(words)))


def states_list() -> list[str]:
    src = open(CHECKOUT_TS, encoding='utf-8').read()
    block = src[src.index('INDIAN_STATES = ['):]
    block = block[:block.index(']')]
    return re.findall(r"'([^']+)'", block)


def main():
    raw = urllib.request.urlopen(PACKAGE, timeout=120).read()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != SHA256:
        raise SystemExit(f'unexpected download (sha256 {digest}); check the package and update SHA256')
    with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
        offices = json.load(gzip.open(tar.extractfile('package/data/pincodes.json.gz')))
    known = {s.upper(): s for s in states_list()}
    known['THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU'] = known['DADRA AND NAGAR HAVELI AND DAMAN AND DIU']

    by_pin = collections.defaultdict(list)
    for o in offices:
        by_pin[o['p']].append(o)

    def vote(rows, key):
        score = collections.Counter()
        for o in rows:
            score[o[key]] += WEIGHT.get(o['t'], 1) + (1 if o.get('d') else 0)
        return score.most_common(1)[0][0] if score else None

    # pincodes whose offices all lack a state borrow the usual state of their 3-digit prefix
    prefix_state = collections.defaultdict(collections.Counter)
    for pin, rows in by_pin.items():
        for o in rows:
            if o['s'] in known:
                prefix_state[pin[:3]][o['s']] += 1

    lines, unknown = [], 0
    for pin in sorted(by_pin):
        rows = [o for o in by_pin[pin] if o['s'] in known]
        state = vote(rows, 's') if rows else (prefix_state[pin[:3]].most_common(1)[0][0] if prefix_state[pin[:3]] else None)
        if not state:
            unknown += 1
            continue
        rows = [o for o in rows if o['s'] == state] or by_pin[pin]
        district = vote([o for o in rows if o['i'].strip().upper() not in ('', 'NA')], 'i') or ''
        up = district.strip().upper()
        offices = ' '.join(o['o'].lower() for o in by_pin[pin] if o['t'] != 'BO')
        if not up:
            city = ''  # unknown district: the state is still filled in
        elif known[state] == 'Delhi':
            city = 'New Delhi' if up == 'NEW DELHI' else 'Delhi'
        elif up == 'GAUTAM BUDDHA NAGAR' and 'noida' in offices:
            city = 'Greater Noida' if 'greater noida' in offices else 'Noida'
        elif known[state] == 'Sikkim' and up.endswith(' DISTRICT'):
            city = title(up.replace(' DISTRICT', ' Sikkim'))
        else:
            city = CITY_ALIASES.get(up) or title(district)
        lines.append(f'{pin}\t{city}\t{known[state]}')

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('# pincode\tcity\tstate. India Post All India Pincode Directory (data.gov.in, GODL-India); '
                'made by scripts/build-pincodes.py\n')
        f.write('\n'.join(lines) + '\n')
    print(f'{len(lines)} pincodes written to {os.path.normpath(OUT)} ({unknown} without a state skipped)')


if __name__ == '__main__':
    main()
