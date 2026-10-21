import { protocol } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LOGO_PROTOCOL } from '../src/shared/types';

export const MAX_LOGO_BYTES = 15 * 1024 * 1024; // 15 MB

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export const LOGO_EXTENSIONS = Object.keys(MIME);
const SAFE_NAME = /^[A-Za-z0-9_-]+\.(png|jpe?g|webp|svg)$/i;

export function isSafeLogoName(name: string): boolean {
  return SAFE_NAME.test(name);
}

function extOf(file: string): string {
  return path.extname(file).slice(1).toLowerCase();
}

/** Checks the file's real content (magic bytes) matches an allowed image type. */
export function detectImageType(buf: Buffer): keyof typeof MIME | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  // SVG: text document whose root element is <svg>. Rendered only through <img>,
  // which never executes embedded scripts, so this is safe to display.
  const head = buf.subarray(0, 4096).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

export type ImportResult = { ok: true; logoPath: string } | { ok: false; error: string };

/** Validates an image buffer and stores it in the logo library under a random name. */
export function storeLogoBuffer(logosDir: string, buf: Buffer): ImportResult {
  if (buf.length === 0) return { ok: false, error: 'The file is empty.' };
  if (buf.length > MAX_LOGO_BYTES) return { ok: false, error: 'The image is larger than 15 MB.' };
  // The real content decides the stored type, whatever the file extension claimed.
  const type = detectImageType(buf);
  if (!type) return { ok: false, error: 'Not a valid PNG, JPG, WebP or SVG image.' };
  const name = `${crypto.randomBytes(8).toString('hex')}.${type}`;
  fs.writeFileSync(path.join(logosDir, name), buf);
  return { ok: true, logoPath: name };
}

export function importLogoFile(logosDir: string, srcPath: string): ImportResult {
  try {
    const ext = extOf(srcPath);
    if (!LOGO_EXTENSIONS.includes(ext)) return { ok: false, error: 'Unsupported file type. Use PNG, JPG, WebP or SVG.' };
    const stat = fs.statSync(srcPath);
    if (!stat.isFile()) return { ok: false, error: 'Not a file.' };
    if (stat.size > MAX_LOGO_BYTES) return { ok: false, error: 'The image is larger than 15 MB.' };
    return storeLogoBuffer(logosDir, fs.readFileSync(srcPath));
  } catch (err) {
    return { ok: false, error: `Could not read the file: ${(err as Error).message}` };
  }
}

export function logoExists(logosDir: string, name: string): boolean {
  if (!isSafeLogoName(name)) return false;
  try {
    return fs.statSync(path.join(logosDir, name)).isFile();
  } catch {
    return false;
  }
}

export function readLogo(logosDir: string, name: string): { buf: Buffer; mime: string } | null {
  if (!isSafeLogoName(name)) return null;
  try {
    return { buf: fs.readFileSync(path.join(logosDir, name)), mime: MIME[extOf(name)] };
  } catch {
    return null;
  }
}

/** Deletes logo files no longer referenced by any sponsor. */
export function cleanupOrphans(logosDir: string, referenced: Set<string>): void {
  try {
    for (const f of fs.readdirSync(logosDir)) {
      if (isSafeLogoName(f) && !referenced.has(f)) fs.unlinkSync(path.join(logosDir, f));
    }
  } catch (err) {
    console.warn('[logos] cleanup failed', err);
  }
}

/** Must be called before app 'ready'. */
export function registerLogoScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: LOGO_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Serves ftlogo://logo/<file> from the local logo library. Call after app 'ready'. */
export function handleLogoProtocol(logosDir: string): void {
  protocol.handle(LOGO_PROTOCOL, (req) => {
    const url = new URL(req.url);
    const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const logo = readLogo(logosDir, name);
    if (!logo) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(logo.buf), {
      headers: { 'content-type': logo.mime, 'cache-control': 'max-age=31536000, immutable' },
    });
  });
}
