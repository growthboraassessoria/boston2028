import webVitals from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

const config = [
  ...webVitals,
  ...ts,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", ".data/**", "test-results/**", "playwright-report/**"] },
];

export default config;
