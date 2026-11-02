"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { EyeMark, PersonIcon } from "./icons";
import { Water } from "./Water";

const TABS = [
  { href: "/", label: "Discover" },
  { href: "/try-on", label: "Try on" },
  { href: "/creators", label: "Creators" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="app">
      <Water />
      <header className="top">
        <Link href="/" className="mark" aria-label="Mirette home">
          <EyeMark />
          <span>Mirette</span>
        </Link>
        <Link href="/me" className="me" aria-label="Me" aria-current={path === "/me" ? "page" : undefined}>
          <PersonIcon />
        </Link>
      </header>
      <main>{children}</main>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="tab" aria-current={path === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
