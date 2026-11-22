// Só no modo local: entrega um arquivo privado se quem pede é o dono ou a equipe autorizada (conferido no banco, com RLS).
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { readLocalPrivate } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Não autorizado", { status: 401 });
  const path = (await params).path.join("/");
  const owner = path.split("/")[1] ?? "";
  // O dono sempre; a equipe só se o RLS deixar ver o documento (ou o perfil, para avatar).
  const allowed = owner === user.id || (await asUser(user, async (tx) => {
    const doc = await tx`select 1 from rtb.application_documents where storage_path = ${path}`;
    if (doc.length) return true;
    const av = await tx`select 1 from rtb.profiles where avatar_path = ${path}`;
    return av.length > 0;
  }));
  if (!allowed) return new NextResponse("Não encontrado", { status: 404 });
  const file = await readLocalPrivate(path);
  if (!file) return new NextResponse("Não encontrado", { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: { "Content-Type": file.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
