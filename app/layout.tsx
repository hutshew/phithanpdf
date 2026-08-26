import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'เครื่องมือจัดการ PDF สำหรับองค์กร',
  description: 'ชุดเครื่องมือ PDF สำหรับองค์กร ใช้งานผ่านเบราว์เซอร์ รองรับรวมไฟล์ แยกไฟล์ แปลงไฟล์ ใส่ลายน้ำ และตั้งรหัสผ่าน',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
