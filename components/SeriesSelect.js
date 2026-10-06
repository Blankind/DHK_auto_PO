"use client";
import { useEffect, useState } from "react";
import { call } from "@/lib/client";

// Pilihan Naming Series diambil dari ERPNext; pilihan terakhir diingat per doctype.
export default function SeriesSelect({ id, doctype, value, onChange }) {
  const [opts, setOpts] = useState(null);
  useEffect(() => {
    let on = true;
    call("naming_series", { doctype })
      .then((r) => {
        if (!on) return;
        const list = r.options || [];
        setOpts(list);
        let saved = "";
        try { saved = localStorage.getItem(`dhk_series_${doctype}`) || ""; } catch {}
        onChange(list.includes(saved) ? saved : r.default || "");
      })
      .catch(() => on && setOpts([]));
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype]);

  const pick = (v) => {
    onChange(v);
    try { localStorage.setItem(`dhk_series_${doctype}`, v); } catch {}
  };

  if (opts === null) return <select id={id} disabled><option>Memuat…</option></select>;
  if (!opts.length) return <select id={id} disabled><option>Default ERPNext</option></select>;
  return (
    <select id={id} value={value} onChange={(e) => pick(e.target.value)}>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
