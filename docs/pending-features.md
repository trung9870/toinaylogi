# Đang dở: film list live-fetch + tier SSS/A/OK

Hai tính năng đang được thêm vào app. Backend đã xong, **UI trong `page.tsx` và cập nhật `AGENTS.md` vẫn chưa làm** — đây là việc cần tiếp tục.

## Bối cảnh

1. Bấm vào **tên** một diễn viên đã yêu thích → hiện danh sách phim mới nhất (mới → cũ), fetch trực tiếp mỗi lần bấm, không phải data đông cứng theo snapshot tuần.
2. Diễn viên yêu thích có thể gán **tier tự chọn: SSS > A > OK** (kèm icon), đồng bộ qua nhiều thiết bị của cùng 1 người dùng.

Tính năng (2) cần đăng nhập thật → đây là lý do app chuyển hẳn sang chạy **local trên máy riêng** (mini PC, xem `setup.md` ở gốc repo) thay vì deploy public lên Vercel: nội dung 18+ + hosting công khai có vùng xám thật với chính sách Vercel (đã tra trực tiếp AUP: cấm nội dung *"sexually exploitative"*, và có thể xử lý ở cấp account chứ không chỉ 1 project). Chạy local + Tailscale loại bỏ hoàn toàn rủi ro đó — không còn PaaS nào serve nội dung ra công khai.

`AGENTS.md` hiện tại vẫn ghi "No backend, OAuth/login... do not add login, account screens, backend endpoints or database clients" — đây là chủ đích **cố tình đi ngược lại** vì cần đồng bộ đa thiết bị (Supabase Auth, không phải cookie/localStorage). Việc chạy local giải quyết vế "public hosting", còn vế "có backend/login" vẫn là thay đổi có chủ đích cần phản ánh lại trong `AGENTS.md`.

## Đã xong (backend)

- `src/lib/supabase.ts` — browser client singleton, đọc `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `src/hooks/use-auth.ts` — `useAuth()`: `user`, `loading`, `signInWithEmail(email)` (magic link), `signOut()`.
- `src/hooks/use-favorites.ts` — viết lại hoàn toàn (trước đây là `localStorage`): giờ đọc/ghi bảng Supabase `favorites` khi đã đăng nhập. Trả về `{ favorites, tiers, count, isFavorite, tierOf, toggleFavorite, setTier, signedIn, loading }`. **Lưu ý**: `toggleFavorite`/`setTier` no-op nếu `!signedIn` — UI phải tự mở dialog đăng nhập khi user bấm mà chưa đăng nhập (chưa làm).
- `src/hooks/use-actress-films.ts` — `useActressFilms()`: `{ films, status, load(avBaseUrl), reset() }`, fetch on-demand (không tự chạy khi mount).
- `src/app/api/actress-films/route.ts` — `GET ?avBaseUrl=...` → fetch AvBase bằng `Impit` (cấu hình y hệt `src/server/jav-crawler/avbase.ts`), parse `__NEXT_DATA__.props.pageProps.works`, trả `{films: [{code, title, date}]}` mới nhất trước.
- `src/lib/i18n.ts` — đã thêm đủ khoá cho cả `vi`/`en`: `favoriteTiers`, `setTierLabel`, `filmsDialogSubtitle/Loading/Unavailable/Empty/NoProfile`, `signInButton/Title/Description/EmailPlaceholder/Submit/Sent/Error/Required`, `signOutButton`.
- Supabase project thật đã tạo: id `lnnrrupjhljbargzfkvp` (org `phmukumybeixlwfsmhhb`), bảng `favorites` (`user_id`, `actress_id`, `tier` check `SSS|A|OK`, RLS `auth.uid() = user_id`). Credentials đã có sẵn trong `.env` — xem `setup.md` để copy sang máy mới.
- `pnpm typecheck && pnpm lint && pnpm build` đều pass ở trạng thái hiện tại (route/hooks mới tồn tại nhưng chưa được `page.tsx` import/gọi tới).

## Còn thiếu (UI — `src/app/page.tsx`)

Đọc kỹ file trước khi sửa — đây là file lớn (~915 dòng), nhiều chỗ chạm vào favorites.

1. **Import mới**: `useAuth` từ `@/hooks/use-auth`; `useActressFilms` từ `@/hooks/use-actress-films`; icon `Crown, Award, ThumbsUp, LogIn` (hoặc tương tự) từ `lucide-react`; `FAVORITE_TIERS`, `type FavoriteTier` từ `@/hooks/use-favorites`.

2. **`Home()`**: gọi `const { user, signInWithEmail, signOut } = useAuth();`. Destructure `useFavorites()` cần thêm `tierOf, setTier, signedIn`. Thêm state cho dialog đăng nhập (`authDialogOpen`, `authEmail`, `authSent`, `authError`) và dialog film list (`filmsActress: Actress | null`, dùng `useActressFilms()`).

3. **Gate đăng nhập**: mọi nơi đang gọi `toggleFavorite(id)` trực tiếp (nút tim trên `Card` ~dòng 166, nút tim trong dialog kết quả ~dòng 795) cần đổi thành 1 handler kiểu:
   ```ts
   const handleToggleFavorite = useCallback((id: string) => {
     if (!signedIn) { setAuthDialogOpen(true); return; }
     toggleFavorite(id);
   }, [signedIn, toggleFavorite]);
   ```
   Không gate ngầm — nếu chưa đăng nhập mà bấm tim, phải **mở dialog đăng nhập** chứ không im lặng không làm gì (hook `toggleFavorite` đã no-op khi `!user`, nhưng UI phải phản hồi).

4. **Tier picker** (Component `Card`, ~dòng 118-188): thêm props `favoriteTier?: FavoriteTier`, `onSetTier?: (tier: FavoriteTier) => void`. Khi `isFavorite` true, hiện 3 nút icon nhỏ (Crown=SSS, Award=A, ThumbsUp=OK — `t.favoriteTiers[tier]` cho label), `onClick` phải `stopPropagation()` để không trigger click của cả card. Badge tier hiện luôn trên card (không cần mở gì) khi đã có `favoriteTier`.

5. **Tên diễn viên clickable** (dòng 184 `<strong>{actress.name}</strong>` trong `Card`, và dòng 597 `<DialogTitle>{result.name}</DialogTitle>` trong dialog kết quả): khi `isFavorite(actress.id)` true, bọc bằng `<button>` gọi `openFilms(actress)` (nhớ `stopPropagation`), mở dialog film mới.

6. **Dialog film mới**: đặt sau dialog `revealed` hiện có (~dòng 821), dùng pattern `Dialog`/`DialogContent`/`DialogTitle`/`DialogDescription` giống `preferences-panel.tsx`. Trạng thái theo `status` từ `useActressFilms`: `idle`→ẩn, `loading`→`t.filmsLoading`, `unavailable`→`t.filmsUnavailable`, `empty`→`t.filmsEmpty`, không có `avBaseUrl`→`t.filmsNoProfile` (check trước khi gọi `load`). Mỗi phim: ngày (format theo `language` như các chỗ khác trong file) · code · title, link ra `https://missav.ws/search/<code>` (giống `contributingMovies` hiện có ở dòng 733-745).

7. **Dialog đăng nhập**: nút mới trong `<header>` (cạnh `github-button` ~dòng 473) — chưa đăng nhập thì icon + `t.signInButton`, mở dialog; đã đăng nhập thì hiện email rút gọn/icon, bấm → `void signOut()`. Dialog: input email + submit gọi `signInWithEmail`, set `authSent`, bắt lỗi vào `authError`. Xem field i18n đã có sẵn (`signInTitle`, `signInDescription`, `signInEmailPlaceholder`, `signInSubmit`, `signInSent`, `signInError`).

8. **CSS** (`src/app/globals.css` — đọc trước để theo đúng convention màu sắc/spacing hiện có, đặc biệt style quanh `.card-top-bar`, `.heart-bookmark-btn`, `.winner-fav-btn`): cần class mới cho tier picker (`.favorite-tier-picker`, `.tier-pick-btn`, active state), badge tier trên card, `.actress-name-link` (tên bấm được, không được trông như link thường vỡ layout), dialog film (`.films-dialog`, `.films-list`, mỗi dòng phim), dialog đăng nhập (`.auth-dialog`, input, nút submit).

9. **Update `AGENTS.md`**: sửa 3 đoạn (dòng 6, 10, 16 — xem git blame/nội dung hiện tại) để phản ánh: app giờ **chạy local + Tailscale** (không phải public hosting), dùng Supabase Auth + bảng `favorites` (RLS theo `auth.uid()`) cho đồng bộ favorites/tier đa thiết bị — không còn đúng như câu "No backend, OAuth/login" nữa.

## Kiểm tra sau khi xong

- `pnpm typecheck && pnpm lint && pnpm build`.
- `pnpm dev`, thử: chưa đăng nhập bấm tim → dialog đăng nhập hiện ra. Đăng nhập bằng email thật → nhận link → xác nhận `user` có giá trị. Favorite 1 diễn viên có `avBaseUrl` (VD Satsuki Nao trong snapshot hiện có) → đặt tier SSS → bấm tên → dialog film hiện danh sách mới nhất trước. Mở trình duyệt khác (hoặc ẩn danh), đăng nhập cùng email → xác nhận favorite + tier xuất hiện lại (chứng minh đồng bộ qua Supabase).
- Actress không có `avBaseUrl` → xác nhận hiện `t.filmsNoProfile`, không crash.
