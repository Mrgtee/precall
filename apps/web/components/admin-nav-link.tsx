"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

export function AdminNavLink() {
  const { address, isConnected } = useAccount();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isConnected || !address) {
        setVisible(false);
        return;
      }
      const response = await fetch(`/api/admin/status?address=${encodeURIComponent(address)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({ isAdmin: false }))) as { isAdmin?: boolean };
      if (!cancelled) setVisible(Boolean(response.ok && payload.isAdmin));
    }
    check().catch(() => {
      if (!cancelled) setVisible(false);
    });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  if (!visible) return null;
  return <Link href="/admin"><Activity size={18} /> Admin</Link>;
}
