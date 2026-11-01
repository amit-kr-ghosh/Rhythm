import './polyfills';
import { AppState, Platform } from 'react-native';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { config, cloudConfigured } from './config';
import { secureStorage } from './secureStorage';
import type { CloudClient, CloudError } from '../data/syncEngine';

WebBrowser.maybeCompleteAuthSession();

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
    });
    // Keep tokens fresh only while the app is in the foreground.
    AppState.addEventListener('change', (s) => {
      if (!client) return;
      if (s === 'active') void client.auth.startAutoRefresh(); else void client.auth.stopAutoRefresh();
    });
  }
  return client;
}

export type AuthResult = { ok: true; needsEmailConfirmation?: boolean } | { ok: false; message: string };
const fail = (e: unknown): AuthResult => ({ ok: false, message: friendlyAuthError(e) });

export function friendlyAuthError(e: unknown): string {
  const m = (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)).toLowerCase();
  if (m.includes('invalid login')) return 'Email or password is incorrect.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try signing in.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('network') || m.includes('fetch') || m.includes('failed to')) return 'No connection. Check your internet and try again.';
  if (m.includes('password')) return 'Password does not meet the requirements.';
  return 'Something went wrong. Please try again.';
}

export const auth = {
  available: cloudConfigured,

  async session(): Promise<Session | null> {
    const sb = supabase(); if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  onChange(cb: (s: Session | null) => void): () => void {
    const sb = supabase(); if (!sb) return () => undefined;
    const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s));
    return () => data.subscription.unsubscribe();
  },

  async signUp(email: string, password: string): Promise<AuthResult> {
    const sb = supabase(); if (!sb) return { ok: false, message: 'Cloud sync is not configured in this build.' };
    try {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: Linking.createURL('auth/callback') } });
      if (error) return fail(error);
      return { ok: true, needsEmailConfirmation: !data.session };
    } catch (e) { return fail(e); }
  },

  async signIn(email: string, password: string): Promise<AuthResult> {
    const sb = supabase(); if (!sb) return { ok: false, message: 'Cloud sync is not configured in this build.' };
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      return error ? fail(error) : { ok: true };
    } catch (e) { return fail(e); }
  },

  async sendPasswordReset(email: string): Promise<AuthResult> {
    const sb = supabase(); if (!sb) return { ok: false, message: 'Cloud sync is not configured in this build.' };
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL('auth/reset') });
      return error ? fail(error) : { ok: true };
    } catch (e) { return fail(e); }
  },

  /** Complete a recovery/confirmation deep link (`?code=` PKCE) and return whether a session now exists. */
  async handleAuthLink(url: string): Promise<AuthResult> {
    const sb = supabase(); if (!sb) return { ok: false, message: 'Cloud sync is not configured in this build.' };
    try {
      const code = new URL(url).searchParams.get('code');
      if (!code) return { ok: false, message: 'This link is invalid or has expired.' };
      const { error } = await sb.auth.exchangeCodeForSession(code);
      return error ? fail(error) : { ok: true };
    } catch (e) { return fail(e); }
  },

  async updatePassword(password: string): Promise<AuthResult> {
    const sb = supabase(); if (!sb) return { ok: false, message: 'Cloud sync is not configured in this build.' };
    try {
      const { error } = await sb.auth.updateUser({ password });
      return error ? fail(error) : { ok: true };
    } catch (e) { return fail(e); }
  },

  /** Optional: only offered when EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true and the Google provider is configured in Supabase. */
  async signInWithGoogle(): Promise<AuthResult> {
    const sb = supabase(); if (!sb) return { ok: false, message: 'Cloud sync is not configured in this build.' };
    try {
      const redirectTo = Linking.createURL('auth/callback');
      if (Platform.OS === 'web') {
        // Browser: a normal full-page redirect to Google and back to /auth/callback, where the PKCE code is exchanged.
        const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
        return error ? fail(error) : { ok: true };
      }
      const { data, error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) return fail(error ?? new Error('No URL'));
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success') return { ok: false, message: 'Google sign-in was cancelled.' };
      return this.handleAuthLink(res.url);
    } catch (e) { return fail(e); }
  },

  async signOut(): Promise<void> {
    const sb = supabase(); if (!sb) return;
    try { await sb.auth.signOut(); } catch { /* local session cleared below */ }
    await secureStorage.removeItem('supabase.auth.token');
  },

  /** Deletes all of this user's cloud rows via the delete_my_data() SQL function (RLS-safe, no service key). */
  async deleteCloudData(): Promise<AuthResult> {
    const sb = supabase(); if (!sb) return { ok: true };
    try {
      const { error } = await sb.rpc('delete_my_data');
      return error ? fail(error) : { ok: true };
    } catch (e) { return fail(e); }
  },
};

/** The sync engine's view of Supabase. Maps PostgREST errors to { status, code, message }. */
export function makeCloudClient(getUserId: () => string | null): CloudClient {
  const toErr = (e: { message?: string; code?: string }, status: number): CloudError => ({
    status: status > 0 ? status : undefined, code: e.code, message: e.message,
  });
  return {
    userId: getUserId,
    async upsert(table, rows, onConflict) {
      const sb = supabase(); if (!sb) throw { message: 'offline: cloud not configured' };
      const idCol = onConflict === 'user_id' ? 'user_id' : 'id';
      const { data, error, status } = await sb.from(table).upsert(rows, { onConflict }).select(idCol);
      if (error) throw toErr(error, status);
      const applied = (data ?? []) as unknown as Record<string, string>[];
      return onConflict === 'user_id' ? (applied.length ? ['applied'] : []) : applied.map((r) => String(r.id));
    },
    async fetchChanged(table, cursor, limit) {
      const sb = supabase(); if (!sb) throw { message: 'offline: cloud not configured' };
      let q = sb.from(table).select('*').order('server_updated_at', { ascending: true }).limit(limit);
      if (cursor) q = q.gte('server_updated_at', cursor);
      const { data, error, status } = await q;
      if (error) throw toErr(error, status);
      return (data ?? []) as Record<string, unknown>[];
    },
    async refreshSession() {
      const sb = supabase(); if (!sb) return false;
      const { data, error } = await sb.auth.refreshSession();
      return !error && !!data.session;
    },
  };
}
