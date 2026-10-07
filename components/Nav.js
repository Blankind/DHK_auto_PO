"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadCfg } from "@/lib/client";

const TABS = [
  { href: "/", label: "Purchase Order" },
  { href: "/receipt", label: "Purchase Receipt" },
  { href: "/stock", label: "Stock Entry" },
  { href: "/log", label: "Log" },
  { href: "/settings", label: "Pengaturan" },
];

export default function Nav() {
  const path = usePathname();
  const [user, setUser] = useState(null);
  useEffect(() => {
    const c = loadCfg();
    setUser(c.api_key ? c.user || "API aktif" : "");
  }, [path]);
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand"><span className="logo">D</span>Dehikas Purchasing</Link>
        <nav className="tabs" aria-label="Menu utama">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={path === t.href ? "active" : ""} aria-current={path === t.href ? "page" : undefined}>{t.label}</Link>
          ))}
        </nav>
        {user !== null && (
          user ? <span className="chip ok" title="Kredensial tersimpan di browser ini">{user}</span>
               : <Link href="/settings" className="chip warn">Belum terhubung</Link>
        )}
      </div>
    </header>
  );
}
