"use client";

import { useState } from "react";
import Checkbox from "@cloudscape-design/components/checkbox";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
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
  /** Elemen di sebelah label, mis. tautan "Lupa password?". */
  info?: React.ReactNode;
  /** Tampilkan daftar syarat yang hidup saat mengetik. Untuk password BARU saja. */
  syarat?: boolean;
}

export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder = "Minimal 8 karakter",
  info,
  syarat = false,
}: Props) {
  const [terlihat, setTerlihat] = useState(false);

  return (
    <FormField stretch
      label={label}
      info={info}
      constraintText={
        // Muncul begitu mulai mengetik. Menampilkannya sejak awal bikin form
        // terlihat penuh tuntutan sebelum orang sempat mencoba.
        syarat && value ? (
          <SpaceBetween size="xxxs">
            {cekPassword(value).map((s) => (
              // Ikon centang vs jam pasir: statusnya terbaca tanpa warna.
              <StatusIndicator key={s.id} type={s.ok ? "success" : "pending"}>
                {s.label}
              </StatusIndicator>
            ))}
          </SpaceBetween>
        ) : undefined
      }
    >
      <SpaceBetween size="xs">
        <Input
          type={terlihat ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.detail.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        {/* Kotak centang, bukan ikon mata: di layar sempit ikon di samping
            kolom ikut turun ke bawah dan maknanya jadi tidak jelas. */}
        <Checkbox checked={terlihat} onChange={(e) => setTerlihat(e.detail.checked)}>
          Tampilkan password
        </Checkbox>
      </SpaceBetween>
    </FormField>
  );
}
