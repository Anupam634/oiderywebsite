#!/usr/bin/env python3
"""Builds the self-hosted web fonts in apps/web/src/fonts from Google Fonts' sources (all SIL Open Font License).

The output is committed, so builds never fetch fonts. Run this only to change fonts or character sets:

    python3 -m pip install fonttools brotli
    python3 apps/web/scripts/build-fonts.py

What it does, to keep every page light:
- keeps only the characters the shop uses (Latin + ₹ + a few symbols; Devanagari for Hindi),
- drops TrueType hinting (about a third of each file; browsers render these sizes well without it),
- Fraunces: weights 400–800 and optical sizes stay variable; the SOFT axis is fixed at 100 (the soft look the
  headings use) and WONK at its default. That halves the file and changes no line lengths,
- Plus Jakarta Sans: weights 400–800 in one variable file (the CSS uses in-between weights like 650 and 750),
- Mukta: Devanagari only (it is the fallback for Hindi text; Jakarta draws everything else, including ₹),
- the embroidery name fonts (Pacifico, Playfair Display Bold Italic, Archivo Black, Yatra One) for the live preview.
"""
import io
import os
import sys
import tempfile
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.varLib.instancer import AxisTriple

# google/fonts commit the sources come from (pinned so a rebuild gives the same files)
GOOGLE_FONTS = '9710da1eacb3be272583c3224dcb70f9da6eadbb'
RAW = f'https://raw.githubusercontent.com/google/fonts/{GOOGLE_FONTS}/ofl/'

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'fonts')
CACHE = os.path.join(tempfile.gettempdir(), f'store-fonts-{GOOGLE_FONTS[:8]}')

# Google's "latin" subset plus ₹, arrows and the symbols the UI shows (★ ✓ ✦ ●)
LATIN = ('U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,'
         'U+20AC,U+20B9,U+2122,U+2190-2199,U+2212,U+2215,U+25CF,U+2605-2606,U+2713,U+2726,U+FEFF,U+FFFD')
# Google's "devanagari" subset without ₹ (Jakarta has it); keep in sync with the unicode-range in src/lib/fonts.ts
DEVANAGARI = 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+25CC,U+A830-A839,U+A8E0-A8FF'
BASIC_LATIN = 'U+0020-007E,U+00A0-00FF,U+2019'

FONTS = [
    # (output, source in google/fonts/ofl, characters, axis limits)
    ('jakarta.woff2', 'plusjakartasans/PlusJakartaSans[wght].ttf', LATIN, {'wght': (400, 800)}),
    ('fraunces.woff2', 'fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf', LATIN, {'wght': (400, 800), 'SOFT': 100, 'WONK': 1}),
    ('fraunces-italic.woff2', 'fraunces/Fraunces-Italic[SOFT,WONK,opsz,wght].ttf', LATIN, {'wght': (400, 800), 'SOFT': 100, 'WONK': 1}),
    ('mukta-500.woff2', 'mukta/Mukta-Medium.ttf', DEVANAGARI, None),
    ('mukta-600.woff2', 'mukta/Mukta-SemiBold.ttf', DEVANAGARI, None),
    ('mukta-700.woff2', 'mukta/Mukta-Bold.ttf', DEVANAGARI, None),
    ('mukta-800.woff2', 'mukta/Mukta-ExtraBold.ttf', DEVANAGARI, None),
    ('pacifico.woff2', 'pacifico/Pacifico-Regular.ttf', BASIC_LATIN, None),
    ('playfair-bold-italic.woff2', 'playfairdisplay/PlayfairDisplay-Italic[wght].ttf', BASIC_LATIN, {'wght': 700}),
    ('archivo-black.woff2', 'archivoblack/ArchivoBlack-Regular.ttf', BASIC_LATIN, None),
    ('yatra-one.woff2', 'yatraone/YatraOne-Regular.ttf', BASIC_LATIN + ',' + DEVANAGARI, None),
]
LICENCES = [('Plus Jakarta Sans', 'plusjakartasans'), ('Fraunces', 'fraunces'), ('Mukta', 'mukta'), ('Pacifico', 'pacifico'),
            ('Playfair Display', 'playfairdisplay'), ('Archivo Black', 'archivoblack'), ('Yatra One', 'yatraone')]


def fetch(rel: str) -> str:
    path = os.path.join(CACHE, rel.replace('/', '__'))
    if not os.path.exists(path):
        url = RAW + urllib.request.quote(rel)
        print('  downloading', rel)
        with urllib.request.urlopen(url, timeout=120) as r, open(path + '.part', 'wb') as f:
            f.write(r.read())
        os.replace(path + '.part', path)
    return path


def limits_of(spec):
    out = {}
    for axis, v in spec.items():
        # a range keeps the axis variable (its default moves inside the range); a number fixes it
        out[axis] = AxisTriple(v[0], v[1], v[1]) if isinstance(v, tuple) else v
    return out


def build(name, rel, chars, axes):
    font = TTFont(fetch(rel))
    opts = subset.Options()
    opts.layout_features = opts.layout_features + ['tnum']  # tabular figures are used for prices in tables
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(chars))
    sub.subset(font)
    if axes:
        buf = io.BytesIO()
        font.save(buf)
        buf.seek(0)
        font = instancer.instantiateVariableFont(TTFont(buf), limits_of(axes))
    font.flavor = 'woff2'
    out = os.path.join(OUT, name)
    font.save(out)
    print(f'  {name:28s} {os.path.getsize(out) / 1024:6.1f} KB')


def main():
    os.makedirs(CACHE, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    for args in FONTS:
        build(*args)
    with open(os.path.join(OUT, 'OFL.txt'), 'w', encoding='utf-8') as f:
        f.write('The fonts in this folder are subsets of fonts from Google Fonts (github.com/google/fonts),\n'
                'made by apps/web/scripts/build-fonts.py. Each is licensed under the SIL Open Font License 1.1:\n\n')
        for family, folder in LICENCES:
            with open(fetch(f'{folder}/OFL.txt'), encoding='utf-8') as lic:
                f.write(f'===== {family} =====\n\n{lic.read().strip()}\n\n')
    print('fonts written to', os.path.normpath(OUT))


if __name__ == '__main__':
    sys.exit(main())
