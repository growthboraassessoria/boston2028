// Só no modo local: serve mídia pública aprovada (logos e imagens de benefícios). Em produção é o bucket público do Supabase.
import { NextResponse, type NextRequest } from "next/server";
import { readLocalPublic } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const file = await readLocalPublic((await params).path.join("/"));
  if (!file) return new NextResponse("Não encontrado", { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: { "Content-Type": file.mime, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
