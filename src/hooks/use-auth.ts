import { useCallback, useEffect, useState } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabaseBrowserClient } from '@/lib/supabase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = supabaseBrowserClient();
    let live = true;
    supabase.auth.getUser().then((result: { data: { user: User | null } }) => {
      if (!live) return;
      setUser(result.data.user);
      setLoading(false);
    });
    const result = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!live) return;
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );
    const subscription = result.data.subscription;
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const { error } = await supabaseBrowserClient().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window === 'undefined' ? undefined : window.location.origin,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabaseBrowserClient().auth.signOut();
  }, []);

  return { user, loading, signInWithEmail, signOut };
}
