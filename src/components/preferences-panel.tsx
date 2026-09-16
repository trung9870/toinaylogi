'use client';

import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Actress } from '@/lib/actresses';
import { tierNames } from '@/lib/actresses';
import { emptyProfile, type ActressProfile } from '@/lib/actress-preferences';
import type { Preferences } from '@/hooks/use-preferences';
import type { Language } from '@/lib/i18n';

export function PreferencesPanel({
  preferences,
  actresses,
  language,
  disabled,
  variant = 'header',
}: {
  preferences: Preferences;
  actresses: Actress[];
  language: Language;
  disabled: boolean;
  variant?: 'header' | 'inventory';
}) {
  const vi = language === 'vi';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ActressProfile>(emptyProfile);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setDraft(preferences.profile), [preferences.profile]);
  const shown = useMemo(
    () =>
      actresses.filter((item) =>
        item.name
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
      ),
    [actresses, search],
  );
  const update = (next: ActressProfile) => {
    setDraft(next);
    preferences.save(next);
  };
  const enabledCount = actresses.filter(
    (item) =>
      draft.enabledTiers[item.tier] && !draft.disabled.includes(item.id),
  ).length;
  return (
    <>
      <button
        className={
          variant === 'inventory'
            ? 'customize-food-button'
            : 'preferences-button'
        }
        disabled={disabled}
        onClick={() => {
          setDraft(preferences.profile);
          setSearch('');
          setConfirmDelete(false);
          setOpen(true);
        }}
        aria-label={vi ? 'Tuỳ chỉnh pool diễn viên' : 'Customize actress pool'}
      >
        <SlidersHorizontal size={variant === 'inventory' ? 16 : 17} />
        <span>{vi ? 'Tuỳ chỉnh' : 'Customize'}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="preferences-dialog">
          <DialogTitle>{vi ? 'Pool diễn viên' : 'Actress pool'}</DialogTitle>
          <DialogDescription>
            {vi
              ? 'Bộ lọc và danh sách loại trừ tự lưu bằng cookie trên máy này.'
              : 'Tier filters and exclusions are automatically saved in cookies on this computer.'}
          </DialogDescription>
          <div
            className="tier-filter-list"
            aria-label={vi ? 'Lọc tier' : 'Filter tiers'}
          >
            {tierNames.map((tier, index) => (
              <label key={tier} className="pool-row">
                <input
                  type="checkbox"
                  checked={draft.enabledTiers[index]}
                  onChange={(event) => {
                    const enabledTiers = [...draft.enabledTiers];
                    enabledTiers[index] = event.target.checked;
                    update({ ...draft, enabledTiers });
                  }}
                />
                <span>{tier}</span>
                <small>
                  {actresses.filter((item) => item.tier === index).length}
                </small>
              </label>
            ))}
          </div>
          <input
            className="pool-search"
            placeholder={vi ? 'Tìm diễn viên…' : 'Search actresses…'}
            aria-label={vi ? 'Tìm diễn viên' : 'Search actresses'}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="pool-list">
            {shown.map((item) => (
              <label className="pool-row" key={item.id}>
                <input
                  type="checkbox"
                  checked={!draft.disabled.includes(item.id)}
                  onChange={(event) =>
                    update({
                      ...draft,
                      disabled: event.target.checked
                        ? draft.disabled.filter((id) => id !== item.id)
                        : [...draft.disabled, item.id],
                    })
                  }
                />
                <span>{item.name}</span>
                <small>{tierNames[item.tier]}</small>
              </label>
            ))}
          </div>
          <div className="pool-save">
            <small>
              {enabledCount}{' '}
              {vi ? 'diễn viên có thể quay' : 'eligible actresses'}
            </small>
            <button
              className="subtle-button"
              onClick={() => update({ ...draft, disabled: [] })}
            >
              {vi ? 'Bật lại tất cả' : 'Enable all'}
            </button>
          </div>
          <div className="preferences-bottom">
            <button onClick={() => setDraft(preferences.reload())}>
              {vi ? 'Tải lại cookie' : 'Reload cookies'}
            </button>
            <button onClick={() => setConfirmDelete(!confirmDelete)}>
              {vi ? 'Đặt lại lựa chọn' : 'Reset preferences'}
            </button>
          </div>
          {confirmDelete && (
            <div className="delete-confirm">
              <p>
                {vi
                  ? 'Xóa toàn bộ bộ lọc và loại trừ trên trình duyệt này?'
                  : 'Clear all filters and exclusions on this browser?'}
              </p>
              <button onClick={() => preferences.remove() && setOpen(false)}>
                {vi ? 'Xác nhận xóa' : 'Confirm reset'}
              </button>
            </div>
          )}
          {preferences.error && (
            <p className="preferences-message" role="status">
              {preferences.error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
