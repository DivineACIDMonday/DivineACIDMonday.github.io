# Builds vocal/index.html: the app with the Oracle words and the suite bar inlined.
import pathlib, re
d = pathlib.Path(__file__).parent
root = d.parent.parent
html = (d / 'app.html').read_text()
lyr = (root / 'lyrics' / 'index.html').read_text()
i = lyr.find('const W = '); words = lyr[i:lyr.find('\n', i)]
press = (root.parent / 'divine-music-machine-v7' / 'press' / 'src' / 'app.html').read_text()
a = press.find('<!-- Divine Monday suite bar'); b = press.find('</body>', a)
html = html.replace('/*WORDS*/', words, 1).replace('/*SUITEBAR*/', press[a:b].strip(), 1)
assert '</script' not in words
(d.parent / 'index.html').write_text(html)
print('built', len(html), 'bytes')
