import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
const xml = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const col = (n: number) => {
  let s = "";
  for (n++; n > 0; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
// Reuse the tested literal-string worksheet writer; never interpret user input as formulas.
export function multiWorkbook(
  sheets: { name: string; rows: unknown[][] }[],
): Uint8Array {
  if (!sheets.length) throw Error("请选择需要导出的场次。");
  const files = unzipSync(
    workbook(sheets[0].rows, { sheetName: sheets[0].name }),
  );
  for (let i = 1; i < sheets.length; i++)
    files[`xl/worksheets/sheet${i + 1}.xml`] = unzipSync(
      workbook(sheets[i].rows),
    )["xl/worksheets/sheet1.xml"];
  files["[Content_Types].xml"] = strToU8(
    strFromU8(files["[Content_Types].xml"]).replace(
      "</Types>",
      sheets
        .slice(1)
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 2}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") + "</Types>",
    ),
  );
  files["xl/workbook.xml"] = strToU8(
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="s${i + 1}"/>`).join("")}</sheets></workbook>`,
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="s${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  return zipSync(files);
}
export function workbook(
  rows: unknown[][],
  options: { sheetName?: string; headerRow?: number; widths?: number[] } = {},
): Uint8Array {
  const headerRow = options.headerRow ?? 1,
    styled = options.headerRow !== undefined;
  if (
    !rows.length ||
    !Number.isInteger(headerRow) ||
    headerRow < 1 ||
    headerRow > rows.length ||
    !rows[headerRow - 1].length
  )
    throw new Error("导出表格缺少表头。");
  const lastCol = col(rows[headerRow - 1].length - 1);
  const widths = options.widths
    ? options.widths
        .map(
          (width, i) =>
            `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`,
        )
        .join("")
    : '<col min="1" max="20" width="24" customWidth="1"/>';
  const sheet =
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>` +
    rows
      .map(
        (r, i) =>
          '<row r="' +
          (i + 1) +
          (styled ? '" ht="42" customHeight="1">' : '">') +
          r
            .map(
              (v, j) =>
                '<c r="' +
                col(j) +
                (i + 1) +
                '" t="inlineStr"' +
                (styled
                  ? ` s="${i + 1 === headerRow ? 2 : i === 0 ? 3 : 1}"`
                  : "") +
                '><is><t xml:space="preserve">' +
                xml(v) +
                "</t></is></c>",
            )
            .join("") +
          "</row>",
      )
      .join("") +
    `</sheetData><autoFilter ref="A${headerRow}:` +
    lastCol +
    rows.length +
    '"/>' +
    (headerRow > 1
      ? `<mergeCells count="${headerRow - 1}">${Array.from({ length: headerRow - 1 }, (_, i) => `<mergeCell ref="A${i + 1}:${lastCol}${i + 1}"/>`).join("")}</mergeCells>`
      : "") +
    "</worksheet>";
  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(options.sheetName || "报名名单")}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml":
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="16"/><color rgb="FF7D2848"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7D2848"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    "xl/worksheets/sheet1.xml": sheet,
  };
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])),
  );
}
