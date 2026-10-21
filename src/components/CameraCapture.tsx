"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";

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

        // Modal keburu ditutup sebelum izin diberikan: matikan lagi,
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
        onCapture(new File([blob], `struk-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92, // struk butuh detail; kompresi agresif bikin angka pecah
    );
  }

  return (
    <Modal
      visible
      size="large"
      header="Foto struk"
      onDismiss={onClose}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              iconName="refresh"
              onClick={() => setFacingMode((f) => (f === "environment" ? "user" : "environment"))}
            >
              Balik kamera
            </Button>
            <Button variant="primary" iconName="video-camera-on" disabled={!siap} onClick={jepret}>
              Jepret
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      {error ? (
        <Alert type="error">{error}</Alert>
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ display: "block", width: "100%", maxHeight: "60vh", objectFit: "contain", background: "#000" }}
        />
      )}
    </Modal>
  );
}
