import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { MotionRoot } from "@/components/motion/MotionRoot";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-volt focus:px-4 focus:py-2 focus:text-night-950">
        Pular para o conteúdo
      </a>
      <SiteHeader />
      {/* Rolagem suave e animações (GSAP). O cabeçalho fica fora, por cima do quadro da rolagem suave. */}
      <MotionRoot smooth>
        <main id="conteudo">{children}</main>
        <SiteFooter />
      </MotionRoot>
    </>
  );
}
