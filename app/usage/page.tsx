'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type UsageRow = {
  toolId: string;
  status: 'success' | 'error';
  events: number;
  fileCount?: number;
  outputCount?: number;
};

type UsageSummary = {
  configured?: boolean;
  totals?: UsageRow[];
};

const toolNames: Record<string, string> = {
  merge: 'รวมไฟล์ PDF',
  organize: 'จัดหน้า PDF',
  split: 'แยกไฟล์ PDF',
  'pdf-to-jpg': 'แปลง PDF to JPG',
  'jpg-to-pdf': 'แปลง JPG to PDF',
  'pdf-to-excel': 'แปลง PDF to Excel',
  'pdf-to-word': 'แปลง PDF to Word',
  'pdf-to-powerpoint': 'แปลง PDF to PowerPoint',
  password: 'ใส่รหัสผ่าน PDF',
  watermark: 'ใส่ลายน้ำ PDF',
  sign: 'เซ็นเอกสาร PDF',
  annotate: 'เพิ่มข้อมูลใน PDF',
};

function formatCount(value: number) {
  return new Intl.NumberFormat('th-TH').format(value);
}

export default function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadSummary() {
      try {
        const response = await fetch('/api/usage/summary', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const data = await response.json() as UsageSummary;
        if (isMounted) {
          setSummary(data);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    const totals = Array.isArray(summary.totals) ? summary.totals : [];
    return Object.entries(toolNames)
      .map(([toolId, title]) => {
        const success = totals.find((row) => row.toolId === toolId && row.status === 'success');
        const error = totals.find((row) => row.toolId === toolId && row.status === 'error');

        return {
          toolId,
          title,
          successCount: Number(success?.events ?? 0),
          errorCount: Number(error?.events ?? 0),
        };
      })
      .sort((first, second) => second.successCount - first.successCount || first.title.localeCompare(second.title, 'th'));
  }, [summary.totals]);

  const totalSuccess = rows.reduce((sum, row) => sum + row.successCount, 0);
  const maxSuccess = Math.max(...rows.map((row) => row.successCount), 1);
  const topTool = rows.find((row) => row.successCount > 0);

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-5 py-6 text-slate-950 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/" className="text-sm font-bold text-[#126b8f] hover:underline">กลับหน้าเครื่องมือ PDF</Link>
            <h1 className="mt-3 text-3xl font-black tracking-normal">รายละเอียดการใช้งานเครื่องมือ</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              แสดงจำนวนครั้งที่ใช้งานสำเร็จแยกตามโหมด เพื่อดูพฤติกรรมว่าเครื่องมือใดถูกใช้มากที่สุด
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-right shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">ใช้งานสำเร็จทั้งหมด</p>
            <p className="mt-1 text-3xl font-black text-[#126b8f]">{formatCount(totalSuccess)}</p>
          </div>
        </header>

        {!summary.configured && !isLoading && (
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ยังไม่พบการเชื่อมต่อฐานข้อมูลสถิติ กรุณาตรวจสอบ D1 binding หลัง deploy
          </p>
        )}

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-500">โหมดที่ถูกใช้มากที่สุด</p>
            <p className="mt-2 text-xl font-black">{topTool?.title ?? '-'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-500">จำนวนโหมดที่มีการใช้งาน</p>
            <p className="mt-2 text-xl font-black">{formatCount(rows.filter((row) => row.successCount > 0).length)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-500">สถานะข้อมูล</p>
            <p className="mt-2 text-xl font-black">{summary.configured ? 'Live' : 'กำลังเตรียมข้อมูล'}</p>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[52px_1fr_120px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase text-slate-500 sm:grid-cols-[64px_1fr_150px_120px]">
            <span>อันดับ</span>
            <span>โหมด</span>
            <span className="text-right">สำเร็จ</span>
            <span className="hidden text-right sm:block">ผิดพลาด</span>
          </div>

          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">กำลังโหลดสถิติ...</p>
          ) : (
            rows.map((row, index) => (
              <div key={row.toolId} className="grid grid-cols-[52px_1fr_120px] items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 sm:grid-cols-[64px_1fr_150px_120px]">
                <span className="text-sm font-black text-slate-500">{index + 1}</span>
                <div>
                  <p className="text-sm font-black text-slate-950">{row.title}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#126b8f]"
                      style={{ width: `${Math.max((row.successCount / maxSuccess) * 100, row.successCount > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
                <span className="text-right text-lg font-black text-[#126b8f]">{formatCount(row.successCount)}</span>
                <span className="hidden text-right text-sm font-bold text-slate-500 sm:block">{formatCount(row.errorCount)}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
