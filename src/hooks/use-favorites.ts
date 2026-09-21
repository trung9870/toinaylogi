import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './use-auth';
import { supabaseBrowserClient } from '@/lib/supabase';

export type FavoriteTier = 'SSS' | 'A' | 'OK';
export const FAVORITE_TIERS: FavoriteTier[] = ['SSS', 'A', 'OK'];

type Row = { actress_id: string; tier: FavoriteTier };

export function useFavorites() {
  const { user, loading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [tiers, setTiers] = useState<Record<string, FavoriteTier>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setFavorites([]);
      setTiers({});
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    supabaseBrowserClient()
      .from('favorites')
      .select('actress_id, tier')
      .then((result: { data: unknown; error: unknown }) => {
        if (!live) return;
        const rows = (result.error ? [] : (result.data as Row[] | null)) ?? [];
        setFavorites(rows.map((row) => row.actress_id));
        setTiers(
          Object.fromEntries(rows.map((row) => [row.actress_id, row.tier])),
        );
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [user, authLoading]);

  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites],
  );

  const toggleFavorite = useCallback(
    (id: string) => {
      if (!user) return;
      const supabase = supabaseBrowserClient();
      const alreadyFavorite = favorites.includes(id);
      if (alreadyFavorite) {
        setFavorites((prev) => prev.filter((item) => item !== id));
        setTiers((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        void supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('actress_id', id);
      } else {
        setFavorites((prev) => [...prev, id]);
        setTiers((prev) => ({ ...prev, [id]: 'OK' }));
        void supabase
          .from('favorites')
          .upsert({ user_id: user.id, actress_id: id, tier: 'OK' });
      }
    },
    [user, favorites],
  );

  const setTier = useCallback(
    (id: string, tier: FavoriteTier) => {
      if (!user || !favorites.includes(id)) return;
      setTiers((prev) => ({ ...prev, [id]: tier }));
      void supabaseBrowserClient()
        .from('favorites')
        .upsert({ user_id: user.id, actress_id: id, tier });
    },
    [user, favorites],
  );

  return {
    favorites,
    tiers,
    count: favorites.length,
    isFavorite,
    tierOf: (id: string) => tiers[id],
    toggleFavorite,
    setTier,
    signedIn: !!user,
    loading: authLoading || loading,
  };
}
