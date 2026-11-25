import { getPassport } from "@/lib/data/passport";
import { buildBook } from "@/lib/data/book";
import { avatarUrlFor } from "@/lib/storage";
import { PassportBook } from "@/components/passport/book/PassportBook";

export default async function PassportHome({ searchParams }: { searchParams: Promise<{ bemvindo?: string }> }) {
  const [d, sp] = await Promise.all([getPassport(), searchParams]);
  const book = await buildBook(d, await avatarUrlFor(d.user, d.profile.avatarPath));
  return (
    <div>
      {sp.bemvindo && (
        <p role="status" className="mx-auto mb-4 max-w-md rounded-md border border-volt/30 bg-volt/10 px-4 py-2 text-center text-sm text-mist-50">
          Passaporte emitido. Abra para conhecer as páginas.
        </p>
      )}
      <PassportBook data={book} />
    </div>
  );
}
