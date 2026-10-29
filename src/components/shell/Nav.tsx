"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";

export type NavItem = { href: string; label: string };

export function Nav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => path === href || path.startsWith(href + "/");
  return (
    <>
      <button
        type="button"
        className="btn-ghost md:hidden"
        aria-expanded={open}
        aria-controls="main-nav"
        onClick={() => setOpen((o) => !o)}
      >
        Menu
      </button>
      <nav
        id="main-nav"
        aria-label="Main"
        className={cx("md:block", open ? "block" : "hidden", "absolute left-0 right-0 top-14 z-20 border-b border-line bg-surface p-3 md:static md:border-0 md:bg-transparent md:p-0")}
      >
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cx(
                  "block rounded-md px-3 py-2 text-sm font-medium",
                  isActive(item.href) ? "bg-primary-soft text-primary" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
