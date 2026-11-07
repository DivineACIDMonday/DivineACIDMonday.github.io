# Builds percussion/index.html from app.html + perc-engine.js. Usage: python3 percussion/src/build.py
import os
D = os.path.dirname(os.path.abspath(__file__))
app = open(D + '/app.html', encoding='utf8').read(); eng = open(D + '/perc-engine.js', encoding='utf8').read()
out = app.replace('<!--ENGINE-->', '<script>\n' + eng + '\n</script>')
open(os.path.join(D, '..', 'index.html'), 'w', encoding='utf8').write(out); print(len(out))
