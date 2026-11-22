// Arquivos privados (comprovantes, avatar). O tipo real é conferido pelos primeiros bytes, não pela extensão.
// supabase: bucket rtb-private (URL assinada de 10 min). local: pasta .data/storage, servida por rota com checagem.
import "server-only";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/auth/session";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
type Mime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
const EXT: Record<Mime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export function sniffMime(bytes: Uint8Array): Mime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

function driver(): "supabase" | "local" {
  if (process.env.STORAGE_DRIVER === "local") {
    if (process.env.VERCEL) throw new Error("STORAGE_DRIVER=local é proibido na Vercel.");
    return "local";
  }
  return "supabase";
}

export type UploadResult = { ok: true; path: string; mime: Mime; size: number } | { ok: false; error: string };

export async function uploadPrivate(user: SessionUser, folder: "docs" | "avatar", file: File, allowed: Mime[]): Promise<UploadResult> {
  const max = folder === "avatar" ? MAX_AVATAR_BYTES : MAX_UPLOAD_BYTES;
  if (file.size <= 0) return { ok: false, error: "Arquivo vazio." };
  if (file.size > max) return { ok: false, error: `Arquivo maior que ${Math.round(max / 1024 / 1024)} MB.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || !allowed.includes(mime)) return { ok: false, error: "Formato não aceito. Use JPG, PNG, WEBP ou PDF." };
  const path = `users/${user.id}/${folder}/${randomUUID()}.${EXT[mime]}`;
  if (driver() === "local") {
    const { mkdir, writeFile } = await import(/* turbopackIgnore: true */ "node:fs/promises");
    const base = `${process.cwd()}/.data/storage/rtb-private/`;
    const full = base + path;
    await mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    await writeFile(full, bytes);
  } else {
    const { createSupabaseAdmin } = await import("@/lib/supabase/server");
    const { error } = await createSupabaseAdmin().storage.from("rtb-private").upload(path, bytes, { contentType: mime, upsert: false });
    if (error) return { ok: false, error: "Falha ao enviar o arquivo. Tente de novo." };
  }
  return { ok: true, path, mime, size: file.size };
}

/** URL temporária para um arquivo do próprio usuário (ou da equipe autorizada, conferida por quem chama). */
export async function signedUrl(path: string): Promise<string | null> {
  if (!/^users\/[0-9a-f-]{36}\/(docs|avatar)\/[A-Za-z0-9._-]+$/.test(path)) return null;
  if (driver() === "local") return `/api/arquivos/${path}`;
  const { createSupabaseAdmin } = await import("@/lib/supabase/server");
  const { data } = await createSupabaseAdmin().storage.from("rtb-private").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export async function avatarUrlFor(user: SessionUser, path: string | null): Promise<string | null> {
  if (!path || !path.startsWith(`users/${user.id}/avatar/`)) return null;
  return signedUrl(path);
}

export async function readLocalPrivate(path: string): Promise<{ bytes: Uint8Array; mime: Mime } | null> {
  if (driver() !== "local") return null;
  if (!/^users\/[0-9a-f-]{36}\/(docs|avatar)\/[A-Za-z0-9._-]+$/.test(path)) return null;
  const { readFile } = await import(/* turbopackIgnore: true */ "node:fs/promises");
  try {
    const bytes = new Uint8Array(await readFile(`${process.cwd()}/.data/storage/rtb-private/${path}`));
    const mime = sniffMime(bytes);
    return mime ? { bytes, mime } : null;
  } catch {
    return null;
  }
}

// ── Mídia pública aprovada (logos autorizados, imagens de benefício). Só imagens (sem SVG: evita script embutido). ──
export const MAX_PUBLIC_BYTES = 5 * 1024 * 1024;
const PUBLIC_PATH = /^(partners|benefits|media)\/[A-Za-z0-9._-]+$/;

export async function uploadPublic(folder: "partners" | "benefits" | "media", file: File): Promise<UploadResult> {
  if (file.size <= 0) return { ok: false, error: "Arquivo vazio." };
  if (file.size > MAX_PUBLIC_BYTES) return { ok: false, error: "Imagem maior que 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || mime === "application/pdf") return { ok: false, error: "Use JPG, PNG ou WEBP." };
  const path = `${folder}/${randomUUID()}.${EXT[mime]}`;
  if (driver() === "local") {
    const { mkdir, writeFile } = await import(/* turbopackIgnore: true */ "node:fs/promises");
    const full = `${process.cwd()}/.data/storage/rtb-public/${path}`;
    await mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    await writeFile(full, bytes);
  } else {
    const { createSupabaseAdmin } = await import("@/lib/supabase/server");
    const { error } = await createSupabaseAdmin().storage.from("rtb-public").upload(path, bytes, { contentType: mime, upsert: false });
    if (error) return { ok: false, error: "Falha ao enviar a imagem." };
  }
  return { ok: true, path, mime, size: file.size };
}

export function publicUrl(path: string | null | undefined): string | null {
  if (!path || !PUBLIC_PATH.test(path)) return null;
  if (driver() === "local") return `/api/publico/${path}`;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rtb-public/${path}`;
}

export async function readLocalPublic(path: string): Promise<{ bytes: Uint8Array; mime: Mime } | null> {
  if (driver() !== "local" || !PUBLIC_PATH.test(path)) return null;
  const { readFile } = await import(/* turbopackIgnore: true */ "node:fs/promises");
  try {
    const bytes = new Uint8Array(await readFile(`${process.cwd()}/.data/storage/rtb-public/${path}`));
    const mime = sniffMime(bytes);
    return mime && mime !== "application/pdf" ? { bytes, mime } : null;
  } catch {
    return null;
  }
}

/** Comprovante de autorização de marca do parceiro (bucket privado, pasta partners/). */
export async function uploadPartnerDocument(partnerId: string, file: File): Promise<UploadResult> {
  if (!/^[0-9a-f-]{36}$/.test(partnerId)) return { ok: false, error: "Parceiro inválido." };
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "Arquivo vazio ou maior que 10 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return { ok: false, error: "Use PDF, JPG, PNG ou WEBP." };
  const path = `partners/${partnerId}/${randomUUID()}.${EXT[mime]}`;
  if (driver() === "local") {
    const { mkdir, writeFile } = await import(/* turbopackIgnore: true */ "node:fs/promises");
    const full = `${process.cwd()}/.data/storage/rtb-private/${path}`;
    await mkdir(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    await writeFile(full, bytes);
  } else {
    const { createSupabaseAdmin } = await import("@/lib/supabase/server");
    const { error } = await createSupabaseAdmin().storage.from("rtb-private").upload(path, bytes, { contentType: mime, upsert: false });
    if (error) return { ok: false, error: "Falha ao enviar o documento." };
  }
  return { ok: true, path, mime, size: file.size };
}

/** Apaga um arquivo privado do próprio usuário (troca/remoção de foto, LGPD). Nunca lança: falha só é registrada. */
export async function removePrivate(userId: string, path: string | null | undefined): Promise<void> {
  if (!path || !path.startsWith(`users/${userId}/`) || !/^users\/[0-9a-f-]{36}\/(docs|avatar)\/[A-Za-z0-9._-]+$/.test(path)) return;
  try {
    if (driver() === "local") {
      const { unlink } = await import(/* turbopackIgnore: true */ "node:fs/promises");
      await unlink(`${process.cwd()}/.data/storage/rtb-private/${path}`).catch(() => undefined);
    } else {
      const { createSupabaseAdmin } = await import("@/lib/supabase/server");
      await createSupabaseAdmin().storage.from("rtb-private").remove([path]);
    }
  } catch (e) {
    console.error("[storage] remover:", (e as Error).message);
  }
}
