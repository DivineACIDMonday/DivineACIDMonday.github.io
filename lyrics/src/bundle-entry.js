const meSpeak = require('./mespeak_p/src/index.js');
meSpeak.loadConfig(require('./mespeak_p/src/mespeak_config.json'));
meSpeak.loadVoice(require('./mespeak_p/voices/en/en-us.json'));
window.meSpeak = meSpeak;
