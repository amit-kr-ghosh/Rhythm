// Stand-in for react-native when bundling the web alert layer for a real-browser test (the real one needs Expo).
export const Platform = { OS: 'web' as const };
export const AppState = { addEventListener: () => ({ remove() { /* noop */ } }) };
export const Vibration = { vibrate() { /* noop */ }, cancel() { /* noop */ } };
