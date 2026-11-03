
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsType from 'expo-notifications';
import type { Channel, PlannedNotification } from '../domain/notify';
import { store } from '../state/store';

export type PermissionState = 'granted' | 'denied' | 'undetermined';
export type NotificationSupport = 'supported' | 'ios-needs-install' | 'unsupported';

/** Browsers can lack notification support (notably iPhone Safari outside an installed web app); phones always have it. */
export const notificationSupport = (): NotificationSupport => 'supported';

let mod: typeof NotificationsType | null | undefined;

function N(): typeof NotificationsType | null {
  if (mod !== undefined) return mod;

  try {
    mod = require('expo-notifications') as typeof NotificationsType;
  } catch (error) {
    console.warn('expo-notifications unavailable:', error);
    mod = null;
  }

  return mod;
}

type Importance = 'DEFAULT' | 'HIGH' | 'LOW';

export const CHANNELS: Record<
  Channel,
  {
    name: string;
    description: string;
    importance: Importance;
  }
> = {
  activities: {
    name: 'Timetable',
    description: 'Upcoming activities from your timetable',
    importance: 'DEFAULT',
  },
  study: {
    name: 'Study sessions',
    description: 'Reminders before study blocks',
    importance: 'HIGH',
  },
  tasks: {
    name: 'Task deadlines',
    description: 'Tasks that are due soon',
    importance: 'DEFAULT',
  },
  goals: {
    name: 'Goals',
    description: 'Daily and weekly goal check-ins',
    importance: 'LOW',
  },
  breaks: {
    name: 'Breaks & focus timer',
    description: 'Break reminders and focus-session completion',
    importance: 'HIGH',
  },
  // Channels are immutable once created on a device, so the sound/vibration settings the timer needs live in a new channel id
  // instead of changing `breaks` (which existing installs already created without them).
  timer: {
    name: 'Timer alerts',
    description: 'Sound and vibration when a focus block, break or countdown ends',
    importance: 'HIGH',
  },
  habits: {
    name: 'Habits',
    description: 'Your habit reminders',
    importance: 'DEFAULT',
  },
  summary: {
    name: 'Daily summary',
    description: 'End-of-day summary',
    importance: 'LOW',
  },
  motivation: {
    name: 'Motivation',
    description: 'Quote of the day',
    importance: 'LOW',
  },
};

/**
 * Expo Go on Android cannot manage notification channels: its scoped channel manager throws a NullPointerException
 * ("getClass() on a null object") from setNotificationChannelAsync. Local notifications still work there and land in
 * the default channel, so in Expo Go we skip channels entirely. Development / production builds create them normally.
 */
const inExpoGo = (): boolean => Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let channelsReady = false;
let channelsUnavailable = false;
let channelWarned = false;
let channelsPromise: Promise<void> | null = null;

export async function ensureChannels(): Promise<void> {
  const Notifications = N();

  if (!Notifications || Platform.OS !== 'android' || channelsReady || channelsUnavailable) {
    return;
  }

  if (inExpoGo()) {
    channelsUnavailable = true;
    return;
  }

  if (channelsPromise) {
    return channelsPromise;
  }

  channelsPromise = (async () => {
    const importanceMap = {
      DEFAULT: Notifications.AndroidImportance.DEFAULT,
      HIGH: Notifications.AndroidImportance.HIGH,
      LOW: Notifications.AndroidImportance.LOW,
    };

    for (const [id, channel] of Object.entries(CHANNELS)) {
      try {
        const importance = importanceMap[channel.importance];

        if (importance == null) {
          console.warn(`Invalid notification importance: ${id}`);
          continue;
        }

        // Only pass keys that have a value: an `undefined` vibrationPattern reaches the Android module as null and
        // crashes it (NullPointerException in getClass()), which is what spammed the log in Expo Go.
        const options: NotificationsType.NotificationChannelInput = {
          name: channel.name,
          description: channel.description,
          importance,
          lockscreenVisibility:
            Notifications.AndroidNotificationVisibility.PRIVATE,
        };
        if (channel.importance !== 'LOW') {
          options.vibrationPattern = id === 'timer' ? [0, 250, 120, 250, 120, 500] : [0, 200];
          options.sound = 'default';
        }

        await Notifications.setNotificationChannelAsync(id, options);
      } catch (error) {
        // The native channel manager is broken in this environment: warn once, stop retrying the other channels, and
        // fall back to the default channel when scheduling.
        if (!channelWarned) {
          channelWarned = true;
          console.warn(`Could not create notification channel "${id}"; using the default channel instead:`, error);
        }
        channelsUnavailable = true;
        return;
      }
    }

    channelsReady = true;
  })();

  try {
    await channelsPromise;
  } finally {
    channelsPromise = null;
  }
}

export function initNotifications(
  onTap: (data: Record<string, string>) => void
): () => void {
  const Notifications = N();

  if (!Notifications) {
    return () => undefined;
  }

  try {
    Notifications.setNotificationHandler({
      // While the app is open, a timer notification still plays the system sound (it is the alert, unless sound is off in
      // Settings); other reminders stay quiet in the foreground because the screen already shows what is happening.
      handleNotification: async (notification) => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: notification.request.content.data?.type === 'timer' ? store.get().alertPrefs.sound : false,
        shouldSetBadge: false,
      }),
    });

    void ensureChannels().catch((error) => {
      console.warn('Notification initialization failed:', error);
    });

    const subscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as
          | Record<string, string>
          | undefined;

        if (data) {
          onTap(data);
        }
      });

    return () => subscription.remove();
  } catch (error) {
    console.warn('Notification setup unavailable:', error);
    return () => undefined;
  }
}

const mapStatus = (
  permission: NotificationsType.NotificationPermissionsStatus
): PermissionState => {
  if (permission.granted) return 'granted';

  return permission.status === 'undetermined'
    ? 'undetermined'
    : 'denied';
};

export async function getPermission(): Promise<PermissionState> {
  const Notifications = N();

  if (!Notifications) return 'denied';

  try {
    const permission = await Notifications.getPermissionsAsync();
    return mapStatus(permission);
  } catch (error) {
    console.warn('Could not get notification permission:', error);
    return 'denied';
  }
}

export async function requestPermission(): Promise<PermissionState> {
  const Notifications = N();

  if (!Notifications) return 'denied';

  try {
    await ensureChannels();

    const current = await Notifications.getPermissionsAsync();

    if (current.granted) return 'granted';

    if (
      current.canAskAgain === false &&
      current.status === 'denied'
    ) {
      return 'denied';
    }

    const result = await Notifications.requestPermissionsAsync();

    return mapStatus(result);
  } catch (error) {
    console.warn('Could not request notification permission:', error);
    return 'denied';
  }
}

let chain: Promise<unknown> = Promise.resolve();

export function applyPlan(
  planned: PlannedNotification[]
): Promise<number> {
  const job = chain.then(async () => {
    const Notifications = N();

    if (!Notifications) return 0;

    if ((await getPermission()) !== 'granted') {
      try {
        await Notifications.cancelAllScheduledNotificationsAsync();
      } catch (error) {
        console.warn('Could not cancel notifications:', error);
      }

      return 0;
    }

    await ensureChannels();

    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.warn('Could not clear previous notifications:', error);
      return 0;
    }

    let scheduled = 0;

    for (const notification of planned) {
      try {
        const trigger: NotificationsType.DateTriggerInput = {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(notification.at),
          ...(Platform.OS === 'android' && channelsReady
            ? { channelId: notification.channel }
            : {}),
        };

        await Notifications.scheduleNotificationAsync({
          identifier: notification.id,
          content: {
            title: notification.title,
            body: notification.body,
            data: notification.data,
            // iOS plays the sound named here; Android plays the channel's sound (set when the channel was created).
            sound: store.get().alertPrefs.sound,
          },
          trigger,
        });

        scheduled++;
      } catch (error) {
        console.warn(
          `Could not schedule notification "${notification.id}":`,
          error
        );
      }
    }

    return scheduled;
  });

  chain = job.catch(() => undefined);

  return job;
}

/** Show nothing: on a phone the OS notifications scheduled by applyPlan already cover the "app in background" case. */
export async function presentNow(_p: Pick<PlannedNotification, 'id' | 'title' | 'body' | 'data'>): Promise<boolean> { return false; }

/** Schedule a one-off test notification through the OS, so it can be seen firing with the app in the background. */
export async function scheduleTestNotification(seconds: number): Promise<boolean> {
  const Notifications = N();
  if (!Notifications || (await getPermission()) !== 'granted') return false;
  try {
    await ensureChannels();
    const trigger: NotificationsType.TimeIntervalTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(seconds)),
      ...(Platform.OS === 'android' && channelsReady ? { channelId: 'timer' } : {}),
    };
    await Notifications.scheduleNotificationAsync({
      identifier: 'rhythm-test-alert',
      content: { title: 'Rhythm test alert', body: 'This is how a finished focus block will sound and look.', data: { type: 'timer', test: '1' }, sound: store.get().alertPrefs.sound },
      trigger,
    });
    return true;
  } catch (error) {
    console.warn('Could not schedule the test notification:', error);
    return false;
  }
}
