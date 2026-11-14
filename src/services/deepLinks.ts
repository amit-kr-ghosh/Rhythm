import { router } from 'expo-router';

/** Route a tapped notification to the screen it is about. Unknown payloads are ignored. */
export function handleNotificationTap(data: Record<string, string>): void {
  switch (data.type) {
    case 'task': if (data.id) router.push(`/task/${data.id}` as never); break;
    case 'habit': router.push('/(tabs)' as never); break;
    case 'goals': router.push('/(tabs)' as never); break;
    case 'quote': router.push('/motivation' as never); break;
    case 'timer': router.push('/(tabs)/focus' as never); break;
    default: break;
  }
}
