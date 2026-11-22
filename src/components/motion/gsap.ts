"use client";

// GSAP do site público, do login e do cadastro. Registra os plugins uma vez (todos gratuitos desde a 3.13).
import gsap from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother, SplitText, DrawSVGPlugin, ScrambleTextPlugin);
gsap.defaults({ ease: "power3.out", duration: 0.9 });
ScrollTrigger.config({ ignoreMobileResize: true });

/** Navegador automatizado (testes): sem rolagem suave nem botão-ímã, para os cliques acharem o alvo parado. */
export const isAutomation = () => typeof navigator !== "undefined" && navigator.webdriver === true;

export { gsap, ScrollSmoother, ScrollTrigger, SplitText, useGSAP };
