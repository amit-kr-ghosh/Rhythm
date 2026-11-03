import { store } from '../../src/state/store';
import { startAlertWatcher, testAlert, dismissAlert } from '../../src/state/alertRuntime';
import * as alerts from '../../src/services/alerts';
import * as notifications from '../../src/services/notifications';
import { scheduleSound } from '../../src/services/webAudioSynth';
import { SOUNDS, soundForEvent, soundLength } from '../../src/domain/sounds';
import { SOUND_IDS, DEFAULT_ALERT_PREFS } from '../../src/domain/alerts';
import { startTimer, pause } from '../../src/domain/timer';
(window as unknown as { R: unknown }).R = { store, startAlertWatcher, testAlert, dismissAlert, alerts, notifications, scheduleSound, SOUNDS, soundForEvent, soundLength, SOUND_IDS, DEFAULT_ALERT_PREFS, startTimer, pause };
