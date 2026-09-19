"use client";

import { useId, useState } from "react";

/**
 * Field password dengan tombol intip.
 *
 * Dipakai di halaman masuk dan halaman password baru, jadi dibuat satu
 * komponen — kalau tidak, perbaikan aksesibilitas apa pun harus dikerjakan
 * dua kali dan gampang tertinggal di salah satunya.
 */

interface Props {
  label: string;
  value: string;
  onChange: (nilai: string) => void;
  autoComplete: string;
  placeholder?: string;
  minLength?: number;
  /** Elemen tambahan di sebelah kanan label, mis. tautan bantuan. */
  aksi?: React.ReactNode;
}

export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder = "Minimal 6 karakter",
  minLength = 6,
  aksi,
}: Props) {
  const id = useId();
  const [terlihat, setTerlihat] = useState(false);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {aksi}
      </div>

      <div className="relative">
        <input
          id={id}
          type={terlihat ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // Ruang kanan disisakan supaya teks tidak tertimpa tombol intip.
          className="w-full rounded-md border border-border bg-transparent py-2 pl-3 pr-12 text-sm outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]"
          placeholder={placeholder}
        />

        <button
          type="button"
          onClick={() => setTerlihat((t) => !t)}
          // Label ikut berubah: pembaca layar harus tahu tombol ini akan
          // melakukan apa, bukan sedang dalam keadaan apa.
          aria-label={terlihat ? "Sembunyikan password" : "Tampilkan password"}
          aria-pressed={terlihat}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted-foreground transition hover:text-foreground"
        >
          {terlihat ? <IconMataTutup /> : <IconMata />}
        </button>
      </div>
    </div>
  );
}

const svg = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconMata() {
  return (
    <svg {...svg}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconMataTutup() {
  return (
    <svg {...svg}>
      <path d="M2 12s3.5-7 10-7c1.7 0 3.2.5 4.5 1.2" />
      <path d="M22 12s-3.5 7-10 7c-1.7 0-3.2-.5-4.5-1.2" />
      <path d="m3 3 18 18" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
