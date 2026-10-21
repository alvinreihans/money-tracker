"use client";

import { I18nProvider } from "@cloudscape-design/components/i18n";
import messages from "@cloudscape-design/components/i18n/messages/all.id";

/**
 * Teks bawaan komponen Cloudscape (kalender, unggah berkas, tabel, label
 * aksesibilitas) memakai terjemahan resmi Bahasa Indonesia, jadi tidak perlu
 * diisi satu per satu lewat i18nStrings.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale="id" messages={[messages]}>
      {children}
    </I18nProvider>
  );
}
