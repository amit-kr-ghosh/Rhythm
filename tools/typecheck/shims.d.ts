/**
 * SANDBOX-ONLY type shims.
 * Used by `tsconfig.shim.json` to type-check the app's OWN modules (state, actions, hooks, components, screens) when the
 * real React / React Native / Expo type packages cannot be installed. Third-party modules are `any`; React hooks are typed.
 * The authoritative check on a normal machine is `npm run typecheck` (real types).
 */
declare namespace React {
  type ReactNode = any;
  type ComponentProps<T> = any;
  type ElementType = any;
  interface Context<T> { Provider: any; __t?: T }
  function useState<T>(i: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  function useState<T = undefined>(): [T | undefined, (v: T | undefined | ((p: T | undefined) => T | undefined)) => void];
  function useEffect(f: () => void | (() => void), d?: readonly unknown[]): void;
  function useLayoutEffect(f: () => void | (() => void), d?: readonly unknown[]): void;
  function useMemo<T>(f: () => T, d: readonly unknown[]): T;
  function useCallback<T extends (...a: any[]) => any>(f: T, d: readonly unknown[]): T;
  function useRef<T>(i: T): { current: T };
  function createContext<T>(d: T): Context<T>;
  function useContext<T>(c: Context<T>): T;
  function useSyncExternalStore<T>(sub: (l: () => void) => () => void, get: () => T, server?: () => T): T;
  function useReducer<S, A>(r: (s: S, a: A) => S, i: S): [S, (a: A) => void];
  function memo<T>(c: T): T;
  const Children: { toArray(c: any): any[] };
}
declare module 'react' { export = React; }
declare namespace JSX {
  interface Element {}
  interface IntrinsicElements { [k: string]: any }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: any }
}
declare module 'react-native' {
  export type ColorValue = any; export type StyleProp<T> = any; export type ViewStyle = any; export type TextStyle = any;
  export const ActivityIndicator: any, KeyboardAvoidingView: any, Platform: any, Pressable: any, ScrollView: any, Text: any, View: any,
    Modal: any, Alert: any, BackHandler: any, Switch: any, TextInput: any, AccessibilityInfo: any, Appearance: any, StatusBar: any,
    AppState: any, FlatList: any, RefreshControl: any, Share: any, Linking: any, Image: any, Keyboard: any, Animated: any, Dimensions: any, Easing: any,
    LayoutAnimation: any, Vibration: any, StyleSheet: any, SectionList: any, TouchableOpacity: any;
  export function useColorScheme(): 'light' | 'dark' | null | undefined;
  export function useWindowDimensions(): { width: number; height: number; fontScale: number };
}
declare module 'react-native-safe-area-context';
declare module 'react-native-svg';
declare module 'react-native-reanimated';
declare module '@expo/vector-icons';
declare module '@react-native-async-storage/async-storage';
declare module '@react-native-community/netinfo';
declare module 'expo-router' {
  export function useLocalSearchParams<T = Record<string, string | undefined>>(): T;
  export const useRouter: any, Stack: any, Tabs: any, Redirect: any, Link: any, useSegments: any, usePathname: any, useFocusEffect: any, useNavigation: any, router: any, useRootNavigationState: any;
}
declare module 'expo-notifications' {
  export type AndroidImportance = any; export const AndroidImportance: any;
  export type NotificationPermissionsStatus = any;
  export const AndroidNotificationVisibility: any, SchedulableTriggerInputTypes: any;
  export const setNotificationChannelAsync: any, setNotificationHandler: any, addNotificationResponseReceivedListener: any,
    getPermissionsAsync: any, requestPermissionsAsync: any, cancelAllScheduledNotificationsAsync: any, scheduleNotificationAsync: any;
}
declare module 'expo-sqlite' {
  export function openDatabaseAsync(name: string): Promise<{ execAsync(s: string): Promise<void>; runAsync(s: string, p?: unknown[]): Promise<unknown>; getAllAsync<T>(s: string, p?: unknown[]): Promise<T[]> }>;
}
declare module 'expo-constants';
declare module 'expo-secure-store';
declare module 'expo-linking';
declare module 'expo-web-browser';
declare module 'expo-file-system';
declare module 'expo-status-bar';
declare module 'expo-sharing';
declare module 'expo-haptics';
declare module 'expo-splash-screen';
declare module 'react-native-url-polyfill/auto';
declare module '@supabase/supabase-js' {
  export type Session = { user: { id: string; email?: string | null } };
  export type SupabaseClient = any;
  export function createClient(url: string, key: string, opts?: unknown): SupabaseClient;
}
declare const process: { env: Record<string, string | undefined> };

declare module 'expo-router/html' { export const ScrollViewStyleReset: any; }
