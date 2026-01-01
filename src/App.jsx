import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Satınalma SaaS — UI Prototip
 * - Üst sekmeler: Satınalımlar, Siparişler, Tedarikçiler, Tedarik Ürünleri, Raporlar
 * - Satınalım ekleme: "Satınalım Ekle" full-screen (yeni fatura + kalemler)
 * - Satınalım düzenleme: satıra tıkla → sağ panel
 * - Fatura ekranı: full-screen
 * - Sayısal giriş: kullanıcının yazdığını anlık formatlamaz (binlik ayırıcı eklemez),
 *   virgül/nokta ondalık olarak kabul edilir.
 */

const TABS = [
  { key: "purchases", label: "Satınalımlar" },
  { key: "orders", label: "Siparişler" },
  { key: "suppliers", label: "Tedarikçiler" },
  { key: "products", label: "Tedarik Ürünleri" },
  { key: "reports", label: "Raporlar" },
];

const UNIT_TYPES = ["Adet", "Kg", "Lt", "Paket", "Kutu", "Hizmet", "Çift"];

/** 3,56 ve 3.56 -> 3.56 (son ayırıcı ondalık varsayılır; tek ayırıcı + 3 hane ise binlik olma olasılığı için heuristik) */
function parseSmartNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s0 = String(v ?? "").trim();
  if (!s0) return 0;

  // keep digits, separators, sign
  let s = s0.replace(/\s+/g, "");
  let sign = "";
  if (s.startsWith("-")) {
    sign = "-";
    s = s.slice(1);
  }

  // allow only digits and separators
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return 0;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const hasDot = lastDot >= 0;
  const hasComma = lastComma >= 0;

  let decSep = null;
  if (hasDot && hasComma) {
    decSep = lastDot > lastComma ? "." : ",";
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const parts = s.split(sep);

    // if exactly one separator and exactly 3 digits after it, likely thousands (e.g., 3.856 => 3856)
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0 && parts[0].length <= 3) {
      decSep = null; // treat as thousands
    } else {
      decSep = sep;
    }
  }

  let intPart = s;
  let fracPart = "";
  if (decSep) {
    const idx = s.lastIndexOf(decSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }

  // remove any leftover separators in both parts (thousands, etc.)
  intPart = intPart.replace(/[.,]/g, "");
  fracPart = fracPart.replace(/[.,]/g, "");

  const normalized = sign + (intPart || "0") + (fracPart ? "." + fracPart : "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toNumber(v) {
  return parseSmartNumber(v);
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Görsel raporlama / tablo için (TR locale, binlik ayırıcı dahil) */
function money(n) {
  const x = toNumber(n);
  return x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(rows, headers) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [];
  lines.push(headers.map((h) => esc(h.label)).join(","));
  for (const r of rows) lines.push(headers.map((h) => esc(r[h.key])).join(","));
  return "\n" + lines.join("\n");
}

async function exportToXlsx({ filename, sheetName, rows, headers }) {
  // XLSX (SheetJS) yoksa CSV fallback
  try {
    const XLSX = await import("xlsx");
    const data = rows.map((r) => {
      const o = {};
      for (const h of headers) o[h.label] = r[h.key];
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || "Veri");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(
      filename,
      new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    );
  } catch (e) {
    const csv = toCsv(rows, headers);
    downloadBlob(filename.replace(/\.xlsx$/i, ".csv"), new Blob([csv], { type: "text/csv;charset=utf-8" }));
    alert("XLSX kütüphanesi bulunamadı. CSV indirildi. XLSX için: npm i xlsx");
  }
}

function normHeader(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");
}


/** Input içinde "binlik ayırıcı eklemeden" gösterim (kırpılmış ondalık) */
function formatForInput(n, maxDecimals = 6) {
  const x = toNumber(n);
  if (!Number.isFinite(x)) return "";
  const fixed = x.toFixed(maxDecimals);
  // trim trailing zeros
  let t = fixed.replace(/\.?0+$/, "");
  // TR alışkanlığı için '.' -> ','
  t = t.replace(".", ",");
  return t;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function calcLine({ qty, unitPrice, discountRate, vatRate }) {
  const q = Math.max(0, toNumber(qty));
  const up = Math.max(0, toNumber(unitPrice));
  const disc = clamp(toNumber(discountRate), 0, 100);
  const vat = clamp(toNumber(vatRate), 0, 100);

  const unitNet = up * (1 - disc / 100); // İskontolu birim (KDV hariç)
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

/**
 * Çift yönlü hesaplama yardımcıları:
 * - kullanıcı "iskontolu birim" veya "kdv dahil birim" girince iskonto% (gerekirse birim fiyat) güncellenir.
 */
function deriveFromUnitNet(draft, nextUnitNet) {
  const unitNet = Math.max(0, toNumber(nextUnitNet));
  const up = Math.max(0, toNumber(draft.unitPrice));
  if (up > 0) {
    // discountRate = 100 * (1 - unitNet/unitPrice)
    let disc = 100 * (1 - unitNet / up);
    // unitNet > unitPrice ise negatif iskonto oluşur; bu durumda birim fiyatı yükselt ve iskonto=0 yap
    if (disc < 0) return { ...draft, unitPrice: String(unitNet), discountRate: "0" };
    return { ...draft, discountRate: String(clamp(disc, 0, 100)) };
  }
  // unitPrice yoksa: unitPrice = unitNet, iskonto=0
  return { ...draft, unitPrice: String(unitNet), discountRate: "0" };
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
    { id: uid(), invoiceId: invA, invoiceItem: "A4 Fotokopi Kağıdı", qty: "20", unitType: "Paket", unitPrice: "165", discountRate: "5", vatRate: "20" },
    { id: uid(), invoiceId: invA, invoiceItem: "Toner (Siyah)", qty: "3", unitType: "Adet", unitPrice: "980", discountRate: "0", vatRate: "20" },
    { id: uid(), invoiceId: invA, invoiceItem: "Koli Bandı", qty: "12", unitType: "Adet", unitPrice: "42", discountRate: "10", vatRate: "20" },
    { id: uid(), invoiceId: invA, invoiceItem: "Zımba Teli", qty: "15", unitType: "Paket", unitPrice: "28", discountRate: "0", vatRate: "20" },

    { id: uid(), invoiceId: invB, invoiceItem: "Endüstriyel Eldiven", qty: "50", unitType: "Çift", unitPrice: "38", discountRate: "0", vatRate: "20" },
    { id: uid(), invoiceId: invB, invoiceItem: "Maske (FFP2)", qty: "200", unitType: "Adet", unitPrice: "7,5", discountRate: "0", vatRate: "20" },
    { id: uid(), invoiceId: invB, invoiceItem: "Koruyucu Gözlük", qty: "25", unitType: "Adet", unitPrice: "68", discountRate: "0", vatRate: "20" },

    { id: uid(), invoiceId: invC, invoiceItem: "Temizlik Kimyasalı", qty: "60", unitType: "Lt", unitPrice: "52", discountRate: "3", vatRate: "20" },
    { id: uid(), invoiceId: invC, invoiceItem: "Dezenfektan", qty: "40", unitType: "Lt", unitPrice: "64", discountRate: "0", vatRate: "20" },
    { id: uid(), invoiceId: invC, invoiceItem: "Köpük Sabun", qty: "30", unitType: "Lt", unitPrice: "48", discountRate: "5", vatRate: "20" },
  ];

  return { invoices, lines };
})();

function blankInvoiceLine() {
  return { _key: uid(), invoiceItem: "", qty: "1", unitType: UNIT_TYPES[0], unitPrice: "", discountRate: "", vatRate: "20" };
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



function SimpleBarChart({ title, data, labelKey = "label", valueKey = "value", height = 180 }) {
  const max = Math.max(1, ...data.map((d) => toNumber(d[valueKey] ?? 0)));
  const barW = 24;
  const gap = 10;
  const pad = 16;
  const w = Math.max(320, pad * 2 + data.length * (barW + gap));
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      {title ? <div className="text-sm font-semibold text-slate-900">{title}</div> : null}
      <div className="mt-3 overflow-x-auto">
        <svg width={w} height={height}>
          <line x1={pad} y1={height - pad} x2={w - pad} y2={height - pad} stroke="currentColor" opacity="0.15" />
          {data.map((d, i) => {
            const v = toNumber(d[valueKey] ?? 0);
            const h = ((height - pad * 2) * v) / max;
            const x = pad + i * (barW + gap);
            const y = height - pad - h;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barW} height={h} rx="6" className="fill-slate-900 opacity-80" />
                <text x={x + barW / 2} y={height - 4} textAnchor="middle" fontSize="10" className="fill-slate-600">
                  {String(d[labelKey] ?? "").slice(0, 10)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function SimpleLineChart({ title, data, labelKey = "label", valueKey = "value", height = 180 }) {
  const max = Math.max(1, ...data.map((d) => toNumber(d[valueKey] ?? 0)));
  const pad = 18;
  const w = Math.max(420, pad * 2 + data.length * 40);
  const pts = data.map((d, i) => {
    const x = pad + i * 40;
    const v = toNumber(d[valueKey] ?? 0);
    const y = height - pad - ((height - pad * 2) * v) / max;
    return { x, y, v, label: d[labelKey] };
  });
  const dPath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      {title ? <div className="text-sm font-semibold text-slate-900">{title}</div> : null}
      <div className="mt-3 overflow-x-auto">
        <svg width={w} height={height}>
          <line x1={pad} y1={height - pad} x2={w - pad} y2={height - pad} stroke="currentColor" opacity="0.15" />
          <path d={dPath} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.85" />
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" className="fill-slate-900" />
              <text x={p.x} y={height - 4} textAnchor="middle" fontSize="10" className="fill-slate-600">
                {String(p.label ?? "").slice(0, 10)}
              </text>
            </g>
          ))}
        </svg>
      </div>
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

function TopNav({ activeTab, onChange }) {
  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1650px] items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-slate-900">Satınalma SaaS</div>
          <div className="hidden text-xs text-slate-500 md:block">UI Prototip</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const active = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => onChange(t.key)}
                className={
                  "h-9 rounded-xl px-4 text-sm font-semibold ring-1 ring-slate-200 " +
                  (active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-900 hover:bg-slate-50")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState("purchases");

  const [invoices, setInvoices] = useState(() => SAMPLE.invoices);
  const [lines, setLines] = useState(() => SAMPLE.lines);

  // Satınalımlar sayfası filtre / sıralama
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("ALL");
  const [itemFilter, setItemFilter] = useState("ALL");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [hoveredInvoiceId, setHoveredInvoiceId] = useState(null);

  // Satır edit paneli
  const [linePanelOpen, setLinePanelOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState(null); // null | lineId
  const [lineDraft, setLineDraft] = useState(null);
  const [lineUnitNetRaw, setLineUnitNetRaw] = useState("");
  const [lineUnitVatRaw, setLineUnitVatRaw] = useState("");

  // Fatura ekranı
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [activeInvoiceId, setActiveInvoiceId] = useState(null);
  const [activeInvoiceLineId, setActiveInvoiceLineId] = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState(null);

  // Fatura içi kalem edit
  const [invoiceLineDraft, setInvoiceLineDraft] = useState(null);
  const [invLineUnitNetRaw, setInvLineUnitNetRaw] = useState("");
  const [invLineUnitVatRaw, setInvLineUnitVatRaw] = useState("");

  // Satınalım Ekle (yeni fatura + kalemler) — FULL SCREEN
  const [invoiceCreateOpen, setInvoiceCreateOpen] = useState(false);
  const [invoiceCreateDraft, setInvoiceCreateDraft] = useState(() => ({
    invoiceNo: "",
    date: new Date().toISOString().slice(0, 10),
    supplierName: "",
    tevfikatRate: "0",
    discountTotal: "",
  }));
  const [invoiceCreateLines, setInvoiceCreateLines] = useState(() => Array.from({ length: 5 }).map(() => blankInvoiceLine()));
  const [createUnitNetRaw, setCreateUnitNetRaw] = useState({}); // { [key]: string }
  const [createUnitVatRaw, setCreateUnitVatRaw] = useState({});

  // Excel Import (Satınalımlar)
  const importInputRef = useRef(null);

  // Rapor Filtreleri (prototip)
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportSupplier, setReportSupplier] = useState("ALL");
  const [reportItem, setReportItem] = useState("ALL");
  const [reportMetric, setReportMetric] = useState("totalVatIncl"); // totalNet | totalVatIncl
 // { [key]: string }

  // Tedarikçi / Kalem modalları (global)
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [supplierModalOriginal, setSupplierModalOriginal] = useState("");
  const [supplierModalDraft, setSupplierModalDraft] = useState("");

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModalOriginal, setItemModalOriginal] = useState("");
  const [itemModalDraft, setItemModalDraft] = useState("");

  // ESC kapama önceliği
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
    return sorted.reduce(
      (acc, r) => {
        const c = calcLine(r);
        acc.totalNet += c.totalNet;
        acc.totalVatIncl += c.totalVatIncl;
        return acc;
      },
      { totalNet: 0, totalVatIncl: 0 }
    );
  }, [sorted]);

  function setSortKey(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  

  const purchaseExportHeaders = [
    { key: "date", label: "Tarih" },
    { key: "supplierName", label: "Tedarikçi Adı" },
    { key: "invoiceNo", label: "Fatura No" },
    { key: "invoiceItem", label: "Fatura Kalemi" },
    { key: "qty", label: "Adet" },
    { key: "unitType", label: "Birim Türü" },
    { key: "unitPrice", label: "Birim Fiyat" },
    { key: "discountRate", label: "İskonto Oranı" },
    { key: "unitNet", label: "İskontolu Birim Fiyat" },
    { key: "vatRate", label: "KDV Oranı" },
    { key: "unitVatIncl", label: "KDV Dahil Birim Fiyat" },
    { key: "totalNet", label: "KDV Hariç Toplam Tutar" },
    { key: "totalVatIncl", label: "KDV Dahil Toplam Tutar" },
  ];

  function buildExportRows(viewRows) {
    return viewRows.map((r) => {
      const c = calcLine(r);
      return {
        date: r.date,
        supplierName: r.supplierName,
        invoiceNo: r.invoiceNo,
        invoiceItem: r.invoiceItem,
        qty: r.qty,
        unitType: r.unitType,
        unitPrice: r.unitPrice,
        discountRate: r.discountRate,
        unitNet: c.unitNet ? String(c.unitNet) : "",
        vatRate: r.vatRate,
        unitVatIncl: c.unitVatIncl ? String(c.unitVatIncl) : "",
        totalNet: c.totalNet ? String(c.totalNet) : "",
        totalVatIncl: c.totalVatIncl ? String(c.totalVatIncl) : "",
      };
    });
  }

  async function exportPurchasesXlsx() {
    const rows = buildExportRows(sorted); // filtre + sıralama uygulanmış görünüm
    await exportToXlsx({ filename: "satinalim_gorunum.xlsx", sheetName: "Satınalımlar", rows, headers: purchaseExportHeaders });
  }

  async function handleImportFile(file) {
    if (!file) return;

    // CSV destek (kolay fallback)
    const name = String(file.name || "").toLowerCase();
    if (name.endsWith(".csv")) {
      const text = await file.text();
      const linesCsv = text.split(/\r?\n/).filter(Boolean);
      if (linesCsv.length < 2) return alert("CSV boş.");
      const headers = linesCsv[0].split(",").map((h) => normHeader(h));
      const rows = linesCsv.slice(1).map((ln) => {
        const parts = ln.split(",");
        const obj = {};
        headers.forEach((h, i) => (obj[h] = (parts[i] ?? "").replace(/^"|"$/g, "")));
        return obj;
      });
      // CSV için minimum mapping (tavsiye: XLSX)
      return alert("CSV import prototipte sınırlı. XLSX önerilir (npm i xlsx).");
    }

    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });

      // Header normalize
      const mapped = raw.map((r) => {
        const o = {};
        for (const [k, v] of Object.entries(r)) o[normHeader(k)] = v;
        return o;
      });

      const invoicesToAdd = [];
      const linesToAdd = [];
      const invoiceByKey = new Map();

      mapped.forEach((r, idx) => {
        const date = String(r["tarih"] || r["date"] || "").slice(0, 10);
        const supplierName = String(r["tedarikci adi"] || r["tedarikci"] || r["supplier"] || "").trim();
        const invoiceNo = String(r["fatura no"] || r["fatura"] || r["invoice no"] || "").trim();
        const invoiceItem = String(r["fatura kalemi"] || r["kalem"] || r["item"] || "").trim();
        const qty = String(r["adet"] || r["qty"] || "").trim();
        const unitType = String(r["birim turu"] || r["birim"] || r["unit"] || "").trim();
        const unitPrice = String(r["birim fiyat"] || r["unit price"] || "").trim();
        const discountRate = String(r["iskonto orani"] || r["iskonto"] || r["discount"] || "").trim();
        const vatRate = String(r["kdv orani"] || r["kdv"] || r["vat"] || "").trim();

        const manualUnitNet = String(r["iskontolu birim fiyat"] || r["iskontolu birim"] || r["unit net"] || "").trim();
        const manualUnitVat = String(r["kdv dahil birim fiyat"] || r["kdv dahil birim"] || r["unit vat incl"] || "").trim();

        if (!supplierName || !date || !invoiceItem) return;

        const key = invoiceNo ? `${supplierName}__${invoiceNo}__${date}` : `${supplierName}__${date}__row${idx}`;
        let inv = invoiceByKey.get(key);
        if (!inv) {
          inv = {
            id: uid(),
            date,
            supplierName,
            invoiceNo,
            currencyCode: "TRY",
            paymentTermDays: "30",
            tevfikatRate: "0",
            discountTotal: "",
          };
          invoiceByKey.set(key, inv);
          invoicesToAdd.push(inv);
        }

        let ln = {
          id: uid(),
          invoiceId: inv.id,
          invoiceItem,
          qty: qty || "1",
          unitType: unitType || "Adet",
          unitPrice: unitPrice || "0",
          discountRate: discountRate || "0",
          vatRate: vatRate || "20",
        };

        // Çift yönlü manuel alanlar (öncelik: iskontolu birim, sonra KDV dahil birim)
        if (manualUnitNet) ln = deriveFromUnitNet(ln, manualUnitNet);
        else if (manualUnitVat) ln = deriveFromUnitVatIncl(ln, manualUnitVat);

        linesToAdd.push(ln);
      });

      if (invoicesToAdd.length === 0 || linesToAdd.length === 0) return alert("İçe aktarılacak satır bulunamadı.");

      setInvoices((prev) => [...invoicesToAdd, ...prev]);
      setLines((prev) => [...linesToAdd, ...prev]);

      alert(`İçe aktarıldı: ${invoicesToAdd.length} fatura, ${linesToAdd.length} satır.`);
    } catch (e) {
      alert("XLSX okuma için kütüphane yok. Kurulum: npm i xlsx");
    }
  }

function openEditLine(lineId) {
    const ln = lines.find((x) => x.id === lineId);
    if (!ln) return;
    setEditingLineId(lineId);
    setLineDraft({
      invoiceId: ln.invoiceId,
      invoiceItem: ln.invoiceItem,
      qty: ln.qty ?? "",
      unitType: ln.unitType,
      unitPrice: ln.unitPrice ?? "",
      discountRate: ln.discountRate ?? "",
      vatRate: ln.vatRate ?? "",
    });
    setLineUnitNetRaw("");
    setLineUnitVatRaw("");
    setLinePanelOpen(true);
  }

  function removeLine(lineId) {
    const ok = confirm("Bu fatura kalemini silmek istiyor musunuz?");
    if (!ok) return;
    setLines((prev) => prev.filter((x) => x.id !== lineId));
  }

  function saveLineFromPanel() {
    if (!lineDraft) return;
    if (!lineDraft.invoiceId) return alert("Fatura seçiniz.");
    if (!String(lineDraft.invoiceItem || "").trim()) return alert("Fatura kalemi zorunludur.");

    const payload = {
      id: editingLineId,
      invoiceId: lineDraft.invoiceId,
      invoiceItem: String(lineDraft.invoiceItem).trim(),
      qty: String(lineDraft.qty ?? ""),
      unitType: lineDraft.unitType,
      unitPrice: String(lineDraft.unitPrice ?? ""),
      discountRate: String(lineDraft.discountRate ?? ""),
      vatRate: String(lineDraft.vatRate ?? ""),
    };

    setLines((prev) => prev.map((x) => (x.id === payload.id ? payload : x)));
    setLinePanelOpen(false);
  }

  function openInvoice(invoiceId) {
    const inv = invoices.find((x) => x.id === invoiceId);
    if (!inv) return;

    setActiveInvoiceId(invoiceId);
    setInvoiceDraft({
      id: inv.id,
      invoiceNo: inv.invoiceNo ?? "",
      date: inv.date ?? "",
      supplierName: inv.supplierName ?? "",
      tevfikatRate: String(inv.tevfikatRate ?? 0),
      discountTotal: String(inv.discountTotal ?? ""),
    });

    const firstLine = lines.find((x) => x.invoiceId === invoiceId);
    setActiveInvoiceLineId(firstLine?.id ?? null);
    setInvoiceModalOpen(true);
  }

  const invoiceLines = useMemo(() => {
    if (!activeInvoiceId) return [];
    return lines.filter((x) => x.invoiceId === activeInvoiceId);
  }, [lines, activeInvoiceId]);

  const invoiceComputed = useMemo(() => {
    const sums = invoiceLines.reduce(
      (acc, ln) => {
        const c = calcLine(ln);
        acc.totalNet += c.totalNet;
        acc.totalVatIncl += c.totalVatIncl;
        acc.vatAmount += c.vatAmount;
        acc.grossNet += Math.max(0, toNumber(ln.unitPrice)) * Math.max(0, toNumber(ln.qty)); // iskonto öncesi
        return acc;
      },
      { grossNet: 0, totalNet: 0, totalVatIncl: 0, vatAmount: 0 }
    );

    const discountComputed = Math.max(0, sums.grossNet - sums.totalNet);
    const tev = clamp(toNumber(invoiceDraft?.tevfikatRate ?? 0), 0, 100);
    const withheldVat = sums.vatAmount * (tev / 100);
    const payableVat = sums.vatAmount - withheldVat;

    return { ...sums, discountComputed, tev, withheldVat, payableVat };
  }, [invoiceLines, invoiceDraft]);

  const createComputed = useMemo(() => {
    const valid = invoiceCreateLines.filter((x) => String(x.invoiceItem || "").trim());
    const sums = valid.reduce(
      (acc, ln) => {
        const c = calcLine(ln);
        acc.totalNet += c.totalNet;
        acc.totalVatIncl += c.totalVatIncl;
        acc.vatAmount += c.vatAmount;
        acc.grossNet += Math.max(0, toNumber(ln.unitPrice)) * Math.max(0, toNumber(ln.qty));
        return acc;
      },
      { totalNet: 0, totalVatIncl: 0, vatAmount: 0, grossNet: 0 }
    );

    const discountComputed = Math.max(0, sums.grossNet - sums.totalNet);
    const tev = clamp(toNumber(invoiceCreateDraft?.tevfikatRate ?? 0), 0, 100);
    const withheldVat = sums.vatAmount * (tev / 100);
    const payableVat = sums.vatAmount - withheldVat;

    return { ...sums, discountComputed, tev, withheldVat, payableVat };
  }, [invoiceCreateLines, invoiceCreateDraft]);

  function distributeCreateDiscount(discountTotal) {
    const invLines = invoiceCreateLines.filter((x) => String(x.invoiceItem || "").trim());
    if (invLines.length === 0) return alert("Kalem yok.");

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

      return { ...ln, discountRate: String(clamp(rate, 0, 100)) };
    });

    setInvoiceCreateLines((prev) => {
      const map = new Map(updated.map((u) => [u._key, u]));
      return prev.map((x) => (map.has(x._key) ? map.get(x._key) : x));
    });
  }



  function saveInvoiceHeader() {
    if (!invoiceDraft) return;
    if (!String(invoiceDraft.supplierName || "").trim()) return alert("Tedarikçi adı zorunludur.");

    setInvoices((prev) =>
      prev.map((x) =>
        x.id === invoiceDraft.id
          ? {
              ...x,
              invoiceNo: String(invoiceDraft.invoiceNo ?? "").trim(),
              date: invoiceDraft.date,
              supplierName: String(invoiceDraft.supplierName ?? "").trim(),
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

      return { ...ln, discountRate: String(clamp(rate, 0, 100)) };
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

  useEffect(() => {
    if (!activeInvoiceLine) return setInvoiceLineDraft(null);
    setInvoiceLineDraft({
      id: activeInvoiceLine.id,
      invoiceId: activeInvoiceLine.invoiceId,
      invoiceItem: activeInvoiceLine.invoiceItem,
      qty: activeInvoiceLine.qty ?? "",
      unitType: activeInvoiceLine.unitType,
      unitPrice: activeInvoiceLine.unitPrice ?? "",
      discountRate: activeInvoiceLine.discountRate ?? "",
      vatRate: activeInvoiceLine.vatRate ?? "",
    });
    setInvLineUnitNetRaw("");
    setInvLineUnitVatRaw("");
  }, [activeInvoiceLineId, activeInvoiceLine]);

  function saveInvoiceLineDraft() {
    if (!invoiceLineDraft) return;
    if (!String(invoiceLineDraft.invoiceItem || "").trim()) return alert("Fatura kalemi zorunludur.");

    const payload = {
      id: invoiceLineDraft.id,
      invoiceId: invoiceLineDraft.invoiceId,
      invoiceItem: String(invoiceLineDraft.invoiceItem).trim(),
      qty: String(invoiceLineDraft.qty ?? ""),
      unitType: invoiceLineDraft.unitType,
      unitPrice: String(invoiceLineDraft.unitPrice ?? ""),
      discountRate: String(invoiceLineDraft.discountRate ?? ""),
      vatRate: String(invoiceLineDraft.vatRate ?? ""),
    };

    setLines((prev) => prev.map((x) => (x.id === payload.id ? payload : x)));
  }

  function openPurchaseCreate() {
    setInvoiceCreateDraft({
      invoiceNo: "",
      date: new Date().toISOString().slice(0, 10),
      supplierName: "",
      tevfikatRate: "0",
      discountTotal: "",
    });
    setInvoiceCreateLines(Array.from({ length: 5 }).map(() => blankInvoiceLine()));
    setCreateUnitNetRaw({});
    setCreateUnitVatRaw({});
    setInvoiceCreateOpen(true);
  }

  function saveInvoiceCreate() {
    if (!String(invoiceCreateDraft.supplierName || "").trim()) return alert("Tedarikçi adı zorunludur.");

    const meaningfulLines = invoiceCreateLines
      .filter((l) => String(l.invoiceItem || "").trim())
      .map((l) => ({
        invoiceItem: String(l.invoiceItem).trim(),
        qty: String(l.qty ?? ""),
        unitType: l.unitType,
        unitPrice: String(l.unitPrice ?? ""),
        discountRate: String(l.discountRate ?? ""),
        vatRate: String(l.vatRate ?? ""),
      }));

    if (meaningfulLines.length === 0) return alert("En az 1 kalem girmelisiniz.");

    const invId = uid();
    const inv = {
      id: invId,
      invoiceNo: String(invoiceCreateDraft.invoiceNo || "").trim() || `INV-${invId.slice(0, 6)}`,
      date: invoiceCreateDraft.date,
      supplierName: String(invoiceCreateDraft.supplierName || "").trim(),
      tevfikatRate: clamp(toNumber(invoiceCreateDraft.tevfikatRate), 0, 100),
      discountTotal: Math.max(0, toNumber(invoiceCreateDraft.discountTotal)),
    };

    // Satırlar
    let newLines = meaningfulLines.map((l) => ({ id: uid(), invoiceId: invId, ...l }));

    // Eğer toplam iskonto girildiyse, sadece yeni satırlar üzerinde dağıt (state'e bakmadan)
    if (inv.discountTotal > 0) {
      const weights = newLines.map((ln) => Math.max(0, toNumber(ln.unitPrice)) * Math.max(0, toNumber(ln.qty)));
      const sumW = weights.reduce((a, b) => a + b, 0);

      if (sumW > 0) {
        let allocated = 0;
        newLines = newLines.map((ln, idx) => {
          const w = weights[idx];
          const share = idx === newLines.length - 1 ? inv.discountTotal - allocated : (inv.discountTotal * w) / sumW;
          allocated += share;
          const gross = w;
          const rate = gross > 0 ? (share / gross) * 100 : 0;
          return { ...ln, discountRate: String(clamp(rate, 0, 100)) };
        });
      }
    }

    setInvoices((prev) => [inv, ...prev]);
    setLines((prev) => [...newLines, ...prev]);
    setInvoiceCreateOpen(false);
  }

  function openSupplierModal(name) {
    setSupplierModalOriginal(name);
    setSupplierModalDraft(name);
    setSupplierModalOpen(true);
  }
  function saveSupplierModal() {
    const next = String(supplierModalDraft || "").trim();
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
    const next = String(itemModalDraft || "").trim();
    if (!next) return alert("Kalem adı boş olamaz.");
    const prevName = itemModalOriginal;
    setLines((prev) => prev.map((x) => (x.invoiceItem === prevName ? { ...x, invoiceItem: next } : x)));
    setItemModalOpen(false);
  }

  const lineDraftComputed = useMemo(() => calcLine(lineDraft ?? {}), [lineDraft]);
  const invoiceLineDraftComputed = useMemo(() => calcLine(invoiceLineDraft ?? {}), [invoiceLineDraft]);

  // Sekmelerde kullanılacak özetler
  const supplierStats = useMemo(() => {
    const bySupplier = new Map();
    for (const r of joined) {
      const c = calcLine(r);
      const key = r.supplierName || "(Bilinmeyen)";
      const cur = bySupplier.get(key) || { supplierName: key, invoiceCount: 0, lineCount: 0, totalNet: 0, totalVatIncl: 0 };
      cur.lineCount += 1;
      cur.totalNet += c.totalNet;
      cur.totalVatIncl += c.totalVatIncl;
      bySupplier.set(key, cur);
    }
    // invoiceCount
    for (const inv of invoices) {
      const key = inv.supplierName || "(Bilinmeyen)";
      const cur = bySupplier.get(key) || { supplierName: key, invoiceCount: 0, lineCount: 0, totalNet: 0, totalVatIncl: 0 };
      cur.invoiceCount += 1;
      bySupplier.set(key, cur);
    }
    return [...bySupplier.values()].sort((a, b) => b.totalVatIncl - a.totalVatIncl);
  }, [joined, invoices]);

  const productStats = useMemo(() => {
    const byItem = new Map();
    for (const r of joined) {
      const c = calcLine(r);
      const key = r.invoiceItem || "(Bilinmeyen)";
      const cur = byItem.get(key) || { invoiceItem: key, lineCount: 0, qty: 0, totalNet: 0, totalVatIncl: 0 };
      cur.lineCount += 1;
      cur.qty += c.q;
      cur.totalNet += c.totalNet;
      cur.totalVatIncl += c.totalVatIncl;
      byItem.set(key, cur);
    }
    return [...byItem.values()].sort((a, b) => b.totalVatIncl - a.totalVatIncl);
  }, [joined]);

  const reportKpis = useMemo(() => {
    const totalInvoices = invoices.length;
    const totalLines = lines.length;
    const totalNet = joined.reduce((a, r) => a + calcLine(r).totalNet, 0);
    const totalVatIncl = joined.reduce((a, r) => a + calcLine(r).totalVatIncl, 0);
    const topSupplier = supplierStats[0]?.supplierName || "-";
    const topProduct = productStats[0]?.invoiceItem || "-";
    return { totalInvoices, totalLines, totalNet, totalVatIncl, topSupplier, topProduct };
  }, [invoices, lines, joined, supplierStats, productStats]);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav activeTab={activeTab} onChange={setActiveTab} />

      {/* datalist'ler (global) */}
      <datalist id="supplierList">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="itemList">{items.map((s) => <option key={s} value={s} />)}</datalist>

      {/* Sayfalar */}
      {activeTab === "purchases" && (
        <div className="mx-auto max-w-[1650px] px-6 py-6">
          <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Satınalımlar</h1>
              <p className="text-sm text-slate-600">
                Satıra tıkla → sağ panelden düzenle. “Fatura” butonu → full ekran fatura ekranı. Hover → aynı faturanın kalemleri belirginleşir.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center">
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300 lg:w-[420px]"
                placeholder="Ara: tedarikçi, kalem, tarih, fatura no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <button onClick={openPurchaseCreate} className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
                Satınalım Ekle
              </button>

              <button
                onClick={exportPurchasesXlsx}
                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                title="Görünen (filtre + sıralama uygulanmış) listeyi Excel olarak indirir."
              >
                Excel’e Aktar
              </button>

              <button
                onClick={() => importInputRef.current?.click()}
                className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                title="Excel (.xlsx) dosyasından içe aktar."
              >
                Excel’den İçe Aktar
              </button>

              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  handleImportFile(f);
                }}
              />

            </div>
          </header>

          {/* Filtre Bar */}
          <section className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Filter label="Tedarikçi">
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                >
                  <option value="ALL">Tümü</option>
                  {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Filter>

              <Filter label="Fatura Kalemi">
                <select
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                  value={itemFilter}
                  onChange={(e) => setItemFilter(e.target.value)}
                >
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

                <button
                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50"
                  onClick={() => { setSupplierFilter("ALL"); setItemFilter("ALL"); setSearch(""); }}
                >
                  Filtreleri Sıfırla
                </button>
              </div>
            </div>
          </section>

          {/* Liste */}
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
                          className={
                            "border-t border-slate-200 " +
                            (groupActive ? "bg-amber-100/70 border-l-4 border-amber-600" : "bg-white") +
                            (otherFaded ? " opacity-60" : "") +
                            " hover:bg-slate-50"
                          }
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
                            <button
                              className="text-left font-medium text-slate-900 hover:underline"
                              onClick={(e) => { e.stopPropagation(); openSupplierModal(r.supplierName); }}
                              title="Tedarikçi formunu aç"
                            >
                              {r.supplierName}
                            </button>
                            <div className="mt-0.5 text-[11px] text-slate-500">{r.invoiceNo}</div>
                          </td>

                          <td className="px-3 py-3">
                            <button
                              className="text-left text-slate-900 hover:underline"
                              onClick={(e) => { e.stopPropagation(); openItemModal(r.invoiceItem); }}
                              title="Kalem formunu aç"
                            >
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
                              <button
                                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
                                onClick={(e) => { e.stopPropagation(); openInvoice(r.invoiceId); }}
                              >
                                Fatura
                              </button>

                              <button
                                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
                                onClick={(e) => { e.stopPropagation(); openEditLine(r.id); }}
                              >
                                Düzenle
                              </button>

                              <button
                                className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                onClick={(e) => { e.stopPropagation(); removeLine(r.id); }}
                              >
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

          <footer className="mt-4 text-xs text-slate-500">
            Not: Bu ekran UI prototipidir. Backend/DB entegrasyonu ayrıca yapılır.
          </footer>
        </div>
      )}

      {activeTab === "orders" && (
        <div className="mx-auto max-w-[1650px] px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">Siparişler</h1>
          <p className="mt-2 text-sm text-slate-600">
            Bu sekme MVP’de placeholder’dır. Sonraki adımda satınalımlardan siparişe dönüşüm ve sipariş takibi eklenecek.
          </p>

          <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="text-sm font-semibold text-slate-900">Önerilen Bağlantılar</div>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
              <li>Satınalımlar → seçili kalemden “Siparişe aktar”</li>
              <li>Tedarikçiler → açık siparişler</li>
              <li>Raporlar → teslimat performansı (planlanan)</li>
            </ul>
          </div>
        </div>
      )}

      {activeTab === "suppliers" && (
        <div className="mx-auto max-w-[1650px] px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">Tedarikçiler</h1>
          <p className="mt-2 text-sm text-slate-600">Bu liste, Satınalımlar/Faturalar verisinden türetilir. Tedarikçi adına tıklayınca form açılır.</p>

          <section className="mt-4 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium">Tedarikçi</th>
                    <th className="px-3 py-3 text-right font-medium">Fatura</th>
                    <th className="px-3 py-3 text-right font-medium">Satır</th>
                    <th className="px-3 py-3 text-right font-medium">KDV Hariç</th>
                    <th className="px-3 py-3 text-right font-medium">KDV Dahil</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierStats.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">Kayıt yok.</td></tr>
                  ) : (
                    supplierStats.map((s) => (
                      <tr key={s.supplierName} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <button className="text-left font-semibold text-slate-900 hover:underline" onClick={() => openSupplierModal(s.supplierName)}>
                            {s.supplierName}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(s.invoiceCount)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(s.lineCount)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(s.totalNet)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(s.totalVatIncl)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeTab === "products" && (
        <div className="mx-auto max-w-[1650px] px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">Tedarik Ürünleri</h1>
          <p className="mt-2 text-sm text-slate-600">Bu liste, fatura kalemlerinden türetilir. Kaleme tıklayınca “Kalem Formu” açılır.</p>

          <section className="mt-4 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium">Kalem</th>
                    <th className="px-3 py-3 text-right font-medium">Satır</th>
                    <th className="px-3 py-3 text-right font-medium">Toplam Adet</th>
                    <th className="px-3 py-3 text-right font-medium">KDV Hariç</th>
                    <th className="px-3 py-3 text-right font-medium">KDV Dahil</th>
                  </tr>
                </thead>
                <tbody>
                  {productStats.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">Kayıt yok.</td></tr>
                  ) : (
                    productStats.map((p) => (
                      <tr key={p.invoiceItem} className="border-t border-slate-200 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <button className="text-left font-semibold text-slate-900 hover:underline" onClick={() => openItemModal(p.invoiceItem)}>
                            {p.invoiceItem}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.lineCount)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.qty)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.totalNet)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(p.totalVatIncl)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      
{activeTab === "reports" && (
        <div className="mx-auto max-w-[1650px] px-6 py-6">
          <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Raporlar</h1>
              <p className="mt-2 text-sm text-slate-600">Filtrelenmiş veri üzerinden tedarikçi / ürün / tarih bazlı özet ve basit grafikler.</p>
            </div>
          </header>

          {/* Filtreler */}
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="lg:col-span-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Tarih</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Başlangıç">
                  <input type="date" className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
                </Field>
                <Field label="Bitiş">
                  <input type="date" className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
                </Field>
              </div>
              <div className="mt-3 text-xs text-slate-600">Boş bırakılırsa tüm tarihleri kapsar.</div>
            </div>

            <div className="lg:col-span-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Kırılımlar</div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <Field label="Tedarikçi">
                  <select className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" value={reportSupplier} onChange={(e) => setReportSupplier(e.target.value)}>
                    <option value="ALL">Tümü</option>
                    {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Ürün / Kalem">
                  <select className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" value={reportItem} onChange={(e) => setReportItem(e.target.value)}>
                    <option value="ALL">Tümü</option>
                    {items.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            <div className="lg:col-span-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-900">Metod</div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <Field label="Tutar Alanı">
                  <select className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300" value={reportMetric} onChange={(e) => setReportMetric(e.target.value)}>
                    <option value="totalVatIncl">KDV Dahil</option>
                    <option value="totalNet">KDV Hariç</option>
                  </select>
                </Field>
                <button
                  className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  onClick={() => { setReportFrom(""); setReportTo(""); setReportSupplier("ALL"); setReportItem("ALL"); }}
                >
                  Filtreleri Temizle
                </button>
              </div>
            </div>

            <div className="lg:col-span-3 grid grid-cols-1 gap-3">
              <ReadOnly label="Toplam Fatura" value={money(reportKpis.totalInvoices)} />
              <ReadOnly label="Toplam Harcama (KDV Dahil)" value={money(reportKpis.totalVatIncl)} />
              <ReadOnly label="Toplam Harcama (KDV Hariç)" value={money(reportKpis.totalNet)} />
            </div>
          </div>

          {(() => {
            const rows = joined.filter((r) => {
              if (reportSupplier !== "ALL" && r.supplierName !== reportSupplier) return false;
              if (reportItem !== "ALL" && r.invoiceItem !== reportItem) return false;
              if (reportFrom && r.date < reportFrom) return false;
              if (reportTo && r.date > reportTo) return false;
              return true;
            });

            const metricKey = reportMetric;
            const topSup = [];
            const mSup = new Map();
            for (const r of rows) {
              const c = calcLine(r);
              const v = metricKey === "totalNet" ? c.totalNet : c.totalVatIncl;
              mSup.set(r.supplierName, (mSup.get(r.supplierName) || 0) + v);
            }
            [...mSup.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .forEach(([label, value]) => topSup.push({ label, value }));

            const topProd = [];
            const mProd = new Map();
            for (const r of rows) {
              const c = calcLine(r);
              const v = metricKey === "totalNet" ? c.totalNet : c.totalVatIncl;
              mProd.set(r.invoiceItem, (mProd.get(r.invoiceItem) || 0) + v);
            }
            [...mProd.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .forEach(([label, value]) => topProd.push({ label, value }));

            const trend = [];
            const mTrend = new Map();
            for (const r of rows) {
              const c = calcLine(r);
              const v = metricKey === "totalNet" ? c.totalNet : c.totalVatIncl;
              const month = String(r.date || "").slice(0, 7);
              if (!month) continue;
              mTrend.set(month, (mTrend.get(month) || 0) + v);
            }
            [...mTrend.entries()].sort((a, b) => (a[0] > b[0] ? 1 : -1)).forEach(([label, value]) => trend.push({ label, value }));

            return (
              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
                <div className="lg:col-span-6">
                  <SimpleBarChart title="Tedarikçiye Göre Harcama (Top 8)" data={topSup} />
                </div>
                <div className="lg:col-span-6">
                  <SimpleBarChart title="Ürüne Göre Harcama (Top 8)" data={topProd} />
                </div>
                <div className="lg:col-span-12">
                  <SimpleLineChart title="Aylık Trend" data={trend} />
                </div>

                <div className="lg:col-span-12 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Filtrelenmiş Detay (İlk 200 Satır)</div>
                    <button
                      className="h-9 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      onClick={async () => {
                        const exportRows = buildExportRows(rows.slice(0, 200));
                        await exportToXlsx({ filename: "rapor_detay.xlsx", sheetName: "Detay", rows: exportRows, headers: purchaseExportHeaders });
                      }}
                      title="Filtrelenmiş detayın ilk 200 satırını Excel'e aktarır."
                    >
                      Excel’e Aktar
                    </button>
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
                    <table className="min-w-[1100px] w-full text-sm">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-3 py-3 text-left font-medium">Tarih</th>
                          <th className="px-3 py-3 text-left font-medium">Tedarikçi</th>
                          <th className="px-3 py-3 text-left font-medium">Kalem</th>
                          <th className="px-3 py-3 text-right font-medium">KDV Hariç</th>
                          <th className="px-3 py-3 text-right font-medium">KDV Dahil</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {rows.slice(0, 200).map((r) => {
                          const c = calcLine(r);
                          return (
                            <tr key={r.id} className="border-t border-slate-200 hover:bg-slate-50">
                              <td className="px-3 py-3">{r.date}</td>
                              <td className="px-3 py-3">{r.supplierName}</td>
                              <td className="px-3 py-3">{r.invoiceItem}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{money(c.totalNet)}</td>
                              <td className="px-3 py-3 text-right tabular-nums">{money(c.totalVatIncl)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 text-xs text-slate-600">Not: Grafikler prototip amaçlı basit SVG çizimleridir.</div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
{linePanelOpen && lineDraft && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) setLinePanelOpen(false); }} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-semibold">Satınalım Düzenle</h2>
                <p className="text-xs text-slate-600">İskontolu birim / KDV dahil birim alanları çift yönlü çalışır.</p>
              </div>
              <button onClick={() => setLinePanelOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Kapat</button>
            </div>

            <div className="p-5 overflow-y-auto h-[calc(100%-92px)]">
              <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">Fatura</div>
                <div className="mt-3">
                  <Field label="Mevcut Fatura">
                    <select
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.invoiceId}
                      onChange={(e) => setLineDraft((p) => ({ ...p, invoiceId: e.target.value }))}
                    >
                      {invoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.date} · {inv.supplierName} · {inv.invoiceNo}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                    onClick={() => { if (lineDraft.invoiceId) openInvoice(lineDraft.invoiceId); }}
                  >
                    Seçili Faturayı Aç
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Fatura Kalemi" hint="(autocomplete)">
                  <input
                    list="itemList"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                    value={lineDraft.invoiceItem}
                    onChange={(e) => setLineDraft((p) => ({ ...p, invoiceItem: e.target.value }))}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Adet">
                    <input
                      inputMode="decimal"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.qty}
                      onChange={(e) => setLineDraft((p) => ({ ...p, qty: e.target.value }))}
                    />
                  </Field>
                  <Field label="Birim Türü">
                    <select
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.unitType}
                      onChange={(e) => setLineDraft((p) => ({ ...p, unitType: e.target.value }))}
                    >
                      {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Birim Fiyat">
                  <input
                    inputMode="decimal"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                    value={lineDraft.unitPrice}
                    onChange={(e) => setLineDraft((p) => ({ ...p, unitPrice: e.target.value }))}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="İskonto Oranı %">
                    <input
                      inputMode="decimal"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.discountRate}
                      onChange={(e) => setLineDraft((p) => ({ ...p, discountRate: e.target.value }))}
                    />
                  </Field>
                  <Field label="KDV Oranı %">
                    <input
                      inputMode="decimal"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                      value={lineDraft.vatRate}
                      onChange={(e) => setLineDraft((p) => ({ ...p, vatRate: e.target.value }))}
                    />
                  </Field>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 md:col-span-2">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <Field label="İskontolu Birim (Elle girilebilir)" hint="KDV hariç">
                      <input
                        inputMode="decimal"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={lineUnitNetRaw !== "" ? lineUnitNetRaw : formatForInput(lineDraftComputed.unitNet)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setLineUnitNetRaw(raw);
                          setLineDraft((p) => deriveFromUnitNet(p, raw));
                        }}
                        onBlur={() => setLineUnitNetRaw("")}
                      />
                    </Field>

                    <Field label="KDV Dahil Birim (Elle girilebilir)">
                      <input
                        inputMode="decimal"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={lineUnitVatRaw !== "" ? lineUnitVatRaw : formatForInput(lineDraftComputed.unitVatIncl)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setLineUnitVatRaw(raw);
                          setLineDraft((p) => deriveFromUnitVatIncl(p, raw));
                        }}
                        onBlur={() => setLineUnitVatRaw("")}
                      />
                    </Field>

                    <ReadOnly label="KDV Hariç Toplam" value={money(lineDraftComputed.totalNet)} />
                    <ReadOnly label="KDV Dahil Toplam" value={money(lineDraftComputed.totalVatIncl)} />
                  </div>

                  <div className="mt-3 text-xs text-slate-600">
                    Not: Bu iki alan, kullanıcı yazarken binlik ayırıcı eklemez; virgül/nokta ondalık olarak kabul edilir.
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-slate-500">Kaydetmeden kapatırsanız değişiklikler kaybolur.</div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-2 border-t border-slate-200 bg-white p-5">
              <button onClick={() => setLinePanelOpen(false)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
                Vazgeç
              </button>
              <button onClick={saveLineFromPanel} className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-slate-800">
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fatura Formu - FULL SCREEN */}
      {invoiceModalOpen && invoiceDraft && (
        <div className="fixed inset-0 z-50 bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setInvoiceModalOpen(false); }}>
          <div className="absolute inset-0 bg-white flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Fatura Formu</h2>
                  <p className="text-xs text-slate-600">Üst: fatura bilgileri ve mali döküm. Alt: kalemler; kaleme tıkla → sağdaki düzenleme alanı değişir.</p>
                </div>
                <button className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50" onClick={() => setInvoiceModalOpen(false)}>
                  Kapat
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Fatura Bilgileri */}
                <div className="lg:col-span-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">Fatura Bilgileri</div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <Field label="Tarih">
                      <input
                        type="date"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.date}
                        onChange={(e) => setInvoiceDraft((p) => ({ ...p, date: e.target.value }))}
                        onBlur={saveInvoiceHeader}
                      />
                    </Field>

                    <Field label="Tedarikçi Adı" hint="(autocomplete)">
                      <input
                        list="supplierList"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.supplierName}
                        onChange={(e) => setInvoiceDraft((p) => ({ ...p, supplierName: e.target.value }))}
                        onBlur={saveInvoiceHeader}
                      />
                    </Field>

                    <Field label="Fatura No">
                      <input
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.invoiceNo}
                        onChange={(e) => setInvoiceDraft((p) => ({ ...p, invoiceNo: e.target.value }))}
                        onBlur={saveInvoiceHeader}
                      />
                    </Field>
                  </div>
                </div>

                {/* Mali Döküm */}
                <div className="lg:col-span-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Fatura Mali Döküm</div>
                    <button
                      className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      onClick={() => {
                        saveInvoiceHeader();
                        const t = Math.max(0, toNumber(invoiceDraft.discountTotal));
                        if (t <= 0) return alert("Toplam iskonto 0'dan büyük olmalıdır.");
                        distributeInvoiceDiscount(invoiceDraft.id, t);
                      }}
                      title="Toplam iskontoyu kalemlere oranlayarak dağıtır (sonradan düzenlenebilir)."
                    >
                      İskontoyu Kalemlere Dağıt
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Tevkifat %">
                      <input
                        inputMode="decimal"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.tevfikatRate}
                        onChange={(e) => setInvoiceDraft((p) => ({ ...p, tevfikatRate: e.target.value }))}
                        onBlur={saveInvoiceHeader}
                      />
                    </Field>
                    <Field label="Toplam İskonto (₺)" hint="(opsiyonel)">
                      <input
                        inputMode="decimal"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceDraft.discountTotal}
                        onChange={(e) => setInvoiceDraft((p) => ({ ...p, discountTotal: e.target.value }))}
                        onBlur={saveInvoiceHeader}
                      />
                    </Field>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <ReadOnly label="Kalemlerin Toplamı (KDV Hariç)" value={money(invoiceComputed.totalNet)} />
                    <ReadOnly label="Toplam İskonto (Hesaplanan)" value={money(invoiceComputed.discountComputed)} />
                    <ReadOnly label="Toplam KDV" value={money(invoiceComputed.vatAmount)} />
                    <ReadOnly label="Toplam Tevkifat (KDV)" value={money(invoiceComputed.withheldVat)} />
                  </div>

                  <div className="mt-3">
                    <ReadOnly label="KDV Dahil Genel Toplam" value={money(invoiceComputed.totalVatIncl)} />
                  </div>

                  <div className="mt-3 text-xs text-slate-600">Not: Tevkifat hesabı prototipte KDV tutarı üzerinden gösterim amaçlıdır.</div>
                </div>

                {/* Kalem Düzenleme */}
                <div className="lg:col-span-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Kalem Düzenleme</div>
                    <button
                      className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
                      onClick={saveInvoiceLineDraft}
                      disabled={!invoiceLineDraft}
                    >
                      Kalemi Kaydet
                    </button>
                  </div>

                  {!invoiceLineDraft ? (
                    <div className="mt-6 text-sm text-slate-600">Kalem seçiniz.</div>
                  ) : (
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <Field label="Fatura Kalemi" hint="(autocomplete)">
                        <input
                          list="itemList"
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                          value={invoiceLineDraft.invoiceItem}
                          onChange={(e) => setInvoiceLineDraft((p) => ({ ...p, invoiceItem: e.target.value }))}
                        />
                      </Field>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Adet">
                          <input
                            inputMode="decimal"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invoiceLineDraft.qty}
                            onChange={(e) => setInvoiceLineDraft((p) => ({ ...p, qty: e.target.value }))}
                          />
                        </Field>
                        <Field label="Birim Türü">
                          <select
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invoiceLineDraft.unitType}
                            onChange={(e) => setInvoiceLineDraft((p) => ({ ...p, unitType: e.target.value }))}
                          >
                            {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </Field>
                      </div>

                      <Field label="Birim Fiyat">
                        <input
                          inputMode="decimal"
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                          value={invoiceLineDraft.unitPrice}
                          onChange={(e) => setInvoiceLineDraft((p) => ({ ...p, unitPrice: e.target.value }))}
                        />
                      </Field>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="İskonto Oranı %">
                          <input
                            inputMode="decimal"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invoiceLineDraft.discountRate}
                            onChange={(e) => setInvoiceLineDraft((p) => ({ ...p, discountRate: e.target.value }))}
                          />
                        </Field>
                        <Field label="KDV Oranı %">
                          <input
                            inputMode="decimal"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invoiceLineDraft.vatRate}
                            onChange={(e) => setInvoiceLineDraft((p) => ({ ...p, vatRate: e.target.value }))}
                          />
                        </Field>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="İskontolu Birim (Elle girilebilir)" hint="KDV hariç">
                          <input
                            inputMode="decimal"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invLineUnitNetRaw !== "" ? invLineUnitNetRaw : formatForInput(invoiceLineDraftComputed.unitNet)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setInvLineUnitNetRaw(raw);
                              setInvoiceLineDraft((p) => deriveFromUnitNet(p, raw));
                            }}
                            onBlur={() => setInvLineUnitNetRaw("")}
                          />
                        </Field>
                        <Field label="KDV Dahil Birim (Elle girilebilir)">
                          <input
                            inputMode="decimal"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                            value={invLineUnitVatRaw !== "" ? invLineUnitVatRaw : formatForInput(invoiceLineDraftComputed.unitVatIncl)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setInvLineUnitVatRaw(raw);
                              setInvoiceLineDraft((p) => deriveFromUnitVatIncl(p, raw));
                            }}
                            onBlur={() => setInvLineUnitVatRaw("")}
                          />
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

                {/* Fatura Kalemleri Tablosu */}
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
                              <tr
                                key={ln.id}
                                className={"border-t border-slate-200 " + (active ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50")}
                                style={{ cursor: "pointer" }}
                                onClick={() => setActiveInvoiceLineId(ln.id)}
                              >
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

            {/* Footer */}
            <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-6 py-4 flex justify-end gap-2">
              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50" onClick={() => { saveInvoiceHeader(); setInvoiceModalOpen(false); }}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Satınalım Ekle (Yeni Fatura + Kalemler) — FULL SCREEN */}
      {invoiceCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setInvoiceCreateOpen(false); }}>
          <div className="absolute inset-0 bg-white flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Satınalım Ekle</h2>
                  <p className="text-xs text-slate-600">Yeni fatura modunda açılır. Kalemleri girip kaydedebilirsiniz.</p>
                </div>
                <button className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50" onClick={() => setInvoiceCreateOpen(false)}>
                  Kapat
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Fatura Bilgileri */}
                <div className="lg:col-span-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">Fatura Bilgileri</div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <Field label="Tarih">
                      <input
                        type="date"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceCreateDraft.date}
                        onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, date: e.target.value }))}
                      />
                    </Field>

                    <Field label="Tedarikçi Adı" hint="(autocomplete)">
                      <input
                        list="supplierList"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceCreateDraft.supplierName}
                        onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, supplierName: e.target.value }))}
                        placeholder="Örn: ABC Tedarik"
                      />
                    </Field>

                    <Field label="Fatura No (opsiyonel)">
                      <input
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceCreateDraft.invoiceNo}
                        onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, invoiceNo: e.target.value }))}
                        placeholder="Örn: 2025/123"
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Tevkifat %">
                        <input
                          inputMode="decimal"
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                          value={invoiceCreateDraft.tevfikatRate}
                          onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, tevfikatRate: e.target.value }))}
                        />
                      </Field>
                      <Field label="Toplam İskonto (₺)" hint="(opsiyonel)">
                        <input
                          inputMode="decimal"
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                          value={invoiceCreateDraft.discountTotal}
                          onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, discountTotal: e.target.value }))}
                        />
                      </Field>
                    </div>

                    <button
                      className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      onClick={() => setInvoiceCreateLines((prev) => [...prev, blankInvoiceLine()])}
                    >
                      Satır Ekle
                    </button>
                  </div>
                </div>


                {/* Fatura Mali Döküm */}
                <div className="lg:col-span-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Fatura Mali Döküm</div>
                    <button
                      className="h-9 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      onClick={() => {
                        const t = Math.max(0, toNumber(invoiceCreateDraft.discountTotal));
                        if (t <= 0) return alert("Toplam iskonto 0'dan büyük olmalıdır.");
                        distributeCreateDiscount(t);
                      }}
                      title="Toplam iskontoyu kalem tutarlarına göre dağıtır (sonradan satır bazında düzenlenebilir)."
                    >
                      İskontoyu Kalemlere Dağıt
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Tevkifat %">
                      <input
                        inputMode="decimal"
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceCreateDraft.tevfikatRate}
                        onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, tevfikatRate: e.target.value }))}
                      />
                    </Field>

                    <Field label="Toplam İskonto (₺)" hint="(opsiyonel)">
                      <input
                        inputMode="decimal"
                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                        value={invoiceCreateDraft.discountTotal}
                        onChange={(e) => setInvoiceCreateDraft((p) => ({ ...p, discountTotal: e.target.value }))}
                      />
                    </Field>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <ReadOnly label="Kalem Toplamı (KDV Hariç)" value={money(createComputed.totalNet)} />
                    <ReadOnly label="Toplam İskonto (Hesaplanan)" value={money(createComputed.discountComputed)} />
                    <ReadOnly label="Toplam KDV" value={money(createComputed.vatAmount)} />
                    <ReadOnly label="Toplam Tevkifat (KDV)" value={money(createComputed.withheldVat)} />
                  </div>

                  <div className="mt-3">
                    <ReadOnly label="KDV Dahil Genel Toplam" value={money(createComputed.totalVatIncl)} />
                  </div>
                </div>

                {/* Kalemler */}
                <div className="lg:col-span-12 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Fatura Kalemleri</div>
                    <div className="text-xs text-slate-600">Kalem adı boş olan satırlar kaydedilmez.</div>
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
                          <th className="px-3 py-3 text-right font-medium"> </th>
                        </tr>
                      </thead>

                      <tbody>
                        {invoiceCreateLines.map((ln, idx) => {
                          const c = calcLine(ln);
                          const netRaw = createUnitNetRaw[ln._key] ?? "";
                          const vatRaw = createUnitVatRaw[ln._key] ?? "";

                          return (
                            <tr key={ln._key} className="border-t border-slate-200">
                              <td className="px-3 py-2">
                                <input
                                  list="itemList"
                                  className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                                  value={ln.invoiceItem}
                                  onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, invoiceItem: e.target.value } : x)))}
                                  placeholder={`Kalem ${idx + 1}`}
                                />
                              </td>

                              <td className="px-3 py-2 text-right">
                                <input
                                  inputMode="decimal"
                                  className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                  value={ln.qty}
                                  onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, qty: e.target.value } : x)))}
                                />
                              </td>

                              <td className="px-3 py-2">
                                <select
                                  className="h-9 w-32 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                                  value={ln.unitType}
                                  onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, unitType: e.target.value } : x)))}
                                >
                                  {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </td>

                              <td className="px-3 py-2 text-right">
                                <input
                                  inputMode="decimal"
                                  className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                  value={ln.unitPrice}
                                  onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, unitPrice: e.target.value } : x)))}
                                />
                              </td>

                              <td className="px-3 py-2 text-right">
                                <input
                                  inputMode="decimal"
                                  className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                  value={ln.discountRate}
                                  onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, discountRate: e.target.value } : x)))}
                                />
                              </td>

                              <td className="px-3 py-2 text-right">
                                <input
                                  inputMode="decimal"
                                  className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                  value={netRaw !== "" ? netRaw : formatForInput(c.unitNet)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setCreateUnitNetRaw((p) => ({ ...p, [ln._key]: raw }));
                                    setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? deriveFromUnitNet(x, raw) : x)));
                                  }}
                                  onBlur={() => setCreateUnitNetRaw((p) => ({ ...p, [ln._key]: "" }))}
                                  title="İskontolu Birim (KDV hariç)"
                                />
                              </td>

                              <td className="px-3 py-2 text-right">
                                <input
                                  inputMode="decimal"
                                  className="h-9 w-20 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                  value={ln.vatRate}
                                  onChange={(e) => setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? { ...x, vatRate: e.target.value } : x)))}
                                />
                              </td>

                              <td className="px-3 py-2 text-right">
                                <input
                                  inputMode="decimal"
                                  className="h-9 w-28 rounded-xl border border-slate-200 bg-white px-3 text-sm text-right outline-none focus:ring-2 focus:ring-slate-300"
                                  value={vatRaw !== "" ? vatRaw : formatForInput(c.unitVatIncl)}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    setCreateUnitVatRaw((p) => ({ ...p, [ln._key]: raw }));
                                    setInvoiceCreateLines((prev) => prev.map((x) => (x._key === ln._key ? deriveFromUnitVatIncl(x, raw) : x)));
                                  }}
                                  onBlur={() => setCreateUnitVatRaw((p) => ({ ...p, [ln._key]: "" }))}
                                  title="KDV Dahil Birim"
                                />
                              </td>

                              <td className="px-3 py-2 text-right tabular-nums">{money(c.totalNet)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{money(c.totalVatIncl)}</td>

                              <td className="px-3 py-2 text-right">
                                <button
                                  className="h-9 rounded-xl border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                  onClick={() => setInvoiceCreateLines((prev) => prev.filter((x) => x._key !== ln._key))}
                                  title="Satırı kaldır"
                                >
                                  Sil
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 text-xs text-slate-500">
                    Sayısal giriş: binlik ayırıcı eklemez. 3,56 ve 3.56 aynı kabul edilir.
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-6 py-4 flex justify-end gap-2">
              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50" onClick={() => setInvoiceCreateOpen(false)}>
                Vazgeç
              </button>
              <button className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800" onClick={saveInvoiceCreate}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tedarikçi Modal */}
      {supplierModalOpen && (
        <SimpleModal title="Tedarikçi Formu" onClose={() => setSupplierModalOpen(false)}>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Tedarikçi Adı">
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={supplierModalDraft}
                onChange={(e) => setSupplierModalDraft(e.target.value)}
              />
            </Field>

            <div className="text-xs text-slate-600">
              Bu prototipte tedarikçi adı değişikliği, bu tedarikçiye bağlı tüm faturaları günceller.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50" onClick={() => setSupplierModalOpen(false)}>
                Kapat
              </button>
              <button className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800" onClick={saveSupplierModal}>
                Kaydet
              </button>
            </div>
          </div>
        </SimpleModal>
      )}

      {/* Kalem Modal */}
      {itemModalOpen && (
        <SimpleModal title="Kalem Formu" onClose={() => setItemModalOpen(false)}>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Kalem Adı">
              <input
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-300"
                value={itemModalDraft}
                onChange={(e) => setItemModalDraft(e.target.value)}
              />
            </Field>

            <div className="text-xs text-slate-600">
              Bu prototipte kalem adı değişikliği, aynı isimdeki tüm satırları günceller.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 hover:bg-slate-50" onClick={() => setItemModalOpen(false)}>
                Kapat
              </button>
              <button className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800" onClick={saveItemModal}>
                Kaydet
              </button>
            </div>
          </div>
        </SimpleModal>
      )}
    </div>
  );
}
