"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Kamera dalam aplikasi, bukan sekadar input file dengan atribut `capture`.
 *
 * `capture="environment"` cuma berfungsi di HP dan diabaikan total di desktop.
 * getUserMedia jalan di keduanya — webcam laptop ikut kepakai — dan memberi
 * pratinjau sebelum jepret, jadi struknya bisa diluruskan dulu.
 *
 * Butuh konteks aman: localhost saat dev, HTTPS di produksi.
 */

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);
  // Kamera belakang lebih tajam untuk struk; desktop akan mengabaikannya.
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let dibatalkan = false;

    async function nyalakan() {
      setSiap(false);
      setError(null);
      stopStream();

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Browser ini nggak mendukung kamera.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1920 } },
        });

        // Komponen keburu ditutup sebelum izin diberikan: matikan lagi,
        // kalau tidak lampu kameranya menyala terus.
        if (dibatalkan) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setSiap(true);
      } catch (err) {
        const nama = (err as Error).name;
        setError(
          nama === "NotAllowedError"
            ? "Izin kamera ditolak. Aktifkan lewat setelan browser ya."
            : nama === "NotFoundError"
              ? "Nggak nemu kamera di perangkat ini."
              : "Kameranya nggak bisa dinyalain.",
        );
      }
    }

    void nyalakan();
    return () => {
      dibatalkan = true;
      stopStream();
    };
  }, [facingMode, stopStream]);

  function jepret() {
    const video = videoRef.current;
    if (!video || !siap) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const nama = `struk-${Date.now()}.jpg`;
        onCapture(new File([blob], nama, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92, // struk butuh detail; kompresi agresif bikin angka pecah
    );
  }

  // Overlay layar penuh harus bisa ditutup dari papan ketik. Tanpa ini,
  // pengguna keyboard terjebak di kamera tanpa jalan keluar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Cegah halaman di belakang ikut tergulir saat kamera terbuka.
    const overflowAwal = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowAwal;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ambil foto struk"
      className="fixed inset-0 z-50 flex flex-col bg-black"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
        >
          Batal
        </button>
        <button
          onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
        >
          Balik kamera
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="max-w-xs px-6 text-center text-sm text-white/80">{error}</p>
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-contain"
          />
        )}
      </div>

      <div className="flex items-center justify-center pb-10 pt-6">
        <button
          onClick={jepret}
          disabled={!siap}
          aria-label="Ambil foto"
          className="h-16 w-16 rounded-full border-4 border-white bg-white/20 transition hover:bg-white/40 disabled:opacity-30"
        />
      </div>
    </div>
  );
}
