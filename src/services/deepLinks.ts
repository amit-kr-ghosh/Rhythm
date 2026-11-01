import { router } from 'expo-router';
import { toDateKey } from '../domain/time';

/** Route a tapped notification to the screen it is about. Unknown payloads are ignored. */
export function handleNotificationTap(data: Record<string, string>): void {
  switch (data.type) {
    case 'occurrence':
      if (data.key && data.date) router.push({ pathname: '/occurrence', params: { key: data.key, date: data.date } } as never);
      break;
    case 'task': if (data.id) router.push(`/task/${data.id}` as never); break;
    case 'habit': router.push('/(tabs)' as never); break;
    case 'goals': router.push('/(tabs)' as never); break;
    case 'summary': router.push(`/summary/${toDateKey(new Date())}` as never); break;
    case 'quote': router.push('/motivation' as never); break;
    case 'timer': router.push('/(tabs)/focus' as never); break;
    default: break;
  }
}
