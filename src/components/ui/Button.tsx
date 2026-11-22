import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

type Variant = "volt" | "outline" | "ghost" | "ink" | "danger";
type Size = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-[transform,background-color,color,border-color,opacity] duration-200 ease-[var(--ease-out-quart)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none";

const variants: Record<Variant, string> = {
  volt: "bg-volt text-night-950 hover:bg-[#d8ff3d]",
  outline: "border border-mist-200/30 text-mist-50 hover:border-volt hover:text-volt",
  ghost: "text-mist-100 hover:bg-white/5",
  ink: "bg-ink text-paper hover:bg-night-800",
  danger: "bg-danger text-white hover:bg-[#d23c41]",
};

const sizes: Record<Size, string> = {
  sm: "min-h-11 px-3.5 text-sm",
  md: "min-h-12 px-5 text-[0.95rem]",
  lg: "min-h-14 px-7 text-base",
};

export function buttonClass(variant: Variant = "volt", size: Size = "md", className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

export function Button({ variant = "volt", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href, variant = "volt", size = "md", className, children, ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
