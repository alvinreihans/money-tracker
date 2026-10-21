"use client";

import { useState } from "react";
import { Circle, CircleCheck, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Field } from "@/components/oneui";
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
  /** Di bawah kolom, mis. tautan "Lupa password?". */
  caption?: React.ReactNode;
  /** Tampilkan daftar syarat yang hidup saat mengetik. Untuk password BARU saja. */
  syarat?: boolean;
}

export default function PasswordField({ label, value, onChange, autoComplete, caption, syarat = false }: Props) {
  const [terlihat, setTerlihat] = useState(false);

  return (
    <Field
      label={label}
      ikon={LockKeyhole}
      kanan={
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
      }
      keterangan={
        syarat && value ? (
          // Muncul begitu mulai mengetik. Menampilkannya sejak awal bikin form
          // terlihat penuh tuntutan sebelum orang sempat mencoba.
          <span style={{ display: "grid", gap: 2 }}>
            {cekPassword(value).map((x) => (
              // Ikon centang vs lingkaran kosong: statusnya terbaca tanpa warna.
              <span key={x.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {x.ok ? <CircleCheck size={14} color="var(--sukses)" /> : <Circle size={14} />}
                {x.label}
              </span>
            ))}
          </span>
        ) : (
          caption
        )
      }
    >
      <input
        type={terlihat ? "text" : "password"}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={label}
      />
    </Field>
  );
}
