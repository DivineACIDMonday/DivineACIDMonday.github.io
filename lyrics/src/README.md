# Sources for the Divine Lyric Oracle voice

- `mespeak.bundle.js` is meSpeak 2.0.2 (eSpeak compiled to JavaScript, GPL) bundled with esbuild from `bundle-entry.js`.
- `mespeak-index-patched.js` is meSpeak's `src/index.js` with one change: the engine restarts from clean copies of its data files every 50 calls, which avoids eSpeak's file system wearing out after about 80 calls.
- eSpeak and meSpeak are free software under the GNU GPL; their full sources are at https://github.com/mikolalysenko/mespeak and http://espeak.sourceforge.net.
- `lame.min.js` is lamejs 1.2.1 (LGPL), https://github.com/zhuker/lamejs.
