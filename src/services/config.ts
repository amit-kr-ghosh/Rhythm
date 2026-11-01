import Constants from 'expo-constants';

/** Public (client-safe) configuration. Only the anon/publishable key is ever shipped — never a service-role key. */
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '',
  googleAuthEnabled: (process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED ?? 'false') === 'true',
};

export const cloudConfigured = (): boolean =>
  /^https?:\/\//.test(config.supabaseUrl) && config.supabaseAnonKey.length > 20 && !/YOUR[_-]/i.test(config.supabaseAnonKey);
