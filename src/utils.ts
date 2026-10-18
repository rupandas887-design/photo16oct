import { Lead, Order, Payment, Customer } from './types';
import { supabaseClient } from './supabaseClient';
import heic2any from 'heic2any';

/**
 * Resolves a raw image value (which could be a full URL, base64 data URI, or a Supabase Storage relative path)
 * into a usable HTTP/HTTPS public image URL.
 */
export function resolveStorageUrl(val: any): string | null {
  if (!val) return null;
  
  // If passed an object or JSON string containing photo URL
  if (typeof val === 'object' && val !== null) {
    const candidate = val.photoUrl || val.photo_url || val.url || val.imageUrl || val.image_url;
    if (candidate && typeof candidate === 'string') {
      return resolveStorageUrl(candidate);
    }
    return null;
  }

  if (typeof val !== 'string') return null;
  let trimmed = val.trim();
  if (!trimmed || trimmed === '—' || trimmed === 'N/A' || trimmed === 'null' || trimmed === 'undefined') return null;

  // Handle JSON stringified objects stored in DB columns
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const innerUrl = parsed?.photo_url || parsed?.photoUrl || parsed?.url || parsed?.imageUrl || parsed?.image_url;
      if (innerUrl && typeof innerUrl === 'string') {
        return resolveStorageUrl(innerUrl);
      }
    } catch (_) {}
  }

  // Already a full web URL or data/blob URI
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const supabaseUrl = 'https://aqifyxsimhqayfjwzzwj.supabase.co';

  // Handle paths already containing /storage/v1/object/public/...
  if (trimmed.startsWith('/storage/v1/object/public/')) {
    return `${supabaseUrl}${trimmed}`;
  }
  if (trimmed.startsWith('storage/v1/object/public/')) {
    return `${supabaseUrl}/${trimmed}`;
  }

  // If path is stored in the 'operations' bucket
  if (trimmed.startsWith('operations/') || trimmed.startsWith('/operations/')) {
    const cleanPath = trimmed.replace(/^\/?operations\//, '');
    return `${supabaseUrl}/storage/v1/object/public/operations/${cleanPath}`;
  }

  // If path is stored in the 'img' bucket or relative 'proofs/...'
  const cleanImgPath = trimmed.replace(/^\/?img\//, '').replace(/^\//, '');
  return `${supabaseUrl}/storage/v1/object/public/img/${cleanImgPath}`;
}

/**
 * Converts and compresses any proof image (HEIC, HEIF, PNG, JPEG, WEBP, Camera photos)
 * into a clean data URL and Blob, preserving aspect ratio, quality, and MIME type without blackout.
 */
export async function processAndCompressImage(
  fileOrInput: File | Blob | string,
  maxDim = 2000
): Promise<{ dataUrl: string; blob: Blob; contentType: string }> {
  let activeBlob: Blob | File;
  let originalName = '';
  let originalType = '';

  if (fileOrInput instanceof File) {
    activeBlob = fileOrInput;
    originalName = fileOrInput.name || '';
    originalType = fileOrInput.type || '';
  } else if (fileOrInput instanceof Blob) {
    activeBlob = fileOrInput;
    originalType = fileOrInput.type || '';
  } else if (typeof fileOrInput === 'string' && fileOrInput.trim().startsWith('data:')) {
    const trimmed = fileOrInput.trim();
    const parts = trimmed.split(';base64,');
    const typeStr = parts[0].replace('data:', '') || 'image/jpeg';
    const byteCharacters = atob(parts[1] || '');
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    activeBlob = new Blob(byteArrays, { type: typeStr });
    originalType = typeStr;
  } else if (typeof fileOrInput === 'string') {
    const resolved = resolveStorageUrl(fileOrInput);
    if (resolved) {
      return {
        dataUrl: resolved,
        blob: new Blob([], { type: 'image/jpeg' }),
        contentType: 'image/jpeg'
      };
    }
    throw new Error("Invalid proof image string provided.");
  } else {
    throw new Error("Invalid image input format.");
  }

  // 1. Detect format
  const nameLower = originalName.toLowerCase();
  const typeLower = originalType.toLowerCase();
  const isHeic = nameLower.endsWith('.heic') || nameLower.endsWith('.heif') || typeLower.includes('heic') || typeLower.includes('heif');
  const isPng = nameLower.endsWith('.png') || typeLower.includes('png');
  const isWebp = nameLower.endsWith('.webp') || typeLower.includes('webp');

  // 2. Convert HEIC/HEIF camera photos if necessary
  if (isHeic && typeof window !== 'undefined') {
    try {
      console.log('[Proof Image Processing] Converting HEIC image to JPEG via heic2any...');
      const converted = await heic2any({
        blob: activeBlob,
        toType: 'image/jpeg',
        quality: 0.90
      });
      activeBlob = Array.isArray(converted) ? converted[0] : converted;
      originalType = 'image/jpeg';
      console.log('[Proof Image Processing] HEIC conversion successful.');
    } catch (err) {
      console.warn('[Proof Image Processing] heic2any warning:', err);
    }
  }

  // 3. Read activeBlob as Data URL
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(activeBlob);
  });

  if (!rawDataUrl) {
    throw new Error('Failed to read image file');
  }

  // If the file is already a valid web image (PNG, WEBP, JPEG, GIF) and under 15MB,
  // preserve it directly without re-encoding to avoid canvas blackout bugs and preserve 100% quality and aspect ratio
  const targetMime = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
  if (!isHeic && activeBlob.size > 0 && activeBlob.size <= 15 * 1024 * 1024) {
    return {
      dataUrl: rawDataUrl,
      blob: activeBlob,
      contentType: activeBlob.type || targetMime
    };
  }

  // 4. For very large images or HEIC: resize safely via canvas while strictly preserving original colors and aspect ratio
  return new Promise((resolve) => {
    const fallback = () => {
      resolve({
        dataUrl: rawDataUrl,
        blob: activeBlob,
        contentType: activeBlob.type || targetMime
      });
    };

    if (typeof window === 'undefined') {
      fallback();
      return;
    }

    const img = new Image();
    // Do NOT set crossOrigin on local data URIs to avoid canvas tainting/blackout in WebKit & mobile browsers

    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => {});
        }

        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height || width <= 0 || height <= 0) {
          fallback();
          return;
        }

        // Scale while preserving exact aspect ratio
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fallback();
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Only fill white background for JPEG when alpha transparency would otherwise turn black
        if (!isPng && !isWebp) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        const outMime = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
        const outQuality = isPng ? undefined : 0.92;

        const processedBlob = await new Promise<Blob | null>((resBlob) => {
          canvas.toBlob(resBlob, outMime, outQuality);
        });

        if (!processedBlob || processedBlob.size === 0) {
          fallback();
          return;
        }

        const processedDataUrl = await new Promise<string>((resUrl) => {
          const r = new FileReader();
          r.onload = (e) => resUrl((e.target?.result as string) || '');
          r.onerror = () => resUrl('');
          r.readAsDataURL(processedBlob);
        });

        if (!processedDataUrl) {
          fallback();
          return;
        }

        resolve({
          dataUrl: processedDataUrl,
          blob: processedBlob,
          contentType: outMime
        });
      } catch (err) {
        console.warn('[Proof Image Processing] Canvas scaling error, falling back to original:', err);
        fallback();
      }
    };

    img.onerror = (err) => {
      console.warn('[Proof Image Processing] Image load error, falling back:', err);
      fallback();
    };

    img.src = rawDataUrl;
  });
}

/**
 * Uploads an image (base64 string, File, or Blob) to Supabase Storage bucket 'img'
 * and returns the public URL. If proofInput is already an HTTP/HTTPS URL, returns it directly.
 */
export async function uploadProofToStorage(proofInput: string | File | Blob, filenamePrefix: string = 'proof'): Promise<string> {
  if (!proofInput) {
    throw new Error("No proof image or link provided.");
  }

  // 1. If it's an HTTP or HTTPS URL already, return as is
  if (typeof proofInput === 'string') {
    const trimmed = proofInput.trim();
    if (!trimmed) throw new Error("Proof string is empty.");
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
  }

  let blob: Blob;
  let contentType = 'image/jpeg';
  let base64DataUri: string | null = null;

  try {
    const processed = await processAndCompressImage(proofInput);
    blob = processed.blob;
    contentType = processed.contentType || 'image/jpeg';
    base64DataUri = processed.dataUrl;
  } catch (procErr) {
    console.warn("[uploadProofToStorage] Image processing warning, using direct fallback:", procErr);
    if (proofInput instanceof File || proofInput instanceof Blob) {
      blob = proofInput;
      contentType = proofInput.type || 'image/jpeg';
    } else if (typeof proofInput === 'string' && proofInput.startsWith('data:')) {
      base64DataUri = proofInput;
      const parts = base64DataUri.split(';base64,');
      contentType = parts[0].replace('data:', '') || 'image/jpeg';
      const byteCharacters = atob(parts[1] || '');
      const byteArrays = [];
      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
      }
      blob = new Blob(byteArrays, { type: contentType });
    } else {
      throw new Error("Invalid proof format provided.");
    }
  }

  const cleanPrefix = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const fileName = `proofs/${cleanPrefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;

  // 1. Try Direct Supabase Client Upload first
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.storage
        .from('img')
        .upload(fileName, blob, {
          contentType,
          upsert: true
        });

      if (!error) {
        const { data: publicData } = supabaseClient.storage
          .from('img')
          .getPublicUrl(fileName);

        if (publicData && publicData.publicUrl) {
          console.log("[uploadProofToStorage] Uploaded directly to Supabase storage:", publicData.publicUrl);
          return publicData.publicUrl;
        }
      } else {
        console.warn("[uploadProofToStorage] Direct storage upload warning:", error.message || error);
      }
    } catch (directErr) {
      console.warn("[uploadProofToStorage] Direct storage upload exception:", directErr);
    }
  }

  // 2. Fallback to Server Proxy /api/upload-proof (Admin client with Service Role key)
  if (base64DataUri) {
    try {
      const resp = await fetch('/api/upload-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: base64DataUri,
          fileName,
          contentType
        })
      });
      const resData = await resp.json();
      if (resData.success && resData.publicUrl) {
        console.log("[uploadProofToStorage] Uploaded successfully via server admin proxy:", resData.publicUrl);
        return resData.publicUrl;
      } else {
        throw new Error(resData.error || 'Server storage upload failed');
      }
    } catch (proxyErr: any) {
      console.error("[uploadProofToStorage] Server proxy upload exception:", proxyErr);
      throw new Error(`Supabase Storage Upload Error: ${proxyErr.message || String(proxyErr)}`);
    }
  }

  throw new Error("Supabase Storage Upload Error: Failed to upload proof image to Supabase Storage.");
}

/**
 * Converts any AM/PM or HH:mm time string to a 24-hour HH:mm:ss format for SQL.
 */
export function convertTimeToDbFormat(timeStr: string): string {
  if (!timeStr) return '';
  
  // Try to match 10pm, 10:00pm, 10 am, 10:00 AM, or just 10, 10:00
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (match) {
    let hours = parseInt(match[1]);
    const minutes = match[2] || '00';
    const period = match[3]?.toLowerCase();
    
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    
    return `${String(hours).padStart(2, '0')}:${minutes}:00`;
  }
  
  console.warn("Invalid time format passed to convertTimeToDbFormat:", timeStr);
  return '00:00:00'; // Return a default valid time instead of the original string
}

/**
 * Utility functions for formatting Indian currency, phone numbers, and AM/PM times.
 */

/**
 * Formats a number to Indian Rupee (₹) format (Lakhs/Crores formatting).
 * Example: 150000 -> ₹1,50,000
 */
export function formatINR(amount: number): string {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return '₹0';
  }
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}

/**
 * Validates if the phone number is a valid Indian mobile number.
 * Valid Indian mobile numbers are 10 digits starting with 6, 7, 8, or 9.
 * They can optionally have an prefix of +91, 91, or 0.
 */
export function validateIndianMobile(phone: string): boolean {
  if (!phone) return false;
  // Strip all non-digit characters except an optional leading +
  const cleaned = phone.replace(/[^\d]/g, '');
  
  if (cleaned.length === 10) {
    return /^[6-9]\d{9}$/.test(cleaned);
  }
  
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return /^[6-9]\d{9}$/.test(cleaned.slice(2));
  }

  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return /^[6-9]\d{9}$/.test(cleaned.slice(1));
  }

  return false;
}

/**
 * Formats a phone number input to Indian format: +91 XXXXX XXXXX
 */
export function formatIndianPhoneNumber(phone: string): string {
  if (!phone) return '';
  // Strip all non-digit characters
  const cleaned = phone.replace(/[^\d]/g, '');
  
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    const mainPart = cleaned.slice(2);
    return `+91 ${mainPart.slice(0, 5)} ${mainPart.slice(5)}`;
  }
  
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    const mainPart = cleaned.slice(1);
    return `+91 ${mainPart.slice(0, 5)} ${mainPart.slice(5)}`;
  }

  // If already prefixed with +91 or similarly handled
  if (phone.trim().startsWith('+91')) {
    const digitsOnly = phone.replace('+91', '').replace(/[^\d]/g, '');
    if (digitsOnly.length === 10) {
      return `+91 ${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}`;
    }
  }

  // Return formatted with +91 default fallback if it's 10 digits but wasn't caught
  const last10 = cleaned.slice(-10);
  if (last10.length === 10 && /^[6-9]/.test(last10)) {
    return `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;
  }

  return phone;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const MONTH_NAMES_MAP: Record<string, string> = {
  jan: 'Jan', january: 'Jan',
  feb: 'Feb', february: 'Feb',
  mar: 'Mar', march: 'Mar',
  apr: 'Apr', april: 'Apr',
  may: 'May',
  jun: 'Jun', june: 'Jun',
  jul: 'Jul', july: 'Jul',
  aug: 'Aug', august: 'Aug',
  sep: 'Sep', sept: 'Sep', september: 'Sep',
  oct: 'Oct', october: 'Oct',
  nov: 'Nov', november: 'Nov',
  dec: 'Dec', december: 'Dec'
};

/**
 * Formats any date into DD MMM YYYY (e.g. "20 Sep 2026", "05 Oct 2026", "01 Jan 2027").
 * Strict display format only. Does not alter underlying values.
 */
export function formatDateDDMMYY(dateInput?: string | null | Date): string {
  if (!dateInput && (dateInput as any) !== 0) return '';
  if (typeof dateInput === 'string') {
    let trimmed = dateInput.trim();
    if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed === 'N/A' || trimmed === 'null' || trimmed === 'undefined') {
      return trimmed;
    }

    // Strip day of week prefix like "Sun, " or "Sunday, " or "Mon, "
    trimmed = trimmed.replace(/^(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*[\s,]+/i, '').trim();

    // 1. If it's already in "DD MMM YYYY" format (e.g. "20 Sep 2026" or "05 Oct 2026" or "1 Sep 2026")
    const alreadyDDMMMYYYY = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]{3,9})\s+(\d{4})$/);
    if (alreadyDDMMMYYYY) {
      const day = alreadyDDMMMYYYY[1].padStart(2, '0');
      const mStr = alreadyDDMMMYYYY[2].toLowerCase();
      const month = MONTH_NAMES_MAP[mStr] || (alreadyDDMMMYYYY[2].slice(0, 1).toUpperCase() + alreadyDDMMMYYYY[2].slice(1, 3).toLowerCase());
      const year = alreadyDDMMMYYYY[3];
      return `${day} ${month} ${year}`;
    }

    // 2. If it's like "20 September 2026" or "20-Sep-2026" or "20/Sep/2026"
    const textMonthDayFirst = trimmed.match(/^(\d{1,2})[-/.:\s]+([a-zA-Z]{3,9})[-/.:\s,]+(\d{2,4})$/);
    if (textMonthDayFirst) {
      const day = textMonthDayFirst[1].padStart(2, '0');
      const mStr = textMonthDayFirst[2].toLowerCase();
      const month = MONTH_NAMES_MAP[mStr] || (textMonthDayFirst[2].slice(0, 1).toUpperCase() + textMonthDayFirst[2].slice(1, 3).toLowerCase());
      let year = textMonthDayFirst[3];
      if (year.length === 2) year = '20' + year;
      return `${day} ${month} ${year}`;
    }

    // 3. If it's like "September 20, 2026" or "Sep 20, 2026"
    const textMonthFirst = trimmed.match(/^([a-zA-Z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/);
    if (textMonthFirst) {
      const mStr = textMonthFirst[1].toLowerCase();
      const month = MONTH_NAMES_MAP[mStr] || (textMonthFirst[1].slice(0, 1).toUpperCase() + textMonthFirst[1].slice(1, 3).toLowerCase());
      const day = textMonthFirst[2].padStart(2, '0');
      let year = textMonthFirst[3];
      if (year.length === 2) year = '20' + year;
      return `${day} ${month} ${year}`;
    }

    // 3b. If it's like "Oct 3" or "Sep 1" (missing year)
    const textMonthFirstNoYear = trimmed.match(/^([a-zA-Z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?$/);
    if (textMonthFirstNoYear) {
      const mStr = textMonthFirstNoYear[1].toLowerCase();
      const month = MONTH_NAMES_MAP[mStr] || (textMonthFirstNoYear[1].slice(0, 1).toUpperCase() + textMonthFirstNoYear[1].slice(1, 3).toLowerCase());
      const day = textMonthFirstNoYear[2].padStart(2, '0');
      const year = '2026';
      return `${day} ${month} ${year}`;
    }

    // 4. If it starts with YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD (e.g. "2026-09-20" or "2026-09-20T14:30:00" or "2026/09/20")
    const yyyymmddMatch = trimmed.match(/^(\d{4})[-/.:](\d{1,2})[-/.:](\d{1,2})/);
    if (yyyymmddMatch) {
      const year = yyyymmddMatch[1];
      const mNum = parseInt(yyyymmddMatch[2], 10);
      const month = mNum >= 1 && mNum <= 12 ? SHORT_MONTHS[mNum - 1] : 'Jan';
      const day = yyyymmddMatch[3].padStart(2, '0');
      return `${day} ${month} ${year}`;
    }

    // 5. If it's in DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY or DD:MM:YYYY format (e.g. "20/09/2026" or "20-09-2026")
    const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[-/.:](\d{1,2})[-/.:](\d{4})/);
    if (ddmmyyyyMatch) {
      const day = ddmmyyyyMatch[1].padStart(2, '0');
      const mNum = parseInt(ddmmyyyyMatch[2], 10);
      const month = mNum >= 1 && mNum <= 12 ? SHORT_MONTHS[mNum - 1] : 'Jan';
      const year = ddmmyyyyMatch[3];
      return `${day} ${month} ${year}`;
    }

    // 6. If it's in DD-MM-YY or DD/MM/YY or DD.MM.YY or DD:MM:YY format (e.g. "20/09/26" or "20-09-26" or "20:09:26")
    const ddmmyyMatch = trimmed.match(/^(\d{1,2})[-/.:](\d{1,2})[-/.:](\d{2})$/);
    if (ddmmyyMatch) {
      const day = ddmmyyMatch[1].padStart(2, '0');
      const mNum = parseInt(ddmmyyMatch[2], 10);
      const month = mNum >= 1 && mNum <= 12 ? SHORT_MONTHS[mNum - 1] : 'Jan';
      const year = '20' + ddmmyyMatch[3];
      return `${day} ${month} ${year}`;
    }

    // 7. Attempt Date object parse for any other string formats
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = SHORT_MONTHS[d.getMonth()];
      const year = String(d.getFullYear());
      return `${day} ${month} ${year}`;
    }

    return trimmed;
  }

  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '';
    const day = String(dateInput.getDate()).padStart(2, '0');
    const month = SHORT_MONTHS[dateInput.getMonth()];
    const year = String(dateInput.getFullYear());
    return `${day} ${month} ${year}`;
  }

  return '';
}

/**
 * Converts any 24-hour or 12-hour time string or ISO datetime to 12-hour "hh:mm AM/PM" format.
 * Example: "14:30:00" -> "02:30 PM", "9:05" -> "09:05 AM", "21:15" -> "09:15 PM"
 */
export function formatTime12Hour(timeStr?: string | null | Date): string {
  if (!timeStr && (timeStr as any) !== 0) return '';

  if (timeStr instanceof Date) {
    if (isNaN(timeStr.getTime())) return '';
    let hours = timeStr.getHours();
    const minutes = String(timeStr.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');
    return `${strHours}:${minutes} ${ampm}`;
  }

  const trimmed = String(timeStr).trim();
  if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed === 'N/A' || trimmed === 'null' || trimmed === 'undefined') {
    return trimmed;
  }

  // If it's an ISO datetime string with T (e.g. 2026-08-20T14:30:00Z)
  if (trimmed.includes('T')) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const strHours = String(hours).padStart(2, '0');
      return `${strHours}:${minutes} ${ampm}`;
    }
  }

  // If it already has AM/PM in it, e.g. "9:30 am", "02:45 PM", "2pm", "11:15 PM"
  const ampmMatch = trimmed.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2] ? ampmMatch[2].padStart(2, '0') : '00';
    const ampm = ampmMatch[4].toUpperCase();
    if (hours > 12) {
      hours = hours % 12;
    }
    if (hours === 0) hours = 12;
    const strHours = String(hours).padStart(2, '0');
    return `${strHours}:${minutes} ${ampm}`;
  }

  // Match standard 24h or 12h time like "14:30", "14:30:00", "09:15", "9:05"
  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2].padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');
    return `${strHours}:${minutes} ${ampm}`;
  }

  return trimmed;
}

/**
 * Formats a date and optional time into "DD-MM-YY hh:mm AM/PM" (or "DD-MM-YY" if time is absent).
 */
export function formatDateTime(dateTimeInput?: string | null | Date, timeInput?: string | null): string {
  if (!dateTimeInput && (dateTimeInput as any) !== 0) return '';
  const dateFormatted = formatDateDDMMYY(dateTimeInput);
  if (!dateFormatted) return '';

  let timeFormatted = '';
  if (timeInput) {
    timeFormatted = formatTime12Hour(timeInput);
  } else if (typeof dateTimeInput === 'string' && (dateTimeInput.includes('T') || dateTimeInput.includes(' '))) {
    const timePart = dateTimeInput.includes('T') ? dateTimeInput.split('T')[1] : dateTimeInput.split(' ')[1];
    if (timePart) {
      timeFormatted = formatTime12Hour(timePart);
    }
  } else if (dateTimeInput instanceof Date) {
    timeFormatted = formatTime12Hour(dateTimeInput);
  }

  if (timeFormatted && timeFormatted !== '12:00 AM') {
    return `${dateFormatted} ${timeFormatted}`;
  }

  return dateFormatted;
}

// Aliases for universal compatibility across codebase
export const formatDate = formatDateDDMMYY;
export const formatDateDMY = formatDateDDMMYY;

/**
 * Strict DD/MM/YYYY Date Formatter
 * Formats any date into DD/MM/YYYY (e.g. "05/10/2026", "15/10/2026", "31/12/2026").
 * Strict display format only. Does not alter underlying values.
 */
export function formatDateToDDMMYYYY(dateInput?: string | null | Date): string {
  if (!dateInput && (dateInput as any) !== 0) return '';
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '';
    const dd = String(dateInput.getDate()).padStart(2, '0');
    const mm = String(dateInput.getMonth() + 1).padStart(2, '0');
    const yyyy = String(dateInput.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  const s = String(dateInput).trim();
  if (!s || s === '—' || s === '-' || s === 'N/A' || s === 'null' || s === 'undefined') return '';

  // 1. If already DD/MM/YYYY (e.g. 05/10/2026)
  const ddmmyyyyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyyMatch) {
    const dd = ddmmyyyyMatch[1].padStart(2, '0');
    const mm = ddmmyyyyMatch[2].padStart(2, '0');
    const yyyy = ddmmyyyyMatch[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  // 2. If YYYY-MM-DD or YYYY/MM/DD or YYYY-MM-DDTHH:mm:ss
  const yyyymmddMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (yyyymmddMatch) {
    const yyyy = yyyymmddMatch[1];
    const mm = yyyymmddMatch[2].padStart(2, '0');
    const dd = yyyymmddMatch[3].padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }

  // 3. If DD-MM-YYYY or DD.MM.YYYY
  const dashMatch = s.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{4})/);
  if (dashMatch) {
    const dd = dashMatch[1].padStart(2, '0');
    const mm = dashMatch[2].padStart(2, '0');
    const yyyy = dashMatch[3];
    return `${dd}/${mm}/${yyyy}`;
  }

  // 4. If DD MMM YYYY (e.g. 05 Oct 2026 or 20 Sep 2026)
  const textMonthMatch = s.match(/^(\d{1,2})[-/\s]+([a-zA-Z]{3,9})[-/\s,]+(\d{2,4})$/);
  if (textMonthMatch) {
    const dd = textMonthMatch[1].padStart(2, '0');
    const mStr = textMonthMatch[2].toLowerCase().slice(0, 3);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const idx = months.indexOf(mStr);
    const mm = idx !== -1 ? String(idx + 1).padStart(2, '0') : '01';
    let yyyy = textMonthMatch[3];
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    return `${dd}/${mm}/${yyyy}`;
  }

  // 5. Fallback Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  return s;
}

/**
 * Parses any date format (DD/MM/YYYY, DD-MM-YYYY, etc.) back to standard ISO YYYY-MM-DD.
 * Ensures backend and query filtering continue working flawlessly.
 */
export function parseDateToYYYYMMDD(input?: string | null): string {
  if (!input) return '';
  const s = input.trim();
  if (!s) return '';

  // 1. If already YYYY-MM-DD
  const yyyymmddMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (yyyymmddMatch) {
    const yyyy = yyyymmddMatch[1];
    const mm = yyyymmddMatch[2].padStart(2, '0');
    const dd = yyyymmddMatch[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // 2. If DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const ddmmyyyyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (ddmmyyyyMatch) {
    const dd = ddmmyyyyMatch[1].padStart(2, '0');
    const mm = ddmmyyyyMatch[2].padStart(2, '0');
    const yyyy = ddmmyyyyMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  // 3. Fallback Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return s;
}

export const formatDateDDMMYYYY = formatDateDDMMYY;

/**
 * Universal Chronological Event Timestamp Parser
 * Accurately parses Event Start Date and Event Start Time into epoch milliseconds for chronological sorting.
 * Correctly parses:
 * - Dates: DD MMM YYYY, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD, Date objects, ISO strings
 * - Times: 12-hour AM/PM ("09:30 AM", "7:00 PM", "9am", "11:15pm"), 24-hour ("14:30", "09:15:00")
 * - If time is absent, defaults to beginning of the day (00:00:00).
 * - If date is absent, falls back to MAX_SAFE_INTEGER so it sorts at the end.
 */
export function parseEventDateTimeToTimestamp(
  dateVal?: string | null | Date,
  timeVal?: string | null | Date
): number {
  if (!dateVal && !timeVal) return Number.MAX_SAFE_INTEGER;

  let year: number | null = null;
  let month = 0; // 0-indexed
  let day = 1;

  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    year = dateVal.getFullYear();
    month = dateVal.getMonth();
    day = dateVal.getDate();
  } else if (typeof dateVal === 'string' && dateVal.trim() !== '') {
    const trimmedDate = dateVal.trim();
    // 1. Check DD MMM YYYY or DD-MMM-YYYY or DD/MMM/YYYY
    const dMmmYMatch = trimmedDate.match(/^(\d{1,2})[\/\-\.\s]+([a-zA-Z]{3,9})[\/\-\.\s]+(\d{2,4})/);
    if (dMmmYMatch) {
      day = parseInt(dMmmYMatch[1], 10);
      const mStr = dMmmYMatch[2].toLowerCase();
      const mIdx = SHORT_MONTHS.findIndex(m => m.toLowerCase() === mStr.slice(0, 3));
      month = mIdx >= 0 ? mIdx : 0;
      year = parseInt(dMmmYMatch[3], 10);
      if (year < 100) year += 2000;
    } else {
      // 2. Check DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
      const dmyMatch = trimmedDate.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
      if (dmyMatch) {
        day = parseInt(dmyMatch[1], 10);
        month = parseInt(dmyMatch[2], 10) - 1;
        year = parseInt(dmyMatch[3], 10);
      } else {
        // 3. Check YYYY-MM-DD or YYYY/MM/DD
        const ymdMatch = trimmedDate.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
        if (ymdMatch) {
          year = parseInt(ymdMatch[1], 10);
          month = parseInt(ymdMatch[2], 10) - 1;
          day = parseInt(ymdMatch[3], 10);
        } else {
          const fallback = new Date(trimmedDate);
          if (!isNaN(fallback.getTime())) {
            year = fallback.getFullYear();
            month = fallback.getMonth();
            day = fallback.getDate();
          }
        }
      }
    }
  }

  // If no date was found but we have time, fallback year to 2000 so time sorting still works
  if (year === null) {
    if (timeVal) {
      year = 2000;
      month = 0;
      day = 1;
    } else {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (timeVal instanceof Date && !isNaN(timeVal.getTime())) {
    hours = timeVal.getHours();
    minutes = timeVal.getMinutes();
    seconds = timeVal.getSeconds();
  } else if (typeof timeVal === 'string' && timeVal.trim() !== '') {
    const trimmedTime = timeVal.trim();
    // 1. Check 12-hour AM/PM: "09:30 AM", "7:00 PM", "9am", "10:30pm"
    const ampmMatch = trimmedTime.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)$/i);
    if (ampmMatch) {
      let h = parseInt(ampmMatch[1], 10);
      const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
      const s = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : 0;
      const ampm = ampmMatch[4].toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      hours = h;
      minutes = m;
      seconds = s;
    } else {
      // 2. Check 24-hour time: "14:30", "09:15:00", "08:00"
      const time24Match = trimmedTime.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
      if (time24Match) {
        hours = parseInt(time24Match[1], 10);
        minutes = parseInt(time24Match[2], 10);
        seconds = time24Match[3] ? parseInt(time24Match[3], 10) : 0;
      }
    }
  }

  const constructed = new Date(year, month, day, hours, minutes, seconds);
  const time = constructed.getTime();
  return isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

export function cleanPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  const cleaned = String(phone).replace(/[^\d]/g, '');
  return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
}

export const normalizeMobileNumber = cleanPhone;

export function checkGlobalMobileUnique(
  mobile: string | undefined | null,
  excludeId?: string | null,
  usersList: any[] = [],
  opStaffList: any[] = [],
  prodStaffList: any[] = []
): { isUnique: boolean; existingAccountName?: string; existingRole?: string; error?: string } {
  const norm = normalizeMobileNumber(mobile);
  if (!norm || norm.length < 7 || norm === '0000000000') {
    return { isUnique: true };
  }

  const cleanExclude = excludeId ? String(excludeId).trim().toLowerCase() : null;

  // Active staff mobile sets to identify legitimate staff vs orphaned records
  const activeStaffMobiles = new Set<string>();
  for (const s of opStaffList) {
    const sNorm = normalizeMobileNumber(s?.mobile || s?.mobile_number || s?.phone);
    if (sNorm && sNorm.length >= 7 && sNorm !== '0000000000') activeStaffMobiles.add(sNorm);
  }
  for (const p of prodStaffList) {
    const pNorm = normalizeMobileNumber(p?.mobile || p?.mobile_number || p?.phone);
    if (pNorm && pNorm.length >= 7 && pNorm !== '0000000000') activeStaffMobiles.add(pNorm);
  }

  // 1. Check operations staff
  for (const s of opStaffList) {
    if (!s) continue;
    const sNorm = normalizeMobileNumber(s.mobile || s.mobile_number || s.phone);
    if (sNorm && sNorm.length >= 7 && sNorm !== '0000000000' && sNorm === norm) {
      const sId = s.staff_id ? String(s.staff_id).trim().toLowerCase() : (s.id ? String(s.id).trim().toLowerCase() : '');
      const sAuthId = s.auth_user_id ? String(s.auth_user_id).trim().toLowerCase() : '';
      if (cleanExclude && (sId === cleanExclude || sAuthId === cleanExclude)) {
        continue;
      }
      return {
        isUnique: false,
        existingAccountName: s.name || s.staff_name || 'Staff',
        existingRole: 'Operations Staff',
        error: 'This mobile number is already registered. Please use a different number.'
      };
    }
  }

  // 2. Check production staff
  for (const p of prodStaffList) {
    if (!p) continue;
    const pNorm = normalizeMobileNumber(p.mobile || p.mobile_number || p.phone);
    if (pNorm && pNorm.length >= 7 && pNorm !== '0000000000' && pNorm === norm) {
      const pId = p.staff_id ? String(p.staff_id).trim().toLowerCase() : (p.id ? String(p.id).trim().toLowerCase() : '');
      const pAuthId = p.auth_user_id ? String(p.auth_user_id).trim().toLowerCase() : '';
      if (cleanExclude && (pId === cleanExclude || pAuthId === cleanExclude)) {
        continue;
      }
      return {
        isUnique: false,
        existingAccountName: p.name || p.staff_name || 'Staff',
        existingRole: 'Production Staff',
        error: 'This mobile number is already registered. Please use a different number.'
      };
    }
  }

  // 3. Check users table/state (excluding orphaned staff records from deleted staff)
  for (const u of usersList) {
    if (!u) continue;
    const uRole = (u.role || '').trim();
    const isOpsRole = uRole === 'Operation Staff' || uRole === 'Operations Team';
    const isProdRole = uRole === 'Production Team' || uRole === 'Production Staff';
    const uNorm = normalizeMobileNumber(u.mobile || u.phone);

    // If an account in users has a staff role but is NOT in active staff lists, it is an orphan
    if ((isOpsRole || isProdRole) && (!uNorm || !activeStaffMobiles.has(uNorm))) {
      continue;
    }

    if (uNorm && uNorm.length >= 7 && uNorm !== '0000000000' && uNorm === norm) {
      const uId = u.id ? String(u.id).trim().toLowerCase() : '';
      const uAuthId = u.auth_user_id ? String(u.auth_user_id).trim().toLowerCase() : '';
      if (cleanExclude && (uId === cleanExclude || uAuthId === cleanExclude)) {
        continue;
      }
      return {
        isUnique: false,
        existingAccountName: u.name || u.full_name || 'User',
        existingRole: u.role || 'Staff',
        error: 'This mobile number is already registered. Please use a different number.'
      };
    }
  }

  return { isUnique: true };
}

export function cleanEmail(email: string | undefined | null): string {
  if (!email) return '';
  return String(email).trim().toLowerCase();
}

export interface CheckGlobalStaffUniquenessParams {
  mobile?: string | null;
  email?: string | null;
  excludeId?: string | null;
  excludeEmail?: string | null;
  excludeMobile?: string | null;
  excludeStaffId?: string | null;
  usersList?: any[];
  opStaffList?: any[];
  prodStaffList?: any[];
}

export function checkGlobalStaffUniqueness(params: CheckGlobalStaffUniquenessParams): {
  isUnique: boolean;
  isMobileDuplicate?: boolean;
  isEmailDuplicate?: boolean;
  error?: string;
  existingAccountName?: string;
  existingRole?: string;
} {
  const {
    mobile,
    email,
    excludeId,
    excludeEmail,
    excludeMobile,
    excludeStaffId,
    usersList = [],
    opStaffList = [],
    prodStaffList = []
  } = params;

  const normMobile = normalizeMobileNumber(mobile);
  const normEmail = cleanEmail(email);

  const cleanExclude = excludeId ? String(excludeId).trim().toLowerCase() : null;
  const cleanExcludeStaffId = excludeStaffId ? String(excludeStaffId).trim().toLowerCase() : null;
  const cleanExcludeEmail = excludeEmail ? cleanEmail(excludeEmail) : null;
  const cleanExcludeMobile = excludeMobile ? normalizeMobileNumber(excludeMobile) : null;

  const isExcluded = (id?: string | null, rEmail?: string | null, rMobile?: string | null) => {
    const sId = id ? String(id).trim().toLowerCase() : '';
    const sEmail = cleanEmail(rEmail);
    const sMobile = normalizeMobileNumber(rMobile);

    if (cleanExclude && sId && (sId === cleanExclude || cleanExclude.includes(sId) || sId.includes(cleanExclude))) return true;
    if (cleanExcludeStaffId && sId && (sId === cleanExcludeStaffId || cleanExcludeStaffId.includes(sId) || sId.includes(cleanExcludeStaffId))) return true;
    if (cleanExcludeEmail && sEmail && sEmail === cleanExcludeEmail) return true;
    if (cleanExcludeMobile && sMobile && sMobile === cleanExcludeMobile) return true;
    return false;
  };

  let isMobileDuplicate = false;
  let isEmailDuplicate = false;
  let existingAccountName: string | undefined;
  let existingRole: string | undefined;

  const isValidMobileToMatch = normMobile && normMobile.length >= 7 && normMobile !== '0000000000';
  const isValidEmailToMatch = normEmail && normEmail.includes('@');

  // Track active staff identifiers to ignore orphaned user records
  const activeStaffMobiles = new Set<string>();
  const activeStaffEmails = new Set<string>();

  // 1. Check operations staff
  for (const s of opStaffList) {
    if (!s) continue;
    const sNormMobile = normalizeMobileNumber(s.mobile || s.mobile_number || s.phone);
    const sEmail = cleanEmail(s.email);
    if (sNormMobile && sNormMobile.length >= 7 && sNormMobile !== '0000000000') activeStaffMobiles.add(sNormMobile);
    if (sEmail && sEmail.includes('@')) activeStaffEmails.add(sEmail);

    if (isExcluded(s.staff_id || s.id || s.auth_user_id, s.email, s.mobile)) continue;

    if (isValidMobileToMatch && sNormMobile && sNormMobile.length >= 7 && sNormMobile !== '0000000000' && sNormMobile === normMobile) {
      isMobileDuplicate = true;
      existingAccountName = existingAccountName || s.name || 'Operations Staff';
      existingRole = existingRole || 'Operations Staff';
    }

    if (isValidEmailToMatch && sEmail && sEmail === normEmail) {
      isEmailDuplicate = true;
      existingAccountName = existingAccountName || s.name || 'Operations Staff';
      existingRole = existingRole || 'Operations Staff';
    }
  }

  // 2. Check production staff
  for (const p of prodStaffList) {
    if (!p) continue;
    const pNormMobile = normalizeMobileNumber(p.mobile || p.mobile_number || p.phone);
    const pEmail = cleanEmail(p.email);
    if (pNormMobile && pNormMobile.length >= 7 && pNormMobile !== '0000000000') activeStaffMobiles.add(pNormMobile);
    if (pEmail && pEmail.includes('@')) activeStaffEmails.add(pEmail);

    if (isExcluded(p.staff_id || p.id || p.auth_user_id, p.email, p.mobile)) continue;

    if (isValidMobileToMatch && pNormMobile && pNormMobile.length >= 7 && pNormMobile !== '0000000000' && pNormMobile === normMobile) {
      isMobileDuplicate = true;
      existingAccountName = existingAccountName || p.name || 'Production Staff';
      existingRole = existingRole || 'Production Staff';
    }

    if (isValidEmailToMatch && pEmail && pEmail === normEmail) {
      isEmailDuplicate = true;
      existingAccountName = existingAccountName || p.name || 'Production Staff';
      existingRole = existingRole || 'Production Staff';
    }
  }

  // 3. Check users (excluding orphaned staff accounts that have no active staff record)
  for (const u of usersList) {
    if (!u) continue;
    if (isExcluded(u.id || u.auth_user_id, u.email, u.mobile)) continue;

    const uRole = (u.role || '').trim();
    const isOpsRole = uRole === 'Operation Staff' || uRole === 'Operations Team';
    const isProdRole = uRole === 'Production Team' || uRole === 'Production Staff';
    const uNormMobile = normalizeMobileNumber(u.mobile || u.phone);
    const uEmail = cleanEmail(u.email);
    const uUsername = cleanEmail(u.username);

    // If an account in users has a staff role but is NOT in active staff lists, it is an orphan
    if ((isOpsRole || isProdRole)) {
      const hasActiveMobile = uNormMobile && activeStaffMobiles.has(uNormMobile);
      const hasActiveEmail = (uEmail && activeStaffEmails.has(uEmail)) || (uUsername && activeStaffEmails.has(uUsername));
      if (!hasActiveMobile && !hasActiveEmail) {
        continue;
      }
    }

    if (isValidMobileToMatch && uNormMobile && uNormMobile.length >= 7 && uNormMobile !== '0000000000' && uNormMobile === normMobile) {
      isMobileDuplicate = true;
      existingAccountName = existingAccountName || u.name || 'User';
      existingRole = existingRole || u.role || 'Staff';
    }

    if (isValidEmailToMatch) {
      if ((uEmail && uEmail === normEmail) || (uUsername && uUsername.includes('@') && uUsername === normEmail)) {
        isEmailDuplicate = true;
        existingAccountName = existingAccountName || u.name || 'User';
        existingRole = existingRole || u.role || 'Staff';
      }
    }
  }

  // 2. Check operations staff
  for (const s of opStaffList) {
    if (!s) continue;
    if (isExcluded(s.staff_id || s.id || s.auth_user_id, s.email, s.mobile)) continue;

    const isValidMobileToMatch = normMobile && normMobile.length >= 7 && normMobile !== '0000000000';
    const isValidEmailToMatch = normEmail && normEmail.includes('@');

    if (isValidMobileToMatch) {
      const sNormMobile = normalizeMobileNumber(s.mobile || s.mobile_number || s.phone);
      if (sNormMobile && sNormMobile.length >= 7 && sNormMobile !== '0000000000' && sNormMobile === normMobile) {
        isMobileDuplicate = true;
        existingAccountName = existingAccountName || s.name || 'Operations Staff';
        existingRole = existingRole || 'Operations Staff';
      }
    }

    if (isValidEmailToMatch) {
      const sEmail = cleanEmail(s.email);
      if (sEmail && sEmail === normEmail) {
        isEmailDuplicate = true;
        existingAccountName = existingAccountName || s.name || 'Operations Staff';
        existingRole = existingRole || 'Operations Staff';
      }
    }
  }

  // 3. Check production staff
  for (const p of prodStaffList) {
    if (!p) continue;
    if (isExcluded(p.staff_id || p.id || p.auth_user_id, p.email, p.mobile)) continue;

    const isValidMobileToMatch = normMobile && normMobile.length >= 7 && normMobile !== '0000000000';
    const isValidEmailToMatch = normEmail && normEmail.includes('@');

    if (isValidMobileToMatch) {
      const pNormMobile = normalizeMobileNumber(p.mobile || p.mobile_number || p.phone);
      if (pNormMobile && pNormMobile.length >= 7 && pNormMobile !== '0000000000' && pNormMobile === normMobile) {
        isMobileDuplicate = true;
        existingAccountName = existingAccountName || p.name || 'Production Staff';
        existingRole = existingRole || 'Production Staff';
      }
    }

    if (isValidEmailToMatch) {
      const pEmail = cleanEmail(p.email);
      if (pEmail && pEmail === normEmail) {
        isEmailDuplicate = true;
        existingAccountName = existingAccountName || p.name || 'Production Staff';
        existingRole = existingRole || 'Production Staff';
      }
    }
  }

  if (isMobileDuplicate && isEmailDuplicate) {
    return {
      isUnique: false,
      isMobileDuplicate: true,
      isEmailDuplicate: true,
      existingAccountName,
      existingRole,
      error: 'This mobile number is already registered. This email address is already registered.'
    };
  }

  if (isMobileDuplicate) {
    return {
      isUnique: false,
      isMobileDuplicate: true,
      isEmailDuplicate: false,
      existingAccountName,
      existingRole,
      error: 'This mobile number is already registered.'
    };
  }

  if (isEmailDuplicate) {
    return {
      isUnique: false,
      isMobileDuplicate: false,
      isEmailDuplicate: true,
      existingAccountName,
      existingRole,
      error: 'This email address is already registered.'
    };
  }

  return { isUnique: true, isMobileDuplicate: false, isEmailDuplicate: false };
}

export interface StaffDatabaseUniquenessResult {
  isUnique: boolean;
  isMobileDuplicate: boolean;
  isEmailDuplicate: boolean;
  queryFailed?: boolean;
  error?: string;
  mobileError?: string;
  emailError?: string;
  diagnostics?: {
    normalizedMobile: string;
    normalizedEmail: string;
    productionStaffMatch: boolean;
    usersMatch: boolean;
    operationsStaffMatch: boolean;
  };
}

/**
 * Validates mobile and email against the ONLY 3 allowed tables:
 * - production_staff
 * - users
 * - operations_staff
 * Customer, client, lead, event, and booking records must NOT count as registered user accounts.
 * Query failures produce a real checking error, never a false duplicate error.
 */
export async function verifyStaffDatabaseUniqueness(
  supabaseClient: any,
  mobile: string | undefined | null,
  email: string | undefined | null,
  excludeStaffId?: string | null,
  excludeUserId?: string | null,
  excludeMobile?: string | null,
  excludeEmail?: string | null
): Promise<StaffDatabaseUniquenessResult> {
  const normMobile = cleanPhone(mobile);
  const normEmail = cleanEmail(email);

  // Safe development diagnostics for logging normalized test values without exposing private data
  console.log('[Safe Diagnostics] verifyStaffDatabaseUniqueness check started:', {
    normalizedMobileLast4: normMobile && normMobile.length >= 4 ? `***${normMobile.slice(-4)}` : (normMobile || 'none'),
    hasEmail: Boolean(normEmail),
    excludeStaffId: excludeStaffId || null
  });

  if (!supabaseClient) {
    return {
      isUnique: false,
      isMobileDuplicate: false,
      isEmailDuplicate: false,
      queryFailed: true,
      error: "Unable to verify registration: Database client is not available."
    };
  }

  // 1. Query production_staff (ONLY allowed table)
  const { data: prodData, error: prodErr } = await supabaseClient
    .from('production_staff')
    .select('staff_id, name, mobile, email');
  if (prodErr) {
    console.error('[Safe Diagnostics] production_staff query failed:', prodErr.message);
    return {
      isUnique: false,
      isMobileDuplicate: false,
      isEmailDuplicate: false,
      queryFailed: true,
      error: `Database checking error in production staff: ${prodErr.message}`
    };
  }

  // 2. Query users (ONLY allowed table)
  const { data: usersData, error: usersErr } = await supabaseClient
    .from('users')
    .select('id, name, mobile, phone, email, role');
  if (usersErr) {
    console.error('[Safe Diagnostics] users query failed:', usersErr.message);
    return {
      isUnique: false,
      isMobileDuplicate: false,
      isEmailDuplicate: false,
      queryFailed: true,
      error: `Database checking error in user accounts: ${usersErr.message}`
    };
  }

  // 3. Query operations_staff (ONLY allowed table)
  const { data: opsData, error: opsErr } = await supabaseClient
    .from('operations_staff')
    .select('staff_id, name, mobile, email');
  if (opsErr) {
    console.error('[Safe Diagnostics] operations_staff query failed:', opsErr.message);
    return {
      isUnique: false,
      isMobileDuplicate: false,
      isEmailDuplicate: false,
      queryFailed: true,
      error: `Database checking error in operations staff: ${opsErr.message}`
    };
  }

  const cleanExcludeId = excludeStaffId ? String(excludeStaffId).trim().toLowerCase() : null;
  const cleanExcludeUserId = excludeUserId ? String(excludeUserId).trim().toLowerCase() : null;
  const cleanExcludeMobile = cleanPhone(excludeMobile);
  const cleanExcludeEmail = cleanEmail(excludeEmail);

  const isExcluded = (id?: string | null, rEmail?: string | null, rMobile?: string | null) => {
    const sId = id ? String(id).trim().toLowerCase() : '';
    const sEmail = cleanEmail(rEmail);
    const sMobile = cleanPhone(rMobile);

    if (cleanExcludeId && sId && sId === cleanExcludeId) return true;
    if (cleanExcludeUserId && sId && sId === cleanExcludeUserId) return true;
    if (cleanExcludeEmail && sEmail && sEmail === cleanExcludeEmail) return true;
    if (cleanExcludeMobile && sMobile && sMobile.length >= 7 && sMobile === cleanExcludeMobile) return true;
    return false;
  };

  let prodMobileMatch = false;
  let prodEmailMatch = false;
  let usersMobileMatch = false;
  let usersEmailMatch = false;
  let opsMobileMatch = false;
  let opsEmailMatch = false;

  const isValidMobileToMatch = normMobile && normMobile.length >= 7 && normMobile !== '0000000000';
  const isValidEmailToMatch = normEmail && normEmail.includes('@');

  // Check production_staff
  if (Array.isArray(prodData)) {
    for (const p of prodData) {
      if (isExcluded(p.staff_id, p.email, p.mobile)) continue;

      if (isValidMobileToMatch) {
        const pNorm = cleanPhone(p.mobile);
        if (pNorm && pNorm.length >= 7 && pNorm !== '0000000000' && pNorm === normMobile) {
          prodMobileMatch = true;
        }
      }
      if (isValidEmailToMatch) {
        const pEmail = cleanEmail(p.email);
        if (pEmail && pEmail === normEmail) {
          prodEmailMatch = true;
        }
      }
    }
  }

  // Build active staff sets from production_staff and operations_staff
  const activeStaffMobiles = new Set<string>();
  const activeStaffEmails = new Set<string>();
  if (Array.isArray(prodData)) {
    for (const p of prodData) {
      const pm = cleanPhone(p.mobile);
      const pe = cleanEmail(p.email);
      if (pm && pm.length >= 7 && pm !== '0000000000') activeStaffMobiles.add(pm);
      if (pe && pe.includes('@')) activeStaffEmails.add(pe);
    }
  }
  if (Array.isArray(opsData)) {
    for (const o of opsData) {
      const om = cleanPhone(o.mobile);
      const oe = cleanEmail(o.email);
      if (om && om.length >= 7 && om !== '0000000000') activeStaffMobiles.add(om);
      if (oe && oe.includes('@')) activeStaffEmails.add(oe);
    }
  }

  // Check users (excluding orphaned staff accounts that have no active staff record in ops or prod tables)
  if (Array.isArray(usersData)) {
    for (const u of usersData) {
      if (isExcluded(u.id, u.email, u.mobile || u.phone)) continue;

      const uRole = (u.role || '').trim();
      const isOpsRole = uRole === 'Operation Staff' || uRole === 'Operations Team';
      const isProdRole = uRole === 'Production Team' || uRole === 'Production Staff';
      const uNorm1 = cleanPhone(u.mobile);
      const uNorm2 = cleanPhone(u.phone);
      const uEmail = cleanEmail(u.email);

      // If user has a staff role, but their mobile/email is not present in prod or ops tables,
      // it is an orphaned record from a deleted/stale staff member. Do not treat as registered!
      if (isOpsRole || isProdRole) {
        const hasActiveMobile = (uNorm1 && activeStaffMobiles.has(uNorm1)) || (uNorm2 && activeStaffMobiles.has(uNorm2));
        const hasActiveEmail = uEmail && activeStaffEmails.has(uEmail);
        if (!hasActiveMobile && !hasActiveEmail) {
          continue;
        }
      }

      if (isValidMobileToMatch) {
        if (uNorm1 && uNorm1.length >= 7 && uNorm1 !== '0000000000' && uNorm1 === normMobile) {
          usersMobileMatch = true;
        }
        if (uNorm2 && uNorm2.length >= 7 && uNorm2 !== '0000000000' && uNorm2 === normMobile) {
          usersMobileMatch = true;
        }
      }
      if (isValidEmailToMatch) {
        if (uEmail && uEmail === normEmail) {
          usersEmailMatch = true;
        }
      }
    }
  }

  // Check operations_staff
  if (Array.isArray(opsData)) {
    for (const o of opsData) {
      if (isExcluded(o.staff_id, o.email, o.mobile)) continue;

      if (isValidMobileToMatch) {
        const oNorm = cleanPhone(o.mobile);
        if (oNorm && oNorm.length >= 7 && oNorm !== '0000000000' && oNorm === normMobile) {
          opsMobileMatch = true;
        }
      }
      if (isValidEmailToMatch) {
        const oEmail = cleanEmail(o.email);
        if (oEmail && oEmail === normEmail) {
          opsEmailMatch = true;
        }
      }
    }
  }

  const isMobileDuplicate = prodMobileMatch || usersMobileMatch || opsMobileMatch;
  const isEmailDuplicate = prodEmailMatch || usersEmailMatch || opsEmailMatch;

  let error: string | undefined;
  const mobileError = isMobileDuplicate ? "This mobile number is already registered." : undefined;
  const emailError = isEmailDuplicate ? "This email address is already registered." : undefined;

  if (isMobileDuplicate && isEmailDuplicate) {
    error = "This mobile number is already registered. This email address is already registered.";
  } else if (isMobileDuplicate) {
    error = mobileError;
  } else if (isEmailDuplicate) {
    error = emailError;
  }

  // Safe development diagnostics record
  console.log('[Safe Diagnostics] verifyStaffDatabaseUniqueness completed:', {
    productionStaffMatch: prodMobileMatch ? 'match found' : 'no match',
    usersMatch: usersMobileMatch ? 'match found' : 'no match',
    operationsStaffMatch: opsMobileMatch ? 'match found' : 'no match',
    isMobileDuplicate,
    isEmailDuplicate,
    isUnique: !isMobileDuplicate && !isEmailDuplicate,
    queryFailed: false
  });

  return {
    isUnique: !isMobileDuplicate && !isEmailDuplicate,
    isMobileDuplicate,
    isEmailDuplicate,
    error,
    mobileError,
    emailError,
    diagnostics: {
      normalizedMobile: normMobile,
      normalizedEmail: normEmail,
      productionStaffMatch: prodMobileMatch,
      usersMatch: usersMobileMatch,
      operationsStaffMatch: opsMobileMatch
    }
  };
}

export function formatStaffErrorMessage(err: any): string {
  if (!err) return "An unexpected error occurred.";
  const msg = err.message || (typeof err === 'string' ? err : JSON.stringify(err));
  const lower = msg.toLowerCase();
  
  if (lower.includes("already registered") || lower.includes("duplicate") || lower.includes("already exists") || lower.includes("unique")) {
    const hasMobile = lower.includes("mobile") || lower.includes("phone");
    const hasEmail = lower.includes("email");

    if (hasMobile && hasEmail) {
      return "This mobile number is already registered. This email address is already registered.";
    }
    if (hasMobile) {
      return "This mobile number is already registered.";
    }
    if (hasEmail) {
      return "This email address is already registered.";
    }
    return msg;
  }
  return msg;
}

/**
 * Compile unified Customer Profiles dynamically from Leads, Orders, and Payments.
 * Ensures consistent Customer ID mapping using deterministic sorting and links history.
 */
export function getCustomers(leads: Lead[], orders: Order[], payments: Payment[]): Customer[] {
  const customerMap: { [key: string]: {
    name: string;
    mobile: string;
    altMobile?: string;
    email: string;
    leads: Lead[];
    orders: Order[];
  } } = {};

  const getMatchedGroupKey = (mobile: string, altMobile?: string, email?: string): string | null => {
    const cp = cleanPhone(mobile);
    const calt = cleanPhone(altMobile);
    const ce = cleanEmail(email);

    if (!cp && !calt && !ce) return null;

    for (const k of Object.keys(customerMap)) {
      const parent = customerMap[k];
      const pcp = cleanPhone(parent.mobile);
      const pcalt = cleanPhone(parent.altMobile);
      const pce = cleanEmail(parent.email);

      if (
        (cp && (cp === pcp || cp === pcalt)) ||
        (calt && (calt === pcp || calt === pcalt)) ||
        (ce && ce === pce)
      ) {
        return k;
      }
    }
    return null;
  };

  // Group leads
  leads.forEach(lead => {
    const matchedKey = getMatchedGroupKey(lead.mobile, lead.alternate_mobile, lead.email);
    const key = matchedKey || lead.email.trim().toLowerCase() || lead.mobile.replace(/[^\d]/g, '') || lead.lead_id;

    if (!customerMap[key]) {
      customerMap[key] = {
        name: lead.customer_name,
        mobile: lead.mobile,
        altMobile: lead.alternate_mobile,
        email: lead.email,
        leads: [],
        orders: []
      };
    }
    
    // Append lead
    if (!customerMap[key].leads.some(l => l.lead_id === lead.lead_id)) {
      customerMap[key].leads.push(lead);
    }
    // Set alt info if missing
    if (!customerMap[key].altMobile && lead.alternate_mobile) {
      customerMap[key].altMobile = lead.alternate_mobile;
    }
    if (!customerMap[key].email && lead.email) {
      customerMap[key].email = lead.email;
    }
    if (!customerMap[key].name && lead.customer_name) {
      customerMap[key].name = lead.customer_name;
    }
  });

  // Group orders and map to their leads/customers
  orders.forEach(order => {
    // Find associated lead to fetch alt mobile & email for accurate grouping
    const associatedLead = leads.find(l => l.lead_id === order.lead_id);
    const matchedKey = getMatchedGroupKey(
      order.mobile,
      associatedLead?.alternate_mobile,
      associatedLead?.email
    );
    
    const key = matchedKey || associatedLead?.email?.trim()?.toLowerCase() || order.mobile.replace(/[^\d]/g, '') || order.order_id;

    if (!customerMap[key]) {
      customerMap[key] = {
        name: order.customer_name,
        mobile: order.mobile,
        altMobile: associatedLead?.alternate_mobile,
        email: associatedLead?.email || '',
        leads: associatedLead ? [associatedLead] : [],
        orders: []
      };
    }

    if (!customerMap[key].orders.some(o => o.order_id === order.order_id)) {
      customerMap[key].orders.push(order);
    }
    if (!customerMap[key].name && order.customer_name) {
      customerMap[key].name = order.customer_name;
    }
  });

  // Convert map to array and filter out empty nodes
  const customerList = Object.keys(customerMap)
    .map(k => customerMap[k])
    .filter(c => c.name || c.mobile || c.email);

  // Sort deterministically to keep Customer IDs stable
  customerList.sort((a, b) => {
    const valA = cleanEmail(a.email) || cleanPhone(a.mobile) || a.name;
    const valB = cleanEmail(b.email) || cleanPhone(b.mobile) || b.name;
    return valA.localeCompare(valB);
  });

  // Map to Customer objects with index-based IDs (CUST-001, CUST-002, ...)
  return customerList.map((c, index) => {
    const customer_id = `CUST-${String(index + 1).padStart(3, '0')}`;

    // Link customer_id back into all the matched leads and orders
    c.leads.forEach(l => { l.customer_id = customer_id; });
    c.orders.forEach(o => { o.customer_id = customer_id; });

    // Link payments
    const customerOrdersIds = c.orders.map(o => o.order_id);
    const customerPayments = payments.filter(p => customerOrdersIds.includes(p.order_id));

    // Calculate total collected revenue: based on advance + final payments
    const collectedRevenue = customerPayments.reduce((sum, p) => sum + (Number(p.advance_received || 0) + Number(p.final_payment_received || 0)), 0);
    // fallback if no payments are configured
    const totalRevenue = collectedRevenue || c.orders.reduce((sum, o) => sum + Number(o.advance_received || 0), 0);

    // Collect packages and events
    const previousPackages = Array.from(new Set(c.orders.map(o => o.package_name).filter(Boolean)));
    const previousEvents = Array.from(new Set(c.orders.map(o => o.event_type).filter(Boolean)));

    // Find the latest event date
    const allEventDates = [
      ...c.leads.map(l => l.event_date),
      ...c.orders.map(o => o.event_date)
    ].filter(Boolean);
    
    const lastEventDate = allEventDates.length > 0 
      ? [...allEventDates].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : undefined;

    return {
      customer_id,
      customer_name: c.name,
      mobile: c.mobile,
      alternate_mobile: c.altMobile,
      email: c.email,
      totalOrders: c.orders.length,
      totalRevenue,
      previousPackages,
      previousEvents,
      lastEventDate,
      leads: c.leads,
      orders: c.orders,
      payments: customerPayments
    };
  });
}

export * from './utils/modalViewportHandler';
export * from './utils/errorViewportHandler';
import { ensureModalScrolledToTop } from './utils/modalViewportHandler';

/**
 * Automatically scrolls to a popup or container, resets its internal scroll position to top, and focuses the first input/interactive field inside it.
 */
export function triggerAutoScrollAndFocus(selector: string, delayMs: number = 100) {
  setTimeout(() => {
    const container = document.querySelector(selector) as HTMLElement;
    if (container) {
      // Ensure popup is properly positioned in viewport and internal scroll containers reset to top
      ensureModalScrolledToTop(container);

      const fixedOverlay = (
        container.classList.contains('fixed') && container.classList.contains('inset-0')
          ? container
          : container.closest('.fixed.inset-0, [class*="fixed"][class*="inset-0"]')
      ) as HTMLElement | null;

      if (!fixedOverlay) {
        try {
          container.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch {
          // Ignore scroll errors
        }
      }
      
      // Focus first field safely without scrolling the outer window
      const firstInput = container.querySelector(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button[type="submit"], button[aria-label="Close modal"]'
      ) as HTMLElement;
      if (firstInput) {
        firstInput.focus({ preventScroll: true });
      }
    }
  }, delayMs);
}

/**
 * Normalizes package category strings to prevent duplicates in dropdown menus and lists.
 * It maps variants like 'Weddings', 'Wedding Package', or 'Wedding Packages' to a clean 'Wedding' category.
 */
export function normalizeCategory(cat: string): string {
  if (!cat) return '';
  const trimmed = cat.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === 'weddings' ||
    lower === 'wedding package' ||
    lower === 'wedding packages' ||
    lower === 'wedding'
  ) {
    return 'Wedding';
  }
  return trimmed;
}

import { LeadEvent } from './types';

/**
 * Serializes LeadEvent array to append to text notes
 */
export function serializeLeadEvents(events: LeadEvent[], textNotes: string = ''): string {
  const marker = '\n\n---EVENTS_JSON---';
  let cleanNotes = textNotes || '';
  if (cleanNotes.includes('---EVENTS_JSON---')) {
    cleanNotes = cleanNotes.split('---EVENTS_JSON---')[0].trim();
  }
  return cleanNotes + marker + JSON.stringify(events);
}

/**
 * Deserializes LeadEvent array from text notes
 */
export function deserializeLeadEvents(textNotes: string | undefined): { events: LeadEvent[], notes: string } {
  if (!textNotes) return { events: [], notes: '' };

  let notes = textNotes;
  let jsonString = '';

  const markerRegex = /---EVENTS_JSON---/i;
  const match = markerRegex.exec(textNotes);

  if (match) {
    const splitIdx = match.index;
    notes = textNotes.substring(0, splitIdx).trim();
    jsonString = textNotes.substring(splitIdx + match[0].length).trim();
  } else {
    // Check if textNotes contains a JSON array or object
    const firstBracket = textNotes.indexOf('[');
    const lastBracket = textNotes.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      notes = textNotes.substring(0, firstBracket).trim();
      jsonString = textNotes.substring(firstBracket, lastBracket + 1).trim();
    }
  }

  if (jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed)) {
        return { events: parsed, notes };
      } else if (parsed && typeof parsed === 'object') {
        return { events: [parsed], notes };
      }
    } catch (e) {
      console.warn("Failed to parse serialized lead events:", e);
    }
  }

  return { events: [], notes: textNotes };
}

export function extractEventsList(orderOrLead: any, fallbackLeadOrOrder?: any): any[] {
  const sources = [orderOrLead, fallbackLeadOrOrder].filter(Boolean);
  for (const src of sources) {
    if (src.events) {
      if (Array.isArray(src.events) && src.events.length > 0) return src.events;
      if (typeof src.events === 'string' && src.events.trim()) {
        try {
          const parsed = JSON.parse(src.events);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (_) {}
      }
    }
    if (src.notes_special_customizations) {
      const deserialized = deserializeLeadEvents(src.notes_special_customizations);
      if (deserialized.events && deserialized.events.length > 0) {
        return deserialized.events;
      }
    }
  }
  return [];
}

/**
 * Parses team members field from JSON string array or falls back to older text formats
 */
export function parseTeamMembers(
  teamMembersStr: string | undefined | null,
  targetEventName?: string,
  targetEventId?: string,
  targetEventIndex?: number
): string[] {
  if (!teamMembersStr) return [];
  const trimmed = teamMembersStr.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return [];
  
  const cleanTargetId = (targetEventId || '').trim().toLowerCase();
  const cleanTargetName = (targetEventName || '').trim().toLowerCase();

  const isEventMatch = (ev: any, idx: number): boolean => {
    const evId = String(ev.event_id || ev.id || '').trim().toLowerCase();
    const evName = String(ev.event_name || ev.custom_event_name || ev.event_type || '').trim().toLowerCase();
    
    // 1. Match by ID (strongest when target ID is specified)
    if (cleanTargetId && evId) {
      if (evId === cleanTargetId) return true;
      const normEvId = evId.replace(/[^a-z0-9]/g, '');
      const normTargetId = cleanTargetId.replace(/[^a-z0-9]/g, '');
      if (normEvId && normTargetId && (normEvId === normTargetId || normEvId.replace(/^0+/, '') === normTargetId.replace(/^0+/, ''))) return true;

      const targetIdxMatch = cleanTargetId.match(/^(?:evt|ev|event)[-_ ]*0*(\d+)$/i);
      const evIdxMatch = evId.match(/^(?:evt|ev|event)[-_ ]*0*(\d+)$/i);
      if (targetIdxMatch && evIdxMatch && targetIdxMatch[1] === evIdxMatch[1]) return true;
      if (targetIdxMatch && parseInt(targetIdxMatch[1], 10) === idx + 1) return true;
      if (evIdxMatch && targetEventIndex !== undefined && parseInt(evIdxMatch[1], 10) === targetEventIndex + 1) return true;
    }
    
    // 2. Match by Name
    if (cleanTargetName && evName) {
      if (evName === cleanTargetName) return true;
      const normEvName = evName.replace(/[^a-z0-9]/g, '');
      const normTargetName = cleanTargetName.replace(/[^a-z0-9]/g, '');
      if (normEvName && normTargetName && normEvName === normTargetName) return true;

      const targetNameIdx = cleanTargetName.match(/^event\s*0*(\d+)$/i);
      const evNameIdx = evName.match(/^event\s*0*(\d+)$/i);
      if (targetNameIdx && evNameIdx && targetNameIdx[1] === evNameIdx[1]) return true;
      if (targetNameIdx && parseInt(targetNameIdx[1], 10) === idx + 1) return true;
      if (evNameIdx && targetEventIndex !== undefined && parseInt(evNameIdx[1], 10) === targetEventIndex + 1) return true;
    }

    // 3. Match by Positional Index
    if (targetEventIndex !== undefined && targetEventIndex === idx) {
      const idConflict = cleanTargetId && evId && evId !== cleanTargetId && !cleanTargetId.match(/^(?:evt|ev|event)/i) && !evId.match(/^(?:evt|ev|event)/i);
      const nameConflict = cleanTargetName && evName && evName !== cleanTargetName && !cleanTargetName.match(/^event\s*\d+/i) && !evName.match(/^event\s*\d+/i);
      if (!idConflict && !nameConflict) {
        return true;
      }
    }

    return false;
  };

  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const result: string[] = [];
        if (parsed[0] && typeof parsed[0] === 'object' && ('team_members' in parsed[0] || 'event_name' in parsed[0] || 'event_id' in parsed[0] || 'id' in parsed[0])) {
          let eventsToUse = parsed;
          let isFilteredButNoMatch = false;

          if (cleanTargetId || cleanTargetName || targetEventIndex !== undefined) {
            const matched = parsed.filter((ev: any, idx: number) => isEventMatch(ev, idx));

            if (matched.length > 0) {
              eventsToUse = matched;
            } else {
              eventsToUse = [];
              isFilteredButNoMatch = true;
            }
          }

          if (!isFilteredButNoMatch) {
            eventsToUse.forEach((ev: any) => {
              const members = Array.isArray(ev.team_members) ? ev.team_members : (Array.isArray(ev.members) ? ev.members : []);
              members.forEach((m: any) => {
                if (typeof m === 'object' && m !== null) {
                  const qty = Number(m.qty || m.quantity || 1);
                  const name = m.name || m.role || m.member_name || '';
                  if (name) result.push(qty > 1 ? `${name} — Qty ${qty}`.trim() : name);
                } else if (m) {
                  result.push(String(m).trim());
                }
              });
            });
          }
          return result;
        } else {
          const isSecondary = (targetEventIndex !== undefined && targetEventIndex > 0) ||
                              (cleanTargetId && Boolean(cleanTargetId.match(/^(?:evt|ev|event)[-_ ]*0*([2-9]|\d{2,})$/i))) || 
                              (cleanTargetName && Boolean(cleanTargetName.match(/^event\s*0*([2-9]|\d{2,})$/i)));
          if (isSecondary && !cleanTargetId && !cleanTargetName) return [];
          return parsed.map(item => {
            if (typeof item === 'object' && item !== null) {
              const qty = Number(item.qty || item.quantity || 1);
              const name = item.name || item.role || item.member_name || '';
              return qty > 1 ? `${name} — Qty ${qty}`.trim() : name;
            }
            return String(item).trim();
          }).filter(Boolean);
        }
      }
    } catch (e) {
      // Fallback
    }
  }

  // If a specific secondary event was requested and it wasn't a JSON array of events, don't leak global text
  const isSecondary = (targetEventIndex !== undefined && targetEventIndex > 0) ||
                      (cleanTargetId && Boolean(cleanTargetId.match(/^(?:evt|ev|event)[-_ ]*0*([2-9]|\d{2,})$/i))) || 
                      (cleanTargetName && Boolean(cleanTargetName.match(/^event\s*0*([2-9]|\d{2,})$/i)));
  if (isSecondary) {
    return [];
  }

  // Fallback for older formats (split by newline or comma)
  if (trimmed.includes('\n')) {
    return trimmed.split('\n').map(item => item.trim()).filter(Boolean);
  }
  return trimmed.split(',').map(item => item.trim()).filter(Boolean);
}

export interface ParsedDeliverableItem {
  qty: number;
  name: string;
  hasQty: boolean;
}

/**
 * Robust parser for package deliverables that converts raw JSON, serialized objects,
 * newline-separated lists, comma-separated lists, and plain text into clean, structured deliverable items.
 * Guarantees that raw JSON strings are NEVER displayed to users.
 */
export function parsePackageDeliverables(raw: any): ParsedDeliverableItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(normalizeDeliverableItem).filter((item: ParsedDeliverableItem | null): item is ParsedDeliverableItem => item !== null);
  }
  let str = String(raw).trim();
  if (!str || str === 'null' || str === 'undefined' || str === '[]' || str === '{}') return [];

  // 1. Try structured JSON parsing
  if ((str.startsWith('[') && str.endsWith(']')) || (str.startsWith('{') && str.endsWith('}'))) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeDeliverableItem).filter((item: ParsedDeliverableItem | null): item is ParsedDeliverableItem => item !== null);
      }
      if (typeof parsed === 'object' && parsed !== null) {
        if (Array.isArray(parsed.deliverables)) {
          return parsed.deliverables.map(normalizeDeliverableItem).filter((item: ParsedDeliverableItem | null): item is ParsedDeliverableItem => item !== null);
        }
        if (typeof parsed.deliverables === 'string') {
          return parsePackageDeliverables(parsed.deliverables);
        }
        if (Array.isArray(parsed.items)) {
          return parsed.items.map(normalizeDeliverableItem).filter((item: ParsedDeliverableItem | null): item is ParsedDeliverableItem => item !== null);
        }
      }
    } catch {
      // Regex recovery for truncated / malformed JSON strings
      const regexMatches: ParsedDeliverableItem[] = [];
      const jsonRegex = /\{\s*(?:["']?qty["']?\s*:\s*(\d+)\s*,\s*)?["']?name["']?\s*:\s*["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = jsonRegex.exec(str)) !== null) {
        if (m[2] && m[2].trim()) {
          regexMatches.push({
            qty: m[1] ? Math.max(1, parseInt(m[1], 10)) : 1,
            name: m[2].replace(/[\s—–-]+$/, '').trim(),
            hasQty: Boolean(m[1])
          });
        }
      }
      if (regexMatches.length > 0) {
        return regexMatches;
      }
      // Clean leading and trailing brackets if JSON was broken
      str = str.replace(/^[\[\{]+|[\]\}]+$/g, '').trim();
    }
  }

  // 2. Split by newlines
  if (str.includes('\n')) {
    return str
      .split(/\r?\n+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(normalizeDeliverableItem)
      .filter((item: ParsedDeliverableItem | null): item is ParsedDeliverableItem => item !== null);
  }

  // 3. Split by comma if multiple items appear present
  if (str.includes(',')) {
    return str
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(normalizeDeliverableItem)
      .filter((item: ParsedDeliverableItem | null): item is ParsedDeliverableItem => item !== null);
  }

  const single = normalizeDeliverableItem(str);
  return single ? [single] : [];
}

function normalizeDeliverableItem(raw: any): ParsedDeliverableItem | null {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const rawQty = raw.qty ?? raw.quantity ?? raw.count;
    const hasExplicitQty = rawQty !== undefined && rawQty !== null && !isNaN(Number(rawQty));
    const qty = hasExplicitQty ? Math.max(1, Number(rawQty)) : 1;
    let name = String(raw.name || raw.text || raw.deliverable || raw.title || raw.role || raw.item || '').trim();
    name = name.replace(/[\s—–-]+$/, '').trim();
    if (!name) return null;
    return { qty, name, hasQty: hasExplicitQty };
  }

  let text = String(raw).trim();
  text = text.replace(/^[•\-\*–—\s]+/, '').trim(); // Remove leading bullets or dashes
  text = text.replace(/^[{\"\'\s]+|[}\"\'\s]+$/g, '').trim(); // Clean residual JSON syntax artifacts
  if (!text) return null;

  // Check for leading qty like '2 × Candid Photographers' or '2 x Candid' or '2 Candid Photographers'
  const isDimensionOrSpec = /^\d+\s*[\*xX×]\s*\d+/i.test(text) || /^\d+\s*(?:k|gb|mb|tb|hours?|hrs?|mins?|minutes?|secs?|seconds?|days?|pages?|sheets?|photos?|pics?|images?|edited)\b/i.test(text);
  const match = text.match(/^(\d+)\s*(?:[x×\*\-–—]\s*|\s+)(.+)$/i);
  if (match && !isDimensionOrSpec && parseInt(match[1], 10) < 50) {
    const qty = parseInt(match[1], 10);
    const name = match[2].replace(/[\s—–-]+$/, '').trim();
    return { qty, name, hasQty: true };
  }

  return { qty: 1, name: text.replace(/[\s—–-]+$/, '').trim(), hasQty: false };
}


export function parseQtyAndText(raw: any): { qty: number; text: string } {
  if (raw === null || raw === undefined) return { qty: 1, text: "" };

  let qty = 1;
  let text = "";

  if (typeof raw === "object") {
    const q = Number(raw.qty || raw.quantity || raw.count || 1);
    qty = isNaN(q) || q < 1 ? 1 : q;
    text = String(raw.name || raw.text || raw.deliverable || raw.title || raw.role || raw.member_name || "").trim();
    return { qty, text };
  } else {
    text = String(raw).trim();
  }

  if (!text) return { qty: 1, text: "" };

  // 1. Check for explicit (Qty: X), (quantity: X), (count: X), (Qty X) anywhere in the string
  let foundQtyFromPattern: number | null = null;
  const qtyPatterns = /\s*[\(\[-]?\s*(?:qty|quantity|count)\s*[:=]?\s*(\d+)\s*[\)\]\-]?/gi;
  let match;
  while ((match = qtyPatterns.exec(text)) !== null) {
    if (match[1]) {
      const parsedQty = parseInt(match[1], 10);
      if (!isNaN(parsedQty) && parsedQty >= 1) {
        if (foundQtyFromPattern === null) {
          foundQtyFromPattern = parsedQty;
        }
      }
    }
  }

  if (foundQtyFromPattern !== null) {
    text = text.replace(/\s*[\(\[-]?\s*(?:qty|quantity|count)\s*[:=]?\s*\d+\s*[\)\]\-]?/gi, "").trim();
    return { qty: foundQtyFromPattern, text };
  }

  // 2. Check for dimension / size specifications at the start of the string:
  // e.g. "16×6", "16x6", "12×8 Album", "16×6 Frame", "16 × 6", "12 x 18", "8x24", "8*12", "12×36"
  // If the string starts with a dimension (digits x/× digits), it is deliverable text, NOT a leading quantity!
  const isLeadingDimension = /^\d+\s*[\*xX×]\s*\d+/.test(text);
  if (isLeadingDimension) {
    return { qty: 1, text };
  }

  // 3. Check for technical specifications / units starting with numbers:
  // e.g. "4K Cinematic Video", "8K Video", "20 Pages × 2", "400 Edited Candid Photos", "50 Photos", "3 Hours", "10 Sheets"
  const isUnitOrSpec = /^\d+\s*(?:[kK]\b|min\b|mins\b|minute|minutes|sec\b|secs\b|second|seconds|hr\b|hrs\b|hour|hours|page|pages|sheet|sheets|photo|photos|image|images|pic|pics|picture|pictures|gb\b|mb\b|tb\b|day\b|days\b|edited\b)/i.test(text);
  if (isUnitOrSpec) {
    return { qty: 1, text };
  }

  // 4. Check for leading quantity with explicit multiplier:
  // e.g. "2 x Traditional Photos", "2 × Cinematic Video", "2 * Album", "2 x 16×6 Frame", "2 × 16×6"
  const multiplierMatch = text.match(/^(\d+)\s*[xX×\*]\s+(.+)$/);
  if (multiplierMatch) {
    const parsedQty = parseInt(multiplierMatch[1], 10);
    if (!isNaN(parsedQty) && parsedQty >= 1) {
      return { qty: parsedQty, text: multiplierMatch[2].trim() };
    }
  }

  // 5. Check for leading quantity followed by dimension:
  // e.g. "2 16×6", "3 12×8 Album", "2 16×6 Frame"
  const qtyDimensionMatch = text.match(/^(\d+)\s+(\d+\s*[\*xX×]\s*\d+.*)$/);
  if (qtyDimensionMatch) {
    const parsedQty = parseInt(qtyDimensionMatch[1], 10);
    if (!isNaN(parsedQty) && parsedQty >= 1) {
      return { qty: parsedQty, text: qtyDimensionMatch[2].trim() };
    }
  }

  // 6. Check for leading quantity with space followed by item name:
  // e.g. "2 Lead Photographer", "1 Drone Operator", "2 Albums", "2 Frames (12×18)"
  const wordMatch = text.match(/^(\d+)\s+([a-zA-Z\(\[\{].+)$/);
  if (wordMatch) {
    const parsedQty = parseInt(wordMatch[1], 10);
    if (!isNaN(parsedQty) && parsedQty >= 1) {
      return { qty: parsedQty, text: wordMatch[2].trim() };
    }
  }

  return { qty: 1, text };
}

export function combineQtyAndText(qty: number | string, text: string): string {
  const qNum = parseInt(String(qty), 10);
  const validQty = !isNaN(qNum) && qNum >= 1 ? qNum : 1;
  const cleanText = (text || "").trim();
  if (!cleanText) return validQty > 1 ? `${validQty}` : "";
  if (validQty <= 1) {
    return cleanText;
  }
  return `${validQty} ${cleanText}`.trim();
}

export function parseDeliverablesWithQty(
  description: string | any | undefined | null,
  targetEventName?: string,
  targetEventId?: string,
  targetEventIndex?: number
): { name: string; qty: number }[] {
  if (!description) return [];

  let itemsRaw: any[] = [];
  let isFilteredButNoMatch = false;
  let isJson = false;

  const cleanTargetId = (targetEventId || '').trim().toLowerCase();
  const cleanTargetName = (targetEventName || '').trim().toLowerCase();

  const isEventMatch = (ev: any, idx: number): boolean => {
    const evId = String(ev.event_id || ev.id || '').trim().toLowerCase();
    const evName = String(ev.event_name || ev.custom_event_name || ev.event_type || ev.name || '').trim().toLowerCase();
    
    // 1. Match by ID (strongest when target ID is specified)
    if (cleanTargetId && evId) {
      if (evId === cleanTargetId) return true;
      const normEvId = evId.replace(/[^a-z0-9]/g, '');
      const normTargetId = cleanTargetId.replace(/[^a-z0-9]/g, '');
      if (normEvId && normTargetId && (normEvId === normTargetId || normEvId.replace(/^0+/, '') === normTargetId.replace(/^0+/, ''))) return true;

      const targetIdxMatch = cleanTargetId.match(/^(?:evt|ev|event)[-_ ]*0*(\d+)$/i);
      const evIdxMatch = evId.match(/^(?:evt|ev|event)[-_ ]*0*(\d+)$/i);
      if (targetIdxMatch && evIdxMatch && targetIdxMatch[1] === evIdxMatch[1]) return true;
      if (targetIdxMatch && parseInt(targetIdxMatch[1], 10) === idx + 1) return true;
      if (evIdxMatch && targetEventIndex !== undefined && parseInt(evIdxMatch[1], 10) === targetEventIndex + 1) return true;

      // CRITICAL: If both target ID and candidate event ID are present and do NOT match,
      // this is definitively a different event. DO NOT fall through to match by generic name or index!
      return false;
    }
    
    // 2. Match by Name (only when ID matching didn't rule it out)
    if (cleanTargetName && evName) {
      if (evName === cleanTargetName) {
        if (targetEventIndex !== undefined && targetEventIndex !== idx) {
          return false;
        }
        return true;
      }
      const normEvName = evName.replace(/[^a-z0-9]/g, '');
      const normTargetName = cleanTargetName.replace(/[^a-z0-9]/g, '');
      if (normEvName && normTargetName && normEvName === normTargetName) {
        if (targetEventIndex !== undefined && targetEventIndex !== idx) {
          return false;
        }
        return true;
      }

      const targetNameIdx = cleanTargetName.match(/^event\s*0*(\d+)$/i);
      const evNameIdx = evName.match(/^event\s*0*(\d+)$/i);
      if (targetNameIdx && evNameIdx && targetNameIdx[1] === evNameIdx[1]) return true;
      if (targetNameIdx && parseInt(targetNameIdx[1], 10) === idx + 1) return true;
      if (evNameIdx && targetEventIndex !== undefined && parseInt(evNameIdx[1], 10) === targetEventIndex + 1) return true;
    }

    // 3. Match by Positional Index
    if (targetEventIndex !== undefined && targetEventIndex === idx) {
      const idConflict = cleanTargetId && evId && evId !== cleanTargetId && !cleanTargetId.match(/^(?:evt|ev|event)/i) && !evId.match(/^(?:evt|ev|event)/i);
      const nameConflict = cleanTargetName && evName && evName !== cleanTargetName && !cleanTargetName.match(/^event\s*\d+/i) && !evName.match(/^event\s*\d+/i);
      if (!idConflict && !nameConflict) {
        return true;
      }
    }

    return false;
  };

  // If description is already an array
  if (Array.isArray(description)) {
    isJson = true;
    // Check if array elements are event containers (having event_name, event_type, event_id, or deliverables array)
    const isEventContainer = description[0] && typeof description[0] === 'object' && (
      'event_name' in description[0] ||
      'event_type' in description[0] ||
      'deliverables' in description[0] ||
      ('event_id' in description[0] && !('name' in description[0]))
    );

    if (isEventContainer) {
      let targetEvents = description;
      if (cleanTargetId || cleanTargetName || targetEventIndex !== undefined) {
        const matched = description.filter((ev: any, idx: number) => isEventMatch(ev, idx));
        if (matched.length > 0) {
          targetEvents = matched;
        } else {
          targetEvents = [];
          isFilteredButNoMatch = true;
        }
      }
      if (!isFilteredButNoMatch) {
        targetEvents.forEach((ev: any) => {
          if (Array.isArray(ev.deliverables)) {
            itemsRaw.push(...ev.deliverables);
          } else if (Array.isArray(ev.deliverables_list)) {
            itemsRaw.push(...ev.deliverables_list);
          } else if (typeof ev.deliverables === 'string') {
            itemsRaw.push(ev.deliverables);
          }
        });
      }
    } else {
      // Direct array of deliverable items
      itemsRaw = description;
    }
  } else if (typeof description === 'object' && description !== null) {
    isJson = true;
    if (Array.isArray(description.deliverables)) {
      itemsRaw = description.deliverables;
    } else if (Array.isArray(description.deliverables_list)) {
      itemsRaw = description.deliverables_list;
    }
  } else if (typeof description === 'string') {
    const trimmed = description.trim();
    
    // Check if string contains serialized lead events with marker
    if (trimmed.includes('---EVENTS_JSON---')) {
      const deserialized = deserializeLeadEvents(trimmed);
      if (deserialized.events && deserialized.events.length > 0) {
        isJson = true;
        let targetEvents = deserialized.events;
        if (cleanTargetId || cleanTargetName || targetEventIndex !== undefined) {
          const matched = deserialized.events.filter((ev: any, idx: number) => isEventMatch(ev, idx));
          if (matched.length > 0) {
            targetEvents = matched;
          } else {
            targetEvents = [];
            isFilteredButNoMatch = true;
          }
        }
        if (!isFilteredButNoMatch) {
          targetEvents.forEach((ev: any) => {
            if (Array.isArray(ev.deliverables)) {
              itemsRaw.push(...ev.deliverables);
            } else if (typeof ev.deliverables === 'string') {
              itemsRaw.push(ev.deliverables);
            }
          });
        }
      }
    } else if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        isJson = true;

        if (Array.isArray(parsed)) {
          // Case A: Array of event objects: [{ event_name: "...", deliverables: [...] }]
          const isEventContainer = parsed[0] && typeof parsed[0] === 'object' && (
            'event_name' in parsed[0] ||
            'event_type' in parsed[0] ||
            'deliverables' in parsed[0] ||
            ('event_id' in parsed[0] && !('name' in parsed[0]))
          );

          if (isEventContainer) {
            let targetEvents = parsed;
            if (cleanTargetId || cleanTargetName || targetEventIndex !== undefined) {
              const matched = parsed.filter((ev: any, idx: number) => isEventMatch(ev, idx));
              if (matched.length > 0) {
                targetEvents = matched;
              } else {
                targetEvents = [];
                isFilteredButNoMatch = true;
              }
            }
            if (!isFilteredButNoMatch) {
              targetEvents.forEach((ev: any) => {
                if (Array.isArray(ev.deliverables)) {
                  itemsRaw.push(...ev.deliverables);
                } else if (Array.isArray(ev.deliverables_list)) {
                  itemsRaw.push(...ev.deliverables_list);
                } else if (typeof ev.deliverables === 'string') {
                  itemsRaw.push(ev.deliverables);
                }
              });
            }
          } 
          // Case B: Array of items directly: [{ qty: 2, name: "..." }] or ["2 x Photo"]
          else {
            const isSecondaryTarget = (targetEventIndex !== undefined && targetEventIndex > 0) ||
                                     (cleanTargetId && Boolean(cleanTargetId.match(/^(?:evt|ev|event)[-_ ]*0*([2-9]|\d{2,})$/i))) || 
                                     (cleanTargetName && Boolean(cleanTargetName.match(/^event\s*0*([2-9]|\d{2,})$/i)));
            if (isSecondaryTarget) {
              itemsRaw = [];
              isFilteredButNoMatch = true;
            } else {
              itemsRaw = parsed;
            }
          }
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.deliverables)) {
            itemsRaw = parsed.deliverables;
          } else if (Array.isArray(parsed.deliverables_list)) {
            itemsRaw = parsed.deliverables_list;
          }
        }
      } catch (e) {
        isJson = false;
      }
    }
  }

  const isSecondaryTarget = (targetEventIndex !== undefined && targetEventIndex > 0) ||
                           (cleanTargetId && Boolean(cleanTargetId.match(/^(?:evt|ev|event)[-_ ]*0*([2-9]|\d{2,})$/i))) || 
                           (cleanTargetName && Boolean(cleanTargetName.match(/^event\s*0*([2-9]|\d{2,})$/i)));

  // 2. If no JSON items extracted, treat description as plain text ONLY if description was NOT valid JSON and target event wasn't filtered out
  if (itemsRaw.length === 0 && typeof description === 'string' && !isJson && !isFilteredButNoMatch && !isSecondaryTarget) {
    itemsRaw = description.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  }

  // 3. Process raw items into { name, qty, id, deliverable_id }
  const result: { name: string; qty: number; id?: string; deliverable_id?: string }[] = [];
  const map = new Map<string, { qty: number; id?: string; deliverable_id?: string }>();

  itemsRaw.forEach(item => {
    if (!item) return;
    let qty = 1;
    let text = '';
    let itemId: string | undefined = undefined;
    let itemDelivId: string | undefined = undefined;

    if (typeof item === 'object' && item !== null) {
      qty = Number(item.qty || item.quantity || item.count || 1);
      if (isNaN(qty) || qty < 1) qty = 1;
      text = String(item.name || item.text || item.deliverable || item.title || '').trim();
      itemId = item.id ? String(item.id).trim() : undefined;
      itemDelivId = item.deliverable_id ? String(item.deliverable_id).trim() : undefined;
    } else {
      const parsedItem = parseQtyAndText(String(item));
      qty = parsedItem.qty;
      text = parsedItem.text;
    }

    if (text) {
      text = text.replace(/^[\*\-•xX×]\s*/, '').trim();
      const existing = map.get(text);
      if (existing) {
        existing.qty += qty;
        if (!existing.id && itemId) existing.id = itemId;
        if (!existing.deliverable_id && itemDelivId) existing.deliverable_id = itemDelivId;
      } else {
        map.set(text, { qty, id: itemId, deliverable_id: itemDelivId });
      }
    }
  });

  map.forEach((val, name) => {
    result.push({ name, qty: val.qty, id: val.id, deliverable_id: val.deliverable_id });
  });

  return result;
}

export function formatQtyItem(raw: any): string {
  if (!raw) return "";
  const { qty, text } = parseQtyAndText(raw);
  if (!text) return typeof raw === "string" ? raw : "";
  return `${qty} × ${text}`;
}

export function formatQtyArray(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  let items: string[] = [];
  if (Array.isArray(raw)) {
    items = raw.map(s => String(s).trim()).filter(Boolean);
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          items = parsed.map(s => String(s).trim()).filter(Boolean);
        }
      } catch (e) {
        items = trimmed.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      }
    } else if (trimmed.includes('\n')) {
      items = trimmed.split('\n').map(s => s.trim()).filter(Boolean);
    } else {
      items = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return items.map(formatQtyItem);
}

export function formatQtyList(raw: string | string[] | undefined | null, delimiter: string = ', '): string {
  const formatted = formatQtyArray(raw);
  return formatted.join(delimiter);
}



export const convertTo12Hour = (timeStr: string | undefined | null): string => {
  if (!timeStr) return '';
  const [hour, min] = timeStr.split(':');
  if (!hour || !min) return timeStr;
  const h = parseInt(hour, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12.toString().padStart(2, '0')}:${min} ${ampm}`;
};

export interface ParsedCustomerProof {
  hasProof: boolean;
  imageUrl: string | null;
  linkUrl: string | null;
  proofType: 'image' | 'link' | 'both' | 'button' | 'none';
  uploadTime?: string | null;
}

/**
 * Intelligently inspects and extracts saved Customer Confirmation Proof / Image across
 * editor_assignments, production, and orders records in Supabase.
 */
export function parseCustomerProof(
  assignment: any,
  prodRec?: any,
  orderRec?: any
): ParsedCustomerProof {
  if (!assignment && !prodRec && !orderRec) {
    return { hasProof: false, imageUrl: null, linkUrl: null, proofType: 'none' };
  }

  let rawImageUrl: string | null = null;
  let rawLinkUrl: string | null = null;

  const isImageValue = (val: string): boolean => {
    const trimmed = val.trim();
    if (
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:') ||
      trimmed.includes('/storage/v1/object/public/img/') ||
      trimmed.includes('/storage/v1/object/public/') ||
      trimmed.includes('googleusercontent.com') ||
      /\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)(\?.*)?$/i.test(trimmed) ||
      /^(img\/)?proofs\/.*\.(jpg|jpeg|png|webp|gif|svg|bmp)$/i.test(trimmed)
    ) {
      return true;
    }
    const resolved = resolveStorageUrl(trimmed);
    if (resolved && (resolved.includes('/img/') || /\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)/i.test(resolved))) {
      return true;
    }
    return false;
  };

  const isLinkValue = (val: string): boolean => {
    const trimmed = val.trim();
    return (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('www.') ||
      trimmed.includes('drive.google.com') ||
      trimmed.includes('dropbox.com') ||
      trimmed.includes('mega.nz') ||
      trimmed.includes('onedrive.live.com') ||
      trimmed.includes('icloud.com')
    );
  };

  const isValidValue = (val: any): val is string => {
    if (!val || typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    return !['pending', 'null', 'undefined', '-', 'n/a', 'none', 'pending upload', 'not uploaded'].includes(lower);
  };

  // 1. Check assignment fields
  const assignmentCandidates = assignment ? [
    assignment.confirmation_proof,
    assignment.customer_communication_proof,
    assignment.client_communication_proof,
    assignment.customer_review_image,
    assignment.customer_proof,
    assignment.client_proof,
    assignment.proof_image,
    assignment.image_proof,
    assignment.image_url,
    assignment.uploaded_proof,
    assignment.upload_proof,
    assignment.proof_url,
    assignment.proof_link,
    assignment.confirmation_link,
    assignment.client_communication_consent_proof,
    assignment.consent_proof,
    assignment.customer_proof_url,
    assignment.client_proof_url,
    assignment.proof_storage_path,
    assignment.upload_link_path,
    assignment.proof,
    assignment.proof_file,
    assignment.raw?.confirmation_proof,
    assignment.raw?.customer_communication_proof,
    assignment.raw?.client_communication_proof,
    assignment.raw?.customer_review_image,
    assignment.raw?.proof_url
  ] : [];

  for (const cand of assignmentCandidates) {
    if (!isValidValue(cand)) continue;
    const trimmed = cand.trim();

    if (isImageValue(trimmed)) {
      if (!rawImageUrl) rawImageUrl = trimmed;
    } else if (isLinkValue(trimmed)) {
      if (!rawLinkUrl) rawLinkUrl = trimmed;
    }
  }

  // If assignment is provided, strictly evaluate ONLY that specific assignment.
  // Do NOT fall back to prodRec or orderRec as that causes proofs from one staff member to leak to all others.
  if (assignment) {
    const textSources = [assignment.remarks, assignment.notes, assignment.raw?.remarks, assignment.raw?.notes].filter(Boolean);
    for (const txt of textSources) {
      if (typeof txt !== 'string') continue;
      
      // Check system fallback annotations: [System Fallback - confirmation_proof]: ...
      const fallbackMatch = txt.match(/\[System Fallback - [^\]]+\]:\s*([^\r\n]+)/i);
      if (fallbackMatch && fallbackMatch[1]) {
        const val = fallbackMatch[1].trim();
        if (isImageValue(val)) {
          if (!rawImageUrl) rawImageUrl = val;
        } else if (isLinkValue(val)) {
          if (!rawLinkUrl) rawLinkUrl = val;
        }
      }

      const match = txt.match(/Proof \((https?:\/\/[^\s)]+)\)/i) || 
                    txt.match(/Confirmation Proof:?\s*(https?:\/\/[^\s)]+)/i) ||
                    txt.match(/Customer Proof:?\s*(https?:\/\/[^\s)]+)/i) ||
                    txt.match(/(https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp|gif|svg|bmp|avif)(?:\?[^\s)]*)?)/i) ||
                    txt.match(/(https?:\/\/[^\s)]*storage\/v1\/object\/public\/[^\s)]+)/i);
      if (match && match[1]) {
        const pUrl = match[1].trim();
        if (isImageValue(pUrl)) {
          if (!rawImageUrl) rawImageUrl = pUrl;
        } else if (isLinkValue(pUrl)) {
          if (!rawLinkUrl) rawLinkUrl = pUrl;
        }
      }
    }

    if (!rawImageUrl && !rawLinkUrl) {
      return { hasProof: false, imageUrl: null, linkUrl: null, proofType: 'none' };
    }
  } else {
    // 2. Fallback to production and order records ONLY when NO assignment was passed
    if (!rawImageUrl && !rawLinkUrl) {
      const fallbackCandidates = [
        prodRec?.client_communication_proof,
        prodRec?.customer_communication_proof,
        prodRec?.confirmation_proof,
        prodRec?.customer_proof,
        prodRec?.client_proof,
        prodRec?.proof_url,
        prodRec?.proof_image,
        prodRec?.image_proof,
        prodRec?.uploaded_proof,
        orderRec?.client_communication_proof,
        orderRec?.customer_communication_proof,
        orderRec?.confirmation_proof,
        orderRec?.customer_proof,
        orderRec?.proof_url,
        orderRec?.proof_image
      ];

      for (const cand of fallbackCandidates) {
        if (!isValidValue(cand)) continue;
        const trimmed = cand.trim();

        if (isImageValue(trimmed)) {
          if (!rawImageUrl) rawImageUrl = trimmed;
        } else if (isLinkValue(trimmed)) {
          if (!rawLinkUrl) rawLinkUrl = trimmed;
        }
      }
    }

    // 3. Check if production/order remarks contains an uploaded proof URL
    if (!rawImageUrl && !rawLinkUrl) {
      const remarksCand = [prodRec?.remarks, orderRec?.remarks];
      for (const rem of remarksCand) {
        if (rem && typeof rem === 'string') {
          const match = rem.match(/Proof \((https?:\/\/[^\s)]+)\)/i) || rem.match(/Confirmation Proof:?\s*(https?:\/\/[^\s)]+)/i) || rem.match(/(https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp|gif|svg|bmp))/i);
          if (match && match[1]) {
            const pUrl = match[1].trim();
            if (isImageValue(pUrl)) {
              rawImageUrl = pUrl;
            } else if (isLinkValue(pUrl)) {
              rawLinkUrl = pUrl;
            }
          }
        }
      }
    }
  }

  // If no proof is found anywhere
  if (!rawImageUrl && !rawLinkUrl) {
    return { hasProof: false, imageUrl: null, linkUrl: null, proofType: 'none' };
  }

  // Format and resolve Image URL
  let resolvedImageUrl: string | null = null;
  if (rawImageUrl) {
    resolvedImageUrl = resolveStorageUrl(rawImageUrl) || rawImageUrl;
    if (resolvedImageUrl.includes('drive.google.com/file/d/')) {
      const fileIdMatch = resolvedImageUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        resolvedImageUrl = `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
      }
    } else if (resolvedImageUrl.includes('drive.google.com/open?id=')) {
      const fileIdMatch = resolvedImageUrl.match(/id=([a-zA-Z0-9_-]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        resolvedImageUrl = `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
      }
    }
  }

  // Format and resolve Link URL
  let resolvedLinkUrl: string | null = null;
  if (rawLinkUrl) {
    resolvedLinkUrl = rawLinkUrl.startsWith('http') ? rawLinkUrl : `https://${rawLinkUrl}`;
  }

  // Extract upload timestamp if available
  const uploadTime = assignment?.proof_uploaded_at ||
                     assignment?.customer_review_image_time ||
                     assignment?.customer_confirmation_time ||
                     assignment?.server_upload_confirmed_at ||
                     prodRec?.proof_uploaded_at ||
                     prodRec?.server_upload_confirmed_at ||
                     null;

  // Determine proofType according to user specification
  if (resolvedImageUrl && resolvedLinkUrl && resolvedImageUrl !== resolvedLinkUrl) {
    return {
      hasProof: true,
      imageUrl: resolvedImageUrl,
      linkUrl: resolvedLinkUrl,
      proofType: 'both',
      uploadTime
    };
  }

  if (resolvedImageUrl) {
    return {
      hasProof: true,
      imageUrl: resolvedImageUrl,
      linkUrl: null,
      proofType: 'image',
      uploadTime
    };
  }

  if (resolvedLinkUrl) {
    return {
      hasProof: true,
      imageUrl: null,
      linkUrl: resolvedLinkUrl,
      proofType: 'link',
      uploadTime
    };
  }

  return {
    hasProof: false,
    imageUrl: null,
    linkUrl: null,
    proofType: 'none',
    uploadTime: null
  };
}

export interface EventTeamMemberConfig {
  event_id?: string;
  event_name?: string;
  package_id?: string;
  team_members: any[];
}

export interface TeamMemberStaffMapping {
  teamMemberRole: string;
  assignedStaffName: string;
  assignedStaffId?: string;
  assignedStaffRole?: string;
  assignedStaffType?: string;
  status: 'Assigned' | 'Pending' | 'In Progress' | 'Completed' | string;
  equipment?: string[];
  mobile?: string;
}

export interface EventTeamMemberAssignmentGroup {
  eventId: string;
  eventName: string;
  eventType: string;
  eventDate: string;
  eventStartTime: string;
  eventEndDate: string;
  eventEndTime: string;
  reportingDate: string;
  reportingTime: string;
  location: string;
  googleMapsLink?: string | null;
  guestPax?: string;
  mappings: TeamMemberStaffMapping[];
  rawEvent?: any;
}

export const extractTeamMembersConfig = (lead: any, leadPkgs: any[]): EventTeamMemberConfig[] => {
  if (!lead && (!leadPkgs || leadPkgs.length === 0)) return [];

  const configs: EventTeamMemberConfig[] = [];

  const parseRaw = (val: any) => {
    if (!val) return null;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch (e) {
        return val.split(/,|\n/).map((s: string) => s.trim()).filter(Boolean);
      }
    }
    return val;
  };

  const processParsedData = (parsed: any, pkgId?: string) => {
    if (!parsed) return;

    if (Array.isArray(parsed)) {
      parsed.forEach((item: any, idx: number) => {
        if (item && typeof item === 'object' && ('event_id' in item || 'event_name' in item || 'event_type' in item || 'team_members' in item || 'inclusions' in item || 'deliverables' in item || 'members' in item)) {
          const evId = String(item.event_id || item.id || `EV-${idx + 1}`).trim();
          const evName = String(item.event_name || item.name || item.event_type || `Event ${idx + 1}`).trim();
          const tm = item.team_members || item.inclusions || item.deliverables || item.members || [];
          const tmList = Array.isArray(tm) ? tm : parseRaw(tm) || [];
          if (tmList.length > 0) {
            configs.push({
              event_id: evId,
              event_name: evName,
              package_id: pkgId,
              team_members: tmList
            });
          }
        }
      });

      const isEventArray = parsed.some((item: any) => item && typeof item === 'object' && ('event_id' in item || 'event_name' in item || 'team_members' in item || 'members' in item));
      if (!isEventArray && parsed.length > 0) {
        configs.push({
          event_id: '',
          event_name: '',
          package_id: pkgId,
          team_members: parsed
        });
      }
    } else if (typeof parsed === 'object') {
      Object.entries(parsed).forEach(([key, val]) => {
        if (!val) return;
        const valList = Array.isArray(val) ? val : parseRaw(val) || [val];
        if (Array.isArray(valList) && valList.length > 0) {
          let extractedEvId = key;
          let extractedEvName = key;

          if (pkgId && key.toLowerCase().startsWith(`${pkgId.toLowerCase()}_`)) {
            const rest = key.substring(pkgId.length + 1);
            extractedEvId = rest;
            extractedEvName = rest;
          } else if (key.toLowerCase().startsWith('custom package_')) {
            const rest = key.substring('custom package_'.length);
            extractedEvId = rest;
            extractedEvName = rest;
          } else if (key.toLowerCase().startsWith('custom_package_')) {
            const rest = key.substring('custom_package_'.length);
            extractedEvId = rest;
            extractedEvName = rest;
          } else if (key.includes('_')) {
            const parts = key.split('_');
            const rest = parts.slice(1).join('_');
            extractedEvId = rest;
            extractedEvName = rest;
          }

          configs.push({
            event_id: extractedEvId,
            event_name: extractedEvName,
            package_id: pkgId,
            team_members: valList
          });
        }
      });
    }
  };

  // 1. PRIMARY SOURCE OF TRUTH: Sales Step 3 saved data on Lead or Order
  // (lead.Team_Members, lead.Team_member, lead.team_members, order.team_members)
  const leadCandidates = [
    lead?.Team_Members,
    lead?.Team_member,
    lead?.team_members,
    (lead as any)?.Team_members,
    (lead as any)?.team_member,
    (lead as any)?.order_team_members
  ];
  for (const c of leadCandidates) {
    if (c) {
      const parsed = parseRaw(c);
      if (parsed) {
        processParsedData(parsed);
        if (configs.length > 0) {
          // If valid Step 3 team members are found on the lead/order, return immediately.
          // Never combine with older/stale package template data.
          return configs;
        }
      }
    }
  }

  // 2. Direct events on lead (lead.events) if they hold Step 3 team members
  if (lead?.events && Array.isArray(lead.events) && lead.events.length > 0) {
    lead.events.forEach((ev: any) => {
      const tm = ev.team_members || ev.Team_Members || ev.team_members_included || ev.inclusions;
      const parsedTm = Array.isArray(tm) ? tm : parseRaw(tm) || [];
      if (parsedTm.length > 0) {
        configs.push({
          event_id: String(ev.id || ev.event_id || '').trim(),
          event_name: String(ev.event_name || ev.event_type || '').trim(),
          team_members: parsedTm
        });
      }
    });
    if (configs.length > 0) {
      return configs;
    }
  }

  // 3. Fallback to active lead package ONLY if lead-level Step 3 data is missing
  if (leadPkgs && Array.isArray(leadPkgs) && leadPkgs.length > 0) {
    const activePkgId = lead?.Select_Package_Option || lead?.selected_package_id;
    const activePkg = leadPkgs.find(lp => lp.package_id === activePkgId || lp.id === activePkgId) || leadPkgs[0];
    if (activePkg) {
      const pkgId = activePkg.package_id || activePkg.id;
      const candidates = [
        activePkg.Team_Members_Included,
        activePkg.team_members_included,
        activePkg.Team_Members,
        activePkg.team_members,
        activePkg.editable_inclusions
      ];
      for (const c of candidates) {
        if (c) {
          const parsed = parseRaw(c);
          processParsedData(parsed, pkgId);
          if (configs.length > 0) {
            return configs;
          }
        }
      }
    }
  }

  return configs;
};

export const getEventRolesForEvent = (ev: any, index: number, configList: EventTeamMemberConfig[], totalEvents: number = 1): any[] => {
  if (!ev) return [];

  if (!configList || configList.length === 0) {
    const directTm = ev.team_members || ev.inclusions || ev.Team_Members || ev.team_members_included;
    if (directTm) {
      if (Array.isArray(directTm) && directTm.length > 0) return directTm;
      if (typeof directTm === 'string') {
        try {
          const parsed = JSON.parse(directTm);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (e) {
          const list = directTm.split(/,|\n/).map((s: string) => s.trim()).filter(Boolean);
          if (list.length > 0) return list;
        }
      }
    }
    return [];
  }

  const rawEvId = String(ev.id || ev.event_id || '').trim();
  const evId = rawEvId.toLowerCase();
  const cleanEvId = evId.replace(/[^a-z0-9]/g, '');

  // 1. Strict ID matching first
  if (evId) {
    const matchById = configList.find(c => {
      if (!c.event_id) return false;
      const cId = c.event_id.toLowerCase().trim();
      if (cId === evId) return true;
      if (cId.endsWith(`_${evId}`) || cId.endsWith(`-${evId}`)) return true;
      if (evId.endsWith(`_${cId}`) || evId.endsWith(`-${cId}`)) return true;
      const cleanCId = cId.replace(/[^a-z0-9]/g, '');
      if (cleanCId && cleanCId === cleanEvId) return true;
      return false;
    });
    if (matchById && matchById.team_members && matchById.team_members.length > 0) {
      return matchById.team_members;
    }
  }

  // 2. Fallback sequence ID check (ev-1, ev-2, etc.)
  const fallbackId = `ev-${index + 1}`;
  const matchByFallback = configList.find(c => {
    if (!c.event_id) return false;
    const cId = c.event_id.toLowerCase().trim();
    return cId === fallbackId || cId.endsWith(`_${fallbackId}`) || cId.endsWith(`-${fallbackId}`) || cId === `EV-${index + 1}`;
  });
  if (matchByFallback && matchByFallback.team_members && matchByFallback.team_members.length > 0) {
    return matchByFallback.team_members;
  }
  
  // 3. Index-based mapping fallback for multi-event or structured orders (configList[index])
  if (configList[index] && configList[index].team_members && configList[index].team_members.length > 0) {
    return configList[index].team_members;
  }

  // 4. Fallback by event name ONLY if totalEvents is 1 (single-event orders) to prevent cross-event team mixing in multi-event same-category orders
  if (totalEvents === 1 && (ev.event_name || ev.event_type)) {
    const evName = String(ev.event_name || ev.event_type).toLowerCase().trim();
    if (evName) {
      const matchByName = configList.find(c => {
        if (!c.event_name) return false;
        const cName = c.event_name.toLowerCase().trim();
        return cName === evName;
      });
      if (matchByName && matchByName.team_members && matchByName.team_members.length > 0) {
        return matchByName.team_members;
      }
    }
  }

  // 5. Single-event quotation / order: if totalEvents is 1 and configList has a single config
  if (totalEvents === 1) {
    if (configList.length === 1 && configList[0].team_members && configList[0].team_members.length > 0) {
      return configList[0].team_members;
    }
    const defaultCfg = configList.find(c => !c.event_id || c.event_id.toLowerCase() === 'default');
    if (defaultCfg && defaultCfg.team_members && defaultCfg.team_members.length > 0) {
      return defaultCfg.team_members;
    }
  }

  return [];
};

export const isRoleMatch = (roleA: string, roleB: string): boolean => {
  const a = (roleA || '').toLowerCase().trim();
  const b = (roleB || '').toLowerCase().trim();
  if (a === b) return true;
  if (!a || !b) return false;
  if ((a.includes('drone') || a.includes('aerial')) && (b.includes('drone') || b.includes('aerial'))) return true;
  if ((a.includes('photo') || a.includes('photographer')) && (b.includes('photo') || b.includes('photographer'))) return true;
  if ((a.includes('video') || a.includes('cinema') || a.includes('videographer')) && (b.includes('video') || b.includes('cinema') || b.includes('videographer'))) return true;
  if ((a.includes('assist') || a.includes('helper')) && (b.includes('assist') || b.includes('helper'))) return true;
  if (a.includes('editor') && b.includes('editor')) return true;
  return false;
};

export interface OrderAssignmentStats {
  totalRequired: number;
  totalAssigned: number;
  totalPending: number;
  isFullyAssigned: boolean;
}

export function calculateOrderAssignmentStats(params: {
  lead?: any;
  order?: any;
  leadPkgs?: any[];
  eventAllocations?: Record<string, { staff?: any[] }>;
  staffAssignments?: any[];
  staffList?: any[];
}): OrderAssignmentStats {
  const { lead, order, leadPkgs = [], eventAllocations, staffAssignments } = params;

  // 1. Resolve raw events list
  const rawEvents = lead?.events && Array.isArray(lead.events) && lead.events.length > 0
    ? lead.events
    : [{ id: 'default', event_name: order?.event_name || order?.event_type || lead?.event_type || 'Main Event' }];

  const totalEvents = rawEvents.length;
  const targetLeadPkgs = leadPkgs.length > 0 ? leadPkgs : (lead?.lead_id ? leadPkgs.filter((lp: any) => lp.lead_id === lead.lead_id) : []);
  const teamMembersConfig = extractTeamMembersConfig(lead, targetLeadPkgs);

  let totalRequired = 0;
  let totalAssigned = 0;
  let hasPending = false;

  rawEvents.forEach((ev: any, index: number) => {
    const evId = ev.id || `EV-N/A-${index}`;
    const includedRoles = getEventRolesForEvent(ev, index, teamMembersConfig, totalEvents);

    // Group required roles into task slots
    const tasksMap = new Map<string, { roleName: string; targetQty: number }>();
    includedRoles.forEach((roleStr: any) => {
      const { qty, text } = parseQtyAndText(roleStr);
      const roleName = (text || (typeof roleStr === 'string' ? roleStr : '')).trim();
      if (!roleName) return;
      if (tasksMap.has(roleName)) {
        tasksMap.get(roleName)!.targetQty += (qty || 1);
      } else {
        tasksMap.set(roleName, { roleName, targetQty: qty || 1 });
      }
    });

    // Resolve assigned staff list for this event
    let validStaffForEvent: { staff_name: string; staff_role: string }[] = [];

    if (eventAllocations) {
      const alloc = eventAllocations[evId] || (totalEvents === 1 ? (eventAllocations['default'] || Object.values(eventAllocations)[0]) : null);
      if (alloc?.staff && Array.isArray(alloc.staff)) {
        validStaffForEvent = alloc.staff
          .filter((s: any) => s.staff_name && s.staff_name.trim() !== '' && s.staff_name.toLowerCase() !== 'unassigned' && s.staff_name.toLowerCase() !== 'none' && s.staff_name.toLowerCase() !== 'pending')
          .map((s: any) => ({ staff_name: s.staff_name.trim(), staff_role: (s.staff_role || '').trim() }));
      }
    } else if (staffAssignments) {
      const isMultiEv = totalEvents > 1;
      const orderIdToMatch = order?.order_id || lead?.lead_id;
      validStaffForEvent = staffAssignments
        .filter((sa: any) => {
          if (sa.order_id !== orderIdToMatch) return false;
          if (sa.assignment_status === 'Cancelled') return false;
          const saEvId = sa.event_id ? String(sa.event_id) : '';
          if (saEvId) {
            return saEvId === evId || saEvId.includes(evId) || (ev.id && saEvId === String(ev.id));
          }
          if (isMultiEv) return false;
          return sa.event_name && (sa.event_name.toLowerCase() === (ev.event_name || '').toLowerCase() || sa.event_name.toLowerCase() === (ev.event_type || '').toLowerCase());
        })
        .map((sa: any) => ({ staff_name: sa.staff_name.trim(), staff_role: (sa.staff_role || '').trim() }));
    } else if (ev.assigned_staff_names && ev.assigned_staff_names.trim()) {
      const names = ev.assigned_staff_names.split(',').map((n: string) => n.trim()).filter((n: string) => n && n.toLowerCase() !== 'unassigned' && n.toLowerCase() !== 'none' && n.toLowerCase() !== 'pending');
      validStaffForEvent = names.map((name: string) => ({ staff_name: name, staff_role: '' }));
    }

    if (tasksMap.size > 0) {
      // Required slots exist
      for (const task of Array.from(tasksMap.values())) {
        totalRequired += task.targetQty;
        const matchingStaff = validStaffForEvent.filter(s => !s.staff_role || (s.staff_role || '').trim().toLowerCase() === (task.roleName || '').trim().toLowerCase());
        const assignedCount = matchingStaff.length;
        const validCount = Math.min(assignedCount, task.targetQty);
        totalAssigned += validCount;
        if (assignedCount < task.targetQty) {
          hasPending = true;
        }
      }
    } else {
      // No tasks configured in package for this event
      const directCount = validStaffForEvent.length;
      totalAssigned += directCount;
      if (directCount === 0) {
        hasPending = true;
      }
    }
  });

  const totalPending = Math.max(0, totalRequired - totalAssigned);
  const isFullyAssigned = totalRequired > 0
    ? (totalAssigned >= totalRequired && !hasPending)
    : totalAssigned > 0;

  return {
    totalRequired,
    totalAssigned,
    totalPending,
    isFullyAssigned
  };
}

export function getEventTeamMemberStaffMapping(params: {
  lead?: any;
  order?: any;
  leadPkgs?: any[];
  staffAssignments?: any[];
  operationsRecord?: any;
  staffList?: any[];
  modalEventAllocations?: any;
  finalAssignments?: any[];
  targetStaffName?: string;
}): EventTeamMemberAssignmentGroup[] {
  const {
    lead,
    order,
    leadPkgs = [],
    staffAssignments = [],
    operationsRecord,
    staffList = [],
    modalEventAllocations,
    finalAssignments,
    targetStaffName
  } = params;

  // Resolve Events - strictly prioritize latest Lead event array / serialized notes from Sales, fallback to order
  let rawEvents: any[] = [];
  if (lead?.events && Array.isArray(lead.events) && lead.events.length > 0) {
    rawEvents = lead.events;
  } else if (lead?.notes_special_customizations) {
    const deserialized = deserializeLeadEvents(lead.notes_special_customizations);
    if (deserialized.events && deserialized.events.length > 0) {
      rawEvents = deserialized.events;
    }
  }

  if (rawEvents.length === 0) {
    if (order?.events && Array.isArray(order.events) && order.events.length > 0) {
      rawEvents = order.events;
    } else if (order?.notes_special_customizations) {
      const deserialized = deserializeLeadEvents(order.notes_special_customizations);
      if (deserialized.events && deserialized.events.length > 0) {
        rawEvents = deserialized.events;
      }
    }
  }

  const totalEvents = rawEvents.length > 0 ? rawEvents.length : 1;
  const teamConfigs = extractTeamMembersConfig(lead, leadPkgs);

  const resolvedEvents = rawEvents.length > 0
    ? sortMultiEventsNewestFirst(rawEvents)
    : [{
        id: 'default_event',
        event_name: order?.event_name || lead?.event_name || order?.event_type || lead?.event_type || 'Main Event',
        event_type: order?.event_type || lead?.event_type || 'Main Event',
        custom_event_name: order?.custom_event_name || lead?.custom_event_name,
        event_date: order?.event_date || lead?.event_date || 'N/A',
        event_start_time: order?.event_time || lead?.event_time || 'N/A',
        event_end_date: order?.event_end_date || lead?.event_end_date || 'N/A',
        event_end_time: order?.event_end_time || lead?.event_end_time || 'N/A',
        reporting_date: order?.Reporting_date || lead?.Reporting_date || order?.event_date || 'N/A',
        reporting_time: order?.reporting_time || lead?.reporting_time || operationsRecord?.reporting_time || 'N/A',
        event_location: (lead?.event_location || order?.event_location || '').trim(),
        google_maps_link: order?.google_maps_link || lead?.google_maps_link || null,
        guest_pax: (lead as any)?.guest_pax || order?.guest_pax || 'N/A'
      }];

  const groups: EventTeamMemberAssignmentGroup[] = [];

  resolvedEvents.forEach((ev: any, evIdx: number) => {
    const evId = String(ev.id || ev.event_id || `ev_${evIdx}`);
    const rawEType = ev.event_type || lead?.event_type || order?.event_type || 'N/A';
    const eventType = rawEType === 'Other' ? (ev.custom_event_type || lead?.custom_event_type || 'Other') : rawEType;
    let eventName = 'Main Event';
    if (ev.event_name === 'Other') {
      eventName = ev.custom_event_name || 'Other';
    } else if (ev.custom_event_name && ev.custom_event_name.trim() !== '') {
      eventName = ev.custom_event_name;
    } else if (ev.event_name && ev.event_name.trim() !== '') {
      eventName = ev.event_name;
    } else if (lead?.custom_event_name && lead.custom_event_name.trim() !== '') {
      eventName = lead.custom_event_name;
    } else if (lead?.event_name && lead.event_name !== 'Other' && lead.event_name.trim() !== '') {
      eventName = lead.event_name;
    } else if (order?.event_name && order.event_name !== 'Other' && order.event_name.trim() !== '') {
      eventName = order.event_name;
    } else if (eventType && eventType !== 'N/A') {
      eventName = eventType;
    }

    const eventDate = ev.event_date || order?.event_date || lead?.event_date || 'N/A';
    const eventStartTime = ev.event_start_time || ev.event_time || order?.event_time || lead?.event_time || 'N/A';
    const eventEndDate = ev.event_end_date || ev.Event_End_Date || order?.event_end_date || lead?.event_end_date || 'N/A';
    const eventEndTime = ev.event_end_time || order?.event_end_time || 'N/A';
    const reportingDate = ev.reporting_date || ev.Reporting_date || order?.Reporting_date || lead?.Reporting_date || eventDate || 'N/A';
    const reportingTime = ev.reporting_time || order?.reporting_time || lead?.reporting_time || operationsRecord?.reporting_time || 'N/A';
    
    // Strict event-wise location mapping:
    // When events are defined, strictly use the specific event's event_location from Sales.
    // If empty in Sales, keep it empty rather than showing another event's location.
    let location = '';
    if (rawEvents.length > 0) {
      location = (ev.event_location || '').trim();
    } else {
      location = (lead?.event_location || order?.event_location || '').trim();
    }
    const googleMapsLink = ev.google_maps_link || (totalEvents === 1 ? (lead?.google_maps_link || order?.google_maps_link || null) : null);
    const guestPax = ev.guest_pax || (lead as any)?.guest_pax || order?.guest_pax || 'N/A';

    // 1. Extract Sales Team Members Included for this event
    const includedRoles = getEventRolesForEvent(ev, evIdx, teamConfigs, totalEvents);
    const requiredSlots: { roleName: string; originalStr: string }[] = [];
    includedRoles.forEach((roleStr: string) => {
      const { qty, text } = parseQtyAndText(roleStr);
      const roleName = (text || roleStr).trim();
      if (!roleName) return;
      const targetQty = qty || 1;
      for (let k = 0; k < targetQty; k++) {
        requiredSlots.push({ roleName, originalStr: roleStr });
      }
    });

    // 2. Gather Assigned Staff pool for this specific event
    const assignedStaffPool: {
      staff_name: string;
      staff_id?: string;
      staff_role?: string;
      staff_type?: string;
      equipment?: string[];
      mobile?: string;
      status?: string;
      used?: boolean;
    }[] = [];

    // Source A: finalAssignments (from assignment modal save)
    if (finalAssignments && finalAssignments.length > 0) {
      finalAssignments.forEach(a => {
        const isEvMatch = a.event_id
          ? (a.event_id === evId || a.event_id.includes(evId))
          : (totalEvents === 1 || (a.event_name && a.event_name.toLowerCase() === eventName.toLowerCase()));
        if (isEvMatch && a.staff_name && a.staff_name.trim()) {
          assignedStaffPool.push({
            staff_name: a.staff_name,
            staff_id: a.staff_id,
            staff_role: a.staff_role,
            staff_type: a.staff_type,
            equipment: a.equipment || [],
            mobile: a.mobile || '',
            status: a.task_status || a.assignment_status || 'Assigned'
          });
        }
      });
    }

    // Source B: modalEventAllocations
    if (modalEventAllocations && modalEventAllocations[evId]?.staff) {
      modalEventAllocations[evId].staff.forEach((st: any) => {
        if (st.staff_name && st.staff_name.trim()) {
          const already = assignedStaffPool.some(p => p.staff_name.toLowerCase() === st.staff_name.toLowerCase() && p.staff_role?.toLowerCase() === st.staff_role?.toLowerCase());
          if (!already) {
            assignedStaffPool.push({
              staff_name: st.staff_name,
              staff_id: st.staff_id,
              staff_role: st.staff_role,
              staff_type: st.staff_type,
              equipment: st.equipment || [],
              mobile: st.mobile || '',
              status: st.task_status || st.assignment_status || 'Assigned'
            });
          }
        }
      });
    }

    // Source C: staffAssignments from database
    const orderIdToMatch = order?.order_id || lead?.lead_id;
    if (orderIdToMatch) {
      const orderAssigns = staffAssignments.filter(sa => {
        if (sa.order_id !== orderIdToMatch && sa.order_id !== order?.order_id && sa.order_id !== lead?.lead_id) return false;
        if (sa.assignment_status === 'Cancelled') return false;
        const saEvId = sa.event_id ? String(sa.event_id) : '';
        if (saEvId) {
          return saEvId === evId || saEvId.includes(evId) || (ev.id && saEvId === String(ev.id));
        }
        if (totalEvents > 1) return false;
        if (sa.event_name) {
          return sa.event_name.toLowerCase() === eventName.toLowerCase() || sa.event_name.toLowerCase() === eventType.toLowerCase();
        }
        return totalEvents === 1;
      });
      orderAssigns.forEach(sa => {
        if (sa.staff_name && sa.staff_name.trim() && sa.staff_name.toLowerCase() !== 'unassigned' && sa.staff_name.toLowerCase() !== 'none') {
          const already = assignedStaffPool.some(p => p.staff_name.toLowerCase() === sa.staff_name.toLowerCase() && (!sa.staff_role || p.staff_role?.toLowerCase() === sa.staff_role?.toLowerCase()));
          if (!already) {
            const stObj = staffList.find(s => s.name?.toLowerCase() === sa.staff_name.toLowerCase() || s.staff_id === sa.staff_id);
            const saEq = sa.equipment ? (Array.isArray(sa.equipment) ? sa.equipment : (() => { try { const p = JSON.parse(sa.equipment); return Array.isArray(p) ? p : [sa.equipment]; } catch(e) { return sa.equipment.split(',').map((s: string) => s.trim()).filter(Boolean); } })()) : [];
            assignedStaffPool.push({
              staff_name: sa.staff_name,
              staff_id: sa.staff_id || stObj?.staff_id,
              staff_role: sa.staff_role || stObj?.role || 'Staff',
              staff_type: sa.staff_type || stObj?.staff_type || 'In-House',
              equipment: saEq,
              mobile: sa.mobile || stObj?.mobile || '',
              status: sa.task_status || sa.assignment_status || 'Assigned'
            });
          }
        }
      });
    }

    // Source D: ev.assigned_staff_names on event record
    if (ev.assigned_staff_names && ev.assigned_staff_names.trim()) {
      const names = ev.assigned_staff_names.split(',').map((n: string) => n.trim()).filter(Boolean);
      let staffEquipments: string[][] = [];
      const mobilesRaw = ev.assigned_staff_mobiles || '';
      if (mobilesRaw.includes(' || EQUIPMENT: JSON:')) {
        try {
          const parts = mobilesRaw.split(' || EQUIPMENT: JSON:');
          staffEquipments = JSON.parse(parts[1]);
        } catch(e) {}
      }
      const cleanMobiles = mobilesRaw.split(' || EQUIPMENT:')[0] || '';
      const mobilesList = cleanMobiles.split(',').map((m: string) => m.trim()).filter(Boolean);

      names.forEach((name: string, nIdx: number) => {
        const already = assignedStaffPool.some(p => p.staff_name.toLowerCase() === name.toLowerCase());
        if (!already && name.toLowerCase() !== 'unassigned' && name.toLowerCase() !== 'none') {
          const stObj = staffList.find(s => s.name?.toLowerCase() === name.toLowerCase());
          assignedStaffPool.push({
            staff_name: name,
            staff_id: stObj?.staff_id,
            staff_role: stObj?.role || 'Staff',
            staff_type: stObj?.staff_type || 'In-House',
            equipment: staffEquipments[nIdx] || [],
            mobile: mobilesList[nIdx] || stObj?.mobile || '',
            status: 'Assigned'
          });
        }
      });
    }

    // Source E: operations table fallback for single event
    if (totalEvents === 1 && operationsRecord && assignedStaffPool.length === 0) {
      if (operationsRecord.photographer_assigned) {
        assignedStaffPool.push({
          staff_name: operationsRecord.photographer_assigned,
          staff_role: 'Lead Photographer',
          status: operationsRecord.event_status || 'Assigned'
        });
      }
      if (operationsRecord.videographer_assigned) {
        assignedStaffPool.push({
          staff_name: operationsRecord.videographer_assigned,
          staff_role: 'Lead Videographer',
          status: operationsRecord.event_status || 'Assigned'
        });
      }
      if (operationsRecord.drone_operator_assigned) {
        assignedStaffPool.push({
          staff_name: operationsRecord.drone_operator_assigned,
          staff_role: 'Drone Operator',
          status: operationsRecord.event_status || 'Assigned'
        });
      }
      if (operationsRecord.assistant_assigned) {
        assignedStaffPool.push({
          staff_name: operationsRecord.assistant_assigned,
          staff_role: 'Production Assistant',
          status: operationsRecord.event_status || 'Assigned'
        });
      }
    }

    // 3. Map Sales Team Members Included slots -> Assigned Staff
    const mappings: TeamMemberStaffMapping[] = [];

    const isRoleMatch = (roleA: string, roleB: string) => {
      const a = roleA.toLowerCase().trim();
      const b = roleB.toLowerCase().trim();
      if (a === b) return true;
      if ((a.includes('drone') || a.includes('aerial')) && (b.includes('drone') || b.includes('aerial'))) return true;
      if ((a.includes('photo') || a.includes('photographer')) && (b.includes('photo') || b.includes('photographer'))) return true;
      if ((a.includes('video') || a.includes('cinema')) && (b.includes('video') || b.includes('cinema'))) return true;
      if ((a.includes('assist') || a.includes('helper')) && (b.includes('assist') || b.includes('helper'))) return true;
      if (a.includes('editor') && b.includes('editor')) return true;
      return false;
    };

    requiredSlots.forEach(slot => {
      // Find matching unassigned staff in pool
      let matchedStaffIdx = assignedStaffPool.findIndex(p => !p.used && p.staff_role && isRoleMatch(p.staff_role, slot.roleName));
      if (matchedStaffIdx === -1) {
        // Fallback: check staff directory role
        matchedStaffIdx = assignedStaffPool.findIndex(p => {
          if (p.used) return false;
          const stObj = staffList.find(s => s.name?.toLowerCase() === p.staff_name.toLowerCase());
          return stObj?.role && isRoleMatch(stObj.role, slot.roleName);
        });
      }
      if (matchedStaffIdx === -1) {
        // Fallback: any unused staff in this event pool
        matchedStaffIdx = assignedStaffPool.findIndex(p => !p.used);
      }

      if (matchedStaffIdx !== -1) {
        const staffMember = assignedStaffPool[matchedStaffIdx];
        staffMember.used = true;
        mappings.push({
          teamMemberRole: slot.roleName,
          assignedStaffName: staffMember.staff_name,
          assignedStaffId: staffMember.staff_id,
          assignedStaffRole: staffMember.staff_role || slot.roleName,
          assignedStaffType: staffMember.staff_type || 'In-House',
          status: staffMember.status || 'Assigned',
          equipment: staffMember.equipment || [],
          mobile: staffMember.mobile || ''
        });
      } else {
        mappings.push({
          teamMemberRole: slot.roleName,
          assignedStaffName: 'Unassigned',
          status: 'Pending',
          equipment: []
        });
      }
    });

    // 4. Any leftover assigned staff in pool not mapped to a required slot
    assignedStaffPool.forEach(staffMember => {
      if (!staffMember.used) {
        staffMember.used = true;
        mappings.push({
          teamMemberRole: staffMember.staff_role || 'Crew Member',
          assignedStaffName: staffMember.staff_name,
          assignedStaffId: staffMember.staff_id,
          assignedStaffRole: staffMember.staff_role || 'Crew Member',
          assignedStaffType: staffMember.staff_type || 'In-House',
          status: staffMember.status || 'Assigned',
          equipment: staffMember.equipment || [],
          mobile: staffMember.mobile || ''
        });
      }
    });

    // 5. If no required slots were configured at all, and no staff in pool
    if (mappings.length === 0) {
      if (includedRoles.length > 0) {
        includedRoles.forEach(r => {
          mappings.push({
            teamMemberRole: r,
            assignedStaffName: 'Unassigned',
            status: 'Pending'
          });
        });
      }
    }

    groups.push({
      eventId: evId,
      eventName: eventName,
      eventType: eventType,
      eventDate: eventDate,
      eventStartTime: eventStartTime,
      eventEndDate: eventEndDate,
      eventEndTime: eventEndTime,
      reportingDate: reportingDate,
      reportingTime: reportingTime,
      location: location,
      googleMapsLink: googleMapsLink,
      guestPax: guestPax,
      mappings: mappings,
      rawEvent: ev
    });
  });

  return groups;
}

export function getEventDeliverables(order: any, lead: any, eventId: string, eventName: string): string[] {
  const raw = order?.deliverables || lead?.deliverables || order?.deliverables_description || lead?.deliverables_description || order?.editable_deliverables || lead?.editable_deliverables;
  if (!raw) return [];

  const parseObj = (obj: any): string[] => {
    if (Array.isArray(obj)) {
      const matchedEv = obj.find((item: any) => {
        if (!item || typeof item !== 'object') return false;
        const idMatch = item.event_id && (item.event_id === eventId || item.event_id.includes(eventId));
        const nameMatch = item.event_name && eventName && item.event_name.trim().toLowerCase() === eventName.trim().toLowerCase();
        return idMatch || nameMatch;
      });

      if (matchedEv && Array.isArray(matchedEv.deliverables)) {
        return matchedEv.deliverables.map((d: any) => {
          if (!d) return '';
          if (typeof d === 'string') return d;
          if (d.name) return `${d.name}${d.qty ? ` × ${d.qty}` : ''}`;
          return '';
        }).filter(Boolean);
      }

      const isEventArray = obj.some((item: any) => item && typeof item === 'object' && (item.event_id || item.event_name));
      if (!isEventArray) {
        return obj.map(String).filter(Boolean);
      }
      return [];
    }

    if (typeof obj === 'object') {
      for (const [key, val] of Object.entries(obj)) {
        if (key === eventId || (eventName && key.toLowerCase() === eventName.toLowerCase())) {
          if (Array.isArray(val)) return val.map(String).filter(Boolean);
          if (typeof val === 'string') return [val];
        }
      }
    }
    return [];
  };

  if (typeof raw === 'object') {
    return parseObj(raw);
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseObj(parsed);
      } catch (e) {
        return [];
      }
    }
  }

  return [];
}

const WHATSAPP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a date range consistently into "DD MMM YYYY – DD MMM YYYY"
 * Example: "01 Sep 2026 – 19 Sep 2026"
 */
export function formatDateRange(startDate?: string | null | Date, endDate?: string | null | Date, separator = ' – '): string {
  const startFmt = startDate ? formatDateDDMMYY(startDate) : '';
  const endFmt = endDate ? formatDateDDMMYY(endDate) : '';
  if (startFmt && endFmt) {
    return `${startFmt}${separator}${endFmt}`;
  }
  if (startFmt) return startFmt;
  if (endFmt) return endFmt;
  return '';
}

export const toCalendarDateString = (dateVal?: string | null | Date): string | null => {
  if (!dateVal && (dateVal as any) !== 0) return null;
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return null;
    const y = dateVal.getFullYear();
    const m = String(dateVal.getMonth() + 1).padStart(2, '0');
    const d = String(dateVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  let str = String(dateVal).trim();
  if (!str || str === '—' || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') return null;

  // Strip day of week prefix like "Sun, " or "Sunday, "
  str = str.replace(/^(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*[\s,]+/i, '');

  // 1. YYYY-MM-DD or YYYY/MM/DD (e.g. "2026-09-20" or "2026-09-20T...")
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY or MM/DD/YYYY etc.
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const n1 = parseInt(dmyMatch[1], 10);
    const n2 = parseInt(dmyMatch[2], 10);
    const y = dmyMatch[3];
    if (n2 > 12 && n1 <= 12) {
      return `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
    }
    return `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
  }

  // 3. DD/MM/YY or DD-MM-YY
  const dmyShortMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmyShortMatch) {
    let y = parseInt(dmyShortMatch[3], 10);
    y = y < 100 ? 2000 + y : y;
    return `${y}-${dmyShortMatch[2].padStart(2, '0')}-${dmyShortMatch[1].padStart(2, '0')}`;
  }

  // 4. DD MMM YYYY or DD-MMM-YYYY or DD Month YYYY (e.g. "20 Sep 2026")
  const dMmmYMatch = str.match(/^(\d{1,2})[\s\-\/\.]*([a-zA-Z]{3,9})[\s\-\/\.,]*(\d{2,4})/);
  if (dMmmYMatch) {
    const d = dMmmYMatch[1].padStart(2, '0');
    const mStr = dMmmYMatch[2].toLowerCase().slice(0, 3);
    const mIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mStr);
    if (mIdx !== -1) {
      const m = String(mIdx + 1).padStart(2, '0');
      let y = parseInt(dMmmYMatch[3], 10);
      if (y < 100) y += 2000;
      return `${y}-${m}-${d}`;
    }
  }

  // 5. MMM DD, YYYY or Month DD, YYYY (e.g. "Sep 20, 2026")
  const mmmDYMatch = str.match(/^([a-zA-Z]{3,9})[\s\-\/\.]*(\d{1,2})(?:st|nd|rd|th)?[\s\-\/\.,]*(\d{2,4})/);
  if (mmmDYMatch) {
    const mStr = mmmDYMatch[1].toLowerCase().slice(0, 3);
    const mIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mStr);
    if (mIdx !== -1) {
      const m = String(mIdx + 1).padStart(2, '0');
      const d = mmmDYMatch[2].padStart(2, '0');
      let y = parseInt(mmmDYMatch[3], 10);
      if (y < 100) y += 2000;
      return `${y}-${m}-${d}`;
    }
  }

  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    const y = fallback.getFullYear();
    const m = String(fallback.getMonth() + 1).padStart(2, '0');
    const d = String(fallback.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
};

/**
 * Safely parse date and time components of an event into a timezone-agnostic millisecond timestamp.
 * Strictly supports: YYYY-MM-DD, DD MMM YYYY, DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, etc.
 */
export function getUniversalEventTimestamp(eventOrDate: any, timeVal?: any): number {
  if (!eventOrDate) return 0;
  let dateVal: any = eventOrDate;
  let timeStr: any = timeVal;
  if (typeof eventOrDate === 'object') {
    dateVal = eventOrDate.event_date || eventOrDate.reporting_date || eventOrDate.Reporting_date || eventOrDate.Event_Date || eventOrDate.event_start_date || eventOrDate.date || '';
    timeStr = timeVal || eventOrDate.event_start_time || eventOrDate.event_time || eventOrDate.reporting_time || eventOrDate.Reporting_time || eventOrDate.time || '';
  }
  const cal = toCalendarDateString(dateVal);
  if (!cal) return 0;
  const parts = cal.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);

  let hours = 0;
  let minutes = 0;
  if (timeStr && typeof timeStr === 'string') {
    const t = timeStr.trim().toUpperCase();
    const isPM = t.includes('PM');
    const isAM = t.includes('AM');
    const cleanTime = t.replace(/(AM|PM)/g, '').trim();
    const timeParts = cleanTime.split(':');
    if (timeParts.length >= 1) {
      let h = parseInt(timeParts[0], 10) || 0;
      const min = parseInt(timeParts[1] || '0', 10) || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      hours = h;
      minutes = min;
    }
  }
  return Date.UTC(y, m, d, hours, minutes);
}

/**
 * Standard Multi-Event Sorter: Always display most recent event date first (descending).
 * Secondary criterion: creation timestamp (newest first).
 * Tertiary criterion: unique event ID.
 */
export function sortMultiEventsNewestFirst<T = any>(events: T[]): T[] {
  if (!events || !Array.isArray(events)) return [];
  return [...events].sort((a: any, b: any) => {
    const tsA = getUniversalEventTimestamp(a);
    const tsB = getUniversalEventTimestamp(b);
    if (tsA > 0 && tsB > 0 && tsA !== tsB) {
      return tsB - tsA; // Most recent first
    }
    if (tsA > 0 && !tsB) return -1;
    if (!tsA && tsB > 0) return 1;

    // Secondary sort: creation timestamp, newest first
    const timeA = new Date(a?.created_at || a?.createdAt || a?.created_date || 0).getTime();
    const timeB = new Date(b?.created_at || b?.createdAt || b?.created_date || 0).getTime();
    if (timeA && timeB && timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
      return timeB - timeA;
    }

    // Tie-breaker: unique event id
    const idA = String(a?.id || a?.event_id || '');
    const idB = String(b?.id || b?.event_id || '');
    if (idA && idB) {
      return idB.localeCompare(idA);
    }
    return 0;
  });
}

export function formatOperationWhatsAppDate(dateVal?: string | null | Date): string {
  if (!dateVal && (dateVal as any) !== 0) return '';
  const formatted = formatDateDDMMYY(dateVal);
  if (formatted) return formatted;
  const cal = toCalendarDateString(dateVal);
  if (!cal) {
    const raw = String(dateVal).trim();
    if (!raw || raw === '—' || raw === '-' || raw === 'N/A' || raw === 'null' || raw === 'undefined') return '';
    return raw;
  }
  const [year, monthStr, dayStr] = cal.split('-');
  const monthIdx = parseInt(monthStr, 10) - 1;
  const monthName = WHATSAPP_MONTHS[monthIdx] || monthStr;
  const dayPadded = dayStr.padStart(2, '0');
  return `${dayPadded} ${monthName} ${year}`;
}

export function getOtherAssignedStaffForEvent(
  group: EventTeamMemberAssignmentGroup,
  params: {
    order?: any;
    lead?: any;
    staffAssignments?: any[];
    modalEventAllocations?: any;
    finalAssignments?: any[];
    targetStaffName?: string;
  },
  allGroups: EventTeamMemberAssignmentGroup[]
): string[] {
  const targetLower = (params.targetStaffName || '').trim().toLowerCase();
  const nameCaseMap = new Map<string, string>(); // lowercase -> display name

  const addName = (rawName: any) => {
    if (!rawName || typeof rawName !== 'string') return;
    const name = rawName.trim();
    if (!name) return;
    const lower = name.toLowerCase();
    if (lower === 'unassigned' || lower === 'none' || lower === 'n/a' || lower === 'pending') return;
    // Exclude recipient's own name
    if (targetLower && lower === targetLower) return;

    if (!nameCaseMap.has(lower)) {
      nameCaseMap.set(lower, name);
    }
  };

  const currentEventId = String(group.eventId || '').trim();
  const rawEvId = (group.rawEvent?.id ? String(group.rawEvent.id) : (group.rawEvent?.event_id ? String(group.rawEvent.event_id) : '')).trim();

  // Collect IDs of other events to strictly prevent cross-event staff leakage
  const otherEventIds = new Set(
    allGroups
      .filter(g => g !== group && String(g.eventId || '').trim() !== currentEventId)
      .flatMap((g, gIdx) => {
        const gRawId = g.rawEvent?.id ? String(g.rawEvent.id).trim() : '';
        const gRawEvId = g.rawEvent?.event_id ? String(g.rawEvent.event_id).trim() : '';
        return [
          String(g.eventId || '').trim(),
          gRawId,
          gRawEvId,
          `ev_${allGroups.indexOf(g)}`,
          `ev_${gIdx}`
        ];
      })
      .filter(Boolean)
  );

  const thisEventIds = new Set(
    [
      currentEventId,
      rawEvId,
      `ev_${allGroups.indexOf(group)}`
    ].filter(Boolean)
  );

  // 1. From group.mappings
  (group.mappings || []).forEach(m => {
    if (m.assignedStaffName) {
      addName(m.assignedStaffName);
    }
  });

  // 2. From modalEventAllocations for this event
  if (params.modalEventAllocations) {
    const alloc = params.modalEventAllocations[currentEventId] || 
      (rawEvId && params.modalEventAllocations[rawEvId]) ||
      Object.entries(params.modalEventAllocations).find(([k]) => thisEventIds.has(String(k).trim()))?.[1];
    if (alloc && Array.isArray((alloc as any).staff)) {
      (alloc as any).staff.forEach((s: any) => {
        addName(s.staff_name || s.name);
      });
    }
  }

  // 3. From finalAssignments for this event
  if (params.finalAssignments && Array.isArray(params.finalAssignments)) {
    params.finalAssignments.forEach((a: any) => {
      const aEvId = String(a.event_id || '').trim();
      if (aEvId) {
        if (otherEventIds.has(aEvId)) return;
        if (thisEventIds.has(aEvId) || aEvId.includes(currentEventId) || (rawEvId && aEvId.includes(rawEvId)) || allGroups.length === 1) {
          addName(a.staff_name || a.name);
        }
      } else if (allGroups.length === 1) {
        addName(a.staff_name || a.name);
      }
    });
  }

  // 4. From staffAssignments (database)
  if (params.staffAssignments && Array.isArray(params.staffAssignments)) {
    const orderIdToMatch = params.order?.order_id || params.lead?.lead_id;
    params.staffAssignments.forEach((sa: any) => {
      if (sa.order_id !== orderIdToMatch && sa.order_id !== params.order?.order_id && sa.order_id !== params.lead?.lead_id) return;
      if (sa.assignment_status === 'Cancelled') return;
      const saEvId = String(sa.event_id || '').trim();
      if (saEvId) {
        if (otherEventIds.has(saEvId)) return;
        if (thisEventIds.has(saEvId) || saEvId.includes(currentEventId) || (rawEvId && saEvId.includes(rawEvId)) || allGroups.length === 1) {
          addName(sa.staff_name);
        }
      } else if (allGroups.length === 1) {
        addName(sa.staff_name);
      }
    });
  }

  // 5. From raw event assigned_staff_names (if stored directly on event object)
  const evObj = group.rawEvent || (params.lead?.events || params.order?.events || []).find((e: any, idx: number) => {
    const eId = String(e.id || e.event_id || `ev_${idx}`).trim();
    return thisEventIds.has(eId);
  });
  if (evObj?.assigned_staff_names && typeof evObj.assigned_staff_names === 'string') {
    evObj.assigned_staff_names.split(',').forEach((n: string) => addName(n));
  }

  return Array.from(nameCaseMap.values());
}

export function generateWhatsAppAssignmentMessage(params: {
  order: any;
  lead?: any;
  leadPkgs?: any[];
  staffAssignments?: any[];
  operationsRecord?: any;
  staffList?: any[];
  modalEventAllocations?: any;
  finalAssignments?: any[];
  targetStaffName?: string;
}): string {
  const { order, lead, targetStaffName } = params;
  const groups = getEventTeamMemberStaffMapping(params);

  // Filter groups so each staff member receives ONLY the events they are assigned to
  let filteredGroups = groups;
  if (targetStaffName && targetStaffName.trim()) {
    const targetNameLower = targetStaffName.trim().toLowerCase();
    filteredGroups = groups.filter(group => {
      // 1. Check in group mappings
      const inMappings = group.mappings.some(m => 
        m.assignedStaffName && 
        m.assignedStaffName.trim().toLowerCase() === targetNameLower
      );
      if (inMappings) return true;

      // 2. Check modalEventAllocations for this event
      if (params.modalEventAllocations) {
        const currentEventId = String(group.eventId || '').trim();
        const rawEvId = (group.rawEvent?.id ? String(group.rawEvent.id) : (group.rawEvent?.event_id ? String(group.rawEvent.event_id) : '')).trim();
        const alloc = params.modalEventAllocations[currentEventId] || 
          (rawEvId && params.modalEventAllocations[rawEvId]) ||
          Object.entries(params.modalEventAllocations).find(([k]) => String(k).trim() === currentEventId || (rawEvId && String(k).trim() === rawEvId))?.[1];
        if (alloc && Array.isArray((alloc as any).staff)) {
          const inModal = (alloc as any).staff.some((s: any) => 
            (s.staff_name || s.name || '').trim().toLowerCase() === targetNameLower
          );
          if (inModal) return true;
        }
      }

      // 3. Check finalAssignments for this event
      if (params.finalAssignments && params.finalAssignments.length > 0) {
        const inFinal = params.finalAssignments.some((a: any) => {
          const isEvMatch = a.event_id 
            ? (a.event_id === group.eventId || a.event_id.includes(group.eventId) || (group.rawEvent?.id && a.event_id === String(group.rawEvent.id))) 
            : (groups.length === 1 || (a.event_name && a.event_name.toLowerCase() === group.eventName.toLowerCase()));
          return isEvMatch && (a.staff_name || a.name || '').trim().toLowerCase() === targetNameLower;
        });
        if (inFinal) return true;
      }

      // 4. Check staffAssignments from database
      if (params.staffAssignments && params.staffAssignments.length > 0) {
        const orderIdToMatch = order?.order_id || lead?.lead_id;
        const inSa = params.staffAssignments.some((sa: any) => {
          if (sa.order_id !== orderIdToMatch && sa.order_id !== order?.order_id && sa.order_id !== lead?.lead_id) return false;
          if (sa.assignment_status === 'Cancelled') return false;
          const isEvMatch = sa.event_id 
            ? (sa.event_id === group.eventId || sa.event_id.includes(group.eventId) || (group.rawEvent?.id && sa.event_id === String(group.rawEvent.id))) 
            : (groups.length === 1 || (sa.event_name && sa.event_name.toLowerCase() === group.eventName.toLowerCase()));
          return isEvMatch && (sa.staff_name || '').trim().toLowerCase() === targetNameLower;
        });
        if (inSa) return true;
      }

      // 5. Check ev.assigned_staff_names
      const evObj = group.rawEvent;
      if (evObj?.assigned_staff_names && typeof evObj.assigned_staff_names === 'string') {
        const evNames = evObj.assigned_staff_names.split(',').map((n: string) => n.trim().toLowerCase());
        if (evNames.includes(targetNameLower)) return true;
      }

      return false;
    });
  }

  // Fallback: if filtering resulted in 0 groups, fallback to all groups
  if (filteredGroups.length === 0) {
    filteredGroups = groups;
  }

  const customerName = order?.customer_name || lead?.customer_name || '';
  const phone = order?.mobile || lead?.mobile || order?.customer_mobile || lead?.customer_mobile || '';

  let msg = `*PHOTOCREW — EVENT ASSIGNMENT*\n\n`;

  const totalGroups = filteredGroups.length;

  filteredGroups.forEach((group, idx) => {
    // 1. Customer Details
    msg += `*Customer Details*\n`;
    if (customerName) {
      msg += `• Customer Name: ${customerName}\n`;
    }
    if (phone) {
      msg += `• Customer Mobile: ${phone}\n`;
    }
    msg += `\n`;

    // 2. Event Details
    msg += `*Event Details*\n`;
    const eventNameVal = group.eventName || 'Event';
    const displayEventName = totalGroups > 1 ? `${eventNameVal} (${idx + 1})` : eventNameVal;
    msg += `• Event Name: ${displayEventName}\n`;

    const repDate = (group.reportingDate && group.reportingDate !== 'N/A') ? group.reportingDate : (group.eventDate && group.eventDate !== 'N/A' ? group.eventDate : '');
    const formattedDate = formatOperationWhatsAppDate(repDate);
    if (formattedDate) {
      msg += `• Reporting Date: ${formattedDate}\n`;
    }
    if (group.reportingTime && group.reportingTime !== 'N/A' && group.reportingTime.trim() !== '') {
      msg += `• Reporting Time: ${group.reportingTime.trim()}\n`;
    }
    if (group.location && group.location !== 'N/A' && group.location.trim() !== '') {
      msg += `• Event Location: ${group.location.trim()}\n`;
    }
    if (group.googleMapsLink && group.googleMapsLink !== 'N/A' && group.googleMapsLink.trim() !== '') {
      msg += `• Google Maps: ${group.googleMapsLink.trim()}\n`;
    }
    msg += `\n`;

    // 3. Assignment Details (Assigned Role, Equipment Assigned)
    const rolesSet = new Set<string>();
    if (targetStaffName && targetStaffName.trim()) {
      const targetLower = targetStaffName.trim().toLowerCase();
      group.mappings.forEach(m => {
        if (m.assignedStaffName && m.assignedStaffName.trim().toLowerCase() === targetLower) {
          if (m.assignedStaffRole) rolesSet.add(m.assignedStaffRole);
          else if (m.teamMemberRole) rolesSet.add(m.teamMemberRole);
        }
      });
      if (rolesSet.size === 0 && params.staffAssignments) {
        params.staffAssignments.forEach((sa: any) => {
          if (sa.staff_name && sa.staff_name.trim().toLowerCase() === targetLower) {
            const isEvMatch = sa.event_id 
              ? (sa.event_id === group.eventId || sa.event_id.includes(group.eventId) || (group.rawEvent?.id && sa.event_id === String(group.rawEvent.id))) 
              : true;
            if (isEvMatch && sa.staff_role) rolesSet.add(sa.staff_role);
          }
        });
      }
      if (rolesSet.size === 0 && params.staffList) {
        const stObj = params.staffList.find(s => s.name?.toLowerCase() === targetLower);
        if (stObj?.role) rolesSet.add(stObj.role);
      }
    }
    if (rolesSet.size === 0) {
      group.mappings.forEach(m => {
        if (m.teamMemberRole) rolesSet.add(m.teamMemberRole);
      });
    }
    const assignedRoleStr = rolesSet.size > 0 ? Array.from(rolesSet).join(', ') : '';

    const eqSet = new Set<string>();
    const addEq = (eqVal: any) => {
      if (!eqVal) return;
      if (Array.isArray(eqVal)) {
        eqVal.forEach(e => addEq(e));
        return;
      }
      if (typeof eqVal === 'string') {
        eqVal.split(/[,;]|\s+[-•*]\s+/).forEach(e => {
          const trimmed = e.trim();
          if (trimmed && trimmed.toLowerCase() !== 'none' && trimmed.toLowerCase() !== 'n/a' && trimmed.toLowerCase() !== 'nil') {
            eqSet.add(trimmed);
          }
        });
      }
    };

    if (targetStaffName && targetStaffName.trim()) {
      const targetLower = targetStaffName.trim().toLowerCase();
      group.mappings.forEach(m => {
        if (m.assignedStaffName && m.assignedStaffName.trim().toLowerCase() === targetLower) {
          if (m.equipment) addEq(m.equipment);
        }
      });
      if (params.staffAssignments) {
        params.staffAssignments.forEach((sa: any) => {
          if (sa.staff_name && sa.staff_name.trim().toLowerCase() === targetLower) {
            const isEvMatch = sa.event_id 
              ? (sa.event_id === group.eventId || sa.event_id.includes(group.eventId) || (group.rawEvent?.id && sa.event_id === String(group.rawEvent.id))) 
              : true;
            if (isEvMatch && sa.equipment) addEq(sa.equipment);
          }
        });
      }
    } else {
      group.mappings.forEach(m => {
        if (m.equipment) addEq(m.equipment);
      });
    }

    const assignedEquipmentStr = eqSet.size > 0 ? Array.from(eqSet).join(', ') : '';

    if (assignedRoleStr || assignedEquipmentStr) {
      msg += `*Assignment Details*\n`;
      if (assignedRoleStr) {
        msg += `• Assigned Role: ${assignedRoleStr}\n`;
      }
      if (assignedEquipmentStr) {
        msg += `• Equipment Assigned: ${assignedEquipmentStr}\n`;
      }
      msg += `\n`;
    }

    // 4. Assigned Staff Members
    const otherStaffNames = getOtherAssignedStaffForEvent(group, params, groups);
    msg += `*Assigned Staff Members*\n`;
    if (otherStaffNames.length > 0) {
      otherStaffNames.forEach(staffName => {
        msg += `• ${staffName}\n`;
      });
    } else {
      msg += `• None\n`;
    }

    if (idx < totalGroups - 1) {
      msg += `\n---\n\n`;
    }
  });

  msg += `\nPlease review the event details and coordinate with the team as required.\n\n`;
  msg += `Thank you,\n`;
  msg += `*PhotoCrew Operations Team*`;

  return msg.trim();
}

export const parseTimeToMinutes = (timeStr: string | null | undefined): number | null => {
  if (!timeStr) return null;
  let str = timeStr.trim();
  if (!str || str === '-' || str === '—' || str.toLowerCase() === 'n/a') return null;

  // Handle ISO string e.g. 2026-09-02T14:30:00
  if (str.includes('T')) {
    const parts = str.split('T');
    if (parts[1]) str = parts[1];
  }

  // Regex to match:
  // HH:MM or HH:MM:SS or HH.MM
  // with optional AM/PM
  const match = str.match(/^(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*(AM|PM|am|pm))?/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[4] ? match[4].toUpperCase() : null;

  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
};

export const checkTimeOverlap = (
  startA: string | null | undefined, 
  endA: string | null | undefined, 
  startB: string | null | undefined, 
  endB: string | null | undefined
): boolean => {
  const sA = parseTimeToMinutes(startA);
  const sB = parseTimeToMinutes(startB);

  // If neither or only one has a parseable start time
  if (sA === null || sB === null) {
    // If exact raw string match, consider them same time (overlap)
    if (startA && startB && startA.trim().toLowerCase() === startB.trim().toLowerCase()) {
      return true;
    }
    // If times cannot be compared at all, return false unless start strings match
    return false;
  }

  // If start times are identical on same day, definitely overlap
  if (sA === sB) {
    return true;
  }

  let eA = parseTimeToMinutes(endA);
  let eB = parseTimeToMinutes(endB);

  // Handle overnight events (e.g. 10 PM to 2 AM)
  if (eA !== null && eA <= sA) {
    eA += 24 * 60;
  }
  if (eB !== null && eB <= sB) {
    eB += 24 * 60;
  }

  // Default duration if end time is missing (e.g. 4 hours = 240 mins)
  if (eA === null) {
    eA = sA + 240;
  }
  if (eB === null) {
    eB = sB + 240;
  }

  // Two events overlap if:
  // existingStart < currentEnd AND existingEnd > currentStart
  return sA < eB && sB < eA;
};

/**
 * Formats an ISO timestamp or date into IST (Asia/Kolkata) Date string (DD MMM YYYY)
 */
export function formatISTDate(dateVal?: string | null | Date): string {
  if (!dateVal) return 'N/A';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return formatDateDDMMYY(String(dateVal));
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).formatToParts(d);
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const month = parts.find(p => p.type === 'month')?.value || 'Jan';
    const year = parts.find(p => p.type === 'year')?.value || '2026';
    return `${day} ${month} ${year}`;
  } catch (e) {
    return formatDateDDMMYY(String(dateVal));
  }
}

/**
 * Formats an ISO timestamp or date into IST (Asia/Kolkata) 12-hour Time string (hh:mm AM/PM)
 */
export function formatISTTime12Hour(dateVal?: string | null | Date): string {
  if (!dateVal) return 'N/A';
  try {
    if (typeof dateVal === 'string' && !dateVal.includes('T') && !dateVal.includes('-') && dateVal.includes(':')) {
      return formatTime12Hour(dateVal);
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return formatTime12Hour(String(dateVal));
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
  } catch (e) {
    return formatTime12Hour(String(dateVal));
  }
}

/**
 * Formats an ISO timestamp into IST (Asia/Kolkata) full timestamp string for image uploads (DD MMM YYYY hh:mm:ss AM/PM)
 */
export function formatISTTimestamp(dateVal?: string | null | Date): string {
  if (!dateVal) return 'N/A';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return formatDateDDMMYY(String(dateVal));
    const datePart = formatISTDate(d);
    const timePart = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
    return `${datePart} ${timePart}`;
  } catch (e) {
    return formatDateDDMMYY(String(dateVal));
  }
}

/**
 * Returns saved custom package categories from persistent local storage
 */
export function getStoredCustomCategories(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('erp_custom_package_categories');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map((s: string) => String(s).trim()) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Saves a new custom package category into persistent local storage and dispatches sync event
 */
export function saveCustomCategoryToStorage(catName: string): void {
  if (!catName || typeof window === 'undefined') return;
  const clean = catName.trim();
  if (!clean || clean.toUpperCase() === 'CUSTOM_CATEGORY') return;
  try {
    const existing = getStoredCustomCategories();
    if (!existing.some(c => c.toLowerCase() === clean.toLowerCase())) {
      const updated = [...existing, clean];
      localStorage.setItem('erp_custom_package_categories', JSON.stringify(updated));
    }
  } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent('custom-category-updated', { detail: clean }));
  } catch (_) {}
}

/**
 * Loads custom equipment categories from persistent local storage
 */
export function getStoredEquipmentCategories(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('erp_custom_equipment_categories') || localStorage.getItem('equipment_categories');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map((s: string) => String(s).trim()) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Saves a new custom equipment category into persistent local storage and dispatches sync event
 */
export function saveEquipmentCategoryToStorage(catName: string): string[] {
  if (!catName || typeof window === 'undefined') return getStoredEquipmentCategories();
  const clean = catName.trim();
  if (!clean) return getStoredEquipmentCategories();
  let updated = getStoredEquipmentCategories();
  try {
    if (!updated.some(c => c.toLowerCase() === clean.toLowerCase())) {
      updated = [...updated, clean];
      localStorage.setItem('erp_custom_equipment_categories', JSON.stringify(updated));
      localStorage.setItem('equipment_categories', JSON.stringify(updated));
    }
  } catch (_) {}
  try {
    window.dispatchEvent(new CustomEvent('equipment-categories-updated', { detail: updated }));
  } catch (_) {}
  return updated;
}

/**
 * Resolves all canonical and formatted variations of Order ID and Lead ID
 * to ensure bulletproof relational querying, payment association, and approval mapping.
 */
export const getAllMatchingOrderIds = (
  orderId?: string | null,
  leadId?: string | null,
  orders: any[] = [],
  leads: any[] = []
): string[] => {
  const set = new Set<string>();
  const addVariant = (id?: any) => {
    if (!id || typeof id !== 'string') return;
    const clean = id.trim();
    if (!clean) return;
    set.add(clean);
    set.add(clean.toUpperCase());
    set.add(clean.toLowerCase());

    const noOrd = clean.replace(/^ORD-?/i, '');
    const noOr = clean.replace(/^OR-?/i, '');
    const noLd = clean.replace(/^LD-?/i, '');
    const noPrefix = clean.replace(/^(?:ORD|OR|LD)-?/i, '');

    if (noOrd) {
      set.add(noOrd);
      set.add(`ORD-${noOrd}`);
      set.add(`ORD${noOrd}`);
    }
    if (noOr) {
      set.add(noOr);
      set.add(`OR-${noOr}`);
      set.add(`OR${noOr}`);
      set.add(`ORD-${noOr}`);
    }
    if (noLd) {
      set.add(noLd);
      set.add(`LD-${noLd}`);
      set.add(`LD${noLd}`);
      set.add(`ORD-${noLd}`);
    }
    if (noPrefix) {
      set.add(noPrefix);
      set.add(`OR-${noPrefix}`);
      set.add(`OR${noPrefix}`);
      set.add(`ORD-${noPrefix}`);
    }

    // Number extraction for zero-padding variations (e.g. 64 -> OR064, OR0064, ORD-0064)
    const numMatch = clean.match(/\d+/);
    if (numMatch) {
      const num = parseInt(numMatch[0], 10);
      if (!isNaN(num)) {
        const p2 = String(num).padStart(2, '0');
        const p3 = String(num).padStart(3, '0');
        const p4 = String(num).padStart(4, '0');
        const isLead = clean.toUpperCase().includes('LD');
        
        if (!isLead) {
          set.add(`OR${num}`);
          set.add(`OR${p2}`);
          set.add(`OR${p3}`);
          set.add(`OR${p4}`);
          set.add(`OR-${num}`);
          set.add(`OR-${p2}`);
          set.add(`OR-${p3}`);
          set.add(`OR-${p4}`);
          set.add(`ORD-${num}`);
          set.add(`ORD-${p2}`);
          set.add(`ORD-${p3}`);
          set.add(`ORD-${p4}`);
          set.add(`ORD-OR${p3}`);
          set.add(`ORD-OR${p4}`);
          set.add(`ORDER-${num}`);
          set.add(`ORDER-${p3}`);
          set.add(`ORDER-${p4}`);
        } else {
          set.add(`LD${num}`);
          set.add(`LD${p2}`);
          set.add(`LD${p3}`);
          set.add(`LD${p4}`);
          set.add(`LD-${num}`);
          set.add(`LD-${p2}`);
          set.add(`LD-${p3}`);
          set.add(`LD-${p4}`);
          set.add(`ORD-LD${p3}`);
          set.add(`ORD-LD${p4}`);
        }
      }
    }
  };

  addVariant(orderId);
  addVariant(leadId);

  // Cross-reference with orders list
  const linkedOrder = orders.find(o => 
    (orderId && (o.order_id === orderId || o.lead_id === orderId)) ||
    (leadId && (o.lead_id === leadId || o.order_id === leadId))
  );
  if (linkedOrder) {
    addVariant(linkedOrder.order_id);
    addVariant(linkedOrder.lead_id);
  }

  // Cross-reference with leads list
  const linkedLead = leads.find(l => 
    (leadId && (l.lead_id === leadId || (l as any).order_id === leadId)) ||
    (orderId && ((l as any).order_id === orderId || l.lead_id === orderId))
  );
  if (linkedLead) {
    addVariant(linkedLead.lead_id);
    addVariant((linkedLead as any).order_id);
  }

  return Array.from(set);
};

const FINISHED_STAFF_TASK_STATUSES = [
  'footage handover', 'verified footage', 'footage handover verified',
  'raw footage received', 'editor assigned', 'assigned editor',
  'editing started', 'editing in progress', 'internal qc review',
  'client review sent', 'internal review', 'client review',
  'revision required', 'revision in progress', 'revision',
  'final approval', 'project delivered', 'project closed',
  'completed', 'closed', 'order closed', 'delivered'
];

export function calculateStaffActiveBookingsCount(
  staffName: string | undefined | null,
  staffAssignments: any[] = [],
  leads: any[] = [],
  orders: any[] = [],
  operations: any[] = []
): number {
  if (!staffName || !staffName.trim()) return 0;
  const normStaffName = staffName.trim().toLowerCase();

  const processedAssignmentIds = new Set<string>();
  const processedUniqueKeys = new Set<string>();
  let activeCount = 0;

  const isStaffAssigned = (checkName?: string | null): boolean => {
    const n = (checkName || '').trim().toLowerCase();
    return Boolean(normStaffName && n && n === normStaffName);
  };

  // Build unified map of orders/leads
  const orderMap = new Map<string, { order?: any; lead?: any; op?: any }>();
  (orders || []).forEach((o: any) => {
    const oId = o.order_id;
    const l = (leads || []).find((lead: any) => lead.lead_id === o.lead_id);
    const op = (operations || []).find((opItem: any) => opItem.order_id === oId || (l && opItem.order_id === l.lead_id));
    orderMap.set(oId, { order: o, lead: l, op });
  });

  (leads || []).forEach((l: any) => {
    const matchingOrd = (orders || []).find((o: any) => o.lead_id === l.lead_id);
    const oId = matchingOrd?.order_id || `OR-${l.lead_id?.replace(/^LD-?/, '')}`;
    if (!orderMap.has(oId)) {
      const op = (operations || []).find((opItem: any) => opItem.order_id === oId || opItem.order_id === l.lead_id);
      orderMap.set(oId, { order: matchingOrd, lead: l, op });
    }
  });

  (staffAssignments || []).forEach((sa: any) => {
    if (sa && isStaffAssigned(sa.staff_name)) {
      const oId = sa.order_id;
      if (oId && !orderMap.has(oId)) {
        const matchedOrd = (orders || []).find((o: any) => o.order_id === oId);
        const matchedLead = (leads || []).find((l: any) => l.lead_id === (sa.lead_id || matchedOrd?.lead_id));
        const op = (operations || []).find((opItem: any) => opItem.order_id === oId);
        orderMap.set(oId, { order: matchedOrd, lead: matchedLead, op });
      }
    }
  });

  orderMap.forEach(({ order, lead, op }, orderId) => {
    const leadId = lead?.lead_id || order?.lead_id || '';
    const orderEvents: any[] = (lead?.events && Array.isArray(lead.events) && lead.events.length > 0)
      ? lead.events
      : (order?.events && Array.isArray(order.events) && order.events.length > 0)
        ? order.events
        : [];

    if (orderEvents.length > 0) {
      orderEvents.forEach((ev: any, evIdx: number) => {
        const evIdentifier = String(ev.id || ev.event_id || `evt_${evIdx}`);
        const evName = (ev.event_name || ev.custom_event_name || ev.event_type || '').trim();
        const evType = (ev.event_type || ev.custom_event_type || 'Event').trim();

        const sa = (staffAssignments || []).find((s: any) => {
          if (!s || s.assignment_status === 'Cancelled' || s.assignment_status === 'Rejected') return false;
          if (s.order_id !== orderId && s.lead_id !== leadId) return false;
          if (!isStaffAssigned(s.staff_name)) return false;

          if (s.event_id && evIdentifier) {
            if (String(s.event_id).trim().toLowerCase() === evIdentifier.toLowerCase()) return true;
          }
          if (s.event_name) {
            const sEv = s.event_name.trim().toLowerCase();
            if (sEv === evName.toLowerCase() || sEv === evType.toLowerCase() || (ev.custom_event_name && sEv === ev.custom_event_name.trim().toLowerCase())) {
              return true;
            }
          }
          if (orderEvents.length === 1 && !s.event_id && !s.event_name) {
            return true;
          }
          return false;
        });

        const assignedNames = ev.assigned_staff_names
          ? ev.assigned_staff_names.split(',').map((n: string) => n.trim().toLowerCase())
          : [];
        const isDirectlyAssigned = assignedNames.some((n: string) => isStaffAssigned(n));

        const isSingleEventOpMatch = orderEvents.length === 1 && op && (
          isStaffAssigned(op.photographer_assigned) ||
          isStaffAssigned(op.videographer_assigned) ||
          isStaffAssigned(op.drone_operator_assigned) ||
          isStaffAssigned(op.assistant_assigned)
        );

        if (!sa && !isDirectlyAssigned && !isSingleEventOpMatch) {
          return;
        }

        const assignmentId = sa?.assignment_id || '';
        if (assignmentId && processedAssignmentIds.has(assignmentId)) return;

        const uniqueKey = assignmentId 
          ? `${orderId}_${assignmentId}_${evIdentifier}_${normStaffName}`
          : `${orderId}_${evIdentifier}_crew_${normStaffName}`;

        if (processedUniqueKeys.has(uniqueKey)) return;

        const currentStaffStatus = ((sa as any)?.task_status || ev?.status || 'Assigned Crew').trim().toLowerCase();
        if (!FINISHED_STAFF_TASK_STATUSES.includes(currentStaffStatus)) {
          activeCount++;
          processedUniqueKeys.add(uniqueKey);
          if (assignmentId) processedAssignmentIds.add(assignmentId);
        }
      });
    } else {
      const sa = (staffAssignments || []).find((s: any) => {
        if (!s || s.assignment_status === 'Cancelled' || s.assignment_status === 'Rejected') return false;
        if (s.order_id !== orderId && s.lead_id !== leadId) return false;
        return isStaffAssigned(s.staff_name);
      });

      const isAssignedInOp = op && (
        isStaffAssigned(op.photographer_assigned) ||
        isStaffAssigned(op.videographer_assigned) ||
        isStaffAssigned(op.drone_operator_assigned) ||
        isStaffAssigned(op.assistant_assigned)
      );

      if (sa || isAssignedInOp) {
        const assignmentId = sa?.assignment_id || '';
        if (assignmentId && processedAssignmentIds.has(assignmentId)) return;

        const uniqueKey = assignmentId 
          ? `${orderId}_${assignmentId}_gen_${normStaffName}`
          : `${orderId}_gen_crew_${normStaffName}`;

        if (processedUniqueKeys.has(uniqueKey)) return;

        const currentStaffStatus = ((sa as any)?.task_status || 'Assigned Crew').trim().toLowerCase();
        if (!FINISHED_STAFF_TASK_STATUSES.includes(currentStaffStatus)) {
          activeCount++;
          processedUniqueKeys.add(uniqueKey);
          if (assignmentId) processedAssignmentIds.add(assignmentId);
        }
      }
    }
  });

  // Also catch any standalone staffAssignments belonging to this staff
  (staffAssignments || []).forEach((sa: any) => {
    if (!sa || sa.assignment_status === 'Cancelled' || sa.assignment_status === 'Rejected') return;
    if (!isStaffAssigned(sa.staff_name)) return;
    if (sa.assignment_id && processedAssignmentIds.has(sa.assignment_id)) return;

    const orderId = sa.order_id;
    const matchedOrd = (orders || []).find((o: any) => o.order_id === orderId);
    const matchedLead = (leads || []).find((l: any) => l.lead_id === (sa.lead_id || matchedOrd?.lead_id));
    const orderEvents: any[] = (matchedLead?.events && Array.isArray(matchedLead.events)) ? matchedLead.events : [];
    if (orderEvents.length > 1) {
      const matchesEvent = orderEvents.some((e: any) => {
        const evId = String(e.id || e.event_id || '');
        if (sa.event_id && evId && String(sa.event_id).toLowerCase() === evId.toLowerCase()) return true;
        return false;
      });
      if (!matchesEvent) return;
    }

    const assignmentId = sa.assignment_id || '';
    const uniqueKey = assignmentId 
      ? `${orderId}_${assignmentId}_${sa.event_id || 'ev'}_${normStaffName}`
      : `${orderId}_${sa.event_id || 'ev'}_crew_${normStaffName}`;

    if (processedUniqueKeys.has(uniqueKey)) return;

    const currentStaffStatus = ((sa as any)?.task_status || 'Assigned Crew').trim().toLowerCase();
    if (!FINISHED_STAFF_TASK_STATUSES.includes(currentStaffStatus)) {
      activeCount++;
      processedUniqueKeys.add(uniqueKey);
      if (assignmentId) processedAssignmentIds.add(assignmentId);
    }
  });

  return activeCount;
}

/**
 * Detects whether a string is a cryptographic password hash, auth token, or UUID.
 * Never treats hashes as original passwords.
 */
export const isPasswordHashOrToken = (val: any): boolean => {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  if (!s) return false;
  // Common hexadecimal hashes:
  // 64 hex chars = SHA-256
  // 128 hex chars = SHA-512
  // 32 hex chars = MD5
  // 40 hex chars = SHA-1
  if (/^[a-f0-9]{32}$/i.test(s) || /^[a-f0-9]{40}$/i.test(s) || /^[a-f0-9]{64}$/i.test(s) || /^[a-f0-9]{128}$/i.test(s)) {
    return true;
  }
  // Bcrypt / Blowfish ($2a$, $2b$, $2y$)
  if (/^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(s)) {
    return true;
  }
  // Argon2 / Scrypt / PBKDF2
  if (s.startsWith('$argon2') || s.startsWith('$pbkdf2') || s.startsWith('$scrypt')) {
    return true;
  }
  // UUID (auth_user_id or tokens mistakenly placed in password field)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return true;
  }
  // JWT tokens
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s)) {
    return true;
  }
  return false;
};

/**
 * Checks if a value is a legitimate non-hash plaintext password.
 */
export const isValidPlaintextPassword = (val: any): boolean => {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  if (!s) return false;
  if (isPasswordHashOrToken(s)) return false;
  return true;
};


