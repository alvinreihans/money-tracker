"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AvgMonthlyExpenseRow } from "@/types/transaction";

// Helper format Rupiah (kompak: Rp1,2jt).
const formatIDR = (value: number): string =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

// Props tooltip kustom (recharts v3 tidak lagi expose payload/label di TooltipProps).
interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ value?: number | string }>;
}

// Tooltip kustom ala shadcn/ui.
function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-medium capitalize text-slate-900">{label}</p>
      <p className="text-slate-500">
        Rata-rata:{" "}
        <span className="font-semibold text-slate-900">
          {formatIDR(Number(payload[0].value))}
        </span>
      </p>
    </div>
  );
}

export default function SpendingByCategoryChart() {
  const [data, setData] = useState<AvgMonthlyExpenseRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Ambil data dari RPC saat mount.
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      const supabase = createSupabaseBrowserClient();
      const { data: rows, error: rpcError } = await supabase.rpc(
        "get_avg_monthly_expense_by_category",
      );

      if (cancelled) return;

      if (rpcError) {
        setError(rpcError.message);
      } else {
        setData((rows ?? []) as AvgMonthlyExpenseRow[]);
      }
      setLoading(false);
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalAvg = useMemo(
    () => data.reduce((sum, row) => sum + row.avg_monthly, 0),
    [data],
  );

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header kartu */}
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="text-lg font-semibold leading-none tracking-tight text-slate-900">
          Rata-rata Pengeluaran per Kategori
        </h3>
        <p className="text-sm text-slate-500">
          Rerata bulanan selama 3 bulan terakhir
        </p>
      </div>

      {/* Konten */}
      <div className="p-6 pt-0">
        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
          </div>
        ) : error ? (
          <div className="flex h-72 items-center justify-center rounded-lg bg-red-50 text-sm text-red-600">
            Gagal ambil data: {error}
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center px-6 text-center text-sm text-slate-500">
            <p>Belum ada pengeluaran di rentang ini.</p>
            <p className="mt-1 text-xs text-slate-400">
              Chart ini cuma menghitung 3 bulan penuh terakhir, jadi transaksi
              bulan berjalan belum ikut. Lihat daftar di atas buat yang terbaru.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <span className="text-2xl font-bold text-slate-900">
                {formatIDR(totalAvg)}
              </span>
              <span className="ml-2 text-sm text-slate-500">
                total rerata / bulan
              </span>
            </div>

            <ResponsiveContainer width="100%" height={288}>
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
              >
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="category"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickFormatter={(v: string) =>
                    v.charAt(0).toUpperCase() + v.slice(1)
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickFormatter={(v: number) => formatIDR(v)}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "#f1f5f9" }}
                />
                <Bar
                  dataKey="avg_monthly"
                  fill="#0f172a"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={56}
                />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}
