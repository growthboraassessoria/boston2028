import { BoraShield } from "@/components/brand/Bora";

export const metadata = { title: "Sem conexão" };

export default function Offline() {
  return (
    <main className="grid min-h-dvh place-items-center bg-night-900 p-6 text-center">
      <div className="max-w-sm">
        <BoraShield className="mx-auto h-14 w-auto text-volt" />
        <h1 className="display mt-6 text-4xl text-mist-50">Sem conexão</h1>
        <p className="mt-3 leading-relaxed text-mist-200">Seu passaporte guarda os dados com segurança no servidor e não fica salvo neste aparelho. Assim que a internet voltar, é só tentar de novo.</p>
        <a href="/passport" className="mt-6 inline-flex min-h-12 items-center rounded-md bg-volt px-6 font-semibold text-night-950">Tentar de novo</a>
      </div>
    </main>
  );
}
