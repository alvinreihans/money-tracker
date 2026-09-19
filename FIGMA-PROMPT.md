# Figma Make — prompt untuk redesign Money Tracker

Tempel isi blok di bawah ke Figma Make. Sudah memuat struktur nyata aplikasi,
teks Indonesia yang dipakai sekarang, dan masalah desain yang mau dipecahkan.

Kalau mau mempersempit, hapus bagian screen yang tidak ingin didesain ulang —
tapi jangan hapus bagian **Product context** dan **Design problems**, dua itu
yang membuat hasilnya nyambung dengan aplikasi kita.

---

Design a mobile-first personal finance app called **Money Tracker**.

## Product context

An Indonesian user photographs shopping receipts and e-wallet payment
screenshots; the app reads them automatically and files them as transactions.
It also imports monthly bank statement PDFs. Most usage is one-handed, on a
phone, standing at a cashier or right after paying — so capture must be the
fastest thing on screen.

The user is a single person tracking their own money. Not a team product, no
sharing, no onboarding wizard.

## Non-negotiable constraints

- **All UI copy in Indonesian, casual register.** Use "kamu", never "Anda".
  Contractions and everyday words: "nggak" not "tidak", "bentar" not "sebentar".
  Copy strings are given verbatim below — use them exactly, do not translate to
  English and do not make them more formal.
- **Currency is Indonesian Rupiah, no decimals.** Format: `Rp 34.000`,
  `Rp 1,2 jt` when compact. Dot is the thousands separator.
- **Dates in Indonesian short form:** `9 Mar 2025`, `18 Jul 2024`.
- Must be implementable in **React + Tailwind CSS**. Avoid effects that need
  custom canvas or heavy illustration work.
- Design **light mode and dark mode** for every screen.
- Amounts are the most important thing on screen; they must be scannable in a
  fast vertical glance.

## Design problems to solve

The current build works but reads as a form, not a product. Fix these
specifically:

1. **No hierarchy.** The home screen is five stacked cards of identical visual
   weight: upload receipts, import statement, transaction list, a chart, and
   account settings. Capturing a receipt (daily) looks as important as editing
   the account list (once, ever).
2. **No navigation.** Everything lives on one long scroll. There is no nav bar,
   no tabs, nothing.
3. **Capture is buried.** Photographing a receipt is the core action and it is
   a plain bordered button halfway down the page.
4. **Empty states feel broken.** The chart only covers the last three *complete*
   months, so anything uploaded today shows nothing. Users read that as data
   loss. Empty states must explain, not just say "no data".
5. **Failed reads are invisible.** When a receipt can't be read, it is saved as
   a draft that needs a human to fix the amount. There is currently no visible
   queue of these — they just sit there.

## Screens

### 1. Home / dashboard

Top area — a monthly summary of three stat tiles:

- `Keluar bulan ini` — Rp 1.240.000 — with a delta line `↓ 12% vs Agustus`
  (down is good for spending — color plus an arrow, never color alone)
- `Masuk bulan ini` — Rp 3.500.000
- `Selisih` — +Rp 2.260.000 — caption `Masih surplus` (or `Lebih besar pasak`
  when negative)

A prominent capture affordance. Two entry points, camera is the primary one:
- `Foto pakai kamera`
- `Pilih gambar` (supports several files at once)

Transaction list, heading `Transaksi`, subtitle `Klik salah satu buat lihat
detailnya.` Each row: merchant name, a type chip, a date + category + payment
method line, and the amount right-aligned. Rows are tappable.

Type chips (three states, each needs its own treatment):
- `Keluar` — money spent
- `Masuk` — money received
- `Pindah kantong` — a transfer between the user's own accounts; explicitly not
  spending, so it must look different from the other two

A row can also carry a red `Perlu dibenerin` chip — the receipt failed to read
and the amount is wrong until a human fixes it.

Use these as sample rows, they are real:
```
Warteg Selera Bahari   Keluar              Rp 21.000
18 Sep 2026 · Makan · ShopeePay

Telkomsel              Keluar              Rp 188.700
9 Sep 2026 · Tagihan · GoPay

Top Up Shopee          Pindah kantong    Rp 7.840.000
2 Sep 2026 · Lainnya · BRI

Alfamart               Keluar  Perlu dibenerin   Rp 0
9 Mar 2025 · Belanja harian
```

Also on this screen, but clearly secondary to the above:
- a bar chart, `Rata-rata Pengeluaran per Kategori`, subtitle `Rerata bulanan
  selama 3 bulan terakhir`
- `Impor Rekening Koran` — a PDF upload for monthly bank statements
- `Rekening & Dompet Saya` — a list of the user's banks and e-wallets (SeaBank,
  BRI, Jago, ShopeePay, GoPay, DANA, OVO, Tunai), each with a type chip

Decide the navigation structure yourself. Splitting these into tabs or separate
screens is welcome — they do not have to stay on one scroll.

### 2. Upload queue

After picking or shooting several images, each one becomes a row with a
thumbnail and its own independent status:

- `Nunggu giliran` — queued
- processing — spinner plus a message that changes the longer it takes:
  `Lagi baca struknya...` → `Bentar, struknya agak panjang nih...` →
  `Ini borong satu toko atau gimana?` →
  `Sabar ya, lagi ngitung kerugian dompetmu...`
- success — shows merchant, amount, date, category
- `Nggak kebaca` — saved as a draft, caption `Disimpan jadi draft, nominalnya
  isi manual ya.`
- `Gagal` — with a one-line reason

Primary button reads `Proses 5 gambar`, and becomes `Upload lagi` once the queue
is finished. Design the transition between those two states.

### 3. Camera (fullscreen)

Live preview, a round shutter button, `Batal` and `Balik kamera`. Dark chrome.
Design a framing hint for holding a long receipt — receipts are tall and narrow
and users tilt them.

### 4. Transaction detail

Large amount at the top with the type chip. Below it a details list: Kategori,
Metode bayar, Rekening, Lawan transaksi, Keterangan, Masuk lewat (values:
`Foto struk`, `Bukti pembayaran`, `Rekening koran`, `Diketik manual`), Dicatat.
Rows with no value are hidden, not shown as dashes.

For a draft, an explanation block: heading `Kenapa perlu dibenerin`, body
`Struknya nggak berhasil dibaca, jadi nominalnya belum benar.` and the raw text
that was partially recognised, in a monospace block.

Actions: edit and delete. Delete asks `Yakin mau dihapus? Nggak bisa dibalikin.`

### 5. Login / register

One card, toggles between two modes.

- Sign in: Email, Password, a `Lupa password?` link next to the password label.
- Register: adds `Nomor HP (buat bot Telegram)`, helper text `Samain sama nomor
  Telegram kamu.`
- Headings: `Masuk` / `Daftar`. Subtitles: `Lanjut ke catatan keuanganmu.` /
  `Bikin akun dulu, bentar aja.`
- Footer link: `Belum punya akun? Daftar` / `Udah punya akun? Masuk`
- Error state, inline, one short line plus an escape action on the same row:
  `Email atau passwordnya nggak cocok.` + `Reset password`

### 6. Empty states

Design each of these; they are seen often and currently read as failures:

- No transactions yet: `Belum ada apa-apa. Upload struk dulu di atas.`
- Chart with no data in range: `Belum ada pengeluaran di rentang ini.` plus a
  smaller line explaining that it only counts the last three complete months, so
  this month's entries are not in it yet.
- No accounts registered: `Masih kosong. Pilih dari bawah — minimal bank sama
  e-wallet yang kamu pakai sehari-hari.`

## Visual direction

The current build is plain Tailwind slate on white — competent, forgettable.
Give it a point of view.

Pick a direction and commit to it rather than hedging. Some things to weigh:

- It handles money, so it needs to feel trustworthy — but it is a personal tool,
  not a bank. It can have warmth and humour. The loading messages already joke
  with the user; the visual design should be able to hold that tone without
  becoming childish.
- Indonesian context. Avoid the default American fintech look (mint green,
  gradient cards, 3D coins).
- Numbers are the content. Typography for amounts matters more than decoration.
  Large values use proportional figures; columns of numbers use tabular figures
  so they align.
- Spending is not a "good/bad" binary. Do not paint every expense red.

Deliver a small type scale, a colour system with both modes, and the component
states listed above — not just happy-path screens.
