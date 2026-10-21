import { Box, ColumnLayout, Container, Header } from "@/components/ui";
import { fmtIDRRingkas, namaBulan } from "@/lib/format";

/**
 * Tiga angka bulan berjalan. Arah perubahan dibawa panah dan teks, bukan
 * warna saja — warna sendirian tidak boleh jadi satu-satunya pembawa makna.
 */
export default function RingkasanBulan({
  keluar,
  masuk,
  keluarBulanLalu,
}: {
  keluar: number;
  masuk: number;
  keluarBulanLalu: number;
}) {
  const selisih = masuk - keluar;
  const sekarang = new Date();

  const bulanLalu = new Date();
  bulanLalu.setDate(1);
  bulanLalu.setMonth(bulanLalu.getMonth() - 1);

  const persen =
    keluarBulanLalu > 0 ? Math.round(((keluar - keluarBulanLalu) / keluarBulanLalu) * 100) : 0;

  return (
    <Container
      header={
        <Header variant="h2">
          {namaBulan(sekarang)} {sekarang.getFullYear()}
        </Header>
      }
    >
      {/* Tanpa minColumnWidth: dengan itu ColumnLayout tetap tiga kolom di HP
          dan nominalnya patah per huruf. Bawaannya jadi satu kolom di layar sempit. */}
      <ColumnLayout columns={3} variant="text-grid">
        <div>
          <Box variant="awsui-key-label">Keluar bulan ini</Box>
          <Box variant="awsui-value-large">{fmtIDRRingkas(keluar)}</Box>
          {persen !== 0 && (
            <Box variant="small" color="text-body-secondary">
              {persen > 0 ? "↑ naik" : "↓ turun"} {Math.abs(persen)}% vs {namaBulan(bulanLalu)}
            </Box>
          )}
        </div>

        <div>
          <Box variant="awsui-key-label">Masuk bulan ini</Box>
          <Box variant="awsui-value-large">{fmtIDRRingkas(masuk)}</Box>
        </div>

        <div>
          <Box variant="awsui-key-label">Selisih</Box>
          <Box
            variant="awsui-value-large"
            color={selisih < 0 ? "text-status-error" : "text-status-success"}
          >
            {selisih < 0 ? "−" : ""}
            {fmtIDRRingkas(Math.abs(selisih))}
          </Box>
          <Box variant="small" color="text-body-secondary">
            {selisih >= 0 ? "Masih surplus" : "Lebih besar pasak"}
          </Box>
        </div>
      </ColumnLayout>
    </Container>
  );
}
