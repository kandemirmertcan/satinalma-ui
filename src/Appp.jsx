import React, { useEffect, useMemo, useState } from "react";

const UNIT_TYPES = ["Adet", "Kg", "Lt", "Paket", "Kutu", "Hizmet", "Çift"];

function toNumber(v) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
function money(n) {
  const x = toNumber(n);
  return x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function calcLine({ qty, unitPrice, discountRate, vatRate }) {
  const q = Math.max(0, toNumber(qty));
  const up = Math.max(0, toNumber(unitPrice));
  const disc = clamp(toNumber(discountRate), 0, 100);
  const vat = clamp(toNumber(vatRate), 0, 100);

  const unitNet = up * (1 - disc / 100);
  const unitVatIncl = unitNet * (1 + vat / 100);
  const totalNet = unitNet * q;
  const totalVatIncl = unitVatIncl * q;
  const vatAmount = totalVatIncl - totalNet;

  return { q, up, disc, vat, unitNet, unitVatIncl, totalNet, totalVatIncl, vatAmount };
}

function sortComparator(sortKey, sortDir, getValue) {
  return (a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    const da = typeof va === "string" ? va.toLowerCase() : va;
    const db = typeof vb === "string" ? vb.toLowerCase() : vb;

    let r = 0;
    if (da < db) r = -1;
    else if (da > db) r = 1;
    return sortDir === "asc" ? r : -r;
  };
}

function IconChevron({ dir }) {
  return (
    <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded bg-slate-200 text-[10px] text-slate-700">
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

// Bidirectional helpers
function deriveFromUnitNet(draft, nextUnitNet) {
  const unitNet = Math.max(0, toNumber(nextUnitNet));
  const up = Math.max(0, toNumber(draft.unitPrice));
  if (up > 0) {
    let disc = 100 * (1 - unitNet / up);
    if (disc < 0) {
      return { ...draft, unitPrice: unitNet, discountRate: 0 };
    }
    return { ...draft, discountRate: clamp(disc, 0, 100) };
  }
  return { ...draft, unitPrice: unitNet, discountRate: 0 };
}
function deriveFromUnitVatIncl(draft, nextUnitVatIncl) {
  const vat = clamp(toNumber(draft.vatRate), 0, 100);
  const uvi = Math.max(0, toNumber(nextUnitVatIncl));
  const denom = 1 + vat / 100;
  const unitNet = denom > 0 ? uvi / denom : uvi;
  return deriveFromUnitNet(draft, unitNet);
}

const SAMPLE = (() => {
  const invA = uid();
  const invB = uid();
  const invC = uid();

  const invoices = [
    { id: invA, invoiceNo: "A-2025-1205", date: "2025-12-05", supplierName: "Aras Endüstri A.Ş.", tevfikatRate: 0, discountTotal: 0 },
    { id: invB, invoiceNo: "B-2025-1212", date: "2025-12-12", supplierName: "Delta Tedarik Ltd.", tevfikatRate: 0, discountTotal: 250 },
    { id: invC, invoiceNo: "C-2025-1220", date: "2025-12-20", supplierName: "Ege Kimya Sanayi", tevfikatRate: 50, discountTotal: 0 },
  ];

  const lines = [
    { id: uid(), invoiceId: invA, invoiceItem: "A4 Fotokopi Kağıdı", qty: 20, unitType: "Paket", unitPrice: 165, discountRate: 5, vatRate: 20 },
    { id: uid(), invoiceId: invA, invoiceItem: "Toner (Siyah)", qty: 3, unitType: "Adet", unitPrice: 980, discountRate: 0, vatRate: 20 },
    { id: uid(), invoiceId: invA, invoiceItem: "Koli Bandı", qty: 12, unitType: "Adet", unitPrice: 42, discountRate: 10, vatRate: 20 },
    { id: uid(), invoiceId: invA, invoiceItem: "Zımba Teli", qty: 15, unitType: "Paket", unitPrice: 28, discountRate: 0, vatRate: 20 },

    { id: uid(), invoiceId: invB, invoiceItem: "Endüstriyel Eldiven", qty: 50, unitType: "Çift", unitPrice: 38, discountRate: 0, vatRate: 20 },
    { id: uid(), invoiceId: invB, invoiceItem: "Maske (FFP2)", qty: 200, unitType: "Adet", unitPrice: 7.5, discountRate: 0, vatRate: 20 },
    { id: uid(), invoiceId: invB, invoiceItem: "Koruyucu Gözlük", qty: 25, unitType: "Adet", unitPrice: 68, discountRate: 0, vatRate: 20 },

    { id: uid(), invoiceId: invC, invoiceItem: "Temizlik Kimyasalı", qty: 60, unitType: "Lt", unitPrice: 52, discountRate: 3, vatRate: 20 },
    { id: uid(), invoiceId: invC, invoiceItem: "Dezenfektan", qty: 40, unitType: "Lt", unitPrice: 64, discountRate: 0, vatRate: 20 },
    { id: uid(), invoiceId: invC, invoiceItem: "Köpük Sabun", qty: 30, unitType: "Lt", unitPrice: 48, discountRate: 5, vatRate: 20 },
  ];

  return { invoices, lines };
})();

function blankInvoiceLine() {
  return { _key: uid(), invoiceItem: "", qty: 1, unitType: UNIT_TYPES[0], unitPrice: 0, discountRate: 0, vatRate: 20 };
}

function Filter({ label, children }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium text-slate-700">{label}</div>
      {children}
    </label>
  );
}
function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-700">{label}</div>
        {hint ? <div className="text-[11px] text-slate-500">{hint}</div> : null}
      </div>
      {children}
    </label>
  );
}
function ReadOnly({ label, value }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="text-[11px] font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}
function Th({ children, sortKey, sort, onSort, align }) {
  const active = sort.key === sortKey;
  const cls = "px-3 py-3 font-medium select-none whitespace-nowrap " + (align === "right" ? "text-right" : "text-left");
  return (
    <th className={cls} style={{ cursor: "pointer" }} onClick={() => onSort(sortKey)} title="Sırala">
      <span className="inline-flex items-center">
        {children}
        {active && <IconChevron dir={sort.dir} />}
      </span>
    </th>
  );
}
function SimpleModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-slate-600">Basit düzenleme ekranı (UI prototip).</p>
          </div>
          <button className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50" onClick={onClose}>
            Kapat
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  const [invoices, setInvoices] = useState(() => SAMPLE.invoices);
  const [lines, setLines] = useState(() => SAMPLE.lines);

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("ALL");
  const [itemFilter, setItemFilter] = useState("ALL");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });

  const [hoveredInvoiceId, setHoveredInvoiceId] = useState(null);

  const [linePanelOpen, setLinePanelOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState(null);

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [activeInvoiceId, setActiveInvoiceId] = useState(null);
  const [activeInvoiceLineId, setActiveInvoiceLineId] = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState(null);
  const [invoiceLineDraftOverrides, setInvoiceLineDraftOverrides] = useState({});

  const [invoiceCreateOpen, setInvoiceCreateOpen] = useState(false);
  const [invoiceCreateDraft, setInvoiceCreateDraft] = useState(() => ({
    invoiceNo: "",
    date: new Date().toISOString().slice(0, 10),
    supplierName: "",
    tevfikatRate: 0,
    discountTotal: 0,
  }));
  const [invoiceCreateLines, setInvoiceCreateLines] = useState(() => Array.from({ length: 5 }).map(() => blankInvoiceLine()));

  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierModalOriginal, setSupplierModalOriginal] = useState("");
  const [supplierModalDraft, setSupplierModalDraft] = useState("");

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModalOriginal, setItemModalOriginal] = useState("");
  const [itemModalDraft, setItemModalDraft] = useState("");

  const emptyLineDraft = {
    invoiceId: invoices?.[0]?.id ?? "",
    invoiceItem: "",
    qty: 1,
    unitType: UNIT_TYPES[0],
    unitPrice: 0,
    discountRate: 0,
    vatRate: 20,
  };
  const [lineDraft, setLineDraft] = useState(emptyLineDraft);

  // ESC öncelik sırası ile kapama
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      if (supplierModalOpen) return setSupplierModalOpen(false);
      if (itemModalOpen) return setItemModalOpen(false);
      if (invoiceCreateOpen) return setInvoiceCreateOpen(false);
      if (invoiceModalOpen) return setInvoiceModalOpen(false);
      if (linePanelOpen) return setLinePanelOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [supplierModalOpen, itemModalOpen, invoiceCreateOpen, invoiceModalOpen, linePanelOpen]);

  const suppliers = useMemo(() => {
    const list = Array.from(new Set(invoices.map((x) => x.supplierName))).filter(Boolean);
    return list.sort((a, b) => a.localeCompare(b, "tr"));
  }, [invoices]);

  const items = useMemo(() => {
    const list = Array.from(new Set(lines.map((x) => x.invoiceItem))).filter(Boolean);
    return list.sort((a, b) => a.localeCompare(b, "tr"));
  }, [lines]);

  const joined = useMemo(() => {
    const invById = new Map(invoices.map((x) => [x.id, x]));
    return lines
      .map((ln) => {
        const inv = invById.get(ln.invoiceId);
        return {
          ...ln,
          date: inv?.date ?? "",
          supplierName: inv?.supplierName ?? "",
          invoiceNo: inv?.invoiceNo ?? "",
          tevfikatRate: inv?.tevfikatRate ?? 0,
          invoiceDiscountTotal: inv?.discountTotal ?? 0,
        };
      })
      .filter((x) => x.invoiceId);
  }, [invoices, lines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return joined.filter((r) => {
      if (supplierFilter !== "ALL" && r.supplierName !== supplierFilter) return false;
      if (itemFilter !== "ALL" && r.invoiceItem !== itemFilter) return false;
      if (!q) return true;
      const hay = [r.date, r.supplierName, r.invoiceItem, r.unitType, r.invoiceNo, String(r.qty)].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [joined, supplierFilter, itemFilter, search]);

  const sorted = useMemo(() => {
    const getVal = (r) => {
      const c = calcLine(r);
      switch (sort.key) {
        case "date": return r.date;
        case "supplierName": return r.supplierName;
        case "invoiceItem": return r.invoiceItem;
        case "qty": return c.q;
        case "unitType": return r.unitType;
        case "unitPrice": return c.up;
        case "discountRate": return c.disc;
        case "unitNet": return c.unitNet;
        case "vatRate": return c.vat;
        case "unitVatIncl": return c.unitVatIncl;
        case "totalNet": return c.totalNet;
        case "totalVatIncl": return c.totalVatIncl;
        default: return r.date;
      }
    };
    return [...filtered].sort(sortComparator(sort.key, sort.dir, getVal));
  }, [filtered, sort]);

  const totals = useMemo(() => {
    return sorted.reduce((acc, r) => {
      const c = calcLine(r);
      acc.totalNet += c.totalNet;
      acc.totalVatIncl += c.totalVatIncl;
      return acc;
    }, { totalNet: 0, totalVatIncl: 0 });
  }, [sorted]);

  function setSortKey(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  function openNewLine() {
    setEditingLineId("__new__");
    setLineDraft({ ...emptyLineDraft, invoiceId: invoices?.[0]?.id ?? "" });
    setLinePanelOpen(true);
  }
  function openEditLine(lineId) {
    const ln = lines.find((x) => x.id === lineId);
    if (!ln) return;
    setEditingLineId(lineId);
    setLineDraft({
      invoiceId: ln.invoiceId,
      invoiceItem: ln.invoiceItem,
      qty: ln.qty,
      unitType: ln.unitType,
      unitPrice: ln.unitPrice,
      discountRate: ln.discountRate,
      vatRate: ln.vatRate,
    });
    setLinePanelOpen(true);
  }
  function removeLine(lineId) {
    const ok = confirm("Bu fatura kalemini silmek istiyor musunuz?");
    if (!ok) return;
    setLines((prev) => prev.filter((x) => x.id !== lineId));
  }
  function saveLineFromPanel() {
    if (!lineDraft.invoiceId) return alert("Fatura seçiniz.");
    if (!lineDraft.invoiceItem.trim()) return alert("Fatura kalemi zorunludur.");

    const payload = {
      id: editingLineId === "__new__" ? uid() : editingLineId,
      invoiceId: lineDraft.invoiceId,
      invoiceItem: lineDraft.invoiceItem.trim(),
      qty: toNumber(lineDraft.qty),
      unitType: lineDraft.unitType,
      unitPrice: toNumber(lineDraft.unitPrice),
      discountRate: clamp(toNumber(lineDraft.discountRate), 0, 100),
      vatRate: clamp(toNumber(lineDraft.vatRate), 0, 100),
    };

    if (editingLineId === "__new__") setLines((prev) => [payload, ...prev]);
    else setLines((prev) => prev.map((x) => (x.id === payload.id ? payload : x)));

    setLinePanelOpen(false);
  }

  function openInvoice(invoiceId) {
    const inv = invoices.find((x) => x.id === invoiceId);
    if (!inv) return;

    setActiveInvoiceId(invoiceId);
    setInvoiceDraft({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      supplierName: inv.supplierName,
      tevfikatRate: inv.tevfikatRate ?? 0,
      discountTotal: inv.discountTotal ?? 0,
    });

    const firstLine = lines.find((x) => x.invoiceId === invoiceId);
    selectInvoiceLine(firstLine?.id ?? null);
    setInvoiceModalOpen(true);
  }

  const invoiceLines = useMemo(() => {
    if (!activeInvoiceId) return [];
    return lines.filter((x) => x.invoiceId === activeInvoiceId);
  }, [lines, activeInvoiceId]);

  const invoiceComputed = useMemo(() => {
    const sums = invoiceLines.reduce((acc, ln) => {
      const c = calcLine(ln);
      acc.totalNet += c.totalNet;
      acc.totalVatIncl += c.totalVatIncl;
      acc.vatAmount += c.vatAmount;
      acc.grossNet += Math.max(0, toNumber(ln.unitPrice)) * Math.max(0, toNumber(ln.qty));
      return acc;
    }, { grossNet: 0, totalNet: 0, totalVatIncl: 0, vatAmount: 0 });

    const discountComputed = Math.max(0, sums.grossNet - sums.totalNet);

    const tev = clamp(toNumber(invoiceDraft?.tevfikatRate ?? 0), 0, 100);
    const withheldVat = sums.vatAmount * (tev / 100);
    const payableVat = sums.vatAmount - withheldVat;

    return { ...sums, discountComputed, tev, withheldVat, payableVat };
  }, [invoiceLines, invoiceDraft]);

  function saveInvoiceHeader() {
    if (!invoiceDraft) return;
    if (!invoiceDraft.supplierName.trim()) return alert("Tedarikçi adı zorunludur.");

    setInvoices((prev) =>
      prev.map((x) =>
        x.id === invoiceDraft.id
          ? {
              ...x,
              invoiceNo: (invoiceDraft.invoiceNo ?? "").trim(),
              date: invoiceDraft.date,
              supplierName: invoiceDraft.supplierName.trim(),
              tevfikatRate: clamp(toNumber(invoiceDraft.tevfikatRate), 0, 100),
              discountTotal: Math.max(0, toNumber(invoiceDraft.discountTotal)),
            }
          : x
      )
    );
  }

  function distributeInvoiceDiscount(invoiceId, discountTotal) {
    const invLines = lines.filter((x) => x.invoiceId === invoiceId);
    if (invLines.length === 0) return alert("Faturada kalem yok.");

    const weights = invLines.map((ln) => Math.max(0, toNumber(ln.unitPrice)) * Math.max(0, toNumber(ln.qty)));
    const sumW = weights.reduce((a, b) => a + b, 0);
    if (sumW <= 0) return alert("Dağıtım için kalem tutarları 0'dan büyük olmalıdır.");

    let allocated = 0;
    const updated = invLines.map((ln, idx) => {
      const w = weights[idx];
      const share = idx === invLines.length - 1 ? discountTotal - allocated : (discountTotal * w) / sumW;
      allocated += share;

      const gross = w;
      const rate = gross > 0 ? (share / gross) * 100 : 0;
      return { ...ln, discountRate: clamp(rate, 0, 100) };
    });

    setLines((prev) => {
      const map = new Map(updated.map((u) => [u.id, u]));
      return prev.map((x) => (map.has(x.id) ? map.get(x.id) : x));
    });
  }

  const activeInvoiceLine = useMemo(() => {
    if (!activeInvoiceLineId) return null;
    return lines.find((x) => x.id === activeInvoiceLineId) ?? null;
  }, [lines, activeInvoiceLineId]);

  const invoiceLineDraft = useMemo(() => {
    if (!activeInvoiceLine) return null;
    const overrides = invoiceLineDraftOverrides[activeInvoiceLine.id] ?? {};
    return {
      id: activeInvoiceLine.id,
      invoiceId: activeInvoiceLine.invoiceId,
      invoiceItem: activeInvoiceLine.invoiceItem,
      qty: activeInvoiceLine.qty,
      unitType: activeInvoiceLine.unitType,
      unitPrice: activeInvoiceLine.unitPrice,
      discountRate: activeInvoiceLine.discountRate,
      vatRate: activeInvoiceLine.vatRate,
      ...overrides,
    };
  }, [activeInvoiceLine, invoiceLineDraftOverrides]);

  function selectInvoiceLine(lineId) {
    setActiveInvoiceLineId(lineId);
    setInvoiceLineDraftOverrides((prev) => {
      if (!lineId || !prev[lineId]) return prev;
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  }

  function updateInvoiceLineDraft(next) {
    setInvoiceLineDraftOverrides((prev) => {
      if (!activeInvoiceLineId || !invoiceLineDraft) return prev;
      const current = prev[activeInvoiceLineId] ?? {};
      const resolved = typeof next === "function" ? next(invoiceLineDraft) : { ...invoiceLineDraft, ...next };
      return { ...prev, [activeInvoiceLineId]: { ...current, ...resolved } };
    });
  }

  function saveInvoiceLineDraft() {
    if (!invoiceLineDraft) return;
    if (!invoiceLineDraft.invoiceItem.trim()) return alert("Fatura kalemi zorunludur.");

    const payload = {
      ...invoiceLineDraft,
      invoiceItem: invoiceLineDraft.invoiceItem.trim(),
      qty: toNumber(invoiceLineDraft.qty),
      unitPrice: toNumber(invoiceLineDraft.unitPrice),
      discountRate: clamp(toNumber(invoiceLineDraft.discountRate), 0, 100),
      vatRate: clamp(toNumber(invoiceLineDraft.vatRate), 0, 100),
    };

    setLines((prev) => prev.map((x) => (x.id === payload.id ? payload : x)));
    setInvoiceLineDraftOverrides((prev) => {
      const next = { ...prev };
      delete next[payload.id];
      return next;
    });
  }

  function openInvoiceCreate() {
    setInvoiceCreateDraft({
      invoiceNo: "",
      date: new Date().toISOString().slice(0, 10),
      supplierName: "",
      tevfikatRate: 0,
      discountTotal: 0,
    });
    setInvoiceCreateLines(Array.from({ length: 5 }).map(() => blankInvoiceLine()));
    setInvoiceCreateOpen(true);
  }

  function saveInvoiceCreate() {
    if (!invoiceCreateDraft.supplierName.trim()) return alert("Tedarikçi adı zorunludur.");

    const meaningfulLines = invoiceCreateLines
      .filter((l) => l.invoiceItem.trim())
      .map((l) => ({
        invoiceItem: l.invoiceItem.trim(),
        qty: toNumber(l.qty),
        unitType: l.unitType,
        unitPrice: toNumber(l.unitPrice),
        discountRate: clamp(toNumber(l.discountRate), 0, 100),
        vatRate: clamp(toNumber(l.vatRate), 0, 100),
      }));

    if (meaningfulLines.length === 0) return alert("En az 1 kalem girmelisiniz.");

    const invId = uid();
    const inv = {
      id: invId,
      invoiceNo: invoiceCreateDraft.invoiceNo?.trim() || `INV-${invId.slice(0, 6)}`,
      date: invoiceCreateDraft.date,
      supplierName: invoiceCreateDraft.supplierName.trim(),
      tevfikatRate: clamp(toNumber(invoiceCreateDraft.tevfikatRate), 0, 100),
      discountTotal: Math.max(0, toNumber(invoiceCreateDraft.discountTotal)),
    };

    setInvoices((prev) => [inv, ...prev]);
    const newLines = meaningfulLines.map((l) => ({ id: uid(), invoiceId: invId, ...l }));
    setLines((prev) => [...newLines, ...prev]);

    if (inv.discountTotal > 0) distributeInvoiceDiscount(invId, inv.discountTotal);

    setInvoiceCreateOpen(false);
  }

  function openSupplierModal(name) {
    setSupplierModalOriginal(name);
    setSupplierModalDraft(name);
    setSupplierModalOpen(true);
  }
  function saveSupplierModal() {
    const next = supplierModalDraft.trim();
    if (!next) return alert("Tedarikçi adı boş olamaz.");
    const prevName = supplierModalOriginal;
    setInvoices((prev) => prev.map((x) => (x.supplierName === prevName ? { ...x, supplierName: next } : x)));
    setSupplierModalOpen(false);
  }

  function openItemModal(name) {
    setItemModalOriginal(name);
    setItemModalDraft(name);
    setItemModalOpen(true);
  }
  function saveItemModal() {
    const next = itemModalDraft.trim();
    if (!next) return alert("Kalem adı boş olamaz.");
    const prevName = itemModalOriginal;
    setLines((prev) => prev.map((x) => (x.invoiceItem === prevName ? { ...x, invoiceItem: next } : x)));
    setItemModalOpen(false);
  }

  const lineDraftComputed = useMemo(() => calcLine(lineDraft), [lineDraft]);
  const invoiceLineDraftComputed = useMemo(() => calcLine(invoiceLineDraft ?? {}), [invoiceLineDraft]);

  return (
    <div className="min-h-screen bg-slate-50">
      <datalist id="supplierList">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="itemList">{items.map((s) => <option key={s} value={s} />)}</datalist>

      <div className="mx-auto max-w-[1650px] px-6 py-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Satınalım Listesi</h1>
            <p className="text-sm text-slate-600">Satıra tıkla → düzenleme paneli. Fatura butonu → full ekran fatura formu.</p>
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
            <input
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300 lg:w-[420px]"
              placeholder="Ara: tedarikçi, kalem, tarih, fatura no..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <button onClick={openNewLine} className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
              Satınalım Ekle
            </button>

            <button onClick={openInvoiceCreate} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50">
              Fatura Ekle
            </button>
          </div>
        </header>

        <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Filter label="Tedarikçi">
              <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
                <option value="ALL">Tümü</option>
                {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Filter>

            <Filter label="Fatura Kalemi">
              <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
                <option value="ALL">Tümü</option>
                {items.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Filter>

            <div className="flex items-end justify-between gap-2">
              <div className="text-xs text-slate-600">
                <div>Görünen satır: <span className="font-semibold text-slate-900">{sorted.length}</span></div>
                <div>
                  KDV Hariç Toplam: <span className="font-semibold text-slate-900">{money(totals.totalNet)}</span> ·
                  KDV Dahil Toplam: <span className="font-semibold text-slate-900">{money(totals.totalVatIncl)}</span>
                </div>
              </div>
              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
                onClick={() => { setSupplierFilter("ALL"); setItemFilter("ALL"); setSearch(""); }}>
                Filtreleri Sıfırla
              </button>
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-[1550px] w-full text-sm">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
                <tr>
                  <Th sortKey="date" sort={sort} onSort={setSortKey} align="left">Tarih</Th>
                  <Th sortKey="supplierName" sort={sort} onSort={setSortKey} align="left">Tedarikçi Adı</Th>
                  <Th sortKey="invoiceItem" sort={sort} onSort={setSortKey} align="left">Fatura Kalemi</Th>
                  <Th sortKey="qty" sort={sort} onSort={setSortKey} align="right">Adet</Th>
                  <Th sortKey="unitType" sort={sort} onSort={setSortKey} align="left">Birim Türü</Th>
                  <Th sortKey="unitPrice" sort={sort} onSort={setSortKey} align="right">Birim Fiyat</Th>
                  <Th sortKey="discountRate" sort={sort} onSort={setSortKey} align="right">İskonto %</Th>
                  <Th sortKey="unitNet" sort={sort} onSort={setSortKey} align="right">İskontolu Birim</Th>
                  <Th sortKey="vatRate" sort={sort} onSort={setSortKey} align="right">KDV %</Th>
                  <Th sortKey="unitVatIncl" sort={sort} onSort={setSortKey} align="right">KDV Dahil Birim</Th>
                  <Th sortKey="totalNet" sort={sort} onSort={setSortKey} align="right">KDV Hariç Toplam</Th>
                  <Th sortKey="totalVatIncl" sort={sort} onSort={setSortKey} align="right">KDV Dahil Toplam</Th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-500">Kayıt bulunamadı.</td></tr>
                ) : (
                  sorted.map((r) => {
                    const c = calcLine(r);
                    const groupActive = hoveredInvoiceId && r.invoiceId === hoveredInvoiceId;
                    const otherFaded = hoveredInvoiceId && r.invoiceId !== hoveredInvoiceId;

                    return (
                      <tr
                        key={r.id}
                        className={"border-t border-slate-200 " + (groupActive ? "bg-amber-100/70 border-l-4 border-amber-600" : "bg-white") + (otherFaded ? " opacity-60" : "") + " hover:bg-slate-50"}
                        onMouseEnter={() => setHoveredInvoiceId(r.invoiceId)}
                        onMouseLeave={() => setHoveredInvoiceId(null)}
                        onClick={(e) => {
                          const tag = e.target?.tagName?.toLowerCase();
                          if (tag === "button" || tag === "a" || tag === "input" || tag === "select") return;
                          openEditLine(r.id);
                        }}
                        style={{ cursor: "pointer" }}
                        title={`Fatura: ${r.invoiceNo}`}
                      >
                        <td className="px-3 py-3 whitespace-nowrap">{r.date}</td>

                        <td className="px-3 py-3">
                          <button className="text-left font-medium text-slate-900 hover:underline" onClick={(e) => { e.stopPropagation(); openSupplierModal(r.supplierName); }}>
                            {r.supplierName}
                          </button>
                          <div className="mt-0.5 text-[11px] text-slate-500">{r.invoiceNo}</div>
                        </td>

                        <td className="px-3 py-3">
                          <button className="text-left text-slate-900 hover:underline" onClick={(e) => { e.stopPropagation(); openItemModal(r.invoiceItem); }}>
                            {r.invoiceItem}
                          </button>
                        </td>

                        <td className="px-3 py-3 text-right tabular-nums">{money(c.q)}</td>
                        <td className="px-3 py-3">{r.unitType}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(c.up)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(c.disc)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(c.unitNet)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(c.vat)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(c.unitVatIncl)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(c.totalNet)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(c.totalVatIncl)}</td>

                        <td className="px-3 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50" onClick={(e) => { e.stopPropagation(); openInvoice(r.invoiceId); }}>
                              Fatura
                            </button>
                            <button className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50" onClick={(e) => { e.stopPropagation(); openEditLine(r.id); }}>
                              Düzenle
                            </button>
                            <button className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs font-medium text-rose-700 hover:bg-rose-50" onClick={(e) => { e.stopPropagation(); removeLine(r.id); }}>
                              Sil
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-4 text-xs text-slate-500">Not: Bu ekran UI prototipidir.</footer>
      </div>

      {/* Sağ Panel: Satınalım (Kalem) */}
      {linePanelOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) setLinePanelOpen(false); }} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-semibold">{editingLineId === "__new__" ? "Satınalım Ekle" : "Satınalım Düzenle"}</h2>
                <p className="text-xs text-slate-600">İskontolu Birim / KDV Dahil Birim elle girilebilir (çift taraflı).</p>
              </div>
              <button onClick={() => setLinePanelOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Kapat</button>
            </div>

            <div className="p-5 overflow-y-auto h-[calc(100%-92px)]">
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">Fatura</div>
                <div className="mt-3">
                  <Field label="Mevcut Fatura">
                    <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.invoiceId} onChange={(e) => setLineDraft((p) => ({ ...p, invoiceId: e.target.value }))}>
                      {invoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>{inv.date} · {inv.supplierName} · {inv.invoiceNo}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="mt-3 flex justify-end">
                  <button className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                    onClick={() => { if (lineDraft.invoiceId) openInvoice(lineDraft.invoiceId); }}>
                    Seçili Faturayı Aç
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Fatura Kalemi" hint="(autocomplete)">
                  <input list="itemList" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                    value={lineDraft.invoiceItem} onChange={(e) => setLineDraft((p) => ({ ...p, invoiceItem: e.target.value }))} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Adet">
                    <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.qty} onChange={(e) => setLineDraft((p) => ({ ...p, qty: e.target.value }))} />
                  </Field>
                  <Field label="Birim Türü">
                    <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.unitType} onChange={(e) => setLineDraft((p) => ({ ...p, unitType: e.target.value }))}>
                      {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Birim Fiyat">
                  <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                    value={lineDraft.unitPrice} onChange={(e) => setLineDraft((p) => ({ ...p, unitPrice: e.target.value }))} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="İskonto Oranı %">
                    <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.discountRate} onChange={(e) => setLineDraft((p) => ({ ...p, discountRate: e.target.value }))} />
                  </Field>
                  <Field label="KDV Oranı %">
                    <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.vatRate} onChange={(e) => setLineDraft((p) => ({ ...p, vatRate: e.target.value }))} />
                  </Field>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 md:col-span-2">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <Field label="İskontolu Birim (Elle)" hint="KDV hariç">
                      <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={money(lineDraftComputed.unitNet)} onChange={(e) => setLineDraft((p) => deriveFromUnitNet(p, e.target.value))} />
                    </Field>
                    <Field label="KDV Dahil Birim (Elle)">
                      <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={money(lineDraftComputed.unitVatIncl)} onChange={(e) => setLineDraft((p) => deriveFromUnitVatIncl(p, e.target.value))} />
                    </Field>
                    <ReadOnly label="KDV Hariç Toplam" value={money(lineDraftComputed.totalNet)} />
                    <ReadOnly label="KDV Dahil Toplam" value={money(lineDraftComputed.totalVatIncl)} />
                  </div>
                  <div className="mt-3 text-xs text-slate-600">
                    İskontolu Birim veya KDV Dahil Birim girince sistem iskonto% (gerekirse birim fiyat) hesaplar.
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-slate-500">Kaydetmeden kapatırsanız değişiklikler kaybolur.</div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-white p-5">
              <button onClick={() => setLinePanelOpen(false)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">Vazgeç</button>
              <button onClick={saveLineFromPanel} className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-slate-800">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Fatura Formu - FULL SCREEN */}
      {invoiceModalOpen && invoiceDraft && (
        <div className="fixed inset-0 z-50 bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setInvoiceModalOpen(false); }}>
          <div className="absolute inset-0 bg-white flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Fatura Formu</h2>
                  <p className="text-xs text-slate-600">Üst: mali döküm. Alt: kalemler ve sağda kalem düzenleme.</p>
                </div>
                <button className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50" onClick={() => setInvoiceModalOpen(false)}>Kapat</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="lg:col-span-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">Fatura Bilgileri</div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <Field label="Tarih">
                      <input type="date" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.date} onChange={(e) => setInvoiceDraft((p) => ({ ...p, date: e.target.value }))} onBlur={saveInvoiceHeader} />
                    </Field>
                    <Field label="Tedarikçi Adı" hint="(autocomplete)">
                      <input list="supplierList" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.supplierName} onChange={(e) => setInvoiceDraft((p) => ({ ...p, supplierName: e.target.value }))} onBlur={saveInvoiceHeader} />
                    </Field>
                    <Field label="Fatura No">
                      <input className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.invoiceNo} onChange={(e) => setInvoiceDraft((p) => ({ ...p, invoiceNo: e.target.value }))} onBlur={saveInvoiceHeader} />
                    </Field>
                  </div>
                </div>

                <div className="lg:col-span-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Fatura Mali Döküm</div>
                    <button className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      onClick={() => {
                        saveInvoiceHeader();
                        const t = Math.max(0, toNumber(invoiceDraft.discountTotal));
                        if (t <= 0) return alert("Toplam iskonto 0'dan büyük olmalıdır.");
                        distributeInvoiceDiscount(invoiceDraft.id, t);
                      }}>
                      İskontoyu Kalemlere Dağıt
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Tevkifat %">
                      <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.tevfikatRate} onChange={(e) => setInvoiceDraft((p) => ({ ...p, tevfikatRate: e.target.value }))} onBlur={saveInvoiceHeader} />
                    </Field>
                    <Field label="Toplam İskonto (₺)" hint="(opsiyonel)">
                      <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.discountTotal} onChange={(e) => setInvoiceDraft((p) => ({ ...p, discountTotal: e.target.value }))} onBlur={saveInvoiceHeader} />
                    </Field>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <ReadOnly label="Kalemler Brüt Toplam (KDV Hariç)" value={money(invoiceComputed.grossNet)} />
                    <ReadOnly label="Hesaplanan Toplam İskonto" value={money(invoiceComputed.discountComputed)} />
                    <ReadOnly label="KDV Hariç Net Toplam" value={money(invoiceComputed.totalNet)} />
                    <ReadOnly label="Toplam KDV" value={money(invoiceComputed.vatAmount)} />
                    <ReadOnly label="Toplam Tevkifat (KDV)" value={money(invoiceComputed.withheldVat)} />
                    <ReadOnly label="Ödenecek KDV" value={money(invoiceComputed.payableVat)} />
                  </div>

                  <div className="mt-3"><ReadOnly label="KDV Dahil Genel Toplam" value={money(invoiceComputed.totalVatIncl)} /></div>
                  <div className="mt-3 text-xs text-slate-600">Not: Tevkifat hesabı prototipte KDV üzerinden gösterim amaçlıdır.</div>
                </div>

                <div className="lg:col-span-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Kalem Düzenleme</div>
                    <button className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                      onClick={saveInvoiceLineDraft} disabled={!invoiceLineDraft}>
                      Kalemi Kaydet
                    </button>
                  </div>

                  {!invoiceLineDraft ? (
                    <div className="mt-6 text-sm text-slate-600">Kalem seçiniz.</div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <Field label="Fatura Kalemi" hint="(autocomplete)">
                        <input list="itemList" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                          value={invoiceLineDraft.invoiceItem} onChange={(e) => updateInvoiceLineDraft({ invoiceItem: e.target.value })} />
                      </Field>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Adet">
                          <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invoiceLineDraft.qty} onChange={(e) => updateInvoiceLineDraft({ qty: e.target.value })} />
                        </Field>
                        <Field label="Birim Türü">
                          <select className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invoiceLineDraft.unitType} onChange={(e) => updateInvoiceLineDraft({ unitType: e.target.value })}>
                            {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </Field>
                      </div>

                      <Field label="Birim Fiyat">
                        <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                          value={invoiceLineDraft.unitPrice} onChange={(e) => updateInvoiceLineDraft({ unitPrice: e.target.value })} />
                      </Field>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="İskonto Oranı %">
                          <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invoiceLineDraft.discountRate} onChange={(e) => updateInvoiceLineDraft({ discountRate: e.target.value })} />
                        </Field>
                        <Field label="KDV Oranı %">
                          <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invoiceLineDraft.vatRate} onChange={(e) => updateInvoiceLineDraft({ vatRate: e.target.value })} />
                        </Field>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="İskontolu Birim (Elle)" hint="KDV hariç">
                          <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={money(invoiceLineDraftComputed.unitNet)} onChange={(e) => updateInvoiceLineDraft((p) => deriveFromUnitNet(p, e.target.value))} />
                        </Field>
                        <Field label="KDV Dahil Birim (Elle)">
                          <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={money(invoiceLineDraftComputed.unitVatIncl)} onChange={(e) => updateInvoiceLineDraft((p) => deriveFromUnitVatIncl(p, e.target.value))} />
                        </Field>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <ReadOnly label="KDV Hariç Toplam" value={money(invoiceLineDraftComputed.totalNet)} />
                          <ReadOnly label="KDV Dahil Toplam" value={money(invoiceLineDraftComputed.totalVatIncl)} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-12 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Fatura Kalemleri</div>
                    <div className="text-xs text-slate-600">Kaleme tıklayınca sağ üstteki düzenleme alanı değişir.</div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
                    <table className="min-w-[1250px] w-full text-sm">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-3 text-left font-medium">Fatura Kalemi</th>
                          <th className="px-3 py-3 text-right font-medium">Adet</th>
                          <th className="px-3 py-3 text-left font-medium">Birim</th>
                          <th className="px-3 py-3 text-right font-medium">Birim Fiyat</th>
                          <th className="px-3 py-3 text-right font-medium">İskonto %</th>
                          <th className="px-3 py-3 text-right font-medium">İskontolu Birim</th>
                          <th className="px-3 py-3 text-right font-medium">KDV %</th>
                          <th className="px-3 py-3 text-right font-medium">KDV Hariç</th>
                          <th className="px-3 py-3 text-right font-medium">KDV Dahil</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceLines.length === 0 ? (
                          <tr><td colSpan={9} className="px-3 py-10 text-center text-slate-500">Bu faturada kalem yok.</td></tr>
                        ) : (
                          invoiceLines.map((ln) => {
                            const c = calcLine(ln);
                            const active = ln.id === activeInvoiceLineId;
                            return (
                              <tr key={ln.id}
                                className={"border-t border-slate-200 " + (active ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50")}
                                style={{ cursor: "pointer" }}
                                onClick={() => selectInvoiceLine(ln.id)}>
                                <td className="px-3 py-3">{ln.invoiceItem}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(c.q)}</td>
                                <td className="px-3 py-3">{ln.unitType}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(c.up)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(c.disc)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(c.unitNet)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(c.vat)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(c.totalNet)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{money(c.totalVatIncl)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 text-xs text-slate-500">Kaydetmeden kapatırsanız değişiklikler kaybolur.</div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-6 py-4 flex justify-end gap-2">
              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
                onClick={() => { saveInvoiceHeader(); setInvoiceModalOpen(false); }}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fatura Ekle Modal */}
      {invoiceCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setInvoiceCreateOpen(false); }}>
          <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-semibold">Fatura Ekle</h2>
                <p className="text-xs text-slate-600">Tek seferde çok kalemli fatura girişi. Varsayılan 5 satır açılır.</p>
              </div>
              <button className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50" onClick={() => setInvoiceCreateOpen(false)}>Kapat</button>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 lg:col-span-1">
                <div className="text-sm font-semibold text-slate-900">Fatura Bilgileri</div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <Field label="Tarih">
                    <input type="date" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={invoiceCreateDraft.date} onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, date: e.target.value }))} />
                  </Field>
                  <Field label="Tedarikçi Adı" hint="(autocomplete)">
                    <input list="supplierList" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={invoiceCreateDraft.supplierName} onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, supplierName: e.target.value }))} />
                  </Field>
                  <Field label="Fatura No (opsiyonel)">
                    <input className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={invoiceCreateDraft.invoiceNo} onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, invoiceNo: e.target.value }))} />
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Tevkifat %">
                      <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceCreateDraft.tevfikatRate} onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, tevfikatRate: e.target.value }))} />
                    </Field>
                    <Field label="Toplam İskonto (₺)">
                      <input inputMode="decimal" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceCreateDraft.discountTotal} onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, discountTotal: e.target.value }))} />
                    </Field>
                  </div>

                  <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                    onClick={() => setInvoiceCreateLines((prev) => [...prev, blankInvoiceLine()])}>
                    Satır Ekle
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 lg:col-span-2">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Fatura Kalemleri</div>
                  <div className="text-xs text-slate-600">İskontolu/KDV dahil birim alanları da elle girilebilir.</div>
                </div>

                <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
                  <table className="min-w-[1350px] w-full text-sm">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-3 text-left font-medium">Fatura Kalemi</th>
                        <th className="px-3 py-3 text-right font-medium">Adet</th>
                        <th className="px-3 py-3 text-left font-medium">Birim</th>
                        <th className="px-3 py-3 text-right font-medium">Birim Fiyat</th>
                        <th className="px-3 py-3 text-right font-medium">İskonto %</th>
                        <th className="px-3 py-3 text-right font-medium">İskontolu Birim (Elle)</th>
                        <th className="px-3 py-3 text-right font-medium">KDV %</th>
                        <th className="px-3 py-3 text-right font-medium">KDV Dahil Birim (Elle)</th>
                        <th className="px-3 py-3 text-right font-medium">KDV Hariç</th>
                        <th className="px-3 py-3 text-right font-medium">KDV Dahil</th>
                        <th className="px-3 py-3 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceCreateLines.map((ln, idx) => {
                        const c = calcLine(ln);
                        return (
                          <tr key={ln._key} className="border-t border-slate-200">
                            <td className="px-3 py-2">
                              <input list="itemList" className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                                value={ln.invoiceItem} onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, invoiceItem: e.target.value } : x)))} placeholder={`Kalem ${idx + 1}`} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input inputMode="decimal" className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                value={ln.qty} onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, qty: e.target.value } : x)))} />
                            </td>
                            <td className="px-3 py-2">
                              <select className="h-9 w-32 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                                value={ln.unitType} onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, unitType: e.target.value } : x)))}>
                                {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input inputMode="decimal" className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                value={ln.unitPrice} onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, unitPrice: e.target.value } : x)))} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input inputMode="decimal" className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                value={ln.discountRate} onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, discountRate: e.target.value } : x)))} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input inputMode="decimal" className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                value={money(c.unitNet)} onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? deriveFromUnitNet(x, e.target.value) : x)))} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input inputMode="decimal" className="h-9 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                value={ln.vatRate} onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, vatRate: e.target.value } : x)))} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input inputMode="decimal" className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                value={money(c.unitVatIncl)} onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? deriveFromUnitVatIncl(x, e.target.value) : x)))} />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(c.totalNet)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(c.totalVatIncl)}</td>
                            <td className="px-3 py-2 text-right">
                              <button className="h-9 rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                onClick={() => setInvoiceCreateLines((prev) => prev.filter((x) => x._key !== ln._key))}>
                                Sil
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 text-xs text-slate-500">Kalem adı boş olan satırlar kaydedilmez.</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-5">
              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50" onClick={() => setInvoiceCreateOpen(false)}>
                Vazgeç
              </button>
              <button className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-slate-800" onClick={saveInvoiceCreate}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {supplierModalOpen && (
        <SimpleModal title="Tedarikçi Formu" onClose={() => setSupplierModalOpen(false)}>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Tedarikçi Adı">
              <input className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={supplierModalDraft} onChange={(e) => setSupplierModalDraft(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50" onClick={() => setSupplierModalOpen(false)}>Kapat</button>
              <button className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800" onClick={saveSupplierModal}>Kaydet</button>
            </div>
          </div>
        </SimpleModal>
      )}

      {itemModalOpen && (
        <SimpleModal title="Kalem Formu" onClose={() => setItemModalOpen(false)}>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Kalem Adı">
              <input className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={itemModalDraft} onChange={(e) => setItemModalDraft(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50" onClick={() => setItemModalOpen(false)}>Kapat</button>
              <button className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800" onClick={saveItemModal}>Kaydet</button>
            </div>
          </div>
        </SimpleModal>
      )}
    </div>
  );
}
