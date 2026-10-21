"use client";

import { useState } from "react";
import { FormControl, Stack, Text, TextInput } from "@primer/react";
import { CheckCircleFillIcon, CircleIcon, EyeClosedIcon, EyeIcon } from "@primer/octicons-react";
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
    <FormControl required>
      <FormControl.Label>{label}</FormControl.Label>
      <TextInput
        block
        type={terlihat ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        trailingAction={
          <TextInput.Action
            icon={terlihat ? EyeClosedIcon : EyeIcon}
            // Label ikut berubah: pembaca layar harus tahu tombol ini akan
            // melakukan apa, bukan sedang dalam keadaan apa.
            aria-label={terlihat ? "Sembunyikan password" : "Tampilkan password"}
            onClick={() => setTerlihat((t) => !t)}
          />
        }
      />
      {syarat && value ? (
        // Muncul begitu mulai mengetik. Menampilkannya sejak awal bikin form
        // terlihat penuh tuntutan sebelum orang sempat mencoba.
        <FormControl.Caption>
          <Stack gap="none">
            {cekPassword(value).map((x) => (
              // Ikon centang vs lingkaran kosong: statusnya terbaca tanpa warna.
              <Stack key={x.id} direction="horizontal" gap="condensed" align="center">
                {x.ok ? <CheckCircleFillIcon fill="var(--fgColor-success)" size={12} /> : <CircleIcon size={12} />}
                <Text size="small">{x.label}</Text>
              </Stack>
            ))}
          </Stack>
        </FormControl.Caption>
      ) : caption ? (
        <FormControl.Caption>{caption}</FormControl.Caption>
      ) : null}
    </FormControl>
  );
}
