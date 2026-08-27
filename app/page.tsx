'use client';

import { ChangeEvent, DragEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { degrees, PDFDocument } from 'pdf-lib';

type ToolMode = 'merge' | 'organize' | 'split' | 'pdf-to-jpg' | 'jpg-to-pdf' | 'pdf-to-excel' | 'pdf-to-word' | 'pdf-to-powerpoint' | 'password' | 'sign' | 'annotate' | 'watermark' | 'planned';

type Tool = {
  id: string;
  title: string;
  description: string;
  accepts: string;
  fields: string[];
  mode: ToolMode;
};

type PdfFileItem = {
  id: string;
  file: File;
};

type DownloadResult = {
  id: string;
  url: string;
  fileName: string;
};

type OrganizePage = {
  id: string;
  originalPageIndex: number;
  pageNumber: number;
  rotation: number;
  thumbnailUrl: string;
};

type AnnotationItem = {
  id: string;
  kind: 'text' | 'symbol' | 'image' | 'blur' | 'crop';
  text: string;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  fontSize: number;
  rotation: number;
  align: 'left' | 'center' | 'right';
  color: string;
  bold: boolean;
  imageDataUrl?: string;
  imageBytes?: ArrayBuffer;
  imageType?: 'png' | 'jpg';
};

type AnnotatePreview = {
  pageNumber: number;
  pageCount: number;
  imageUrl: string;
  width: number;
  height: number;
};

type DrawMode = 'crop' | 'blur' | '';

type DrawRect = {
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
};

type WatermarkMode = 'text' | 'image';
type SignatureMode = 'draw' | 'upload' | 'type';

type ExtractedPdfPage = {
  pageNumber: number;
  lines: string[];
};

type ZipEntry = {
  path: string;
  data: Uint8Array;
};

type UsageStatus = 'success' | 'error';
type UsageToolId = ToolMode | 'site-visit';

type UsageSummaryRow = {
  toolId: string;
  status: UsageStatus;
  events: number;
  fileCount?: number;
  outputCount?: number;
};

type UsageSummaryState = {
  configured: boolean;
  visits: number;
  successfulRuns: number;
  runsLast24Hours: number;
};

const annotationSymbols = ['✓', 'X', '□', '☑', '★', '•', '○', '■', '▲', '→'];
const annotationColors = ['#0f172a', '#000000', '#1d4ed8', '#dc2626'];

const tools: Tool[] = [
  {
    id: 'merge',
    title: 'รวมไฟล์ PDF',
    description: 'เลือกไฟล์หลายฉบับแล้วรวมเป็นเอกสาร PDF เดียวสำหรับส่งต่อหรือจัดเก็บ',
    accepts: '.pdf',
    fields: ['ลากวางหรือเลือกไฟล์ PDF หลายไฟล์', 'เปลี่ยนลำดับก่อนรวมไฟล์ได้'],
    mode: 'merge',
  },
  {
    id: 'organize',
    title: 'จัดหน้า PDF',
    description: 'ลากสลับหน้า หมุนหน้า หรือลบหน้าที่ไม่ต้องการออกจากเอกสาร',
    accepts: '.pdf',
    fields: ['เลือกและเรียงหน้าด้วยตัวเลขหน้า', 'หมุนหน้าทั้งชุดได้ก่อนดาวน์โหลด'],
    mode: 'organize',
  },
  {
    id: 'split',
    title: 'แยกไฟล์ PDF',
    description: 'แยกช่วงหน้าออกเป็นไฟล์ใหม่ หรือแตกทุกหน้าเป็นไฟล์ PDF แยกกัน',
    accepts: '.pdf',
    fields: ['ระบุช่วงหน้า เช่น 1-3, 7', 'ดาวน์โหลด PDF ที่แยกแล้วได้ทันที'],
    mode: 'split',
  },
  {
    id: 'pdf-to-jpg',
    title: 'แปลง PDF to JPG',
    description: 'แปลงหน้าเอกสาร PDF เป็นรูปภาพ JPG เพื่อแนบในระบบหรือส่งตรวจทาน',
    accepts: '.pdf',
    fields: ['เลือกช่วงหน้าที่ต้องการแปลง', 'ดาวน์โหลด JPG แยกตามหน้า'],
    mode: 'pdf-to-jpg',
  },
  {
    id: 'jpg-to-pdf',
    title: 'แปลง JPG to PDF',
    description: 'รวมรูปภาพ JPG หลายไฟล์เป็นเอกสาร PDF พร้อมจัดลำดับภาพ',
    accepts: '.jpg,.jpeg,.png',
    fields: ['ลากวางรูปภาพหลายไฟล์', 'เปลี่ยนลำดับรูปก่อนสร้าง PDF'],
    mode: 'jpg-to-pdf',
  },
  {
    id: 'pdf-to-excel',
    title: 'แปลง PDF to Excel',
    description: 'ดึงตารางและข้อมูลจาก PDF ออกเป็นไฟล์ Excel สำหรับตรวจสอบหรือแก้ไขต่อ',
    accepts: '.pdf',
    fields: ['เลือกช่วงหน้าที่ต้องการแปลง', 'สร้างไฟล์ Excel จากข้อความใน PDF'],
    mode: 'pdf-to-excel',
  },
  {
    id: 'pdf-to-word',
    title: 'แปลง PDF to Word',
    description: 'แปลงหน้า PDF เป็นเอกสาร Word โดยฝังภาพหน้าเอกสารเพื่อให้เปิดไฟล์ได้เสถียร',
    accepts: '.pdf',
    fields: ['เลือกช่วงหน้าที่ต้องการแปลง', 'หนึ่งหน้า PDF เป็นภาพหนึ่งหน้าใน Word'],
    mode: 'pdf-to-word',
  },
  {
    id: 'pdf-to-powerpoint',
    title: 'แปลง PDF to PowerPoint',
    description: 'แปลงหน้า PDF เป็นสไลด์ PowerPoint สำหรับนำเสนอหรือปรับแก้ในที่ประชุม',
    accepts: '.pdf',
    fields: ['หนึ่งหน้า PDF เป็นหนึ่งสไลด์', 'รักษาหน้าตาเอกสารด้วยภาพหน้า PDF'],
    mode: 'pdf-to-powerpoint',
  },
  {
    id: 'password',
    title: 'ใส่รหัสผ่าน PDF',
    description: 'กำหนดรหัสผ่านก่อนเปิดไฟล์ เพื่อปกป้องเอกสารภายในองค์กร',
    accepts: '.pdf',
    fields: ['เข้ารหัสไฟล์ PDF จริงก่อนดาวน์โหลด', 'ไฟล์จะถามรหัสผ่านเมื่อเปิดอ่าน'],
    mode: 'password',
  },
  {
    id: 'watermark',
    title: 'ใส่ลายน้ำ PDF',
    description: 'ใส่ลายน้ำข้อความหรือรูปภาพลงทุกหน้า พร้อมปรับขนาด มุมเอียง และความจาง',
    accepts: '.pdf',
    fields: ['ลายน้ำข้อความภาษาไทยหรือรูปภาพ', 'ปรับขนาด มุมเอียง และความจางได้'],
    mode: 'watermark',
  },
  {
    id: 'sign',
    title: 'เซ็นเอกสาร PDF',
    description: 'พิมพ์ลายเซ็นหรือข้อความรับรอง แล้ววางลงบนหน้าที่ต้องการ',
    accepts: '.pdf',
    fields: ['พิมพ์ลายเซ็นภาษาไทยได้', 'กำหนดหน้าและตำแหน่งก่อนบันทึก'],
    mode: 'sign',
  },
  {
    id: 'annotate',
    title: 'เพิ่มข้อมูลใน PDF',
    description: 'เพิ่มข้อความ วันที่ ครอบตัด เบลอ แทรกรูป หรือหมายเหตุภาษาไทยลงในเอกสาร PDF',
    accepts: '.pdf',
    fields: ['เพิ่มข้อความหรือวันที่ลง PDF', 'กำหนดหน้าและตำแหน่งได้'],
    mode: 'annotate',
  },
];

const toolIds = new Set(tools.map((tool) => tool.id));

const toolVisuals: Record<string, { icon: string; group: string; tone: string }> = {
  merge: { icon: '⇄', group: 'จัดการไฟล์', tone: 'bg-sky-50 text-sky-700 border-sky-100' },
  organize: { icon: '▦', group: 'จัดการไฟล์', tone: 'bg-violet-50 text-violet-700 border-violet-100' },
  split: { icon: '↧', group: 'จัดการไฟล์', tone: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
  'pdf-to-jpg': { icon: 'JPG', group: 'แปลงไฟล์', tone: 'bg-amber-50 text-amber-700 border-amber-100' },
  'jpg-to-pdf': { icon: 'PDF', group: 'แปลงไฟล์', tone: 'bg-lime-50 text-lime-700 border-lime-100' },
  'pdf-to-excel': { icon: 'XLS', group: 'แปลงไฟล์', tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  'pdf-to-word': { icon: 'DOC', group: 'แปลงไฟล์', tone: 'bg-blue-50 text-blue-700 border-blue-100' },
  'pdf-to-powerpoint': { icon: 'PPT', group: 'แปลงไฟล์', tone: 'bg-orange-50 text-orange-700 border-orange-100' },
  password: { icon: '●●', group: 'ความปลอดภัย', tone: 'bg-rose-50 text-rose-700 border-rose-100' },
  watermark: { icon: 'WM', group: 'ความปลอดภัย', tone: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  sign: { icon: '✎', group: 'แก้ไขเอกสาร', tone: 'bg-teal-50 text-teal-700 border-teal-100' },
  annotate: { icon: 'T+', group: 'แก้ไขเอกสาร', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const toolGroups = ['จัดการไฟล์', 'แปลงไฟล์', 'ความปลอดภัย', 'แก้ไขเอกสาร'];

function createFileId(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatUsageCount(value: number) {
  return new Intl.NumberFormat('th-TH').format(value);
}

function cleanFileBaseName(name: string) {
  return name.replace(/\.[^.]+$/i, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'เอกสาร';
}

function parsePageRanges(input: string, totalPages: number) {
  const normalized = input.trim();
  if (!normalized) {
    throw new Error('กรุณาระบุหน้าที่ต้องการแยก เช่น 1-3 หรือ 2,4,6');
  }

  const pageIndexes: number[] = [];
  const seen = new Set<number>();
  const parts = normalized.split(',');

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) {
      throw new Error('รูปแบบช่วงหน้าไม่ถูกต้อง กรุณาตรวจสอบเครื่องหมายคั่นหน้า');
    }

    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const singleMatch = part.match(/^\d+$/);

    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start > end) {
        throw new Error('ช่วงหน้าต้องเรียงจากเลขหน้าน้อยไปมาก');
      }
      for (let page = start; page <= end; page += 1) {
        if (page < 1 || page > totalPages) {
          throw new Error(`ไฟล์นี้มี ${totalPages} หน้า กรุณาระบุหน้าให้อยู่ในช่วง 1-${totalPages}`);
        }
        const index = page - 1;
        if (!seen.has(index)) {
          seen.add(index);
          pageIndexes.push(index);
        }
      }
      continue;
    }

    if (singleMatch) {
      const page = Number(part);
      if (page < 1 || page > totalPages) {
        throw new Error(`ไฟล์นี้มี ${totalPages} หน้า กรุณาระบุหน้าให้อยู่ในช่วง 1-${totalPages}`);
      }
      const index = page - 1;
      if (!seen.has(index)) {
        seen.add(index);
        pageIndexes.push(index);
      }
      continue;
    }

    throw new Error('รูปแบบช่วงหน้าไม่ถูกต้อง กรุณาใช้รูปแบบ เช่น 1-3, 7');
  }

  return pageIndexes;
}

function parseOptionalPageRanges(input: string, totalPages: number) {
  if (!input.trim()) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  return parsePageRanges(input, totalPages);
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('ไม่สามารถสร้างไฟล์ JPG ได้'));
      },
      'image/jpeg',
      quality,
    );
  });
}

async function canvasToJpegBytes(canvas: HTMLCanvasElement, quality: number) {
  const blob = await canvasToJpegBlob(canvas, quality);
  return blob.arrayBuffer();
}

function canvasToPngBytes(canvas: HTMLCanvasElement) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('ไม่สามารถสร้างภาพข้อความได้'));
        return;
      }

      resolve(await blob.arrayBuffer());
    }, 'image/png');
  });
}

function getFiniteNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toThaiDigits(value: string) {
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  return value.replace(/\d/g, (digit) => thaiDigits[Number(digit)] ?? digit);
}

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSignatureDate(value: string, locale: 'th' | 'en') {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) {
    return '';
  }

  if (locale === 'th') {
    const monthNames = [
      'มกราคม',
      'กุมภาพันธ์',
      'มีนาคม',
      'เมษายน',
      'พฤษภาคม',
      'มิถุนายน',
      'กรกฎาคม',
      'สิงหาคม',
      'กันยายน',
      'ตุลาคม',
      'พฤศจิกายน',
      'ธันวาคม',
    ];
    return toThaiDigits(`${day} ${monthNames[month - 1]} พ.ศ. ${year + 543}`);
  }

  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

function getPageIndexFromInput(input: string, totalPages: number) {
  const pageNumber = Math.floor(getFiniteNumber(input, 1));

  if (pageNumber < 1 || pageNumber > totalPages) {
    throw new Error(`ไฟล์นี้มี ${totalPages} หน้า กรุณาระบุหน้าให้อยู่ในช่วง 1-${totalPages}`);
  }

  return pageNumber - 1;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function stringToBytes(value: string) {
  return new TextEncoder().encode(value);
}

function numberToLittleEndianBytes(value: number, byteCount: number) {
  const bytes = new Uint8Array(byteCount);
  for (let index = 0; index < byteCount; index += 1) {
    bytes[index] = (value >>> (index * 8)) & 0xff;
  }
  return bytes;
}

function createCrc32Table() {
  return Array.from({ length: 256 }, (_, tableIndex) => {
    let crc = tableIndex;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    return crc >>> 0;
  });
}

const crc32Table = createCrc32Table();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function bytesToLatin1(bytes: Uint8Array) {
  let output = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    output += String.fromCharCode(...bytes.slice(index, index + 0x8000));
  }
  return output;
}

function latin1ToBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string) {
  const cleanHex = value.replace(/\s+/g, '');
  const bytes = new Uint8Array(Math.floor(cleanHex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(cleanHex.slice(index * 2, index * 2 + 2), 16) || 0;
  }
  return bytes;
}

function leftRotate(value: number, amount: number) {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

const md5Shifts = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const md5Constants = Array.from({ length: 64 }, (_, index) => (
  Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0
));

function md5(bytes: Uint8Array) {
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >>> 6) + 1) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  for (let index = 0; index < 8; index += 1) {
    padded[paddedLength - 8 + index] = Math.floor(bitLength / 2 ** (8 * index)) & 0xff;
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let chunk = 0; chunk < padded.length; chunk += 64) {
    const words = new Array<number>(16);
    for (let index = 0; index < 16; index += 1) {
      const offset = chunk + index * 4;
      words[index] = (
        padded[offset]
        | (padded[offset + 1] << 8)
        | (padded[offset + 2] << 16)
        | (padded[offset + 3] << 24)
      ) >>> 0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index += 1) {
      let f = 0;
      let g = 0;

      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }

      const next = d;
      d = c;
      c = b;
      b = (b + leftRotate((a + f + md5Constants[index] + words[g]) >>> 0, md5Shifts[index])) >>> 0;
      a = next;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return concatBytes([
    numberToLittleEndianBytes(a0, 4),
    numberToLittleEndianBytes(b0, 4),
    numberToLittleEndianBytes(c0, 4),
    numberToLittleEndianBytes(d0, 4),
  ]);
}

function rc4(key: Uint8Array, data: Uint8Array) {
  const state = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) {
    state[index] = index;
  }

  let j = 0;
  for (let index = 0; index < 256; index += 1) {
    j = (j + state[index] + key[index % key.length]) & 0xff;
    [state[index], state[j]] = [state[j], state[index]];
  }

  const output = new Uint8Array(data.length);
  let i = 0;
  j = 0;

  for (let offset = 0; offset < data.length; offset += 1) {
    i = (i + 1) & 0xff;
    j = (j + state[i]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
    output[offset] = data[offset] ^ state[(state[i] + state[j]) & 0xff];
  }

  return output;
}

const pdfPasswordPadding = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function passwordToPdfBytes(password: string) {
  if (!/^[\x20-\x7e]+$/.test(password)) {
    throw new Error('รหัสผ่าน PDF กรุณาใช้ตัวอักษรอังกฤษ ตัวเลข หรือสัญลักษณ์มาตรฐานเท่านั้น เพื่อให้เปิดกับ PDF reader ได้เสถียร');
  }

  return latin1ToBytes(password);
}

function padPdfPassword(password: string) {
  const passwordBytes = passwordToPdfBytes(password);
  const padded = new Uint8Array(32);
  padded.set(passwordBytes.slice(0, 32));

  if (passwordBytes.length < 32) {
    padded.set(pdfPasswordPadding.slice(0, 32 - passwordBytes.length), passwordBytes.length);
  }

  return padded;
}

function xorKey(key: Uint8Array, value: number) {
  return key.map((byte) => byte ^ value);
}

function computeOwnerPasswordValue(userPassword: string, ownerPassword: string) {
  let digest = md5(padPdfPassword(ownerPassword));
  for (let index = 0; index < 50; index += 1) {
    digest = md5(digest.slice(0, 16));
  }

  let encrypted = rc4(digest.slice(0, 16), padPdfPassword(userPassword));
  for (let index = 1; index <= 19; index += 1) {
    encrypted = rc4(xorKey(digest.slice(0, 16), index), encrypted);
  }

  return encrypted;
}

function computePdfEncryptionKey(userPassword: string, ownerValue: Uint8Array, permissions: number, fileId: Uint8Array) {
  let digest = md5(concatBytes([
    padPdfPassword(userPassword),
    ownerValue,
    numberToLittleEndianBytes(permissions >>> 0, 4),
    fileId,
  ]));

  for (let index = 0; index < 50; index += 1) {
    digest = md5(digest.slice(0, 16));
  }

  return digest.slice(0, 16);
}

function computeUserPasswordValue(encryptionKey: Uint8Array, fileId: Uint8Array) {
  let encrypted = rc4(encryptionKey, md5(concatBytes([pdfPasswordPadding, fileId])));
  for (let index = 1; index <= 19; index += 1) {
    encrypted = rc4(xorKey(encryptionKey, index), encrypted);
  }

  return concatBytes([encrypted, new Uint8Array(16)]);
}

function getPdfObjectKey(encryptionKey: Uint8Array, objectNumber: number, generationNumber: number) {
  const objectBytes = new Uint8Array([
    objectNumber & 0xff,
    (objectNumber >> 8) & 0xff,
    (objectNumber >> 16) & 0xff,
    generationNumber & 0xff,
    (generationNumber >> 8) & 0xff,
  ]);

  return md5(concatBytes([encryptionKey, objectBytes])).slice(0, Math.min(encryptionKey.length + 5, 16));
}

function encryptPdfLiteralContent(content: string, objectKey: Uint8Array) {
  const bytes = latin1ToBytes(content);
  return `<${bytesToHex(rc4(objectKey, bytes))}>`;
}

function encryptPdfStrings(content: string, objectKey: Uint8Array) {
  let output = '';
  let index = 0;

  while (index < content.length) {
    const char = content[index];

    if (char === '(') {
      let depth = 1;
      let cursor = index + 1;
      let raw = '';

      while (cursor < content.length && depth > 0) {
        const current = content[cursor];
        if (current === '\\') {
          raw += current;
          cursor += 1;
          if (cursor < content.length) {
            raw += content[cursor];
          }
        } else if (current === '(') {
          depth += 1;
          raw += current;
        } else if (current === ')') {
          depth -= 1;
          if (depth > 0) {
            raw += current;
          }
        } else {
          raw += current;
        }
        cursor += 1;
      }

      output += encryptPdfLiteralContent(raw, objectKey);
      index = cursor;
      continue;
    }

    if (char === '<' && content[index + 1] !== '<') {
      const end = content.indexOf('>', index + 1);
      if (end > index) {
        output += `<${bytesToHex(rc4(objectKey, hexToBytes(content.slice(index + 1, end))))}>`;
        index = end + 1;
        continue;
      }
    }

    output += char;
    index += 1;
  }

  return output;
}

function encryptPdfObjectContent(content: string, objectNumber: number, generationNumber: number, encryptionKey: Uint8Array) {
  const objectKey = getPdfObjectKey(encryptionKey, objectNumber, generationNumber);
  const streamIndex = content.indexOf('stream');

  if (streamIndex < 0) {
    return encryptPdfStrings(content, objectKey);
  }

  const streamDataStart = content.indexOf('\n', streamIndex);
  const endStreamIndex = content.lastIndexOf('endstream');

  if (streamDataStart < 0 || endStreamIndex < streamDataStart) {
    return encryptPdfStrings(content, objectKey);
  }

  const streamStart = streamDataStart + 1;
  const streamEnd = content[endStreamIndex - 1] === '\n'
    ? endStreamIndex - (content[endStreamIndex - 2] === '\r' ? 2 : 1)
    : endStreamIndex;
  const beforeStream = content.slice(0, streamStart);
  const streamData = latin1ToBytes(content.slice(streamStart, streamEnd));
  const afterStream = content.slice(streamEnd);

  return `${encryptPdfStrings(beforeStream, objectKey)}${bytesToLatin1(rc4(objectKey, streamData))}${afterStream}`;
}

function extractTrailerRef(pdfText: string, key: string) {
  const match = pdfText.match(new RegExp(`/${key}\\s+(\\d+)\\s+(\\d+)\\s+R`));
  return match ? `${match[1]} ${match[2]} R` : null;
}

async function encryptPdfWithPassword(sourceBytes: ArrayBuffer, password: string) {
  const loadedPdf = await PDFDocument.load(sourceBytes);
  const normalizedBytes = await loadedPdf.save({ useObjectStreams: false });
  const normalizedText = bytesToLatin1(new Uint8Array(normalizedBytes));
  const rootRef = extractTrailerRef(normalizedText, 'Root');
  const infoRef = extractTrailerRef(normalizedText, 'Info');

  if (!rootRef) {
    throw new Error('ไม่สามารถอ่านโครงสร้าง PDF สำหรับเข้ารหัสได้');
  }

  const objectPattern = /(\d+)\s+(\d+)\s+obj\r?\n([\s\S]*?)\r?\nendobj/g;
  const objects: Array<{ objectNumber: number; generationNumber: number; content: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = objectPattern.exec(normalizedText)) !== null) {
    objects.push({
      objectNumber: Number(match[1]),
      generationNumber: Number(match[2]),
      content: match[3],
    });
  }

  if (objects.length === 0) {
    throw new Error('ไม่พบข้อมูลภายใน PDF สำหรับเข้ารหัส');
  }

  const fileId = crypto.getRandomValues(new Uint8Array(16));
  const permissions = -4;
  const ownerValue = computeOwnerPasswordValue(password, `${password}-owner`);
  const encryptionKey = computePdfEncryptionKey(password, ownerValue, permissions, fileId);
  const userValue = computeUserPasswordValue(encryptionKey, fileId);
  const maxObjectNumber = Math.max(...objects.map((item) => item.objectNumber));
  const encryptObjectNumber = maxObjectNumber + 1;
  const encryptedObjects = objects.map((item) => ({
    ...item,
    content: encryptPdfObjectContent(item.content, item.objectNumber, item.generationNumber, encryptionKey),
  }));
  encryptedObjects.push({
    objectNumber: encryptObjectNumber,
    generationNumber: 0,
    content: `<< /Filter /Standard /V 2 /R 3 /Length 128 /O <${bytesToHex(ownerValue)}> /U <${bytesToHex(userValue)}> /P ${permissions} >>`,
  });
  encryptedObjects.sort((first, second) => first.objectNumber - second.objectNumber || first.generationNumber - second.generationNumber);

  const chunks: Uint8Array[] = [latin1ToBytes('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = new Map<number, number>();
  let currentOffset = chunks[0].length;

  for (const object of encryptedObjects) {
    offsets.set(object.objectNumber, currentOffset);
    const objectBytes = latin1ToBytes(`${object.objectNumber} ${object.generationNumber} obj\n${object.content}\nendobj\n`);
    chunks.push(objectBytes);
    currentOffset += objectBytes.length;
  }

  const xrefOffset = currentOffset;
  const size = encryptObjectNumber + 1;
  const xrefLines = ['xref', `0 ${size}`, '0000000000 65535 f '];
  for (let objectNumber = 1; objectNumber < size; objectNumber += 1) {
    xrefLines.push(`${String(offsets.get(objectNumber) ?? 0).padStart(10, '0')} 00000 n `);
  }

  const trailerParts = [
    `/Size ${size}`,
    `/Root ${rootRef}`,
    infoRef ? `/Info ${infoRef}` : '',
    `/Encrypt ${encryptObjectNumber} 0 R`,
    `/ID [<${bytesToHex(fileId)}> <${bytesToHex(fileId)}>]`,
  ].filter(Boolean);
  const tail = `${xrefLines.join('\n')}\ntrailer\n<< ${trailerParts.join(' ')} >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(latin1ToBytes(tail));

  return concatBytes(chunks);
}

function getContainedImageSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function createZip(entries: ZipEntry[]) {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const pathBytes = stringToBytes(entry.path);
    const checksum = crc32(entry.data);
    const localHeader = concatBytes([
      numberToLittleEndianBytes(0x04034b50, 4),
      numberToLittleEndianBytes(20, 2),
      numberToLittleEndianBytes(0x0800, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(checksum, 4),
      numberToLittleEndianBytes(entry.data.length, 4),
      numberToLittleEndianBytes(entry.data.length, 4),
      numberToLittleEndianBytes(pathBytes.length, 2),
      numberToLittleEndianBytes(0, 2),
      pathBytes,
    ]);

    localChunks.push(localHeader, entry.data);
    centralChunks.push(concatBytes([
      numberToLittleEndianBytes(0x02014b50, 4),
      numberToLittleEndianBytes(20, 2),
      numberToLittleEndianBytes(20, 2),
      numberToLittleEndianBytes(0x0800, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(checksum, 4),
      numberToLittleEndianBytes(entry.data.length, 4),
      numberToLittleEndianBytes(entry.data.length, 4),
      numberToLittleEndianBytes(pathBytes.length, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(0, 2),
      numberToLittleEndianBytes(0, 4),
      numberToLittleEndianBytes(offset, 4),
      pathBytes,
    ]));
    offset += localHeader.length + entry.data.length;
  }

  const centralDirectory = concatBytes(centralChunks);
  const endRecord = concatBytes([
    numberToLittleEndianBytes(0x06054b50, 4),
    numberToLittleEndianBytes(0, 2),
    numberToLittleEndianBytes(0, 2),
    numberToLittleEndianBytes(entries.length, 2),
    numberToLittleEndianBytes(entries.length, 2),
    numberToLittleEndianBytes(centralDirectory.length, 4),
    numberToLittleEndianBytes(offset, 4),
    numberToLittleEndianBytes(0, 2),
  ]);

  return concatBytes([...localChunks, centralDirectory, endRecord]);
}

async function createImageDocxBytes(pages: Array<{ pageNumber: number; imageBytes: Uint8Array; width: number; height: number }>) {
  const {
    AlignmentType,
    Document,
    ImageRun,
    Packer,
    PageBreak,
    Paragraph,
  } = await import('docx');

  const children = pages.flatMap((page, index) => {
    const imageSize = getContainedImageSize(page.width, page.height, 610, 860);
    const paragraph = new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          data: page.imageBytes,
          transformation: {
            width: imageSize.width,
            height: imageSize.height,
          },
          type: 'jpg',
        }),
      ],
    });

    return index === pages.length - 1
      ? [paragraph]
      : [paragraph, new Paragraph({ children: [new PageBreak()] })];
  });

  const doc = new Document({
    creator: 'PDF Tools',
    description: 'Converted from PDF in browser',
    title: 'PDF to Word',
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
            size: {
              width: 11906,
              height: 16838,
            },
          },
        },
        children,
      },
    ],
  });

  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

async function createXlsxBytes(pages: ExtractedPdfPage[]) {
  const xlsx = await import('xlsx');
  const rows = pages.flatMap((page) => [
    [`หน้า ${page.pageNumber}`],
    ...(page.lines.length ? page.lines : ['']).map((line) => [line]),
    [''],
  ]);
  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 110 }];
  xlsx.utils.book_append_sheet(workbook, worksheet, 'PDF Text');

  const output = xlsx.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;

  return new Uint8Array(output);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createPptxBytes(slides: Array<{ pageNumber: number; imageBytes: Uint8Array; width: number; height: number }>) {
  const slideOverrides = slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('');
  const slideIds = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join('');
  const presentationRels = [
    ...slides.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`),
    `<Relationship Id="rId${slides.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
    `<Relationship Id="rId${slides.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
  ].join('');
  const entries: ZipEntry[] = [
    {
      path: '[Content_Types].xml',
      data: stringToBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>`),
    },
    {
      path: '_rels/.rels',
      data: stringToBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'),
    },
    {
      path: 'docProps/core.xml',
      data: stringToBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PDF to PowerPoint</dc:title><dc:creator>PDF Tools</dc:creator></cp:coreProperties>'),
    },
    {
      path: 'docProps/app.xml',
      data: stringToBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>PDF Tools</Application><PresentationFormat>On-screen Show (4:3)</PresentationFormat><Slides>${slides.length}</Slides></Properties>`),
    },
    {
      path: 'ppt/presentation.xml',
      data: stringToBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId${slides.length + 1}"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="th-TH"/></a:defPPr></p:defaultTextStyle></p:presentation>`),
    },
    {
      path: 'ppt/_rels/presentation.xml.rels',
      data: stringToBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presentationRels}</Relationships>`),
    },
    {
      path: 'ppt/slideMasters/slideMaster1.xml',
      data: stringToBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>'),
    },
    {
      path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: stringToBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>'),
    },
    {
      path: 'ppt/slideLayouts/slideLayout1.xml',
      data: stringToBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'),
    },
    {
      path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: stringToBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'),
    },
    {
      path: 'ppt/theme/theme1.xml',
      data: stringToBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PDF Tools"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F8FAFC"/></a:lt2><a:accent1><a:srgbClr val="146BB2"/></a:accent1><a:accent2><a:srgbClr val="126B8F"/></a:accent2><a:accent3><a:srgbClr val="F2A23A"/></a:accent3><a:accent4><a:srgbClr val="22C55E"/></a:accent4><a:accent5><a:srgbClr val="64748B"/></a:accent5><a:accent6><a:srgbClr val="DC2626"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'),
    },
  ];

  slides.forEach((slide, index) => {
    const slideNumber = index + 1;
    const imageSize = getContainedImageSize(slide.width, slide.height, 9144000, 6858000);
    const offsetX = Math.max(0, Math.round((9144000 - imageSize.width) / 2));
    const offsetY = Math.max(0, Math.round((6858000 - imageSize.height) / 2));
    entries.push(
      {
        path: `ppt/slides/slide${slideNumber}.xml`,
        data: stringToBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="หน้า ${slide.pageNumber}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${offsetX}" y="${offsetY}"/><a:ext cx="${imageSize.width}" cy="${imageSize.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`),
      },
      {
        path: `ppt/slides/_rels/slide${slideNumber}.xml.rels`,
        data: stringToBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/page' + slideNumber + '.jpg"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>'),
      },
      {
        path: `ppt/media/page${slideNumber}.jpg`,
        data: slide.imageBytes,
      },
    );
  });

  return createZip(entries);
}

function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
  }

  return btoa(binary);
}

async function createStablePptxBytes(slides: Array<{ pageNumber: number; imageBytes: Uint8Array; width: number; height: number }>) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  const slideWidth = 10;
  const slideHeight = 7.5;

  pptx.defineLayout({ name: 'PDF_4X3', width: slideWidth, height: slideHeight });
  pptx.layout = 'PDF_4X3';
  pptx.author = 'PDF Tools';
  pptx.company = 'PDF Tools';
  pptx.subject = 'Converted from PDF in browser';
  pptx.title = 'PDF to PowerPoint';
  pptx.lang = 'th-TH';
  pptx.theme = {
    headFontFace: 'Arial',
    bodyFontFace: 'Arial',
    lang: 'th-TH',
  };

  slides.forEach((page) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    const imageSize = getContainedImageSize(page.width, page.height, slideWidth, slideHeight);
    const x = Math.max(0, (slideWidth - imageSize.width) / 2);
    const y = Math.max(0, (slideHeight - imageSize.height) / 2);

    slide.addImage({
      data: `data:image/jpeg;base64,${bytesToBase64(page.imageBytes)}`,
      x,
      y,
      w: imageSize.width,
      h: imageSize.height,
    });
  });

  const output = await pptx.write({ outputType: 'arraybuffer', compression: true });

  return new Uint8Array(output as ArrayBuffer);
}

async function createStyledAnnotationImage(item: AnnotationItem) {
  const scale = 2;
  const lines = (item.text.trim() || 'ข้อความ').split('\n');
  const paddingX = 12;
  const paddingY = 8;
  const fontFamily = '"Segoe UI", Tahoma, Arial, sans-serif';
  const fontWeight = item.bold ? '700' : '400';
  const font = `${fontWeight} ${item.fontSize * scale}px ${fontFamily}`;
  const measuringCanvas = document.createElement('canvas');
  const measuringContext = measuringCanvas.getContext('2d');

  if (!measuringContext) {
    throw new Error('เบราว์เซอร์ไม่สามารถเตรียมข้อมูลสำหรับ PDF ได้');
  }

  measuringContext.font = font;
  const lineHeight = item.fontSize * 1.42;
  const widestLine = lines.reduce((width, line) => Math.max(width, measuringContext.measureText(line).width), 0);
  const width = Math.ceil(widestLine + paddingX * 2 * scale);
  const height = Math.ceil((lineHeight * lines.length + paddingY * 2) * scale);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('เบราว์เซอร์ไม่สามารถสร้างข้อมูลสำหรับ PDF ได้');
  }

  canvas.width = Math.max(width, 48 * scale);
  canvas.height = Math.max(height, 32 * scale);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = font;
  context.textBaseline = 'top';
  context.fillStyle = item.color;

  lines.forEach((line, index) => {
    const measuredWidth = context.measureText(line).width;
    const left = item.align === 'center'
      ? (canvas.width - measuredWidth) / 2
      : item.align === 'right'
        ? canvas.width - measuredWidth - paddingX * scale
        : paddingX * scale;
    context.fillText(line, left, paddingY * scale + index * lineHeight * scale);
  });

  return {
    bytes: await canvasToPngBytes(canvas),
    width: canvas.width / scale,
    height: canvas.height / scale,
  };
}

async function createBlurredPdfRegion(file: File, item: AnnotationItem) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

  const sourceBytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes) });
  const pdf = await loadingTask.promise;
  const safePageNumber = clampNumber(item.pageNumber, 1, pdf.numPages);
  const page = await pdf.getPage(safePageNumber);
  const viewport = page.getViewport({ scale: 2 });
  const sourceCanvas = document.createElement('canvas');
  const sourceContext = sourceCanvas.getContext('2d');

  if (!sourceContext) {
    throw new Error('เบราว์เซอร์ไม่สามารถสร้างภาพเบลอจาก PDF ได้');
  }

  sourceCanvas.width = Math.floor(viewport.width);
  sourceCanvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: sourceContext, viewport }).promise;

  const cropX = clampNumber((item.xPercent / 100) * sourceCanvas.width, 0, sourceCanvas.width - 2);
  const cropY = clampNumber((item.yPercent / 100) * sourceCanvas.height, 0, sourceCanvas.height - 2);
  const cropWidth = clampNumber((item.widthPercent / 100) * sourceCanvas.width, 8, sourceCanvas.width - cropX);
  const cropHeight = clampNumber((item.heightPercent / 100) * sourceCanvas.height, 8, sourceCanvas.height - cropY);
  const blurCanvas = document.createElement('canvas');
  const blurContext = blurCanvas.getContext('2d');

  if (!blurContext) {
    throw new Error('เบราว์เซอร์ไม่สามารถสร้างพื้นที่เบลอได้');
  }

  blurCanvas.width = Math.max(8, Math.round(cropWidth));
  blurCanvas.height = Math.max(8, Math.round(cropHeight));
  blurContext.filter = 'blur(8px)';
  blurContext.drawImage(
    sourceCanvas,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    blurCanvas.width,
    blurCanvas.height,
  );
  blurContext.filter = 'none';
  blurContext.fillStyle = 'rgba(255,255,255,0.18)';
  blurContext.fillRect(0, 0, blurCanvas.width, blurCanvas.height);

  return {
    bytes: await canvasToJpegBytes(blurCanvas, 0.88),
    width: blurCanvas.width,
    height: blurCanvas.height,
  };
}

async function createPdfPageThumbnails(file: File) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

  const sourceBytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes) });
  const pdf = await loadingTask.promise;
  const pages: OrganizePage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.34 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('เบราว์เซอร์ไม่สามารถแสดงตัวอย่างหน้า PDF ได้');
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    pages.push({
      id: crypto.randomUUID(),
      originalPageIndex: pageNumber - 1,
      pageNumber,
      rotation: 0,
      thumbnailUrl: canvas.toDataURL('image/jpeg', 0.82),
    });
  }

  return pages;
}

async function createPdfPagePreview(file: File, pageNumber: number) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

  const sourceBytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes) });
  const pdf = await loadingTask.promise;
  const safePageNumber = clampNumber(pageNumber, 1, pdf.numPages);
  const page = await pdf.getPage(safePageNumber);
  const viewport = page.getViewport({ scale: 1.35 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('เบราว์เซอร์ไม่สามารถแสดงตัวอย่างหน้า PDF ได้');
  }

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;

  return {
    pageNumber: safePageNumber,
    pageCount: pdf.numPages,
    imageUrl: canvas.toDataURL('image/jpeg', 0.9),
    width: canvas.width,
    height: canvas.height,
  };
}

async function extractPdfTextPages(file: File, pageRange: string) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

  const sourceBytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes) });
  const pdf = await loadingTask.promise;
  const pageIndexes = parseOptionalPageRanges(pageRange, pdf.numPages);
  const pages: ExtractedPdfPage[] = [];

  for (const pageIndex of pageIndexes) {
    const page = await pdf.getPage(pageIndex + 1);
    const textContent = await page.getTextContent();
    const textItems = textContent.items as Array<{ str?: string; transform?: number[] }>;
    const lineMap = new Map<number, Array<{ x: number; text: string }>>();

    for (const item of textItems) {
      const text = item.str?.trim();
      if (!text) {
        continue;
      }

      const transform = item.transform ?? [0, 0, 0, 0, 0, 0];
      const yKey = Math.round((transform[5] ?? 0) / 4) * 4;
      const x = transform[4] ?? 0;
      lineMap.set(yKey, [...(lineMap.get(yKey) ?? []), { x, text }]);
    }

    const lines = [...lineMap.entries()]
      .sort(([firstY], [secondY]) => secondY - firstY)
      .map(([, items]) => items
        .sort((first, second) => first.x - second.x)
        .map((item) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim())
      .filter(Boolean);

    pages.push({
      pageNumber: pageIndex + 1,
      lines,
    });
  }

  return pages;
}

async function renderPdfPagesForSlides(file: File, pageRange: string) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

  const sourceBytes = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(sourceBytes) });
  const pdf = await loadingTask.promise;
  const pageIndexes = parseOptionalPageRanges(pageRange, pdf.numPages);
  const slides: Array<{ pageNumber: number; imageBytes: Uint8Array; width: number; height: number }> = [];

  for (const pageIndex of pageIndexes) {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1.65 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('เบราว์เซอร์ไม่สามารถสร้างสไลด์จาก PDF ได้');
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;

    slides.push({
      pageNumber: pageIndex + 1,
      imageBytes: new Uint8Array(await canvasToJpegBytes(canvas, 0.9)),
      width: canvas.width,
      height: canvas.height,
    });
  }

  return slides;
}

export default function Home() {
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeId, setActiveId] = useState(tools[0].id);
  const [files, setFiles] = useState<PdfFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [splitRange, setSplitRange] = useState('1');
  const [organizePageOrder, setOrganizePageOrder] = useState('');
  const [rotateDegrees, setRotateDegrees] = useState('0');
  const [jpgRange, setJpgRange] = useState('1');
  const [officeRange, setOfficeRange] = useState('');
  const [pdfPassword, setPdfPassword] = useState('');
  const [pdfPasswordConfirm, setPdfPasswordConfirm] = useState('');
  const [downloadResults, setDownloadResults] = useState<DownloadResult[]>([]);
  const [organizePages, setOrganizePages] = useState<OrganizePage[]>([]);
  const [organizeOriginalPageCount, setOrganizeOriginalPageCount] = useState(0);
  const [draggedPageId, setDraggedPageId] = useState('');
  const [targetPage, setTargetPage] = useState('1');
  const [positionX, setPositionX] = useState('50');
  const [positionY, setPositionY] = useState('80');
  const [signatureText, setSignatureText] = useState('');
  const [signatureWidth, setSignatureWidth] = useState('180');
  const [signPreview, setSignPreview] = useState<AnnotatePreview | null>(null);
  const [signItems, setSignItems] = useState<AnnotationItem[]>([]);
  const [selectedSignItemId, setSelectedSignItemId] = useState('');
  const [draggedSignItemId, setDraggedSignItemId] = useState('');
  const [signMode, setSignMode] = useState<SignatureMode>('draw');
  const [signatureColor, setSignatureColor] = useState('#0f172a');
  const [isDrawingSignature, setIsDrawingSignature] = useState(false);
  const [typedSignatureName, setTypedSignatureName] = useState('');
  const [signatureDateValue, setSignatureDateValue] = useState(getTodayInputValue);
  const [signatureDateLocale, setSignatureDateLocale] = useState<'th' | 'en'>('th');
  const [signZoom, setSignZoom] = useState(1);
  const [annotationText, setAnnotationText] = useState('');
  const [annotationSize, setAnnotationSize] = useState('22');
  const [annotatePreview, setAnnotatePreview] = useState<AnnotatePreview | null>(null);
  const [annotateItems, setAnnotateItems] = useState<AnnotationItem[]>([]);
  const [selectedAnnotateItemId, setSelectedAnnotateItemId] = useState('');
  const [draggedAnnotateItemId, setDraggedAnnotateItemId] = useState('');
  const [annotateZoom, setAnnotateZoom] = useState(1);
  const [annotateDrawMode, setAnnotateDrawMode] = useState<DrawMode>('');
  const [annotateDrawStart, setAnnotateDrawStart] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [annotateDraftRect, setAnnotateDraftRect] = useState<DrawRect | null>(null);
  const [watermarkPreview, setWatermarkPreview] = useState<AnnotatePreview | null>(null);
  const [watermarkMode, setWatermarkMode] = useState<WatermarkMode>('text');
  const [watermarkText, setWatermarkText] = useState('สำเนา');
  const [watermarkFontSize, setWatermarkFontSize] = useState('64');
  const [watermarkRotation, setWatermarkRotation] = useState('-45');
  const [watermarkOpacity, setWatermarkOpacity] = useState('20');
  const [watermarkXPercent, setWatermarkXPercent] = useState('50');
  const [watermarkYPercent, setWatermarkYPercent] = useState('50');
  const [isDraggingWatermark, setIsDraggingWatermark] = useState(false);
  const [watermarkImageName, setWatermarkImageName] = useState('');
  const [watermarkImageDataUrl, setWatermarkImageDataUrl] = useState('');
  const [watermarkImageBytes, setWatermarkImageBytes] = useState<ArrayBuffer | null>(null);
  const [watermarkImageType, setWatermarkImageType] = useState<'png' | 'jpg' | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummaryState>({
    configured: false,
    visits: 0,
    successfulRuns: 0,
    runsLast24Hours: 0,
  });

  const activeTool = useMemo(
    () => tools.find((tool) => tool.id === activeId) ?? tools[0],
    [activeId],
  );

  function resetWorkspace() {
    setFiles([]);
    setError('');
    setSuccess('');
    setIsDragging(false);
    setSplitRange('1');
    setOrganizePageOrder('');
    setRotateDegrees('0');
    setJpgRange('1');
    setOfficeRange('');
    setPdfPassword('');
    setPdfPasswordConfirm('');
    setTargetPage('1');
    setPositionX('50');
    setPositionY('80');
    setSignatureText('');
    setSignatureWidth('180');
    setSignPreview(null);
    setSignItems([]);
    setSelectedSignItemId('');
    setDraggedSignItemId('');
    setSignMode('draw');
    setSignatureColor('#0f172a');
    setIsDrawingSignature(false);
    setTypedSignatureName('');
    setSignatureDateValue(getTodayInputValue());
    setSignatureDateLocale('th');
    setSignZoom(1);
    setAnnotationText('');
    setAnnotationSize('22');
    setAnnotatePreview(null);
    setAnnotateItems([]);
    setSelectedAnnotateItemId('');
    setDraggedAnnotateItemId('');
    setAnnotateZoom(1);
    setAnnotateDrawMode('');
    setAnnotateDrawStart(null);
    setAnnotateDraftRect(null);
    setWatermarkPreview(null);
    setWatermarkMode('text');
    setWatermarkText('สำเนา');
    setWatermarkFontSize('64');
    setWatermarkRotation('-45');
    setWatermarkOpacity('20');
    setWatermarkXPercent('50');
    setWatermarkYPercent('50');
    setIsDraggingWatermark(false);
    setWatermarkImageName('');
    setWatermarkImageDataUrl('');
    setWatermarkImageBytes(null);
    setWatermarkImageType(null);
    setOrganizePages([]);
    setOrganizeOriginalPageCount(0);
    setDraggedPageId('');
    setDownloadResults((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
  }

  const loadUsageSummary = useCallback(async () => {
    try {
      const response = await fetch('/api/usage/summary', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const data = await response.json() as {
        configured?: boolean;
        totals?: UsageSummaryRow[];
        last24Hours?: UsageSummaryRow[];
      };
      const totals = Array.isArray(data.totals) ? data.totals : [];
      const last24Hours = Array.isArray(data.last24Hours) ? data.last24Hours : [];
      const visits = totals
        .filter((row) => row.toolId === 'site-visit' && row.status === 'success')
        .reduce((sum, row) => sum + Number(row.events || 0), 0);
      const successfulRuns = totals
        .filter((row) => row.toolId !== 'site-visit' && row.status === 'success')
        .reduce((sum, row) => sum + Number(row.events || 0), 0);
      const runsLast24Hours = last24Hours
        .filter((row) => row.toolId !== 'site-visit' && row.status === 'success')
        .reduce((sum, row) => sum + Number(row.events || 0), 0);

      setUsageSummary({
        configured: data.configured === true,
        visits,
        successfulRuns,
        runsLast24Hours,
      });
    } catch {
      // Public counters are informational only.
    }
  }, []);

  useEffect(() => {
    const syncToolFromHash = () => {
      const nextId = window.location.hash.replace('#', '');
      const nextActiveId = toolIds.has(nextId) ? nextId : tools[0].id;
      resetWorkspace();
      setActiveId(nextActiveId);
    };

    syncToolFromHash();
    window.addEventListener('hashchange', syncToolFromHash);
    return () => window.removeEventListener('hashchange', syncToolFromHash);
  }, []);

  useEffect(() => {
    const visitKey = 'phithanpdf-usage-visit-tracked';
    if (sessionStorage.getItem(visitKey)) {
      window.setTimeout(() => {
        void loadUsageSummary();
      }, 0);
      return;
    }

    sessionStorage.setItem(visitKey, '1');
    const payload = JSON.stringify({
      toolId: 'site-visit',
      status: 'success',
      fileCount: 0,
      outputCount: 0,
      path: window.location.pathname + window.location.hash,
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/usage', new Blob([payload], { type: 'application/json' }));
      } else {
        void fetch('/api/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // Usage tracking must never interrupt the visitor.
    }

    window.setTimeout(() => {
      void loadUsageSummary();
    }, 500);
  }, [loadUsageSummary]);

  useEffect(() => {
    return () => {
      downloadResults.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [downloadResults]);

  function selectTool(toolId: string) {
    if (toolId !== activeId) {
      resetWorkspace();
    }
    window.history.pushState(null, '', `#${toolId}`);
    setActiveId(toolId);
  }

  async function addFiles(selectedFiles: FileList | File[]) {
    const incoming = Array.from(selectedFiles);
    const invalidPdfFiles = incoming.filter((file) => file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'));

    setSuccess('');
    setDownloadResults((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });

    if (activeTool.mode !== 'jpg-to-pdf' && invalidPdfFiles.length > 0) {
      setError('รองรับเฉพาะไฟล์ PDF เท่านั้น กรุณาเลือกไฟล์ใหม่');
      return;
    }

    if (activeTool.mode === 'jpg-to-pdf') {
      const invalidImageFiles = incoming.filter((file) => {
        const fileName = file.name.toLowerCase();
        return !file.type.startsWith('image/') && !fileName.endsWith('.jpg') && !fileName.endsWith('.jpeg') && !fileName.endsWith('.png');
      });

      if (invalidImageFiles.length > 0) {
        setError('รองรับเฉพาะไฟล์ JPG, JPEG หรือ PNG เท่านั้น กรุณาเลือกไฟล์ใหม่');
        return;
      }
    }

    const singleFileModes: ToolMode[] = ['split', 'organize', 'pdf-to-jpg', 'pdf-to-excel', 'pdf-to-word', 'pdf-to-powerpoint', 'password', 'sign', 'annotate', 'watermark'];

    if (singleFileModes.includes(activeTool.mode) && incoming.length > 1) {
      setError('เครื่องมือนี้รองรับครั้งละ 1 ไฟล์');
      return;
    }

    const nextFiles = incoming.map((file) => ({
      id: createFileId(file),
      file,
    }));

    setError('');
    setFiles((current) => (singleFileModes.includes(activeTool.mode) ? nextFiles.slice(0, 1) : [...current, ...nextFiles]));

    if (activeTool.mode === 'organize' && nextFiles[0]) {
      setIsProcessing(true);
      try {
        const thumbnails = await createPdfPageThumbnails(nextFiles[0].file);
        setOrganizePages(thumbnails);
        setOrganizeOriginalPageCount(thumbnails.length);
      } catch (caughtError) {
        setOrganizePages([]);
        setOrganizeOriginalPageCount(0);
        setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถเปิดตัวอย่างหน้า PDF ได้');
      } finally {
        setIsProcessing(false);
      }
    }

    if (activeTool.mode === 'annotate' && nextFiles[0]) {
      setIsProcessing(true);
      try {
        const preview = await createPdfPagePreview(nextFiles[0].file, 1);
        setAnnotatePreview(preview);
        setTargetPage(String(preview.pageNumber));
        setAnnotateItems([]);
        setSelectedAnnotateItemId('');
      } catch (caughtError) {
        setAnnotatePreview(null);
        setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถเปิดตัวอย่าง PDF ได้');
      } finally {
        setIsProcessing(false);
      }
    }

    if (activeTool.mode === 'sign' && nextFiles[0]) {
      setIsProcessing(true);
      try {
        const preview = await createPdfPagePreview(nextFiles[0].file, 1);
        setSignPreview(preview);
        setTargetPage(String(preview.pageNumber));
        setSignItems([]);
        setSelectedSignItemId('');
      } catch (caughtError) {
        setSignPreview(null);
        setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถเปิดตัวอย่าง PDF ได้');
      } finally {
        setIsProcessing(false);
      }
    }

    if (activeTool.mode === 'watermark' && nextFiles[0]) {
      setIsProcessing(true);
      try {
        const preview = await createPdfPagePreview(nextFiles[0].file, 1);
        setWatermarkPreview(preview);
      } catch (caughtError) {
        setWatermarkPreview(null);
        setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถเปิดตัวอย่าง PDF ได้');
      } finally {
        setIsProcessing(false);
      }
    }
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void addFiles(event.target.files);
      event.target.value = '';
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void addFiles(event.dataTransfer.files);
  }

  function moveFile(index: number, direction: -1 | 1) {
    setFiles((current) => {
      const next = [...current];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) {
        return next;
      }
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function moveOrganizePage(fromId: string, toId: string) {
    if (!fromId || fromId === toId) {
      return;
    }

    setOrganizePages((current) => {
      const fromIndex = current.findIndex((page) => page.id === fromId);
      const toIndex = current.findIndex((page) => page.id === toId);

      if (fromIndex < 0 || toIndex < 0) {
        return current;
      }

      const next = [...current];
      const [movedPage] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, movedPage);
      return next;
    });
  }

  function rotateOrganizePage(pageId: string) {
    setOrganizePages((current) => current.map((page) => (
      page.id === pageId ? { ...page, rotation: (page.rotation + 90) % 360 } : page
    )));
  }

  function removeOrganizePage(pageId: string) {
    setOrganizePages((current) => current.filter((page) => page.id !== pageId));
    setDownloadResults((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
    setSuccess('');
    setError('');
  }

  function removeFile(fileId: string) {
    setFiles((current) => current.filter((item) => item.id !== fileId));
    setOrganizePages([]);
    setOrganizeOriginalPageCount(0);
    setAnnotatePreview(null);
    setAnnotateItems([]);
    setSelectedAnnotateItemId('');
    setSignPreview(null);
    setSignItems([]);
    setSelectedSignItemId('');
    setDraggedSignItemId('');
    setWatermarkPreview(null);
    setError('');
    setSuccess('');
    setDownloadResults((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return [];
    });
  }

  function setNewDownloads(items: Array<{ blob: Blob; fileName: string }>) {
    setDownloadResults((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.url));
      return items.map((item) => ({
        id: crypto.randomUUID(),
        url: URL.createObjectURL(item.blob),
        fileName: item.fileName,
      }));
    });
  }

  function trackUsage(
    toolId: UsageToolId,
    status: UsageStatus,
    detail: { fileCount?: number; outputCount?: number; errorCode?: string } = {},
  ) {
    const payload = JSON.stringify({
      toolId,
      status,
      fileCount: detail.fileCount ?? files.length,
      outputCount: detail.outputCount ?? 0,
      errorCode: detail.errorCode,
      path: window.location.pathname + window.location.hash,
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/usage', new Blob([payload], { type: 'application/json' }));
      } else {
        void fetch('/api/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // Usage tracking must never interrupt PDF processing.
    }

    window.setTimeout(() => {
      void loadUsageSummary();
    }, 500);
  }

  async function refreshAnnotatePreview(pageNumber: number) {
    const sourceFile = files[0]?.file;
    if (!sourceFile) {
      return;
    }

    setError('');
    setIsProcessing(true);
    try {
      const preview = await createPdfPagePreview(sourceFile, pageNumber);
      setAnnotatePreview(preview);
      setTargetPage(String(preview.pageNumber));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถเปลี่ยนหน้าตัวอย่าง PDF ได้');
    } finally {
      setIsProcessing(false);
    }
  }

  async function refreshSignPreview(pageNumber: number) {
    const sourceFile = files[0]?.file;
    if (!sourceFile) {
      return;
    }

    setError('');
    setIsProcessing(true);
    try {
      const preview = await createPdfPagePreview(sourceFile, pageNumber);
      setSignPreview(preview);
      setTargetPage(String(preview.pageNumber));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถเปลี่ยนหน้าตัวอย่าง PDF ได้');
    } finally {
      setIsProcessing(false);
    }
  }

  function updateAnnotationItem(itemId: string, updates: Partial<AnnotationItem>) {
    setAnnotateItems((current) => current.map((item) => (
      item.id === itemId ? { ...item, ...updates } : item
    )));
  }

  function updateSignItem(itemId: string, updates: Partial<AnnotationItem>) {
    setSignItems((current) => current.map((item) => (
      item.id === itemId ? { ...item, ...updates } : item
    )));
  }

  function addAnnotationTextBox() {
    const pageNumber = annotatePreview?.pageNumber ?? 1;
    const newItem: AnnotationItem = {
      id: crypto.randomUUID(),
      kind: 'text',
      text: `ช่องข้อความ ${annotateItems.length + 1}`,
      pageNumber,
      xPercent: 18,
      yPercent: 18 + annotateItems.length * 7,
      widthPercent: 28,
      heightPercent: 7,
      fontSize: 18,
      rotation: 0,
      align: 'left',
      color: '#0f172a',
      bold: false,
    };

    setAnnotateItems((current) => [...current, newItem]);
    setSelectedAnnotateItemId(newItem.id);
    setError('');
    setSuccess('');
  }

  function addAnnotationSymbol(symbol: string) {
    const pageNumber = annotatePreview?.pageNumber ?? 1;
    const newItem: AnnotationItem = {
      id: crypto.randomUUID(),
      kind: 'symbol',
      text: symbol,
      pageNumber,
      xPercent: 46,
      yPercent: 34,
      widthPercent: 8,
      heightPercent: 7,
      fontSize: 28,
      rotation: 0,
      align: 'center',
      color: '#0f172a',
      bold: true,
    };

    setAnnotateItems((current) => [...current, newItem]);
    setSelectedAnnotateItemId(newItem.id);
    setError('');
    setSuccess('');
  }

  async function addAnnotationImage(file: File) {
    const fileName = file.name.toLowerCase();
    const isPng = file.type === 'image/png' || fileName.endsWith('.png');
    const isJpg = file.type === 'image/jpeg' || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');

    if (!isPng && !isJpg) {
      setError('รองรับเฉพาะไฟล์รูปภาพ JPG, JPEG หรือ PNG เท่านั้น');
      return;
    }

    const imageBytes = await file.arrayBuffer();
    const imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
      reader.readAsDataURL(file);
    });
    const newItem: AnnotationItem = {
      id: crypto.randomUUID(),
      kind: 'image',
      text: file.name,
      pageNumber: annotatePreview?.pageNumber ?? 1,
      xPercent: 58,
      yPercent: 20,
      widthPercent: 18,
      heightPercent: 14,
      fontSize: 18,
      rotation: 0,
      align: 'center',
      color: '#0f172a',
      bold: false,
      imageBytes,
      imageDataUrl,
      imageType: isPng ? 'png' : 'jpg',
    };

    setAnnotateItems((current) => [...current, newItem]);
    setSelectedAnnotateItemId(newItem.id);
    setError('');
    setSuccess('');
  }

  async function addSignatureImage(file: File) {
    const fileName = file.name.toLowerCase();
    const isPng = file.type === 'image/png' || fileName.endsWith('.png');
    const isJpg = file.type === 'image/jpeg' || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');

    if (!isPng && !isJpg) {
      setError('รองรับเฉพาะไฟล์รูปลายเซ็น JPG, JPEG หรือ PNG เท่านั้น');
      return;
    }

    try {
      const imageBytes = await file.arrayBuffer();
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปลายเซ็นได้'));
        reader.readAsDataURL(file);
      });
      const newItem: AnnotationItem = {
        id: crypto.randomUUID(),
        kind: 'image',
        text: file.name,
        pageNumber: signPreview?.pageNumber ?? 1,
        xPercent: 66,
        yPercent: 78,
        widthPercent: 16,
        heightPercent: 7,
        fontSize: 18,
        rotation: 0,
        align: 'center',
        color: signatureColor,
        bold: false,
        imageBytes,
        imageDataUrl,
        imageType: isPng ? 'png' : 'jpg',
      };

      setSignItems((current) => [...current, newItem]);
      setSelectedSignItemId(newItem.id);
      setError('');
      setSuccess('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถเพิ่มรูปลายเซ็นได้');
    }
  }

  function getSignatureCanvasPointer(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * (canvas?.width ?? bounds.width),
      y: ((event.clientY - bounds.top) / bounds.height) * (canvas?.height ?? bounds.height),
    };
  }

  function startSignatureDraw(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    const point = getSignatureCanvasPointer(event);
    context.strokeStyle = signatureColor;
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(point.x, point.y);
    setIsDrawingSignature(true);
    setError('');
    setSuccess('');
  }

  function drawSignature(event: MouseEvent<HTMLCanvasElement>) {
    if (!isDrawingSignature) {
      return;
    }

    const context = signatureCanvasRef.current?.getContext('2d');
    if (!context) {
      return;
    }

    const point = getSignatureCanvasPointer(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function clearSignatureCanvas() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    setIsDrawingSignature(false);
    setError('');
    setSuccess('');
  }

  async function addDrawnSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) {
      setError('เบราว์เซอร์ไม่สามารถเตรียมพื้นที่วาดลายเซ็นได้');
      return;
    }

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasInk = Array.from({ length: pixels.length / 4 }).some((_, index) => pixels[index * 4 + 3] > 0);
    if (!hasInk) {
      setError('กรุณาวาดลายเซ็นก่อนกดเพิ่ม');
      return;
    }

    const imageBytes = await canvasToPngBytes(canvas);
    const newItem: AnnotationItem = {
      id: crypto.randomUUID(),
      kind: 'image',
      text: 'ลายเซ็น',
      pageNumber: signPreview?.pageNumber ?? 1,
      xPercent: 63,
      yPercent: 78,
      widthPercent: 18,
      heightPercent: 7,
      fontSize: 18,
      rotation: 0,
      align: 'center',
      color: signatureColor,
      bold: false,
      imageBytes,
      imageDataUrl: canvas.toDataURL('image/png'),
      imageType: 'png',
    };

    setSignItems((current) => [...current, newItem]);
    setSelectedSignItemId(newItem.id);
    setError('');
    setSuccess('');
  }

  function addTypedSignature() {
    const trimmedName = typedSignatureName.trim();
    if (!trimmedName) {
      setError('กรุณาพิมพ์ชื่อก่อนกดเพิ่มชื่อ');
      return;
    }

    const newItem: AnnotationItem = {
      id: crypto.randomUUID(),
      kind: 'text',
      text: trimmedName,
      pageNumber: signPreview?.pageNumber ?? 1,
      xPercent: 60,
      yPercent: 79,
      widthPercent: 22,
      heightPercent: 6,
      fontSize: 22,
      rotation: 0,
      align: 'center',
      color: signatureColor,
      bold: false,
    };

    setSignItems((current) => [...current, newItem]);
    setSelectedSignItemId(newItem.id);
    setError('');
    setSuccess('');
  }

  function addSignatureDate() {
    const text = formatSignatureDate(signatureDateValue, signatureDateLocale);
    if (!text) {
      setError('กรุณาเลือกวันที่ก่อนกดเพิ่มวันที่');
      return;
    }

    const newItem: AnnotationItem = {
      id: crypto.randomUUID(),
      kind: 'text',
      text,
      pageNumber: signPreview?.pageNumber ?? 1,
      xPercent: 58,
      yPercent: 86,
      widthPercent: 26,
      heightPercent: 5,
      fontSize: 16,
      rotation: 0,
      align: 'center',
      color: signatureColor,
      bold: false,
    };

    setSignItems((current) => [...current, newItem]);
    setSelectedSignItemId(newItem.id);
    setError('');
    setSuccess('');
  }

  async function addWatermarkImage(file: File) {
    const fileName = file.name.toLowerCase();
    const isPng = file.type === 'image/png' || fileName.endsWith('.png');
    const isJpg = file.type === 'image/jpeg' || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');

    if (!isPng && !isJpg) {
      setError('รองรับเฉพาะไฟล์รูปภาพ JPG, JPEG หรือ PNG เท่านั้น');
      return;
    }

    try {
      const imageBytes = await file.arrayBuffer();
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
        reader.readAsDataURL(file);
      });

      setWatermarkImageName(file.name);
      setWatermarkImageDataUrl(imageDataUrl);
      setWatermarkImageBytes(imageBytes);
      setWatermarkImageType(isPng ? 'png' : 'jpg');
      setWatermarkMode('image');
      setError('');
      setSuccess('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถอ่านไฟล์รูปลายน้ำได้');
    }
  }

  function moveWatermarkToPointer(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextX = clampNumber(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const nextY = clampNumber(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100);

    setWatermarkXPercent(nextX.toFixed(1));
    setWatermarkYPercent(nextY.toFixed(1));
    setError('');
    setSuccess('');
  }

  function startWatermarkDrag(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDraggingWatermark(true);
    moveWatermarkToPointer(event);
  }

  function updateWatermarkDrag(event: MouseEvent<HTMLDivElement>) {
    if (!isDraggingWatermark || event.buttons !== 1) {
      return;
    }

    moveWatermarkToPointer(event);
  }

  function beginDrawMode(mode: Exclude<DrawMode, ''>) {
    setAnnotateDrawMode((current) => (current === mode ? '' : mode));
    setAnnotateDrawStart(null);
    setAnnotateDraftRect(null);
    setDraggedAnnotateItemId('');
    setSelectedAnnotateItemId('');
    setError('');
    setSuccess('');
  }

  function createAreaItem(kind: Exclude<DrawMode, ''>, rect: DrawRect) {
    const newItem: AnnotationItem = {
      id: crypto.randomUUID(),
      kind,
      text: kind === 'crop' ? 'ครอบตัดหน้า' : 'เบลอข้อมูล',
      pageNumber: annotatePreview?.pageNumber ?? 1,
      xPercent: rect.xPercent,
      yPercent: rect.yPercent,
      widthPercent: rect.widthPercent,
      heightPercent: rect.heightPercent,
      fontSize: 18,
      rotation: 0,
      align: 'center',
      color: kind === 'crop' ? '#dc2626' : '#1d4ed8',
      bold: false,
    };

    setAnnotateItems((current) => (
      kind === 'crop'
        ? [...current.filter((item) => !(item.kind === 'crop' && item.pageNumber === newItem.pageNumber)), newItem]
        : [...current, newItem]
    ));
    setSelectedAnnotateItemId(newItem.id);
    setAnnotateDrawMode('');
    setAnnotateDrawStart(null);
    setAnnotateDraftRect(null);
    setError('');
    setSuccess('');
  }

  function getAnnotatePointer(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      xPercent: clampNumber(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
      yPercent: clampNumber(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100),
    };
  }

  function getRectFromPoints(start: { xPercent: number; yPercent: number }, end: { xPercent: number; yPercent: number }) {
    const xPercent = Math.min(start.xPercent, end.xPercent);
    const yPercent = Math.min(start.yPercent, end.yPercent);
    return {
      xPercent,
      yPercent,
      widthPercent: Math.abs(end.xPercent - start.xPercent),
      heightPercent: Math.abs(end.yPercent - start.yPercent),
    };
  }

  function startAreaDraw(event: MouseEvent<HTMLDivElement>) {
    if (!annotateDrawMode) {
      return;
    }

    event.preventDefault();
    const start = getAnnotatePointer(event);
    setAnnotateDrawStart(start);
    setAnnotateDraftRect({
      xPercent: start.xPercent,
      yPercent: start.yPercent,
      widthPercent: 0,
      heightPercent: 0,
    });
  }

  function updateAreaDraw(event: MouseEvent<HTMLDivElement>) {
    if (!annotateDrawMode || !annotateDrawStart || event.buttons !== 1) {
      return;
    }

    setAnnotateDraftRect(getRectFromPoints(annotateDrawStart, getAnnotatePointer(event)));
  }

  function finishAreaDraw(event: MouseEvent<HTMLDivElement>) {
    if (!annotateDrawMode || !annotateDrawStart) {
      setDraggedAnnotateItemId('');
      return;
    }

    const rect = getRectFromPoints(annotateDrawStart, getAnnotatePointer(event));
    if (rect.widthPercent < 1.5 || rect.heightPercent < 1.5) {
      setAnnotateDrawStart(null);
      setAnnotateDraftRect(null);
      setError('กรุณาลากกรอบให้มีขนาดใหญ่ขึ้น');
      return;
    }

    createAreaItem(annotateDrawMode, rect);
  }

  function removeAnnotationItem(itemId: string) {
    setAnnotateItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedAnnotateItemId((current) => (current === itemId ? '' : current));
    setSuccess('');
    setError('');
  }

  function moveAnnotationItem(event: MouseEvent<HTMLDivElement>, itemId: string) {
    if (!annotatePreview) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const xPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
    const yPercent = ((event.clientY - bounds.top) / bounds.height) * 100;
    const currentItem = annotateItems.find((item) => item.id === itemId);
    updateAnnotationItem(itemId, {
      xPercent: clampNumber(xPercent, 0, 100 - (currentItem?.widthPercent ?? 4)),
      yPercent: clampNumber(yPercent, 0, 100 - (currentItem?.heightPercent ?? 4)),
    });
  }

  function removeSignItem(itemId: string) {
    setSignItems((current) => current.filter((item) => item.id !== itemId));
    setSelectedSignItemId((current) => (current === itemId ? '' : current));
    setSuccess('');
    setError('');
  }

  function moveSignItem(event: MouseEvent<HTMLDivElement>, itemId: string) {
    if (!signPreview) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const xPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
    const yPercent = ((event.clientY - bounds.top) / bounds.height) * 100;
    const currentItem = signItems.find((item) => item.id === itemId);
    updateSignItem(itemId, {
      xPercent: clampNumber(xPercent, 0, 100 - (currentItem?.widthPercent ?? 4)),
      yPercent: clampNumber(yPercent, 0, 100 - (currentItem?.heightPercent ?? 4)),
    });
  }

  function placeSignatureCenter() {
    const selectedItem = signItems.find((item) => item.id === selectedSignItemId) ?? signItems[0];
    if (!selectedItem) {
      setError('กรุณาเพิ่มลายเซ็นก่อนวางตรงกลางหน้า');
      return;
    }

    updateSignItem(selectedItem.id, {
      xPercent: clampNumber(50 - selectedItem.widthPercent / 2, 0, 100 - selectedItem.widthPercent),
      yPercent: clampNumber(50 - selectedItem.heightPercent / 2, 0, 100 - selectedItem.heightPercent),
    });
    setSelectedSignItemId(selectedItem.id);
    setError('');
    setSuccess('');
  }

  async function mergePdfFiles() {
    if (files.length < 2) {
      setError('กรุณาเลือกไฟล์ PDF อย่างน้อย 2 ไฟล์สำหรับการรวมไฟล์');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const item of files) {
        const bytes = await item.file.arrayBuffer();
        const sourcePdf = await PDFDocument.load(bytes);
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      setNewDownloads([{ blob, fileName: `รวมไฟล์-${new Date().toISOString().slice(0, 10)}.pdf` }]);
      setSuccess('รวมไฟล์ PDF สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('merge', 'success', { fileCount: files.length, outputCount: 1 });
    } catch {
      setError('ไม่สามารถรวมไฟล์ PDF ได้ กรุณาตรวจสอบว่าไฟล์ไม่เสียหายหรือไม่ได้เข้ารหัส');
      trackUsage('merge', 'error', { fileCount: files.length, errorCode: 'merge_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function splitPdfFile() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับการแยกไฟล์');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const sourceFile = files[0].file;
      const sourceBytes = await sourceFile.arrayBuffer();
      const sourcePdf = await PDFDocument.load(sourceBytes);
      const pageIndexes = parsePageRanges(splitRange, sourcePdf.getPageCount());
      const splitPdf = await PDFDocument.create();
      const copiedPages = await splitPdf.copyPages(sourcePdf, pageIndexes);
      copiedPages.forEach((page) => splitPdf.addPage(page));

      const splitBytes = await splitPdf.save();
      const blob = new Blob([splitBytes], { type: 'application/pdf' });
      setNewDownloads([{ blob, fileName: `แยกไฟล์-${cleanFileBaseName(sourceFile.name)}.pdf` }]);
      setSuccess('แยกไฟล์ PDF สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('split', 'success', { fileCount: 1, outputCount: 1 });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถแยกไฟล์ PDF ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('split', 'error', { fileCount: files.length, errorCode: 'split_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function organizePdfFile() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับการจัดหน้า');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const sourceFile = files[0].file;
      const sourceBytes = await sourceFile.arrayBuffer();
      const sourcePdf = await PDFDocument.load(sourceBytes);
      const pagePlan = organizePages.length > 0
        ? organizePages
        : parseOptionalPageRanges(organizePageOrder, sourcePdf.getPageCount()).map((pageIndex) => ({
          id: `${pageIndex}`,
          originalPageIndex: pageIndex,
          pageNumber: pageIndex + 1,
          rotation: Number(rotateDegrees),
          thumbnailUrl: '',
        }));

      if (pagePlan.length === 0) {
        setError('กรุณาเหลืออย่างน้อย 1 หน้าเพื่อบันทึกไฟล์ใหม่');
        return;
      }

      const organizedPdf = await PDFDocument.create();
      const copiedPages = await organizedPdf.copyPages(sourcePdf, pagePlan.map((page) => page.originalPageIndex));

      copiedPages.forEach((page, index) => {
        const rotation = pagePlan[index].rotation || 0;
        if (rotation) {
          page.setRotation(degrees(rotation));
        }
        organizedPdf.addPage(page);
      });

      const organizedBytes = await organizedPdf.save();
      const blob = new Blob([organizedBytes], { type: 'application/pdf' });
      setNewDownloads([{ blob, fileName: `จัดหน้า-${cleanFileBaseName(sourceFile.name)}.pdf` }]);
      setSuccess('จัดหน้า PDF สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('organize', 'success', { fileCount: 1, outputCount: 1 });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถจัดหน้า PDF ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('organize', 'error', { fileCount: files.length, errorCode: 'organize_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function convertPdfToJpg() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับแปลงเป็น JPG');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';

      const sourceFile = files[0].file;
      const sourceBytes = await sourceFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(sourceBytes),
      });
      const pdf = await loadingTask.promise;
      const pageIndexes = parsePageRanges(jpgRange, pdf.numPages);
      const results: Array<{ blob: Blob; fileName: string }> = [];

      for (const pageIndex of pageIndexes) {
        const page = await pdf.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('เบราว์เซอร์ไม่สามารถสร้างภาพจาก PDF ได้');
        }

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await canvasToJpegBlob(canvas, 0.92);
        results.push({
          blob,
          fileName: `${cleanFileBaseName(sourceFile.name)}-หน้า-${pageIndex + 1}.jpg`,
        });
      }

      setNewDownloads(results);
      setSuccess(`แปลง PDF เป็น JPG สำเร็จ ${results.length} ไฟล์ กรุณากดดาวน์โหลดไฟล์`);
      trackUsage('pdf-to-jpg', 'success', { fileCount: 1, outputCount: results.length });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถแปลง PDF เป็น JPG ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('pdf-to-jpg', 'error', { fileCount: files.length, errorCode: 'pdf_to_jpg_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function convertJpgToPdf() {
    if (files.length < 1) {
      setError('กรุณาเลือกไฟล์ JPG, JPEG หรือ PNG อย่างน้อย 1 ไฟล์');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const pdf = await PDFDocument.create();

      for (const item of files) {
        const imageBytes = await item.file.arrayBuffer();
        const fileName = item.file.name.toLowerCase();
        const image = fileName.endsWith('.png')
          ? await pdf.embedPng(imageBytes)
          : await pdf.embedJpg(imageBytes);
        const page = pdf.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
      }

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setNewDownloads([{ blob, fileName: `รูปภาพเป็น-pdf-${new Date().toISOString().slice(0, 10)}.pdf` }]);
      setSuccess('แปลง JPG เป็น PDF สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('jpg-to-pdf', 'success', { fileCount: files.length, outputCount: 1 });
    } catch {
      setError('ไม่สามารถแปลงรูปภาพเป็น PDF ได้ กรุณาตรวจสอบว่าไฟล์รูปภาพไม่เสียหาย');
      trackUsage('jpg-to-pdf', 'error', { fileCount: files.length, errorCode: 'jpg_to_pdf_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function convertPdfToWord() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับแปลงเป็น Word');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const sourceFile = files[0].file;
      const pages = await renderPdfPagesForSlides(sourceFile, officeRange);
      const docxBytes = await createImageDocxBytes(pages);
      const blob = new Blob([docxBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      setNewDownloads([{ blob, fileName: `${cleanFileBaseName(sourceFile.name)}.docx` }]);
      setSuccess('แปลง PDF เป็น Word สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('pdf-to-word', 'success', { fileCount: 1, outputCount: 1 });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถแปลง PDF เป็น Word ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('pdf-to-word', 'error', { fileCount: files.length, errorCode: 'pdf_to_word_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function convertPdfToExcel() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับแปลงเป็น Excel');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const sourceFile = files[0].file;
      const pages = await extractPdfTextPages(sourceFile, officeRange);
      const xlsxBytes = await createXlsxBytes(pages);
      const blob = new Blob([xlsxBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      setNewDownloads([{ blob, fileName: `${cleanFileBaseName(sourceFile.name)}.xlsx` }]);
      setSuccess('แปลง PDF เป็น Excel สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('pdf-to-excel', 'success', { fileCount: 1, outputCount: 1 });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถแปลง PDF เป็น Excel ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('pdf-to-excel', 'error', { fileCount: files.length, errorCode: 'pdf_to_excel_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function convertPdfToPowerPoint() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับแปลงเป็น PowerPoint');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const sourceFile = files[0].file;
      const slides = await renderPdfPagesForSlides(sourceFile, officeRange);
      const pptxBytes = await createStablePptxBytes(slides);
      const blob = new Blob([pptxBytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      setNewDownloads([{ blob, fileName: `${cleanFileBaseName(sourceFile.name)}.pptx` }]);
      setSuccess('แปลง PDF เป็น PowerPoint สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('pdf-to-powerpoint', 'success', { fileCount: 1, outputCount: 1 });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถแปลง PDF เป็น PowerPoint ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('pdf-to-powerpoint', 'error', { fileCount: files.length, errorCode: 'pdf_to_powerpoint_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function protectPdfWithPassword() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับใส่รหัสผ่าน');
      return;
    }

    if (!pdfPassword) {
      setError('กรุณากรอกรหัสผ่านสำหรับเปิดไฟล์ PDF');
      return;
    }

    if (pdfPassword.length < 4) {
      setError('รหัสผ่านควรมีอย่างน้อย 4 ตัวอักษร');
      return;
    }

    if (pdfPassword !== pdfPasswordConfirm) {
      setError('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const sourceFile = files[0].file;
      const sourceBytes = await sourceFile.arrayBuffer();
      const encryptedBytes = await encryptPdfWithPassword(sourceBytes, pdfPassword);
      const blob = new Blob([encryptedBytes], { type: 'application/pdf' });
      setNewDownloads([{ blob, fileName: `ใส่รหัสผ่าน-${cleanFileBaseName(sourceFile.name)}.pdf` }]);
      setSuccess('ใส่รหัสผ่าน PDF สำเร็จแล้ว กรุณาดาวน์โหลดไฟล์และทดสอบเปิดด้วยรหัสผ่านที่ตั้งไว้');
      trackUsage('password', 'success', { fileCount: 1, outputCount: 1 });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถใส่รหัสผ่าน PDF ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('password', 'error', { fileCount: files.length, errorCode: 'password_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function signPdfFile() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับเซ็นเอกสาร');
      return;
    }

    const trimmedSignature = signatureText.trim();
    const itemsToSave = signItems.length > 0
      ? signItems
      : trimmedSignature
        ? [{
          id: crypto.randomUUID(),
          kind: 'text' as const,
          text: trimmedSignature,
          pageNumber: getFiniteNumber(targetPage, 1),
          xPercent: 8,
          yPercent: 12,
          widthPercent: Math.max(10, Math.min(getFiniteNumber(signatureWidth, 180) / 6, 48)),
          heightPercent: 7,
          fontSize: 34,
          rotation: 0,
          align: 'center' as const,
          color: '#0f172a',
          bold: false,
        }]
        : [];

    if (itemsToSave.length === 0) {
      setError('กรุณาเพิ่มลายเซ็นก่อนบันทึกเอกสาร');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const sourceFile = files[0].file;
      const sourceBytes = await sourceFile.arrayBuffer();
      const pdf = await PDFDocument.load(sourceBytes);

      for (const item of itemsToSave) {
        const pageIndex = getPageIndexFromInput(String(item.pageNumber), pdf.getPageCount());
        const page = pdf.getPages()[pageIndex];
        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();

        if (item.kind === 'image' && item.imageBytes && item.imageType) {
          const embeddedSignature = item.imageType === 'png'
            ? await pdf.embedPng(item.imageBytes)
            : await pdf.embedJpg(item.imageBytes);
          const drawWidth = clampNumber((item.widthPercent / 100) * pageWidth, 24, pageWidth);
          const drawHeight = clampNumber((item.heightPercent / 100) * pageHeight, 12, pageHeight);
          const x = clampNumber((item.xPercent / 100) * pageWidth, 0, pageWidth - drawWidth);
          const yFromTop = clampNumber((item.yPercent / 100) * pageHeight, 0, pageHeight - drawHeight);

          page.drawImage(embeddedSignature, {
            x,
            y: pageHeight - yFromTop - drawHeight,
            width: drawWidth,
            height: drawHeight,
            rotate: degrees(item.rotation),
          });
          continue;
        }

        const signatureImage = await createStyledAnnotationImage({
          ...item,
          kind: 'text',
          fontSize: clampNumber(item.fontSize, 10, 72),
        });
        const embeddedSignature = await pdf.embedPng(signatureImage.bytes);
        const drawWidth = clampNumber((item.widthPercent / 100) * pageWidth, 24, pageWidth);
        const drawHeight = signatureImage.height * (drawWidth / signatureImage.width);
        const x = clampNumber((item.xPercent / 100) * pageWidth, 0, pageWidth - drawWidth);
        const yFromTop = clampNumber((item.yPercent / 100) * pageHeight, 0, pageHeight - drawHeight);

        page.drawImage(embeddedSignature, {
          x,
          y: pageHeight - yFromTop - drawHeight,
          width: drawWidth,
          height: drawHeight,
          rotate: degrees(item.rotation),
        });
      }

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setNewDownloads([{ blob, fileName: `เซ็นเอกสาร-${cleanFileBaseName(sourceFile.name)}.pdf` }]);
      setSuccess('เซ็นเอกสาร PDF สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('sign', 'success', { fileCount: 1, outputCount: 1 });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถเซ็นเอกสาร PDF ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('sign', 'error', { fileCount: files.length, errorCode: 'sign_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function annotatePdfFile() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับเพิ่มข้อมูล');
      return;
    }

    const itemsToSave = annotateItems.length > 0
      ? annotateItems
      : annotationText.trim()
        ? [{
          id: crypto.randomUUID(),
          kind: 'text' as const,
          text: annotationText.trim(),
          pageNumber: getFiniteNumber(targetPage, 1),
          xPercent: 8,
          yPercent: 10,
          widthPercent: 42,
          heightPercent: 8,
          fontSize: Math.max(10, Math.min(getFiniteNumber(annotationSize, 22), 72)),
          rotation: 0,
          align: 'left' as const,
          color: '#0f172a',
          bold: false,
        }]
        : [];

    if (itemsToSave.length === 0) {
      setError('กรุณาเพิ่มช่องข้อความ สัญลักษณ์ หรือรูปภาพก่อนบันทึกไฟล์');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const sourceFile = files[0].file;
      const sourceBytes = await sourceFile.arrayBuffer();
      const pdf = await PDFDocument.load(sourceBytes);

      for (const item of itemsToSave) {
        const pageIndex = getPageIndexFromInput(String(item.pageNumber), pdf.getPageCount());
        const page = pdf.getPages()[pageIndex];
        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();

        if (item.kind === 'crop') {
          const cropX = clampNumber((item.xPercent / 100) * pageWidth, 0, pageWidth - 20);
          const cropHeight = clampNumber((item.heightPercent / 100) * pageHeight, 20, pageHeight);
          const cropWidth = clampNumber((item.widthPercent / 100) * pageWidth, 20, pageWidth - cropX);
          const cropYFromTop = clampNumber((item.yPercent / 100) * pageHeight, 0, pageHeight - cropHeight);
          const cropY = pageHeight - cropYFromTop - cropHeight;

          page.setCropBox(cropX, cropY, cropWidth, cropHeight);
          continue;
        }

        if (item.kind === 'blur') {
          const blurImage = await createBlurredPdfRegion(sourceFile, item);
          const embeddedBlur = await pdf.embedJpg(blurImage.bytes);
          const drawWidth = clampNumber((item.widthPercent / 100) * pageWidth, 18, pageWidth);
          const drawHeight = clampNumber((item.heightPercent / 100) * pageHeight, 18, pageHeight);
          const x = clampNumber((item.xPercent / 100) * pageWidth, 0, pageWidth - drawWidth);
          const yFromTop = clampNumber((item.yPercent / 100) * pageHeight, 0, pageHeight - drawHeight);

          page.drawImage(embeddedBlur, {
            x,
            y: pageHeight - yFromTop - drawHeight,
            width: drawWidth,
            height: drawHeight,
          });
          continue;
        }

        if (item.kind === 'image' && item.imageBytes && item.imageType) {
          const embeddedImage = item.imageType === 'png'
            ? await pdf.embedPng(item.imageBytes)
            : await pdf.embedJpg(item.imageBytes);
          const drawWidth = clampNumber((item.widthPercent / 100) * pageWidth, 24, pageWidth);
          const drawHeight = embeddedImage.height * (drawWidth / embeddedImage.width);
          const x = clampNumber((item.xPercent / 100) * pageWidth, 0, pageWidth - drawWidth);
          const yFromTop = clampNumber((item.yPercent / 100) * pageHeight, 0, pageHeight - drawHeight);

          page.drawImage(embeddedImage, {
            x,
            y: pageHeight - yFromTop - drawHeight,
            width: drawWidth,
            height: drawHeight,
            rotate: degrees(item.rotation),
          });
          continue;
        }

        const annotationImage = await createStyledAnnotationImage(item);
        const embeddedAnnotation = await pdf.embedPng(annotationImage.bytes);
        const drawWidth = clampNumber((item.widthPercent / 100) * pageWidth, 18, pageWidth);
        const drawHeight = annotationImage.height * (drawWidth / annotationImage.width);
        const x = clampNumber((item.xPercent / 100) * pageWidth, 0, pageWidth - drawWidth);
        const yFromTop = clampNumber((item.yPercent / 100) * pageHeight, 0, pageHeight - drawHeight);

        page.drawImage(embeddedAnnotation, {
          x,
          y: pageHeight - yFromTop - drawHeight,
          width: drawWidth,
          height: drawHeight,
          rotate: degrees(item.rotation),
        });
      }

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setNewDownloads([{ blob, fileName: `เพิ่มข้อมูล-${cleanFileBaseName(sourceFile.name)}.pdf` }]);
      setSuccess('เพิ่มข้อมูลใน PDF สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('annotate', 'success', { fileCount: 1, outputCount: 1 });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถเพิ่มข้อมูลใน PDF ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('annotate', 'error', { fileCount: files.length, errorCode: 'annotate_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function watermarkPdfFile() {
    if (files.length !== 1) {
      setError('กรุณาเลือกไฟล์ PDF 1 ไฟล์สำหรับใส่ลายน้ำ');
      return;
    }

    const trimmedText = watermarkText.trim();
    if (watermarkMode === 'text' && !trimmedText) {
      setError('กรุณาพิมพ์ข้อความลายน้ำก่อนบันทึกไฟล์');
      return;
    }

    if (watermarkMode === 'image' && (!watermarkImageBytes || !watermarkImageType)) {
      setError('กรุณาเลือกรูปภาพลายน้ำก่อนบันทึกไฟล์');
      return;
    }

    setError('');
    setSuccess('');
    setIsProcessing(true);

    try {
      const sourceFile = files[0].file;
      const sourceBytes = await sourceFile.arrayBuffer();
      const pdf = await PDFDocument.load(sourceBytes);
      const opacity = clampNumber(getFiniteNumber(watermarkOpacity, 20), 5, 80) / 100;
      const rotation = clampNumber(getFiniteNumber(watermarkRotation, -45), -90, 90);
      const xPercent = clampNumber(getFiniteNumber(watermarkXPercent, 50), 0, 100);
      const yPercent = clampNumber(getFiniteNumber(watermarkYPercent, 50), 0, 100);

      let embeddedWatermark;
      let sourceWidth = 0;
      let sourceHeight = 0;

      if (watermarkMode === 'text') {
        const textImage = await createStyledAnnotationImage({
          id: 'watermark-text',
          kind: 'text',
          text: trimmedText,
          pageNumber: 1,
          xPercent: 0,
          yPercent: 0,
          widthPercent: 0,
          heightPercent: 0,
          fontSize: clampNumber(getFiniteNumber(watermarkFontSize, 64), 5, 96),
          rotation,
          align: 'center',
          color: '#94a3b8',
          bold: true,
        });
        embeddedWatermark = await pdf.embedPng(textImage.bytes);
        sourceWidth = textImage.width;
        sourceHeight = textImage.height;
      } else if (watermarkImageBytes && watermarkImageType) {
        embeddedWatermark = watermarkImageType === 'png'
          ? await pdf.embedPng(watermarkImageBytes)
          : await pdf.embedJpg(watermarkImageBytes);
        sourceWidth = embeddedWatermark.width;
        sourceHeight = embeddedWatermark.height;
      }

      if (!embeddedWatermark || sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error('ไม่สามารถเตรียมลายน้ำสำหรับ PDF ได้');
      }

      for (const page of pdf.getPages()) {
        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();
        const maxWidth = pageWidth * (watermarkMode === 'text' ? 0.62 : 0.42);
        const minWidth = Math.min(pageWidth * 0.2, 120);
        const drawWidth = clampNumber(sourceWidth, minWidth, maxWidth);
        const drawHeight = sourceHeight * (drawWidth / sourceWidth);
        const centerX = (xPercent / 100) * pageWidth;
        const centerYFromTop = (yPercent / 100) * pageHeight;

        page.drawImage(embeddedWatermark, {
          x: clampNumber(centerX - drawWidth / 2, 0, pageWidth - drawWidth),
          y: clampNumber(pageHeight - centerYFromTop - drawHeight / 2, 0, pageHeight - drawHeight),
          width: drawWidth,
          height: drawHeight,
          rotate: degrees(rotation),
          opacity,
        });
      }

      const pdfBytes = await pdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      setNewDownloads([{ blob, fileName: `ใส่ลายน้ำ-${cleanFileBaseName(sourceFile.name)}.pdf` }]);
      setSuccess('ใส่ลายน้ำ PDF สำเร็จแล้ว กรุณากดดาวน์โหลดไฟล์');
      trackUsage('watermark', 'success', { fileCount: 1, outputCount: 1 });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'ไม่สามารถใส่ลายน้ำ PDF ได้ กรุณาตรวจสอบไฟล์อีกครั้ง');
      trackUsage('watermark', 'error', { fileCount: files.length, errorCode: 'watermark_failed' });
    } finally {
      setIsProcessing(false);
    }
  }

  function runActiveTool() {
    if (activeTool.mode === 'merge') {
      void mergePdfFiles();
      return;
    }

    if (activeTool.mode === 'organize') {
      void organizePdfFile();
      return;
    }

    if (activeTool.mode === 'split') {
      void splitPdfFile();
      return;
    }

    if (activeTool.mode === 'pdf-to-jpg') {
      void convertPdfToJpg();
      return;
    }

    if (activeTool.mode === 'jpg-to-pdf') {
      void convertJpgToPdf();
      return;
    }

    if (activeTool.mode === 'pdf-to-excel') {
      void convertPdfToExcel();
      return;
    }

    if (activeTool.mode === 'pdf-to-word') {
      void convertPdfToWord();
      return;
    }

    if (activeTool.mode === 'pdf-to-powerpoint') {
      void convertPdfToPowerPoint();
      return;
    }

    if (activeTool.mode === 'password') {
      void protectPdfWithPassword();
      return;
    }

    if (activeTool.mode === 'sign') {
      void signPdfFile();
      return;
    }

    if (activeTool.mode === 'annotate') {
      void annotatePdfFile();
      return;
    }

    if (activeTool.mode === 'watermark') {
      void watermarkPdfFile();
      return;
    }

    setError('เครื่องมือนี้อยู่ใน Phase ถัดไป ขณะนี้ยังรอระบบเฉพาะทางเพิ่มเติม');
  }

  if (activeTool.mode === 'sign') {
    const sourceFile = files[0]?.file;
    const selectedSignItem = signItems.find((item) => item.id === selectedSignItemId) ?? signItems[0];
    const visibleSignItems = signItems.filter((item) => item.pageNumber === (signPreview?.pageNumber ?? 1));
    const signedPageCount = new Set(signItems.map((item) => item.pageNumber)).size;
    const selectedSignWidthPx = selectedSignItem && signPreview
      ? Math.round((selectedSignItem.widthPercent / 100) * signPreview.width)
      : 0;

    return (
      <main className="min-h-screen bg-[#eef5fb] px-4 py-4 text-slate-950 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <button
            type="button"
            onClick={() => selectTool('merge')}
            className="mb-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ‹ กลับไปเลือกเครื่องมืออื่น
          </button>

          <section className="rounded-xl border border-slate-200 bg-white shadow-[0_18px_40px_rgb(15_23_42/12%)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-lg font-black text-emerald-700">✓</span>
                <div>
                  <h1 className="text-xl font-bold tracking-normal text-slate-950">เซ็นเอกสาร PDF</h1>
                  <p className="mt-1 text-sm text-slate-600">วาด อัปโหลด หรือพิมพ์ลายเซ็น แล้ววางตำแหน่งบนหน้าเอกสาร</p>
                </div>
              </div>

              <label className="inline-flex cursor-pointer items-center justify-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                เลือกไฟล์อื่น
                <input className="sr-only" type="file" accept=".pdf" onChange={handleFileInput} />
              </label>
            </div>

            {!sourceFile && (
              <div className="p-6">
                <label
                  className={`flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-4 py-8 text-center transition ${
                    isDragging
                      ? 'border-[#126b8f] bg-[#e8f6fb]'
                      : 'border-slate-300 bg-slate-50 hover:border-[#126b8f] hover:bg-[#f1fbfe]'
                  }`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <span className="text-base font-bold text-slate-950">เลือกไฟล์ PDF หรือลากไฟล์มาวาง</span>
                  <span className="mt-1 text-sm text-slate-500">ไฟล์จะถูกเปิดในเบราว์เซอร์ ไม่อัปโหลดไป server</span>
                  <input className="sr-only" type="file" accept=".pdf" onChange={handleFileInput} />
                </label>
              </div>
            )}

            {sourceFile && (
              <>
                <div className="flex flex-col gap-1 px-4 py-4">
                  <h2 className="text-base font-bold text-slate-950">{sourceFile.name}</h2>
                  <p className="text-sm text-slate-600">
                    {signPreview?.pageCount ?? 1} หน้า · {formatBytes(sourceFile.size)}
                  </p>
                </div>

                <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[380px_minmax(0,1fr)]">
                  <aside className="space-y-4">
                    <section className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="mb-3 text-sm font-semibold text-slate-700">สร้างลายเซ็น</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ['draw', 'วาดเอง'],
                          ['upload', 'อัปโหลดรูป'],
                          ['type', 'พิมพ์ชื่อ'],
                        ] as Array<[SignatureMode, string]>).map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setSignMode(mode)}
                            className={`rounded border px-3 py-2 text-sm font-bold ${
                              signMode === mode
                                ? 'border-[#1469b8] bg-[#1469b8] text-white'
                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700">สี</span>
                        {annotationColors.map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setSignatureColor(color)}
                            className={`h-7 w-7 rounded-full border ${signatureColor === color ? 'border-[#126b8f] ring-2 ring-[#126b8f]/25' : 'border-slate-300'}`}
                            style={{ backgroundColor: color }}
                            aria-label={`เลือกสี ${color}`}
                          />
                        ))}
                      </div>

                      {signMode === 'draw' && (
                        <div className="mt-4">
                          <canvas
                            ref={signatureCanvasRef}
                            width={900}
                            height={300}
                            onMouseDown={startSignatureDraw}
                            onMouseMove={drawSignature}
                            onMouseUp={() => setIsDrawingSignature(false)}
                            onMouseLeave={() => setIsDrawingSignature(false)}
                            className="h-56 w-full cursor-crosshair rounded border border-slate-300 bg-white shadow-inner"
                          />
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <p className="text-xs leading-5 text-slate-600">วาดลายเซ็นด้วยเมาส์หรือทัชในกรอบด้านบน</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={clearSignatureCanvas}
                                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                              >
                                ล้าง
                              </button>
                              <button
                                type="button"
                                onClick={() => void addDrawnSignature()}
                                className="rounded bg-[#1469b8] px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0f5da7]"
                              >
                                + เพิ่มลายเซ็น
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {signMode === 'upload' && (
                        <label className="mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-[#126b8f] hover:bg-[#f1fbfe]">
                          <span className="text-sm font-bold text-slate-900">เลือกรูปลายเซ็น JPG หรือ PNG</span>
                          <span className="mt-1 text-xs text-slate-500">พื้นหลังโปร่งใสจะแสดงผลดีที่สุด</span>
                          <input
                            className="sr-only"
                            type="file"
                            accept=".jpg,.jpeg,.png"
                            onChange={(event) => {
                              if (event.target.files?.[0]) {
                                void addSignatureImage(event.target.files[0]);
                                event.target.value = '';
                              }
                            }}
                          />
                        </label>
                      )}

                      {signMode === 'type' && (
                        <div className="mt-4 space-y-4">
                          <label className="block">
                            <span className="text-xs font-semibold text-slate-700">ชื่อ - สกุล</span>
                            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                              <input
                                value={typedSignatureName}
                                onChange={(event) => setTypedSignatureName(event.target.value)}
                                className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                                placeholder="เช่น นายสมชาย ใจดี"
                              />
                              <button
                                type="button"
                                onClick={addTypedSignature}
                                className="rounded bg-[#1469b8] px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0f5da7]"
                              >
                                + เพิ่มชื่อ
                              </button>
                            </div>
                          </label>

                          <label className="block">
                            <span className="text-xs font-semibold text-slate-700">
                              วันที่ ({signatureDateLocale === 'th' ? 'ไทย' : 'อเมริกัน'}) - {formatSignatureDate(signatureDateValue, signatureDateLocale)}
                            </span>
                            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                              <input
                                type="date"
                                value={signatureDateValue}
                                onChange={(event) => setSignatureDateValue(event.target.value)}
                                className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                              />
                              <button
                                type="button"
                                onClick={addSignatureDate}
                                className="rounded bg-[#1469b8] px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0f5da7]"
                              >
                                + เพิ่มวันที่
                              </button>
                            </div>
                          </label>

                          <div className="flex gap-2">
                            {(['th', 'en'] as const).map((locale) => (
                              <button
                                key={locale}
                                type="button"
                                onClick={() => setSignatureDateLocale(locale)}
                                className={`rounded border px-3 py-1.5 text-xs font-bold ${
                                  signatureDateLocale === locale
                                    ? 'border-[#1469b8] bg-[#1469b8] text-white'
                                    : 'border-slate-300 bg-white text-slate-600'
                                }`}
                              >
                                {locale === 'th' ? 'เลขไทย' : 'เลขอารบิก'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>

                    {selectedSignItem && (
                      <section className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-slate-900">
                            {selectedSignItem.kind === 'image' ? 'ลายเซ็น' : 'ข้อความ'} {selectedSignWidthPx ? `- ${selectedSignWidthPx}PX` : ''}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeSignItem(selectedSignItem.id)}
                            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-red-600 hover:bg-red-50"
                          >
                            ลบ
                          </button>
                        </div>
                        <label className="block">
                          <span className="text-xs font-semibold text-slate-700">ขนาด</span>
                          <input
                            type="range"
                            min="6"
                            max="45"
                            value={selectedSignItem.widthPercent}
                            onChange={(event) => updateSignItem(selectedSignItem.id, { widthPercent: Number(event.target.value) })}
                            className="mt-2 w-full accent-[#1469b8]"
                          />
                        </label>
                        {selectedSignItem.kind === 'text' && (
                          <label className="mt-3 block">
                            <span className="text-xs font-semibold text-slate-700">ข้อความ</span>
                            <input
                              value={selectedSignItem.text}
                              onChange={(event) => updateSignItem(selectedSignItem.id, { text: event.target.value })}
                              className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                            />
                          </label>
                        )}
                        <label className="mt-3 block">
                          <span className="flex justify-between text-xs font-semibold text-slate-700">
                            <span>หมุน</span>
                            <span>{selectedSignItem.rotation}°</span>
                          </span>
                          <input
                            type="range"
                            min="-30"
                            max="30"
                            value={selectedSignItem.rotation}
                            onChange={(event) => updateSignItem(selectedSignItem.id, { rotation: Number(event.target.value) })}
                            className="mt-2 w-full accent-[#1469b8]"
                          />
                        </label>
                      </section>
                    )}
                  </aside>

                  <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">วางลายเซ็นบนหน้า</span>
                        <input
                          type="number"
                          min="1"
                          max={signPreview?.pageCount ?? 1}
                          value={targetPage}
                          onChange={(event) => setTargetPage(event.target.value)}
                          onBlur={() => void refreshSignPreview(Math.floor(getFiniteNumber(targetPage, 1)))}
                          className="h-9 w-20 rounded border border-slate-300 px-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSignZoom((current) => (current === 1 ? 1.2 : 1))}
                          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                        >
                          ⛶ ขยายเต็มจอ
                        </button>
                        <button
                          type="button"
                          onClick={placeSignatureCenter}
                          className="rounded bg-[#1469b8] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0f5da7]"
                        >
                          + วางลายเซ็นตรงกลางหน้า
                        </button>
                      </div>
                    </div>

                    <div className="min-h-[620px] overflow-auto bg-[#f1f5f9] p-4">
                      {signPreview ? (
                        <div
                          className="relative mx-auto origin-top rounded border border-slate-300 bg-white shadow-sm"
                          style={{
                            width: signPreview.width,
                            height: signPreview.height,
                            transform: `scale(${signZoom})`,
                            marginBottom: signZoom > 1 ? `${signPreview.height * (signZoom - 1)}px` : undefined,
                          }}
                          onMouseMove={(event) => {
                            if (draggedSignItemId && event.buttons === 1) {
                              moveSignItem(event, draggedSignItemId);
                            }
                          }}
                          onMouseLeave={() => setDraggedSignItemId('')}
                          onMouseUp={() => setDraggedSignItemId('')}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={`ตัวอย่างหน้า ${signPreview.pageNumber}`}
                            className="h-full w-full select-none object-contain"
                            src={signPreview.imageUrl}
                            draggable={false}
                          />
                          {visibleSignItems.map((item) => (
                            <div
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setSelectedSignItemId(item.id);
                                setDraggedSignItemId(item.id);
                              }}
                              className={`absolute cursor-move select-none overflow-hidden rounded border bg-white/70 px-1 py-0.5 shadow-sm ${
                                selectedSignItem?.id === item.id ? 'border-[#1469b8] ring-2 ring-[#1469b8]/25' : 'border-blue-200'
                              }`}
                              style={{
                                left: `${item.xPercent}%`,
                                top: `${item.yPercent}%`,
                                width: `${item.widthPercent}%`,
                                height: `${item.heightPercent}%`,
                                color: item.color,
                                fontSize: `${Math.max(12, item.fontSize * 0.85)}px`,
                                fontWeight: item.bold ? 700 : 400,
                                textAlign: item.align,
                                transform: `rotate(${item.rotation}deg)`,
                              }}
                            >
                              {item.kind === 'image' && item.imageDataUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="h-full w-full object-contain" src={item.imageDataUrl} alt={item.text} draggable={false} />
                              ) : (
                                <span className="grid h-full place-items-center whitespace-pre-wrap break-words">{item.text}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid min-h-[420px] place-items-center rounded border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                          กำลังเตรียมตัวอย่าง PDF...
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {error && (
                      <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm leading-5 text-red-700">
                        {error}
                      </p>
                    )}
                    {success && (
                      <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-5 text-emerald-700">
                        {success}
                      </p>
                    )}
                    {downloadResults.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {downloadResults.map((item) => (
                          <a
                            key={item.id}
                            href={item.url}
                            download={item.fileName}
                            className="rounded bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                          >
                            ดาวน์โหลด {item.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-sm text-slate-600">
                      วางลายเซ็นแล้ว {signItems.length} จุด ใน {signedPageCount} หน้า
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void signPdfFile()}
                    disabled={isProcessing || signItems.length === 0}
                    className="rounded bg-[#1469b8] px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#0f5da7] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {isProcessing ? 'กำลังบันทึก...' : 'บันทึกเอกสาร'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (activeTool.mode === 'annotate') {
    const sourceFile = files[0]?.file;
    const selectedAnnotationItem = annotateItems.find((item) => item.id === selectedAnnotateItemId) ?? annotateItems[0];
    const visibleAnnotateItems = annotateItems.filter((item) => item.pageNumber === (annotatePreview?.pageNumber ?? 1));

    return (
      <main className="min-h-screen bg-[#eef5fb] px-4 py-4 text-slate-950 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <button
            type="button"
            onClick={() => selectTool('merge')}
            className="mb-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ‹ กลับไปเลือกเครื่องมืออื่น
          </button>

          <section className="rounded-xl border border-slate-200 bg-white shadow-[0_18px_40px_rgb(15_23_42/12%)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-xl font-bold tracking-normal text-slate-950">วางข้อมูลบนหน้า {annotatePreview?.pageNumber ?? 1}</h1>
                <p className="mt-1 text-sm text-slate-600">
                  {sourceFile ? `${sourceFile.name} · ${formatBytes(sourceFile.size)}` : 'เลือกไฟล์ PDF เพื่อเริ่มเพิ่มข้อมูล'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAnnotateZoom((current) => (current === 1 ? 1.2 : 1))}
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  ⛶ ขยายเต็มจอ
                </button>
                <button
                  type="button"
                  onClick={addAnnotationTextBox}
                  disabled={!sourceFile}
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + ช่องข้อความ
                </button>
                <button
                  type="button"
                  onClick={() => addAnnotationSymbol('✓')}
                  disabled={!sourceFile}
                  className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + เพิ่มสัญลักษณ์
                </button>
                <button
                  type="button"
                  onClick={() => beginDrawMode('crop')}
                  disabled={!sourceFile}
                  className={`rounded border px-4 py-2 text-sm font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${
                    annotateDrawMode === 'crop'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {annotateDrawMode === 'crop' ? 'ลากกรอบ Crop' : '+ ครอบตัด PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => beginDrawMode('blur')}
                  disabled={!sourceFile}
                  className={`rounded border px-4 py-2 text-sm font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${
                    annotateDrawMode === 'blur'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {annotateDrawMode === 'blur' ? 'ลากกรอบ Blur' : '+ เบลอข้อมูล'}
                </button>
                <label className={`rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 ${sourceFile ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                  + เพิ่มรูปภาพ
                  <input
                    className="sr-only"
                    type="file"
                    accept=".jpg,.jpeg,.png"
                    disabled={!sourceFile}
                    onChange={(event) => {
                      if (event.target.files?.[0]) {
                        void addAnnotationImage(event.target.files[0]);
                        event.target.value = '';
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {!sourceFile && (
              <div className="p-6">
                <label
                  className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-4 py-8 text-center transition ${
                    isDragging
                      ? 'border-[#126b8f] bg-[#e8f6fb]'
                      : 'border-slate-300 bg-slate-50 hover:border-[#126b8f] hover:bg-[#f1fbfe]'
                  }`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <span className="text-base font-bold text-slate-950">เลือกไฟล์ PDF หรือลากไฟล์มาวาง</span>
                  <span className="mt-1 text-sm text-slate-500">ไฟล์จะถูกเปิดในเบราว์เซอร์ ไม่อัปโหลดไป server</span>
                  <input className="sr-only" type="file" accept=".pdf" onChange={handleFileInput} />
                </label>
              </div>
            )}

            {sourceFile && (
              <>
                <div className="border-b border-slate-200 bg-[#f1f6fb] px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    {annotationSymbols.map((symbol) => (
                      <button
                        key={symbol}
                        type="button"
                        onClick={() => addAnnotationSymbol(symbol)}
                        className="grid h-9 w-9 place-items-center rounded border border-slate-300 bg-white text-lg font-bold text-slate-900 hover:bg-slate-50"
                        aria-label={`เพิ่มสัญลักษณ์ ${symbol}`}
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-[380px_minmax(0,1fr)]">
                  <aside className="max-h-[calc(100vh-180px)] overflow-y-auto border-r border-slate-200 bg-white p-4">
                    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-semibold text-slate-700">หน้าที่แสดง</span>
                        <input
                          type="number"
                          min="1"
                          max={annotatePreview?.pageCount ?? 1}
                          value={targetPage}
                          onChange={(event) => setTargetPage(event.target.value)}
                          onBlur={() => void refreshAnnotatePreview(Math.floor(getFiniteNumber(targetPage, 1)))}
                          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                        />
                      </label>
                      <label className="mt-6 inline-flex cursor-pointer items-center justify-center rounded border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 lg:mt-0 xl:mt-6">
                        เลือกไฟล์อื่น
                        <input className="sr-only" type="file" accept=".pdf" onChange={handleFileInput} />
                      </label>
                    </div>

                    {annotateItems.length === 0 && (
                      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm leading-6 text-slate-600">
                        กด + ช่องข้อความ หรือเลือกครอบตัด/เบลอ แล้วลากตีกรอบบนหน้า PDF
                      </div>
                    )}

                    {annotateDrawMode && (
                      <div className={`mb-3 rounded border px-4 py-3 text-sm leading-6 ${
                        annotateDrawMode === 'crop'
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-blue-200 bg-blue-50 text-blue-700'
                      }`}
                      >
                        กำลังเลือกพื้นที่{annotateDrawMode === 'crop' ? 'ครอบตัด PDF' : 'เบลอข้อมูล'}: คลิกค้างแล้วลากบนหน้า PDF จากมุมหนึ่งไปอีกมุมหนึ่ง
                      </div>
                    )}

                    <div className="space-y-3">
                      {annotateItems.map((item, index) => (
                        <article
                          key={item.id}
                          className={`rounded border p-3 ${selectedAnnotationItem?.id === item.id ? 'border-[#126b8f] bg-[#f1fbfe]' : 'border-slate-200 bg-white'}`}
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setSelectedAnnotateItemId(item.id)}
                              className="text-left text-sm font-bold text-slate-900"
                            >
                              {item.kind === 'image'
                                ? 'รูปภาพ'
                                : item.kind === 'blur'
                                  ? 'เบลอข้อมูล'
                                  : item.kind === 'crop'
                                    ? 'ครอบตัด PDF'
                                    : 'ช่องข้อความ'} {index + 1}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeAnnotationItem(item.id)}
                              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-red-600 hover:bg-red-50"
                            >
                              ลบ
                            </button>
                          </div>

                          {item.kind !== 'image' && item.kind !== 'blur' && item.kind !== 'crop' ? (
                            <label className="block">
                              <span className="text-xs font-semibold text-slate-700">ชื่อช่อง</span>
                              <textarea
                                value={item.text}
                                onChange={(event) => updateAnnotationItem(item.id, { text: event.target.value })}
                                className="mt-2 min-h-[62px] w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                              />
                            </label>
                          ) : (
                            <p className="text-sm leading-6 text-slate-600">
                              {item.kind === 'blur'
                                ? 'ลากกล่องไปทับข้อมูลที่ต้องการเบลอ แล้วปรับความกว้าง/สูง'
                                : item.kind === 'crop'
                                  ? 'ลากกรอบเพื่อเลือกพื้นที่หน้าที่ต้องการเก็บไว้'
                                  : item.text}
                            </p>
                          )}

                          <label className="mt-3 block">
                            <span className="flex justify-between text-xs font-semibold text-slate-700">
                              <span>ขนาดตัวอักษร</span>
                              <span>{item.fontSize}PT</span>
                            </span>
                            <input
                              type="range"
                              min="10"
                              max="72"
                              value={item.fontSize}
                              onChange={(event) => updateAnnotationItem(item.id, { fontSize: Number(event.target.value) })}
                              className="mt-2 w-full accent-[#126b8f]"
                              disabled={item.kind === 'image' || item.kind === 'blur' || item.kind === 'crop'}
                            />
                          </label>

                          <label className="mt-3 block">
                            <span className="flex justify-between text-xs font-semibold text-slate-700">
                              <span>หมุนข้อความ</span>
                              <span>{item.rotation}°</span>
                            </span>
                            <input
                              type="range"
                              min="-45"
                              max="45"
                              value={item.rotation}
                              onChange={(event) => updateAnnotationItem(item.id, { rotation: Number(event.target.value) })}
                              className="mt-2 w-full accent-[#126b8f]"
                              disabled={item.kind === 'blur' || item.kind === 'crop'}
                            />
                          </label>

                          <label className="mt-3 block">
                            <span className="flex justify-between text-xs font-semibold text-slate-700">
                              <span>ความกว้าง</span>
                              <span>{Math.round(item.widthPercent)}%</span>
                            </span>
                            <input
                              type="range"
                              min="4"
                              max="80"
                              value={item.widthPercent}
                              onChange={(event) => updateAnnotationItem(item.id, { widthPercent: Number(event.target.value) })}
                              className="mt-2 w-full accent-[#126b8f]"
                            />
                          </label>

                          {(item.kind === 'image' || item.kind === 'blur' || item.kind === 'crop') && (
                            <label className="mt-3 block">
                              <span className="flex justify-between text-xs font-semibold text-slate-700">
                                <span>ความสูง</span>
                                <span>{Math.round(item.heightPercent)}%</span>
                              </span>
                              <input
                                type="range"
                                min="4"
                                max="95"
                                value={item.heightPercent}
                                onChange={(event) => updateAnnotationItem(item.id, { heightPercent: Number(event.target.value) })}
                                className="mt-2 w-full accent-[#126b8f]"
                              />
                            </label>
                          )}

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="flex gap-2">
                              {(['left', 'center', 'right'] as const).map((align) => (
                                <button
                                  key={align}
                                  type="button"
                                  onClick={() => updateAnnotationItem(item.id, { align })}
                                  disabled={item.kind === 'image' || item.kind === 'blur' || item.kind === 'crop'}
                                  className={`rounded border px-2.5 py-1.5 text-xs font-semibold ${item.align === align ? 'border-[#126b8f] bg-[#e8f6fb] text-[#126b8f]' : 'border-slate-300 bg-white text-slate-600'} disabled:opacity-40`}
                                >
                                  {align === 'left' ? 'ซ้าย' : align === 'center' ? 'กลาง' : 'ขวา'}
                                </button>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => updateAnnotationItem(item.id, { bold: !item.bold })}
                              disabled={item.kind === 'image' || item.kind === 'blur' || item.kind === 'crop'}
                              className={`rounded border px-3 py-1.5 text-xs font-bold ${item.bold ? 'border-[#126b8f] bg-[#e8f6fb] text-[#126b8f]' : 'border-slate-300 bg-white text-slate-600'} disabled:opacity-40`}
                            >
                              ตัวหนา
                            </button>
                          </div>

                          <div className="mt-3 flex gap-2">
                            {annotationColors.map((color) => (
                              <button
                                key={color}
                                type="button"
                                onClick={() => updateAnnotationItem(item.id, { color })}
                                disabled={item.kind === 'image' || item.kind === 'blur' || item.kind === 'crop'}
                                className={`h-6 w-6 rounded-full border ${item.color === color ? 'border-[#126b8f] ring-2 ring-[#126b8f]/25' : 'border-slate-300'} disabled:opacity-40`}
                                style={{ backgroundColor: color }}
                                aria-label={`เลือกสี ${color}`}
                              />
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  </aside>

                  <div className="min-h-[620px] overflow-auto bg-[#e8eef5] p-4">
                    {annotatePreview ? (
                      <div
                        className="relative mx-auto origin-top rounded border border-slate-300 bg-white shadow-sm"
                        style={{
                          width: annotatePreview.width,
                          height: annotatePreview.height,
                          transform: `scale(${annotateZoom})`,
                          marginBottom: annotateZoom > 1 ? `${annotatePreview.height * (annotateZoom - 1)}px` : undefined,
                          cursor: annotateDrawMode ? 'crosshair' : undefined,
                        }}
                        onMouseDown={startAreaDraw}
                        onMouseMove={(event) => {
                          if (annotateDrawMode) {
                            updateAreaDraw(event);
                            return;
                          }
                          if (draggedAnnotateItemId && event.buttons === 1) {
                            moveAnnotationItem(event, draggedAnnotateItemId);
                          }
                        }}
                        onMouseUp={finishAreaDraw}
                        onMouseLeave={() => {
                          setDraggedAnnotateItemId('');
                          setAnnotateDrawStart(null);
                          setAnnotateDraftRect(null);
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={`ตัวอย่างหน้า ${annotatePreview.pageNumber}`}
                          className="h-full w-full select-none object-contain"
                          src={annotatePreview.imageUrl}
                          draggable={false}
                        />
                        {annotateDraftRect && (
                          <div
                            className={`pointer-events-none absolute rounded border-2 ${
                              annotateDrawMode === 'crop'
                                ? 'border-dashed border-red-500 bg-red-500/10'
                                : 'border-blue-500 bg-blue-400/20 backdrop-blur-sm'
                            }`}
                            style={{
                              left: `${annotateDraftRect.xPercent}%`,
                              top: `${annotateDraftRect.yPercent}%`,
                              width: `${annotateDraftRect.widthPercent}%`,
                              height: `${annotateDraftRect.heightPercent}%`,
                            }}
                          />
                        )}
                        {visibleAnnotateItems.map((item) => (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onMouseDown={(event) => {
                              if (annotateDrawMode) {
                                return;
                              }
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedAnnotateItemId(item.id);
                              setDraggedAnnotateItemId(item.id);
                            }}
                            className={`absolute cursor-move select-none overflow-hidden rounded border px-1 py-0.5 shadow-sm ${
                              item.kind === 'crop'
                                ? 'border-2 border-dashed border-red-500 bg-red-500/5'
                                : item.kind === 'blur'
                                  ? 'border-blue-400 bg-white/55 backdrop-blur-sm'
                                  : 'border-blue-200 bg-white/80'
                            } ${selectedAnnotationItem?.id === item.id ? 'ring-2 ring-[#126b8f]/25' : ''}`}
                            style={{
                              left: `${item.xPercent}%`,
                              top: `${item.yPercent}%`,
                              width: `${item.widthPercent}%`,
                              height: item.kind === 'image' || item.kind === 'blur' || item.kind === 'crop' ? `${item.heightPercent}%` : undefined,
                              color: item.color,
                              fontSize: `${Math.max(12, item.fontSize * 0.85)}px`,
                              fontWeight: item.bold ? 700 : 400,
                              textAlign: item.align,
                              transform: `rotate(${item.rotation}deg)`,
                              pointerEvents: annotateDrawMode ? 'none' : undefined,
                            }}
                          >
                            {item.kind === 'image' && item.imageDataUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img className="h-full w-full object-contain" src={item.imageDataUrl} alt={item.text} draggable={false} />
                            ) : item.kind === 'blur' ? (
                              <span className="grid h-full place-items-center text-xs font-bold text-blue-700">เบลอข้อมูล</span>
                            ) : item.kind === 'crop' ? (
                              <span className="grid h-full place-items-center text-xs font-bold text-red-600">พื้นที่หลัง Crop</span>
                            ) : (
                              <span className="whitespace-pre-wrap break-words">{item.text}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid min-h-[420px] place-items-center rounded border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                        กำลังเตรียมตัวอย่าง PDF...
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {error && (
                      <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm leading-5 text-red-700">
                        {error}
                      </p>
                    )}
                    {success && (
                      <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm leading-5 text-emerald-700">
                        {success}
                      </p>
                    )}
                    {downloadResults.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {downloadResults.map((downloadResult) => (
                          <a
                            key={downloadResult.id}
                            href={downloadResult.url}
                            download={downloadResult.fileName}
                            className="block rounded border border-[#126b8f] bg-[#e8f6fb] px-4 py-3 text-center text-sm font-bold text-[#126b8f] hover:bg-[#d9f0f8]"
                          >
                            ดาวน์โหลดไฟล์: {downloadResult.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void annotatePdfFile()}
                    disabled={isProcessing || annotateItems.length === 0}
                    className="rounded bg-[#126b8f] px-5 py-3 text-sm font-bold text-white hover:bg-[#0d5876] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isProcessing ? 'กำลังบันทึก...' : 'บันทึกเป็นไฟล์ใหม่'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (activeTool.mode === 'watermark') {
    const sourceFile = files[0]?.file;
    const previewFontSize = clampNumber(getFiniteNumber(watermarkFontSize, 64), 5, 96);
    const previewRotation = clampNumber(getFiniteNumber(watermarkRotation, -45), -90, 90);
    const previewOpacity = clampNumber(getFiniteNumber(watermarkOpacity, 20), 5, 80) / 100;
    const previewXPercent = clampNumber(getFiniteNumber(watermarkXPercent, 50), 0, 100);
    const previewYPercent = clampNumber(getFiniteNumber(watermarkYPercent, 50), 0, 100);

    return (
      <main className="min-h-screen bg-[#eef5fb] px-4 py-4 text-slate-950 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <button
            type="button"
            onClick={() => selectTool('merge')}
            className="mb-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ‹ กลับไปเลือกเครื่องมืออื่น
          </button>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgb(15_23_42/12%)] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold tracking-normal text-slate-950">
                  {sourceFile?.name ?? 'ใส่ลายน้ำ PDF'}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {sourceFile ? `${watermarkPreview?.pageCount ?? 1} หน้า  ·  ${formatBytes(sourceFile.size)}` : 'เลือกไฟล์ PDF เพื่อเริ่มใส่ลายน้ำ'}
                </p>
              </div>

              <label className="inline-flex cursor-pointer items-center justify-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                เลือกไฟล์อื่น
                <input className="sr-only" type="file" accept=".pdf" onChange={handleFileInput} />
              </label>
            </div>

            {!sourceFile && (
              <label
                className={`mt-5 flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-4 py-8 text-center transition ${
                  isDragging
                    ? 'border-[#126b8f] bg-[#e8f6fb]'
                    : 'border-slate-300 bg-slate-50 hover:border-[#126b8f] hover:bg-[#f1fbfe]'
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <span className="text-base font-bold text-slate-950">เลือกไฟล์ PDF หรือลากไฟล์มาวาง</span>
                <span className="mt-1 text-sm text-slate-500">ไฟล์จะถูกเปิดในเบราว์เซอร์ ไม่อัปโหลดไป server</span>
                <input className="sr-only" type="file" accept=".pdf" onChange={handleFileInput} />
              </label>
            )}

            {sourceFile && (
              <>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setWatermarkMode('text')}
                    className={`rounded px-4 py-3 text-sm font-bold ${
                      watermarkMode === 'text'
                        ? 'bg-[#146bb2] text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    T̲ ลายน้ำข้อความ
                  </button>
                  <button
                    type="button"
                    onClick={() => setWatermarkMode('image')}
                    className={`rounded px-4 py-3 text-sm font-bold ${
                      watermarkMode === 'image'
                        ? 'bg-[#146bb2] text-white'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    ▧ ลายน้ำรูปภาพ
                  </button>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-700">ตัวอย่างหน้ากระดาษ</p>
                  <p className="mt-1 text-xs text-slate-500">คลิกหรือลากลายน้ำบนหน้ากระดาษเพื่อย้ายตำแหน่ง</p>
                  <div className="mt-4 overflow-auto">
                    {watermarkPreview ? (
                      <div
                        className="relative mx-auto cursor-crosshair rounded border border-slate-300 bg-white shadow-sm"
                        style={{
                          width: `min(100%, ${Math.min(watermarkPreview.width, 430)}px)`,
                          aspectRatio: `${watermarkPreview.width} / ${watermarkPreview.height}`,
                        }}
                        onMouseDown={startWatermarkDrag}
                        onMouseMove={updateWatermarkDrag}
                        onMouseUp={() => setIsDraggingWatermark(false)}
                        onMouseLeave={() => setIsDraggingWatermark(false)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt="ตัวอย่างหน้ากระดาษพร้อมลายน้ำ"
                          className="h-full w-full select-none object-contain"
                          src={watermarkPreview.imageUrl}
                          draggable={false}
                        />
                        {watermarkMode === 'text' ? (
                          <div
                            className="pointer-events-none absolute max-w-[78%] select-none whitespace-pre-wrap break-words text-center font-bold text-slate-400"
                            style={{
                              left: `${previewXPercent}%`,
                              top: `${previewYPercent}%`,
                              fontSize: `${previewFontSize}px`,
                              opacity: previewOpacity,
                              transform: `translate(-50%, -50%) rotate(${previewRotation}deg)`,
                            }}
                          >
                            {watermarkText || 'ลายน้ำ'}
                          </div>
                        ) : watermarkImageDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt="รูปลายน้ำ"
                            className="pointer-events-none absolute max-w-[46%] select-none object-contain"
                            src={watermarkImageDataUrl}
                            draggable={false}
                            style={{
                              left: `${previewXPercent}%`,
                              top: `${previewYPercent}%`,
                              opacity: previewOpacity,
                              transform: `translate(-50%, -50%) rotate(${previewRotation}deg)`,
                            }}
                          />
                        ) : (
                          <div
                            className="pointer-events-none absolute w-[42%] rounded border-2 border-dashed border-slate-300 bg-slate-100/60 px-4 py-8 text-center text-sm font-bold text-slate-500"
                            style={{
                              left: `${previewXPercent}%`,
                              top: `${previewYPercent}%`,
                              opacity: previewOpacity,
                              transform: 'translate(-50%, -50%)',
                            }}
                          >
                            เลือกรูปภาพลายน้ำ
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid min-h-[360px] place-items-center rounded border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                        กำลังเตรียมตัวอย่าง PDF...
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  {watermarkMode === 'text' ? (
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-800">ข้อความ</span>
                      <textarea
                        value={watermarkText}
                        onChange={(event) => setWatermarkText(event.target.value)}
                        className="mt-2 min-h-[68px] w-full rounded border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                        placeholder="เช่น สำเนา / เอกสารภายใน"
                      />
                    </label>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-slate-800">รูปภาพลายน้ำ</p>
                      <label className="mt-2 flex cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm font-bold text-slate-700 hover:border-[#126b8f] hover:bg-[#f1fbfe]">
                        {watermarkImageName || 'เลือกไฟล์ JPG หรือ PNG'}
                        <input
                          className="sr-only"
                          type="file"
                          accept=".jpg,.jpeg,.png"
                          onChange={(event) => {
                            if (event.target.files?.[0]) {
                              void addWatermarkImage(event.target.files[0]);
                              event.target.value = '';
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}

                  <div className="mt-5 grid gap-5 lg:grid-cols-3">
                    <label className="block">
                      <span className="flex justify-between text-sm font-semibold text-slate-700">
                        <span>ขนาดตัวอักษร</span>
                        <span>{previewFontSize}</span>
                      </span>
                      <input
                        type="range"
                        min="5"
                        max="64"
                        value={watermarkFontSize}
                        onChange={(event) => setWatermarkFontSize(event.target.value)}
                        disabled={watermarkMode === 'image'}
                        className="mt-3 w-full accent-[#146bb2] disabled:opacity-40"
                      />
                    </label>
                    <label className="block">
                      <span className="flex justify-between text-sm font-semibold text-slate-700">
                        <span>มุมเอียง</span>
                        <span>{previewRotation}°</span>
                      </span>
                      <input
                        type="range"
                        min="-90"
                        max="90"
                        value={watermarkRotation}
                        onChange={(event) => setWatermarkRotation(event.target.value)}
                        className="mt-3 w-full accent-[#146bb2]"
                      />
                    </label>
                    <label className="block">
                      <span className="flex justify-between text-sm font-semibold text-slate-700">
                        <span>ความจาง</span>
                        <span>{Math.round(previewOpacity * 100)}%</span>
                      </span>
                      <input
                        type="range"
                        min="5"
                        max="80"
                        value={watermarkOpacity}
                        onChange={(event) => setWatermarkOpacity(event.target.value)}
                        className="mt-3 w-full accent-[#146bb2]"
                      />
                    </label>
                  </div>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <span className="flex justify-between text-sm font-semibold text-slate-700">
                        <span>ตำแหน่งแนวนอน</span>
                        <span>{Math.round(previewXPercent)}%</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={watermarkXPercent}
                        onChange={(event) => setWatermarkXPercent(event.target.value)}
                        className="mt-3 w-full accent-[#146bb2]"
                      />
                    </label>
                    <label className="block">
                      <span className="flex justify-between text-sm font-semibold text-slate-700">
                        <span>ตำแหน่งแนวตั้ง</span>
                        <span>{Math.round(previewYPercent)}%</span>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={watermarkYPercent}
                        onChange={(event) => setWatermarkYPercent(event.target.value)}
                        className="mt-3 w-full accent-[#146bb2]"
                      />
                    </label>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="mt-5 rounded border border-red-200 bg-red-50 px-3 py-3 text-sm leading-5 text-red-700">
                    {error}
                  </p>
                )}

                {success && (
                  <p role="status" className="mt-5 rounded border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-5 text-emerald-700">
                    {success}
                  </p>
                )}

                {downloadResults.length > 0 && (
                  <div className="mt-4 max-w-sm space-y-2">
                    {downloadResults.map((downloadResult) => (
                      <a
                        key={downloadResult.id}
                        href={downloadResult.url}
                        download={downloadResult.fileName}
                        className="block rounded border border-[#126b8f] bg-[#e8f6fb] px-4 py-3 text-center text-sm font-bold text-[#126b8f] hover:bg-[#d9f0f8]"
                      >
                        ดาวน์โหลดไฟล์: {downloadResult.fileName}
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-6 flex justify-end border-t border-slate-200 pt-5">
                  <button
                    type="button"
                    onClick={() => void watermarkPdfFile()}
                    disabled={isProcessing}
                    className="rounded bg-[#146bb2] px-5 py-3 text-sm font-bold text-white hover:bg-[#10578f] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isProcessing ? 'กำลังบันทึก...' : 'บันทึกเป็นไฟล์ใหม่'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (activeTool.mode === 'organize') {
    const sourceFile = files[0]?.file;
    const keptPageCount = organizePages.length;

    return (
      <main className="min-h-screen bg-[#eef5fb] px-5 py-6 text-slate-950 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <button
            type="button"
            onClick={() => selectTool('merge')}
            className="mb-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            ‹ กลับไปเลือกเครื่องมืออื่น
          </button>

          <section className="rounded-[16px] border border-slate-200 bg-white p-7 shadow-[0_18px_40px_rgb(15_23_42/14%)]">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 text-lg font-bold text-violet-600">
                ▦
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-normal text-slate-950">จัดหน้า PDF</h1>
                <p className="mt-1 text-sm text-slate-600">ลากสลับลำดับ หมุนทีละหน้า ตัดหน้าที่ไม่ต้องการทิ้ง</p>
              </div>
            </div>

            <div className="my-6 border-t border-slate-200" />

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-950">{sourceFile?.name ?? 'ยังไม่ได้เลือกไฟล์ PDF'}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {sourceFile ? `${organizeOriginalPageCount || '-'} หน้า  ·  ${formatBytes(sourceFile.size)}` : 'เลือกไฟล์ PDF เพื่อเริ่มจัดหน้า'}
                </p>
              </div>

              <label className="inline-flex cursor-pointer items-center justify-center rounded border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                เลือกไฟล์อื่น
                <input className="sr-only" type="file" accept=".pdf" onChange={handleFileInput} />
              </label>
            </div>

            {!sourceFile && (
              <label
                className={`mt-7 flex min-h-[190px] cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed px-4 py-8 text-center transition ${
                  isDragging
                    ? 'border-[#126b8f] bg-[#e8f6fb]'
                    : 'border-slate-300 bg-slate-50 hover:border-[#126b8f] hover:bg-[#f1fbfe]'
                }`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <span className="text-base font-bold text-slate-950">เลือกไฟล์ PDF หรือลากไฟล์มาวาง</span>
                <span className="mt-1 text-sm text-slate-500">ไฟล์จะถูกเปิดในเบราว์เซอร์ ไม่อัปโหลดไป server</span>
                <input className="sr-only" type="file" accept=".pdf" onChange={handleFileInput} />
              </label>
            )}

            {sourceFile && (
              <>
                <p className="mt-6 text-sm text-slate-600">แตะไอคอน ⋮⋮ ค้างไว้แล้วลากเพื่อสลับตำแหน่งหน้า</p>

                <div className="mt-6 flex flex-wrap gap-4">
                  {organizePages.map((page, index) => (
                    <article
                      key={page.id}
                      draggable
                      onDragStart={() => setDraggedPageId(page.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        moveOrganizePage(draggedPageId, page.id);
                        setDraggedPageId('');
                      }}
                      onDragEnd={() => setDraggedPageId('')}
                      className="w-[140px]"
                    >
                      <div className="overflow-hidden rounded border border-blue-200 bg-white shadow-sm">
                        <div className="relative grid h-[176px] place-items-center bg-slate-50">
                          <span className="absolute left-2 top-2 rounded bg-slate-700 px-2 py-1 text-xs font-bold text-white">{page.pageNumber}</span>
                          <span className="absolute right-2 top-2 rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white">{index + 1}</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={`หน้า ${page.pageNumber}`}
                            className="max-h-[138px] max-w-[112px] object-contain transition"
                            src={page.thumbnailUrl}
                            style={{ transform: `rotate(${page.rotation}deg)` }}
                          />
                        </div>
                        <div className="cursor-grab bg-slate-700 py-1 text-center text-lg leading-none text-white">⋮⋮</div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => rotateOrganizePage(page.id)}
                          className="rounded border border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          ⟳ หมุน
                        </button>
                        <button
                          type="button"
                          onClick={() => removeOrganizePage(page.id)}
                          className="rounded border border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                        >
                          ตัดออก
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                {error && (
                  <p role="alert" className="mt-5 rounded border border-red-200 bg-red-50 px-3 py-3 text-sm leading-5 text-red-700">
                    {error}
                  </p>
                )}

                {success && (
                  <p role="status" className="mt-5 rounded border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-5 text-emerald-700">
                    {success}
                  </p>
                )}

                {downloadResults.length > 0 && (
                  <div className="mt-4 max-w-sm space-y-2">
                    {downloadResults.map((downloadResult) => (
                      <a
                        key={downloadResult.id}
                        href={downloadResult.url}
                        download={downloadResult.fileName}
                        className="block rounded border border-[#126b8f] bg-[#e8f6fb] px-4 py-3 text-center text-sm font-bold text-[#126b8f] hover:bg-[#d9f0f8]"
                      >
                        ดาวน์โหลดไฟล์: {downloadResult.fileName}
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-7 border-t border-slate-200 pt-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-slate-600">เหลือ&nbsp; {keptPageCount} &nbsp;จาก&nbsp; {organizeOriginalPageCount} &nbsp;หน้า</p>
                    <button
                      type="button"
                      onClick={() => void organizePdfFile()}
                      disabled={isProcessing || keptPageCount === 0}
                      className="rounded bg-[#126b8f] px-5 py-3 text-sm font-bold text-white hover:bg-[#0d5876] disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isProcessing ? 'กำลังบันทึก...' : 'บันทึกเป็นไฟล์ใหม่'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    );
  }

  const activeVisual = toolVisuals[activeTool.id] ?? toolVisuals.merge;

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            onClick={() => selectTool('merge')}
            className="flex items-center gap-3 text-left"
            aria-label="กลับหน้าแรกเครื่องมือ PDF"
          >
            <span className="grid h-14 w-14 place-items-center rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="h-full w-full object-contain" src="/logo-phithan.png" alt="โลโก้บริษัท พิธาน" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-normal text-slate-950">เครื่องมือจัดการ PDF</h1>
            </div>
          </button>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#126b8f]">PDF Tools Workspace</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">
              จัดการเอกสาร PDF ได้ครบในหน้าเดียว
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              รวมไฟล์ แยกไฟล์ จัดหน้า แปลงไฟล์ ใส่ลายน้ำ เซ็นเอกสาร เพิ่มข้อมูล และตั้งรหัสผ่าน PDF โดยประมวลผลบนเครื่องของผู้ใช้ผ่านเบราว์เซอร์
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <p className="text-xs font-black uppercase text-slate-500">สถิติการใช้งาน</p>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                usageSummary.configured
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-500'
              }`}
              >
                {usageSummary.configured ? 'Live' : 'กำลังเตรียมข้อมูล'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-white px-3 py-3 text-center shadow-sm">
                <p className="text-xl font-black text-slate-950">{formatUsageCount(usageSummary.visits)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">เข้าชม</p>
              </div>
              <a href="/usage" className="rounded bg-white px-3 py-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#126b8f]/25">
                <p className="text-xl font-black text-slate-950">{formatUsageCount(usageSummary.successfulRuns)}</p>
                <p className="mt-1 text-xs font-semibold text-[#126b8f]">ใช้งานสำเร็จ</p>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          {toolGroups.map((group) => (
            <section key={group}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-black tracking-normal text-slate-950">{group}</h2>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {tools.filter((tool) => toolVisuals[tool.id]?.group === group).map((tool) => {
                  const visual = toolVisuals[tool.id] ?? toolVisuals.merge;
                  const isActive = activeTool.id === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => selectTool(tool.id)}
                      className={`group flex min-h-[154px] flex-col rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                        isActive
                          ? 'border-[#126b8f] bg-white shadow-md ring-2 ring-[#126b8f]/10'
                          : 'border-slate-200 bg-white shadow-sm'
                      }`}
                    >
                      <div className="mb-4 flex items-center gap-2">
                        <span className={`grid h-10 min-w-10 place-items-center rounded border px-2 text-xs font-black ${visual.tone}`}>
                          {visual.icon}
                        </span>
                      </div>
                      <h3 className="text-base font-black tracking-normal text-slate-950">{tool.title}</h3>
                      <p className="mt-2 text-sm leading-5 text-slate-600">{tool.description}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-start gap-3">
            <span className={`grid h-12 min-w-12 place-items-center rounded-lg border px-2 text-sm font-black ${activeVisual.tone}`}>
              {activeVisual.icon}
            </span>
            <div>
              <p className="text-sm font-semibold text-[#126b8f]">เครื่องมือที่เลือก</p>
              <h2 className="mt-1 text-2xl font-black tracking-normal">{activeTool.title}</h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{activeTool.description}</p>

          <label
            className={`mt-5 flex min-h-[170px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-7 text-center transition ${
              isDragging
                ? 'border-[#126b8f] bg-[#e8f6fb]'
                : 'border-slate-300 bg-slate-50 hover:border-[#126b8f] hover:bg-[#f1fbfe]'
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <span className="grid h-12 w-12 place-items-center rounded-lg bg-white text-2xl font-black text-[#126b8f] shadow-sm">+</span>
            <span className="mt-4 text-base font-black text-slate-950">ปล่อยไฟล์ไว้ตรงนี้</span>
            <span className="mt-1 text-sm font-semibold text-[#126b8f]">หรือเลือกไฟล์จากเครื่อง</span>
            <span className="mt-2 text-xs text-slate-500">ชนิดไฟล์ที่รองรับ: {activeTool.accepts}</span>
            <input className="sr-only" type="file" accept={activeTool.accepts} multiple={activeTool.mode === 'merge' || activeTool.mode === 'jpg-to-pdf'} onChange={handleFileInput} />
          </label>

          {files.length > 0 && (
            <div className="mt-5 space-y-2">
              {files.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span className="grid h-8 min-w-8 place-items-center rounded bg-white text-xs font-black text-slate-600 shadow-sm">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{item.file.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatBytes(item.file.size)}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeFile(item.id)} className="rounded border border-red-100 bg-white px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">
                      ลบ
                    </button>
                  </div>
                  {(activeTool.mode === 'merge' || activeTool.mode === 'jpg-to-pdf') && (
                    <div className="mt-3 flex gap-2 pl-11">
                      <button type="button" onClick={() => moveFile(index, -1)} disabled={index === 0} className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50">
                        ขึ้น
                      </button>
                      <button type="button" onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-slate-50">
                        ลง
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTool.mode === 'split' && (
            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-800">ช่วงหน้าที่ต้องการแยก</span>
              <input
                value={splitRange}
                onChange={(event) => setSplitRange(event.target.value)}
                className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                placeholder="เช่น 1-3, 7"
              />
            </label>
          )}

          {activeTool.mode === 'organize' && (
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px]">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">ลำดับหน้าที่ต้องการ</span>
                <input
                  value={organizePageOrder}
                  onChange={(event) => setOrganizePageOrder(event.target.value)}
                  className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  placeholder="เว้นว่าง = ทุกหน้า, เช่น 3,1,2"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">หมุนหน้า</span>
                <select
                  value={rotateDegrees}
                  onChange={(event) => setRotateDegrees(event.target.value)}
                  className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                >
                  <option value="0">0°</option>
                  <option value="90">90°</option>
                  <option value="180">180°</option>
                  <option value="270">270°</option>
                </select>
              </label>
            </div>
          )}

          {activeTool.mode === 'pdf-to-jpg' && (
            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-800">ช่วงหน้าที่ต้องการแปลงเป็น JPG</span>
              <input
                value={jpgRange}
                onChange={(event) => setJpgRange(event.target.value)}
                className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                placeholder="เช่น 1-3, 7"
              />
            </label>
          )}

          {(activeTool.mode === 'pdf-to-excel' || activeTool.mode === 'pdf-to-word' || activeTool.mode === 'pdf-to-powerpoint') && (
            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-800">ช่วงหน้าที่ต้องการแปลง</span>
              <input
                value={officeRange}
                onChange={(event) => setOfficeRange(event.target.value)}
                className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                placeholder="เว้นว่าง = ทุกหน้า, เช่น 1-3, 7"
              />
              <span className="mt-2 block text-xs leading-5 text-slate-500">
                {activeTool.mode === 'pdf-to-powerpoint'
                  ? 'PowerPoint จะเก็บหน้าตาเอกสารเป็นภาพหน้า PDF หนึ่งหน้าต่อหนึ่งสไลด์'
                  : activeTool.mode === 'pdf-to-word'
                    ? 'Word จะเก็บหน้าตาเอกสารเป็นภาพหน้า PDF เพื่อให้เปิดไฟล์ได้เสถียร'
                    : 'Excel จะดึงข้อความที่อ่านได้จาก PDF หากเป็นไฟล์สแกนอาจต้อง OCR เพิ่ม'}
              </span>
            </label>
          )}

          {activeTool.mode === 'password' && (
            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">รหัสผ่านสำหรับเปิดไฟล์</span>
                <input
                  type="password"
                  value={pdfPassword}
                  onChange={(event) => setPdfPassword(event.target.value)}
                  className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">ยืนยันรหัสผ่าน</span>
                <input
                  type="password"
                  value={pdfPasswordConfirm}
                  onChange={(event) => setPdfPasswordConfirm(event.target.value)}
                  className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                />
              </label>
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                เพื่อให้เปิดกับ PDF reader ได้เสถียร กรุณาใช้รหัสผ่านเป็นตัวอักษรอังกฤษ ตัวเลข หรือสัญลักษณ์มาตรฐาน
              </p>
            </div>
          )}

          {activeTool.mode === 'sign' && (
            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">ข้อความลายเซ็น</span>
                <input
                  value={signatureText}
                  onChange={(event) => setSignatureText(event.target.value)}
                  className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  placeholder="เช่น นายทดสอบ เอกสาร"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">หน้า</span>
                  <input
                    type="number"
                    min="1"
                    value={targetPage}
                    onChange={(event) => setTargetPage(event.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">ความกว้างลายเซ็น</span>
                  <input
                    type="number"
                    min="80"
                    value={signatureWidth}
                    onChange={(event) => setSignatureWidth(event.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">X จากซ้าย</span>
                  <input
                    type="number"
                    min="0"
                    value={positionX}
                    onChange={(event) => setPositionX(event.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">Y จากบน</span>
                  <input
                    type="number"
                    min="0"
                    value={positionY}
                    onChange={(event) => setPositionY(event.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  />
                </label>
              </div>
            </div>
          )}

          {activeTool.mode === 'annotate' && (
            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">ข้อความที่ต้องการเพิ่ม</span>
                <input
                  value={annotationText}
                  onChange={(event) => setAnnotationText(event.target.value)}
                  className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  placeholder="เช่น ตรวจแล้ว / วันที่ 24-08-2026"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">หน้า</span>
                  <input
                    type="number"
                    min="1"
                    value={targetPage}
                    onChange={(event) => setTargetPage(event.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">ขนาดข้อความ</span>
                  <input
                    type="number"
                    min="10"
                    max="72"
                    value={annotationSize}
                    onChange={(event) => setAnnotationSize(event.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">X จากซ้าย</span>
                  <input
                    type="number"
                    min="0"
                    value={positionX}
                    onChange={(event) => setPositionX(event.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-800">Y จากบน</span>
                  <input
                    type="number"
                    min="0"
                    value={positionY}
                    onChange={(event) => setPositionY(event.target.value)}
                    className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#126b8f] focus:ring-2 focus:ring-[#126b8f]/15"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="mt-5 space-y-3">
            {activeTool.fields.map((field, index) => (
              <div key={field} className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <span className="grid h-6 w-6 place-items-center rounded bg-white text-xs font-black text-[#126b8f] shadow-sm">{index + 1}</span>
                <span className="text-sm text-slate-700">{field}</span>
              </div>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-3 text-sm leading-5 text-red-700">
              {error}
            </p>
          )}

          {success && (
            <p role="status" className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-5 text-emerald-700">
              {success}
            </p>
          )}

          {downloadResults.length > 0 && (
            <div className="mt-4 space-y-2">
              {downloadResults.map((downloadResult) => (
                <a
                  key={downloadResult.id}
                  href={downloadResult.url}
                  download={downloadResult.fileName}
                  className="block rounded-lg border border-[#126b8f] bg-[#e8f6fb] px-4 py-3 text-center text-sm font-bold text-[#126b8f] hover:bg-[#d9f0f8]"
                >
                  ดาวน์โหลดไฟล์: {downloadResult.fileName}
                </a>
              ))}
            </div>
          )}

          <button
            className="mt-5 w-full rounded-lg bg-[#126b8f] px-4 py-3.5 text-sm font-black text-white shadow-md shadow-[#126b8f]/20 hover:bg-[#0d5876] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            type="button"
            onClick={runActiveTool}
            disabled={isProcessing}
          >
            {isProcessing ? 'กำลังประมวลผล...' : activeTool.mode === 'planned' ? 'ดูสถานะเครื่องมือ' : 'เริ่มดำเนินการ'}
          </button>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            เวอร์ชันทดลองสาธารณะ ประมวลผลในเบราว์เซอร์ของผู้ใช้ ไฟล์ไม่ถูกส่งไป Server สำหรับเครื่องมือที่เปิดใช้งานแล้ว
          </p>
        </aside>
      </section>
    </main>
  );
}

