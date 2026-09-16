'use client';

import Link from 'next/link';
import { flushSync } from 'react-dom';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Box,
  CircleHelp,
  ExternalLink,
  Heart,
  Sparkles,
  Star,
  StarHalf,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { readCookie, writeCookie } from '@/lib/cookies';
import {
  chooseTiered,
  createSpinProfile,
  spinProgress,
  stopFraction,
} from '@/lib/case-mechanics';
import { type Actress } from '@/lib/actresses';
import { copy, type Language } from '@/lib/i18n';
import { useActressSnapshot } from '@/hooks/use-actress-snapshot';
import { useFavorites } from '@/hooks/use-favorites';
import { useLocalSpinCount } from '@/hooks/use-local-spin-count';
import { useServerSpinCount } from '@/hooks/use-server-spin-count';
import { usePreferences } from '@/hooks/use-preferences';
import { eligibleActresses } from '@/lib/actress-preferences';
import { PreferencesPanel } from '@/components/preferences-panel';
import { CaseAudio } from '@/lib/case-audio';
import { TAG_VI_TO_EN } from '@/lib/tag-translations';
import { isDirectCardDialogEnabled } from '@/lib/direct-card-dialog';

const colors = ['#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#e4ae39'];
const reelStep = 254;
const reelInitialOffset = -400;

function formatBirthDate(value: string, language: Language) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    dateStyle: 'long',
  }).format(new Date(year, month - 1, day));
}

function StarRating({
  score,
  showScore = true,
  max = 5,
}: {
  score: number;
  showScore?: boolean;
  max?: number;
}) {
  const starScore = Math.min(max, Math.max(0, score / 2));
  return (
    <div
      className="star-rating"
      title={`${score.toFixed(2)}/10 (${starScore.toFixed(2)}/${max})`}
    >
      <div className="star-icons" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => {
          if (starScore >= i - 0.25) {
            return (
              <Star
                key={i}
                size={13}
                className="star-icon star-full"
                fill="currentColor"
                stroke="currentColor"
              />
            );
          }
          if (starScore >= i - 0.75) {
            return (
              <StarHalf
                key={i}
                size={13}
                className="star-icon star-half"
                fill="currentColor"
                stroke="currentColor"
              />
            );
          }
          return (
            <Star
              key={i}
              size={13}
              className="star-icon star-empty"
              stroke="currentColor"
              fill="none"
            />
          );
        })}
      </div>
      {showScore && <span className="star-score">{starScore.toFixed(1)}</span>}
    </div>
  );
}

function ActressImage({ actress, alt }: { actress: Actress; alt: string }) {
  // Cached user-generated image dimensions vary; avoid optimizer routes for local snapshots.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="actress-image" src={actress.imagePath} alt={alt} />
  );
}

const Card = memo(function Card({
  actress,
  language,
  small = false,
  slot,
  onClick,
  isFavorite,
  onToggleFavorite,
}: {
  actress: Actress;
  language: Language;
  small?: boolean;
  slot?: number;
  onClick?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <div
      className={`actress-card ${small ? 'small' : ''} ${onClick ? 'clickable' : ''}`}
      data-slot-id={slot}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? actress.name : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={
        {
          '--rarity': colors[actress.tier],
          ...(slot === undefined
            ? {}
            : { position: 'absolute', left: slot * reelStep }),
        } as React.CSSProperties
      }
    >
      <div className="card-top-bar">
        <span className="tier">{copy[language].tiers[actress.tier]}</span>
        {onToggleFavorite && (
          <button
            className={`heart-bookmark-btn ${isFavorite ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            aria-label="Toggle favorite"
            title={isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}
          >
            <Heart
              size={13}
              fill={isFavorite ? '#ef4444' : 'none'}
              stroke={isFavorite ? '#ef4444' : 'currentColor'}
            />
          </button>
        )}
      </div>
      <ActressImage actress={actress} alt={actress.name} />
      <div className="card-copy">
        <strong>{actress.name}</strong>
      </div>
    </div>
  );
});

export default function Home() {
  const { snapshot, status, error } = useActressSnapshot();
  const preferences = usePreferences();
  const { favorites, isFavorite, toggleFavorite, count: favoritesCount } = useFavorites();
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
  const { count: localSpins, recordSpin } = useLocalSpinCount();
  const {
    count: serverSpins,
    status: serverSpinStatus,
    increment: recordServerSpin,
  } = useServerSpinCount();
  const [language, setLanguage] = useState<Language>('vi');
  const [sound, setSound] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Actress | null>(null);
  const [lastChoice, setLastChoice] = useState<Actress | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [active, setActive] = useState<Actress[]>([]);
  const [reel, setReel] = useState<{ actress: Actress; id: number }[]>([]);
  const [visibleStart, setVisibleStart] = useState(0);
  const busy = useRef(false);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const position = useRef(-400);
  const frame = useRef(0);
  const audio = useRef<CaseAudio | null>(null);
  const t = copy[language];

  useEffect(() => {
    const saved = readCookie<Language>('language');
    const next = saved === 'en' ? 'en' : 'vi';
    setLanguage(next);
    document.documentElement.lang = next;
  }, []);
  const changeLanguage = (next: Language) => {
    setLanguage(next);
    document.documentElement.lang = next;
    try {
      writeCookie('language', next);
    } catch {}
  };
  useEffect(() => {
    document.title = language === 'vi' ? 'Tối Nay Lọ Gì?' : 'Who tonight?';
  }, [language]);
  useEffect(() => {
    const engine = new CaseAudio();
    audio.current = engine;
    engine.preload();
    const handleVisibility = () => {
      if (document.hidden) engine.pause();
      else engine.recover();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      engine.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(() => {
    if (snapshot && !spinning) setActive(snapshot.actresses);
  }, [snapshot, spinning]);
  const eligible = useMemo(
    () => eligibleActresses(active, preferences.profile),
    [active, preferences.profile],
  );
  useEffect(() => {
    if (!eligible.length) {
      setReel([]);
      setVisibleStart(0);
      position.current = reelInitialOffset;
      if (track.current)
        track.current.style.transform = `translate3d(${position.current}px,0,0)`;
      return;
    }
    const firstSlot = Math.floor(Math.random() * eligible.length);
    setReel(
      Array.from({ length: 12 }, (_, index) => {
        const id = firstSlot + index;
        return { id, actress: eligible[id % eligible.length] };
      }),
    );
    setVisibleStart(firstSlot);
    position.current = reelInitialOffset - firstSlot * reelStep;
    if (track.current)
      track.current.style.transform = `translate3d(${position.current}px,0,0)`;
  }, [eligible]);
  useEffect(() => {
    const last = readCookie<{ id?: unknown }>('last-choice');
    if (last?.id && typeof last.id === 'string') {
      const found = active.find((item) => item.id === last.id) ?? null;
      setResult(found);
      setLastChoice(found);
    }
  }, [active]);
  const attachTrack = useCallback((node: HTMLDivElement | null) => {
    track.current = node;
    if (node) node.style.transform = `translate3d(${position.current}px,0,0)`;
  }, []);

  function open() {
    if (busy.current || !eligible.length || !track.current || !viewport.current)
      return;
    audio.current?.unlock();
    busy.current = true;
    const winner = chooseTiered(eligible);
    const step = reelStep,
      tileWidth = 240,
      width = viewport.current.clientWidth;
    const start = position.current;
    const center = Math.floor((width / 2 - start) / step);
    const profile = createSpinProfile(
      Math.random,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    const target = center + profile.tiles;
    const end = width / 2 - tileWidth * stopFraction() - target * step;
    const current = reel.filter(
      ({ id }) => id >= Math.max(0, center - 6) && id <= target + 4,
    );
    let last = current.length
      ? Math.max(...current.map((item) => item.id))
      : center;
    const recent: Actress[] = [];
    while (last < target + 4) {
      last++;
      const options = eligible.filter((item) => !recent.includes(item));
      const actress =
        last === target
          ? winner
          : chooseTiered(options.length ? options : eligible);
      current.push({ id: last, actress });
      recent.push(actress);
      if (recent.length > 8) recent.shift();
    }
    flushSync(() => {
      setReel(current);
      setSpinning(true);
      setResult(null);
    });
    audio.current?.play('csgo_ui_crate_open');
    const began = performance.now();
    let shown = visibleStart;
    let lastCell = Math.floor((start - width / 2) / step);
    const animate = (now: number) => {
      const progress = Math.max(
        0,
        Math.min(1, (now - began) / profile.durationMs),
      );
      const next =
        start + (end - start) * spinProgress(progress, profile.friction);
      position.current = next;
      const first = Math.max(0, Math.floor(-next / step));
      if (first - shown >= 4 || first < shown) {
        shown = Math.max(0, first - 2);
        setVisibleStart(shown);
      }
      if (track.current)
        track.current.style.transform = `translate3d(${next}px,0,0)`;
      const cell = Math.floor((next - width / 2) / step);
      while (cell !== lastCell) {
        lastCell += cell > lastCell ? 1 : -1;
        audio.current?.play('csgo_ui_crate_item_scroll');
      }
      if (progress < 1) {
        frame.current = requestAnimationFrame(animate);
        return;
      }
      recordSpin(winner);
      void recordServerSpin();
      busy.current = false;
      setSpinning(false);
      setResult(winner);
      setLastChoice(winner);
      setRevealed(true);
      audio.current?.play(
        (
          [
            'item_reveal3_rare',
            'item_reveal4_mythical',
            'item_reveal5_legendary',
            'item_reveal6_ancient',
            'item_reveal6_ancient',
          ] as const
        )[winner.tier],
      );
    };
    frame.current = requestAnimationFrame(animate);
  }

  const allowDirectCardDialog = isDirectCardDialogEnabled();

  const handleCardClick = useCallback(
    (actress: Actress) => {
      if (!allowDirectCardDialog || spinning || busy.current) return;
      setResult(actress);
      setRevealed(true);
    },
    [allowDirectCardDialog, spinning],
  );

  const filteredActresses = useMemo(() => {
    if (!filterFavoritesOnly) return eligible;
    return eligible.filter((actress) => favorites.includes(actress.id));
  }, [eligible, filterFavoritesOnly, favorites]);

  const inventory = useMemo(
    () =>
      [...filteredActresses]
        .sort(
          (a, b) => b.tier - a.tier || a.publicName.localeCompare(b.publicName),
        )
        .map((actress) => (
          <Card
            key={actress.id}
            actress={actress}
            language={language}
            small
            isFavorite={isFavorite(actress.id)}
            onToggleFavorite={() => toggleFavorite(actress.id)}
            onClick={
              allowDirectCardDialog ? () => handleCardClick(actress) : undefined
            }
          />
        )),
    [filteredActresses, language, allowDirectCardDialog, handleCardClick, isFavorite, toggleFavorite],
  );
  if (!snapshot)
    return (
      <main className="cache-state">
        <h1>Tối Nay Lọ Gì?</h1>
        <p>{error ? t.cacheError : t.loading}</p>
        <small>{status.message}</small>
      </main>
    );

  return (
    <div className="site-shell">
      <header>
        <Link href="/" className="brand">
          <CircleHelp className="brand-case" size={24} strokeWidth={2.5} />
          <span>
            TỐI NAY <b>LỌ GÌ?</b>
          </span>
        </Link>
        <div className="header-actions">
          <button
            className={`favorites-header-button ${filterFavoritesOnly ? 'active' : ''}`}
            onClick={() => setFilterFavoritesOnly(!filterFavoritesOnly)}
            aria-label="Favorites"
            title={language === 'vi' ? 'Xem danh sách yêu thích' : 'View favorites'}
          >
            <Heart
              size={15}
              fill={favoritesCount > 0 ? '#ef4444' : 'none'}
              stroke={favoritesCount > 0 ? '#ef4444' : 'currentColor'}
            />
            <span className="fav-count">{favoritesCount}</span>
          </button>
          <PreferencesPanel
            preferences={preferences}
            actresses={active}
            language={language}
            disabled={spinning}
          />
          <button
            className="language-button"
            onClick={() => changeLanguage(language === 'vi' ? 'en' : 'vi')}
            aria-label={t.language}
          >
            {language === 'vi' ? 'EN' : 'VI'}
          </button>
          <button
            className="sound-button"
            onClick={() => {
              audio.current?.setMuted(sound);
              setSound(!sound);
            }}
            aria-label={sound ? t.turnSoundOff : t.turnSoundOn}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <a
            className="github-button"
            href="https://github.com/zennomi/toinaylogi"
            target="_blank"
            rel="noreferrer"
            aria-label={t.github}
          >
            GitHub <ExternalLink size={14} />
          </a>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <h1>{t.subtitle}</h1>
          </div>
          <div className="stattrak-container" title={t.serverCounterTitle}>
            <div className="stattrak-badge">
              <span className="stattrak-label">{t.stattrakLabel}</span>
              <span className="stattrak-caption">{t.stattrakSpins}</span>
              <span
                className="stattrak-digits"
                aria-label={
                  serverSpinStatus === 'unavailable'
                    ? t.serverCounterUnavailable
                    : undefined
                }
              >
                {serverSpins === null
                  ? '—'
                  : String(serverSpins).padStart(6, '0')}
              </span>
            </div>
          </div>
        </div>
        {status.state === 'refreshing' && (
          <p className="refresh-status" role="status">
            {t.refreshing}
          </p>
        )}
        {status.state === 'error' && (
          <p className="preferences-message" role="status">
            {status.message || t.cacheError}
          </p>
        )}
        {!eligible.length && (
          <p className="preferences-message">{t.noEligible}</p>
        )}
        <div className="cs-case-heading">
          <div className="cs-case-emblem" aria-hidden="true">
            <Box size={20} />
          </div>
          <div className="cs-case-info">
            <span className="cs-case-subtitle">{t.crateCollection}</span>
            <h2 className="cs-case-title">{t.crateTitle}</h2>
          </div>
          <div className={`cs-case-status ${spinning ? 'opening' : 'ready'}`}>
            <span className="cs-case-status-dot" />
            <span>{spinning ? t.openingCase : t.readyToOpen}</span>
          </div>
        </div>
        <section className="case-panel" aria-label={t.caseLabel}>
          <div className="reel-window" ref={viewport}>
            <div className="selector-line">
              <div className="selector-marker top" />
              <div className="selector-marker bottom" />
            </div>
            <div className="reel-track" ref={attachTrack}>
              {reel
                .filter(
                  ({ id }) => id >= visibleStart && id < visibleStart + 12,
                )
                .map(({ actress, id }) => (
                  <Card
                    key={id}
                    actress={actress}
                    language={language}
                    slot={id}
                  />
                ))}
            </div>
            <div className="reel-fade left" />
            <div className="reel-fade right" />
          </div>
        </section>
        <div className="control-bar">
          <div className="last-choice-slot">
            <span className="last-choice-tag">
              {t.lastChoice} ({localSpins}):
            </span>
            {lastChoice ? (
              <div className="last-choice-card">
                <span
                  className="last-choice-tier-pill"
                  style={
                    {
                      '--rarity': colors[lastChoice.tier],
                    } as React.CSSProperties
                  }
                >
                  {t.tiers[lastChoice.tier]}
                </span>
                <strong className="last-choice-name">
                  {lastChoice.name}
                </strong>
              </div>
            ) : (
              <span className="last-choice-empty">—</span>
            )}
          </div>
          <button
            className="open-button"
            disabled={spinning || !eligible.length}
            onClick={open}
          >
            {spinning ? <AudioLines size={22} /> : <Sparkles size={21} />}
            {spinning ? t.opening : result ? t.openAgain : t.open}
          </button>
        </div>
        <Dialog open={revealed} onOpenChange={setRevealed}>
          <DialogContent className="winner-dialog" showCloseButton={false}>
            {result && (
              <>
                <DialogTitle className="winner-title">
                  {result.name}
                </DialogTitle>
                {(result.nativeName || result.nameReading || result.age) && (
                  <p className="winner-native-name">
                    {[
                      result.nativeName,
                      result.nameReading,
                      result.age ? `${result.age} ${t.ageUnit}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                <DialogDescription className="winner-description">
                  {t.tiers[result.tier]}
                </DialogDescription>
                <div
                  className="winner-art"
                  style={
                    { '--rarity': colors[result.tier] } as React.CSSProperties
                  }
                >
                  <ActressImage actress={result} alt={result.name} />
                </div>
                {(result.birthDate ||
                  result.heightCm ||
                  result.debutYear ||
                  result.bustCm ||
                  result.waistCm ||
                  result.hipCm ||
                  result.cup ||
                  result.bloodType ||
                  result.videoCount) && (
                  <div className="winner-details">
                    <div className="winner-detail">
                      <span>{t.profile}</span>
                      <strong>
                        {[
                          result.birthDate
                            ? formatBirthDate(result.birthDate, language)
                            : null,
                          result.heightCm ? `${result.heightCm} cm` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </strong>
                      {result.debutYear && (
                        <small className="winner-subdetail">
                          {`${t.debut}: ${result.debutYear}`}
                        </small>
                      )}
                    </div>

                    <div className="winner-detail">
                      <span>{t.measurements}</span>
                      <strong>
                        {result.bustCm ||
                        result.waistCm ||
                        result.hipCm ||
                        result.cup
                          ? `B${result.bustCm ?? '—'}${result.cup ? ` (${result.cup.replace(/-Cup$/i, '').trim()})` : ''} · W${result.waistCm ?? '—'} · H${result.hipCm ?? '—'} cm`
                          : '—'}
                      </strong>
                      {(result.bloodType || result.videoCount) && (
                        <small className="winner-subdetail">
                          {[
                            result.bloodType
                              ? `${t.bloodType}: ${result.bloodType}`
                              : null,
                            result.videoCount
                              ? `${result.videoCount} ${t.videoCountUnit}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      )}
                    </div>
                  </div>
                )}

                {result.ratings && (
                  <div className="winner-ratings-card">
                    <div className="winner-ratings-header">
                      <span className="winner-ratings-label">{t.ratings}</span>
                      {result.ratings.overall !== undefined && (
                        <div className="winner-rating-overall">
                          <span className="overall-label">
                            {t.overallScore}
                          </span>
                          <StarRating score={result.ratings.overall} />
                        </div>
                      )}
                    </div>
                    <div className="winner-ratings-grid">
                      {result.ratings.looks !== undefined && (
                        <div className="winner-rating-item">
                          <span className="rating-name">{t.looksScore}</span>
                          <StarRating score={result.ratings.looks} />
                        </div>
                      )}
                      {result.ratings.body !== undefined && (
                        <div className="winner-rating-item">
                          <span className="rating-name">{t.bodyScore}</span>
                          <StarRating score={result.ratings.body} />
                        </div>
                      )}
                      {result.ratings.charm !== undefined && (
                        <div className="winner-rating-item">
                          <span className="rating-name">{t.charmScore}</span>
                          <StarRating score={result.ratings.charm} />
                        </div>
                      )}
                      {result.ratings.eroticAppeal !== undefined && (
                        <div className="winner-rating-item">
                          <span className="rating-name">
                            {t.eroticAppealScore}
                          </span>
                          <StarRating score={result.ratings.eroticAppeal} />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {result.tags && result.tags.length > 0 && (
                  <div className="winner-tags" aria-label={t.tags}>
                    {result.tags.map((tag) => (
                      <span key={tag} className="winner-tag">
                        {language === 'en' && TAG_VI_TO_EN[tag]
                          ? TAG_VI_TO_EN[tag]
                          : tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="winner-profile">
                  <strong>{t.topFilms}</strong>
                  {result.contributingMovies.map((movie) => (
                    <a
                      key={movie.code}
                      href={`https://missav.ws/search/${encodeURIComponent(movie.code)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      #{movie.rank} · {movie.code} <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
                {result.socialLinks.length > 0 && (
                  <div className="winner-socials">
                    {result.socialLinks.map((social, index) => (
                      <a
                        key={`${social.label}-${social.url}-${index}`}
                        href={social.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {social.label}
                        {social.handle ? ` @${social.handle}` : ''}{' '}
                        <ExternalLink size={12} />
                      </a>
                    ))}
                  </div>
                )}
                {(result.wikipediaUrl || result.minnanoAvUrl) && (
                  <div className="winner-socials winner-reference-links">
                    {result.wikipediaUrl && (
                      <a
                        href={result.wikipediaUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.wikipedia} <ExternalLink size={12} />
                      </a>
                    )}
                    {result.minnanoAvUrl && (
                      <a
                        href={result.minnanoAvUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.minnanoAvProfile} <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                )}
                <div className="winner-actions">
                  <a
                    className="find-button"
                    href={`https://www.google.com/search?q=${encodeURIComponent(result.nativeName || result.name)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>{t.source}</span>
                    <ExternalLink size={16} />
                  </a>
                  <button
                    className={`winner-fav-btn ${isFavorite(result.id) ? 'active' : ''}`}
                    onClick={() => toggleFavorite(result.id)}
                    title={isFavorite(result.id) ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
                  >
                    <Heart
                      size={15}
                      fill={isFavorite(result.id) ? '#ef4444' : 'none'}
                      stroke={isFavorite(result.id) ? '#ef4444' : 'currentColor'}
                    />
                    <span>
                      {isFavorite(result.id)
                        ? language === 'vi'
                          ? 'Đã thích'
                          : 'Liked'
                        : language === 'vi'
                          ? 'Yêu thích'
                          : 'Favorite'}
                    </span>
                  </button>
                  <button onClick={() => setRevealed(false)}>
                    {t.continue}
                  </button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
        <section className="inventory">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{t.whatsInside}</span>
              <div className="inventory-title-row">
                <h2>
                  {t.items} <span>{eligible.length}</span>
                </h2>
                <div className="inventory-tabs">
                  <button
                    className={`tab-btn ${!filterFavoritesOnly ? 'active' : ''}`}
                    onClick={() => setFilterFavoritesOnly(false)}
                  >
                    {language === 'vi' ? 'Tất cả' : 'All'} ({eligible.length})
                  </button>
                  <button
                    className={`tab-btn ${filterFavoritesOnly ? 'active' : ''}`}
                    onClick={() => setFilterFavoritesOnly(true)}
                  >
                    <Heart
                      size={12}
                      fill={favoritesCount > 0 ? '#ef4444' : 'none'}
                      stroke={favoritesCount > 0 ? '#ef4444' : 'currentColor'}
                    />
                    {language === 'vi' ? 'Yêu thích' : 'Favorites'} ({favoritesCount})
                  </button>
                </div>
                <PreferencesPanel
                  preferences={preferences}
                  actresses={active}
                  language={language}
                  disabled={spinning}
                  variant="inventory"
                />
              </div>
            </div>
            <div className="rarity-legend">
              {t.tiers.map((tier, index) => (
                <span key={tier}>
                  <i style={{ background: colors[index] }} />
                  {tier}
                </span>
              ))}
            </div>
          </div>
          <div className="inventory-grid">{inventory}</div>
        </section>
        <footer>
          <div className="footer-left">
            <span>
              Tối Nay Lọ Gì? ·{' '}
              <a href="/privacy.html">
                {language === 'vi' ? 'Quyền riêng tư' : 'Privacy'}
              </a>{' '}
              ·{' '}
              <a href="/terms.html">
                {language === 'vi' ? 'Điều khoản' : 'Terms'}
              </a>
            </span>
            <span className="footer-source">
              {t.sourceData}{' '}
              {new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
                dateStyle: 'medium',
              }).format(new Date(snapshot.createdAt))}
            </span>
          </div>
          <div className="footer-right">
            <span>
              {t.inspiredBy}{' '}
              <a
                href="https://github.com/nagisanzenin/truanayangi"
                target="_blank"
                rel="noreferrer"
              >
                nagisanzenin/truanayangi
              </a>
            </span>
            <span>
              {t.adultNote} {t.footer}{' '}
              <a
                href="https://github.com/sourcesounds/csgo"
                target="_blank"
                rel="noreferrer"
              >
                SourceSounds
              </a>
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
