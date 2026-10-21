"use client";

import { useState } from "react";
import { Circle, CircleCheck, Eye, EyeOff } from "lucide-react";
import s from "@/components/ui.module.css";
import { cekPassword } from "@/lib/password";

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
  /** Di bawah kolom, mis. tautan "Lupa password?". */
  caption?: React.ReactNode;
  /** Tampilkan daftar syarat yang hidup saat mengetik. Untuk password BARU saja. */
  syarat?: boolean;
}

export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  caption,
  syarat = false,
}: Props) {
  const [terlihat, setTerlihat] = useState(false);

  return (
    <div className={s.field}>
      <label className={s.field}>
        <span className={s.label}>{label}</span>
        <span className={s.isianDenganAksi}>
          <input
            type={terlihat ? "text" : "password"}
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            placeholder={placeholder}
          />
          <button
            type="button"
            className={s.ikonTombol}
            // Label ikut berubah: pembaca layar harus tahu tombol ini akan
            // melakukan apa, bukan sedang dalam keadaan apa.
            aria-label={terlihat ? "Sembunyikan password" : "Tampilkan password"}
            onClick={() => setTerlihat((t) => !t)}
          >
            {terlihat ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </span>
      </label>

      {syarat && value ? (
        // Muncul begitu mulai mengetik. Menampilkannya sejak awal bikin form
        // terlihat penuh tuntutan sebelum orang sempat mencoba.
        <ul style={{ listStyle: "none", margin: 0, padding: "0 4px", display: "grid", gap: 2 }}>
          {cekPassword(value).map((x) => (
            // Ikon centang vs lingkaran kosong: statusnya terbaca tanpa warna.
            <li key={x.id} className={s.keterangan} style={{ display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
              {x.ok ? <CircleCheck size={14} color="var(--sukses)" /> : <Circle size={14} />}
              {x.label}
            </li>
          ))}
        </ul>
      ) : (
        caption
      )}
    </div>
  );
}
