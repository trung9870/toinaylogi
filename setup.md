# Setup trên mini PC (chạy 24/7, truy cập qua Tailscale)

App này **không còn deploy public** (đã gỡ khỏi Vercel + domain `homnay.logi.asia`). Lý do: nội dung 18+ + hosting công khai có vùng xám thật với chính sách các nền tảng PaaS (đã kiểm tra trực tiếp AUP của Vercel — cấm nội dung *"sexually exploitative"*, có thể xử lý ở cấp account). Hướng mới: chạy **local trên 1 máy chạy 24/7** (mini PC), truy cập từ các thiết bị khác qua **Tailscale** (mạng riêng ảo, không public ra internet, không mở port router).

Việc còn lại (tính năng mới đang code dở) mô tả ở `docs/pending-features.md` — đọc file đó SAU khi setup xong phần dưới đây.

## 1. Yêu cầu

- Node.js ≥ 22.12 và pnpm (theo `package.json` → `engines`, `packageManager`).
- Git.
- Redis (tùy chọn — chỉ phục vụ bộ đếm "STATTRAK" server-wide, không có vẫn chạy bình thường).
- Tailscale (để truy cập từ thiết bị khác mà không public).

## 2. Clone + cài đặt

```sh
git clone https://github.com/trung9870/toinaylogi.git
cd toinaylogi
pnpm install --frozen-lockfile
```

## 3. Cấu hình `.env`

Copy `.env.example` thành `.env` rồi điền:

```sh
cp .env.example .env
```

```dotenv
# Redis local (tùy chọn — không có Redis vẫn chạy được, chỉ mất bộ đếm server-wide)
REDIS_URL=redis://localhost:6379

NEXT_PUBLIC_DIRECT_CARD_DIALOG=false

# Supabase project THẬT đã tạo sẵn cho toinaylogi (project riêng, tách biệt khỏi
# mọi project Otama khác). Đây là publishable/anon key — an toàn để ghi thẳng vào
# đây, KHÔNG phải bí mật: mọi trình duyệt chạy app này đều nhận đúng key này qua
# bundle JS. Dữ liệu thật được bảo vệ bằng Row Level Security (RLS), không phải
# bằng việc giấu key.
NEXT_PUBLIC_SUPABASE_URL=https://lnnrrupjhljbargzfkvp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_-qZqVdki5wAoW5WGa-XWpg_ZtZxgfUO
```

## 4. Dữ liệu diễn viên (`public/actress-cache/`)

Thư mục này bị `.gitignore` (không đi theo `git clone`) — app sẽ báo lỗi "Chưa thể tải dữ liệu cục bộ" nếu thiếu. Chọn 1 trong 2 cách:

**Cách A — crawl mới trên mini PC** (sạch nhất, nếu mạng ở đó không bị chặn):

```sh
node -e "console.log(require('dns').lookup('jav.guru', (e,a)=>console.log(a)))"
```

Nếu không resolve về `127.0.0.1`/lỗi, mạng ổn → chạy:

```sh
redis-server &   # nếu có cài, không bắt buộc
pnpm data:refresh
```

Lệnh này crawl xong mới publish (giữ cache cũ nếu lỗi) — có thể mất vài phút.

**Cách B — copy dữ liệu có sẵn từ máy hiện tại** (máy Windows, `C:\Users\Sumi\toinaylogi\public\actress-cache`, đã có snapshot 97 diễn viên) — nếu mạng jav.guru bị chặn ở cả 2 máy. Copy nguyên thư mục `actress-cache` (qua USB, mạng LAN, hoặc `tailscale file cp` nếu cả 2 máy đã lên chung tailnet) vào đúng đường dẫn `toinaylogi/public/actress-cache` trên mini PC.

## 5. Chạy production, giữ sống 24/7

```sh
pnpm build
pnpm start   # next start, mặc định lắng nghe cổng 3000
```

Để tự khởi động lại khi crash/reboot máy — dùng process manager:

- **Linux**: `pm2 start "pnpm start" --name toinaylogi && pm2 save && pm2 startup` (hoặc viết 1 systemd unit gọi `pnpm start` trong thư mục repo).
- **Windows**: dùng [NSSM](https://nssm.cc/) để đăng ký `pnpm start` thành Windows Service, hoặc Task Scheduler với trigger "At startup".

Vì mọi thứ chạy trên 1 máy sống liên tục (khác Vercel serverless), **bộ crawler tự làm mới hàng tuần hoạt động đúng như thiết kế gốc** — không cần chạy `pnpm data:refresh` tay nữa sau lần đầu (trừ khi máy tắt lâu ngày).

## 6. Tailscale — truy cập từ các thiết bị khác

1. Cài Tailscale trên mini PC: https://tailscale.com/download — đăng nhập bằng tài khoản của bạn.
2. Cài Tailscale trên mọi thiết bị muốn truy cập (điện thoại, laptop khác) — đăng nhập **cùng tài khoản**.
3. Trên mini PC, xem hostname Tailscale:
   ```sh
   tailscale status
   ```
   Sẽ thấy dạng `100.x.x.x   ten-may   ...` hoặc hostname `ten-may.tailXXXX.ts.net`.
4. Từ thiết bị khác (đã join cùng tailnet), mở: `http://<hostname-hoặc-ip-tailscale>:3000` — **không cần domain, không cần mở port router, không public ra internet**.

## 7. Kiểm tra

```sh
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s http://localhost:3000/actress-cache/status.json
```

Cả hai phải trả `200` và `status.json` phải có `"state":"idle"`. Mở trình duyệt vào `http://localhost:3000` (hoặc qua Tailscale từ máy khác) — hòm diễn viên phải hiện ra, không còn "Chưa thể tải dữ liệu cục bộ".

## Việc tiếp theo

Đọc `docs/pending-features.md` — 2 tính năng (film list live-fetch + tier SSS/A/OK qua Supabase) đã xong phần backend (hooks, API route, Supabase project + bảng `favorites`), **còn thiếu phần UI trong `src/app/page.tsx` và cập nhật `AGENTS.md`**. File đó mô tả chi tiết từng việc cần làm.
