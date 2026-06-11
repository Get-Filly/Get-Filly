// ============================================================
// csv-export — gedeelde CSV-download-helper
// ============================================================
// Geëxtraheerd uit de reserveringen-pagina (2026-06-11) zodat
// gasten / reserveringen / rapportages dezelfde export gebruiken.
//
// Excel-friendly: BOM-prefix zodat ä/é/etc niet als rommel
// verschijnen bij dubbelklik in Excel. Quote-escape per cel zodat
// komma's of regel-eindes in een notitie de CSV niet breken.

export function downloadCsv(
  filenameBase: string,
  headers: string[],
  rows: string[][],
) {
  if (rows.length === 0) return;

  const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const csv = [headers, ...rows]
    .map((r) => r.map(escape).join(","))
    .join("\n");

  // BOM zorgt dat Excel UTF-8 herkent. Expliciet als escape zodat
  // het onzichtbare teken niet per ongeluk wegge-edit wordt.
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// PDF-export = de browser-printdialoog (daar zit "Bewaar als PDF"
// in op elk OS). De @media print-regels in dashboard.css verbergen
// sidebar/topbar/knoppen zodat alleen de pagina-inhoud overblijft.
// Bewust geen PDF-library: geen extra bundle-gewicht en de browser
// rendert de pagina al precies zoals de eigenaar 'm ziet.
export function exportPagePdf() {
  window.print();
}
