import * as XLSX from 'xlsx';
import {
  DocumentaryRequirement,
  Employee,
  Office,
  TravelRecord,
  TravelRequirementChecklist,
} from '../types/tev';
import { calculateTravelDays, checkOverlappingTravel } from './tevCalculations';

export const EXCEL_TEMPLATE_COLUMNS = [
  'Employee Name',
  'Office/Division/Unit',
  'Position/Designation',
  'Employee ID',
  'Destination/Location',
  'Purpose of Travel',
  'Date of Departure',
  'Date of Return',
  'Travel Order Number',
  'Travel Order Date',
  'Remarks',
  'Travel Order',
  'Itinerary of Travel',
  'Certificate of Appearance',
  'Certificate of Travel Completed',
  'Back to Office Report',
  'ORS',
  'Disbursement Voucher',
  'Trip Ticket',
  'Proposed Itinerary of Travel',
  'Authority to Travel Certification',
  'Official Receipts',
  'Other Supporting Documents',
] as const;

export const BULK_UPDATE_COLUMNS = [
  'TEV Reference Number',
  'Employee Name',
  'Office/Division/Unit',
  'Position/Designation',
  'Destination/Location',
  'Purpose of Travel',
  'Date of Departure',
  'Date of Return',
  'Travel Order Number',
  'Travel Order Date',
  'Date of Submission',
  'Processing Officer',
  'Remarks',
] as const;

export const EXCEL_TO_REQUIREMENT_MATCH: Array<{ col: string; keywords: string[] }> = [
  { col: 'Travel Order', keywords: ['travel order'] },
  { col: 'Itinerary of Travel', keywords: ['itinerary of travel'] },
  { col: 'Certificate of Appearance', keywords: ['certificate of appearance'] },
  { col: 'Certificate of Travel Completed', keywords: ['certificate of travel completed'] },
  { col: 'Back to Office Report', keywords: ['back to office report'] },
  { col: 'ORS', keywords: ['obligation request', 'ors'] },
  { col: 'Disbursement Voucher', keywords: ['disbursement voucher'] },
  { col: 'Trip Ticket', keywords: ['trip ticket'] },
  { col: 'Proposed Itinerary of Travel', keywords: ['proposed itinerary'] },
  { col: 'Authority to Travel Certification', keywords: ['authority to travel'] },
  { col: 'Official Receipts', keywords: ['official receipts'] },
  { col: 'Other Supporting Documents', keywords: ['other supporting'] },
];

export function downloadBulkImportTemplate(): void {
  const wb = XLSX.utils.book_new();

  const sampleRow: Record<string, string> = {
    'Employee Name': 'Juan Dela Cruz',
    'Office/Division/Unit': 'Planning and Monitoring Unit',
    'Position/Designation': 'Senior Planning Officer',
    'Employee ID': 'EMP-2026-001',
    'Destination/Location': 'Iloilo City, Iloilo',
    'Purpose of Travel': 'Regional Planning Consultation',
    'Date of Departure': '2026-12-10',
    'Date of Return': '2026-12-12',
    'Travel Order Number': 'TO-2026-1205',
    'Travel Order Date': '2026-12-04',
    'Remarks': 'Sample row — replace or delete before uploading',
    'Travel Order': 'YES',
    'Itinerary of Travel': 'YES',
    'Certificate of Appearance': 'YES',
    'Certificate of Travel Completed': 'YES',
    'Back to Office Report': 'YES',
    'ORS': 'YES',
    'Disbursement Voucher': 'YES',
    'Trip Ticket': 'NO',
    'Proposed Itinerary of Travel': 'NO',
    'Authority to Travel Certification': 'NO',
    'Official Receipts': 'YES',
    'Other Supporting Documents': 'NO',
  };

  const wsData = XLSX.utils.json_to_sheet([sampleRow], {
    header: [...EXCEL_TEMPLATE_COLUMNS],
  });
  wsData['!cols'] = EXCEL_TEMPLATE_COLUMNS.map((col) => ({
    wch: Math.max(col.length + 4, 20),
  }));
  XLSX.utils.book_append_sheet(wb, wsData, 'TEV_Import_Template');

  const instructionsRows = [
    ['GOVTEV BULK EXCEL IMPORT — INSTRUCTIONS'],
    [''],
    ['Section', 'Rule / Guidance'],
    ['1. Required Fields', 'Employee Name, Office/Division/Unit, Destination/Location, Purpose of Travel, Date of Departure, and Date of Return are mandatory.'],
    ['2. Date Formats', 'Use YYYY-MM-DD format (e.g., 2026-12-10). Standard Excel date cells are also parsed automatically. Date of Return must be on or after Date of Departure.'],
    ['3. Employee & Office Matching', 'Employee Name / Employee ID and Office/Division/Unit should match registered records in the system. Unregistered entries trigger a validation warning or can be registered prior to import.'],
    ['4. Documentary Requirements (Cols 12-23)', 'Enter ONLY "YES" (Applicable) or "NO" (Not Applicable). Blank values default to "NO".'],
    ['5. Processing Status Rule', 'Bulk import initializes all applicable documentary requirements as "Not Yet Prepared". It never automatically marks documents as Submitted, Signed, or Approved.'],
    ['6. Duplicate & Overlap Guard', 'Rows with matching Employee + Travel Dates + Destination already in the database are flagged as duplicates. Overlapping dates for the same employee show a warning.'],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsRows);
  wsInstructions['!cols'] = [{ wch: 36 }, { wch: 95 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  XLSX.writeFile(wb, 'GovTEV_Bulk_Import_Template.xlsx');
}

export function downloadBulkUpdateTemplate(records: TravelRecord[]): void {
  const wb = XLSX.utils.book_new();
  const rows = records.slice(0, 25).map((r) => ({
    'TEV Reference Number': r.tevRefNumber,
    'Employee Name': r.employeeName,
    'Office/Division/Unit': r.officeName,
    'Position/Designation': r.position,
    'Destination/Location': r.destination,
    'Purpose of Travel': r.purpose,
    'Date of Departure': r.departureDate,
    'Date of Return': r.returnDate,
    'Travel Order Number': r.travelOrderNumber,
    'Travel Order Date': r.travelOrderDate,
    'Date of Submission': r.submissionDate,
    'Processing Officer': r.processingOfficer,
    'Remarks': r.remarks,
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...BULK_UPDATE_COLUMNS] });
  ws['!cols'] = BULK_UPDATE_COLUMNS.map((c) => ({ wch: Math.max(c.length + 4, 20) }));
  XLSX.utils.book_append_sheet(wb, ws, 'TEV_Bulk_Update');
  XLSX.writeFile(wb, 'GovTEV_Bulk_Update_Template.xlsx');
}

export function normalizeExcelDate(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number') {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const str = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return 'INVALID';
}

export interface ParsedImportRow {
  rowNumber: number;
  employeeName: string;
  officeName: string;
  position: string;
  employeeCode: string;
  matchedEmployeeId: string;
  matchedOfficeId: string;
  destination: string;
  purpose: string;
  departureDate: string;
  returnDate: string;
  travelDays: number;
  travelOrderNumber: string;
  travelOrderDate: string;
  remarks: string;
  applicableRequirementFlags: Record<string, boolean>;
  applicableCount: number;
  validationStatus: 'Valid' | 'Warning' | 'Invalid';
  errors: string[];
  warnings: string[];
}

export function validateParsedImportRow(
  row: Omit<ParsedImportRow, 'matchedEmployeeId' | 'matchedOfficeId' | 'travelDays' | 'applicableCount' | 'validationStatus' | 'errors' | 'warnings'>,
  employees: Employee[],
  offices: Office[],
  existingRecords: TravelRecord[],
  seenKeysInFile: Set<string>
): ParsedImportRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!row.employeeName.trim()) errors.push('Missing Employee Name');
  if (!row.officeName.trim()) errors.push('Missing Office/Division');
  if (!row.destination.trim()) errors.push('Missing Destination');
  if (!row.purpose.trim()) errors.push('Missing Purpose of Travel');

  if (!row.departureDate || row.departureDate === 'INVALID') {
    errors.push('Invalid or missing Date of Departure (expected YYYY-MM-DD)');
  }
  if (!row.returnDate || row.returnDate === 'INVALID') {
    errors.push('Invalid or missing Date of Return (expected YYYY-MM-DD)');
  }
  if (
    row.departureDate &&
    row.returnDate &&
    row.departureDate !== 'INVALID' &&
    row.returnDate !== 'INVALID' &&
    row.returnDate < row.departureDate
  ) {
    errors.push('Date of Return cannot be earlier than Date of Departure');
  }
  if (row.travelOrderDate === 'INVALID') {
    errors.push('Invalid Travel Order Date format');
  }

  const empMatch = employees.find(
    (e) =>
      (row.employeeCode && e.employeeCode.toLowerCase() === row.employeeCode.trim().toLowerCase()) ||
      e.fullName.toLowerCase() === row.employeeName.trim().toLowerCase()
  );
  if (!empMatch) {
    errors.push(`Unregistered employee "${row.employeeName || row.employeeCode}"`);
  }

  const offMatch = offices.find(
    (o) =>
      o.name.toLowerCase() === row.officeName.trim().toLowerCase() ||
      o.code.toLowerCase() === row.officeName.trim().toLowerCase()
  );
  if (!offMatch) {
    errors.push(`Unregistered office "${row.officeName}"`);
  }

  const dedupeKey = `${row.employeeName.trim().toLowerCase()}|${row.departureDate}|${row.returnDate}|${row.destination.trim().toLowerCase()}`;
  if (seenKeysInFile.has(dedupeKey)) {
    errors.push('Duplicate row inside uploaded spreadsheet');
  }
  seenKeysInFile.add(dedupeKey);

  const dbDuplicate = existingRecords.find(
    (r) =>
      r.employeeName.toLowerCase() === row.employeeName.trim().toLowerCase() &&
      r.departureDate === row.departureDate &&
      r.returnDate === row.returnDate &&
      r.destination.toLowerCase() === row.destination.trim().toLowerCase()
  );
  if (dbDuplicate) {
    errors.push(`Duplicate of existing record ${dbDuplicate.tevRefNumber}`);
  } else if (empMatch && row.departureDate && row.returnDate && row.departureDate !== 'INVALID' && row.returnDate !== 'INVALID') {
    const overlaps = checkOverlappingTravel(empMatch.id, row.departureDate, row.returnDate, existingRecords);
    if (overlaps.length > 0) {
      warnings.push(`Overlaps travel schedule with ${overlaps.map((o) => o.tevRefNumber).join(', ')}`);
    }
  }

  const applicableCount = Object.values(row.applicableRequirementFlags).filter(Boolean).length;
  if (applicableCount === 0) {
    warnings.push('No documentary requirements marked YES');
  }

  const validationStatus: 'Valid' | 'Warning' | 'Invalid' =
    errors.length > 0 ? 'Invalid' : warnings.length > 0 ? 'Warning' : 'Valid';

  return {
    ...row,
    matchedEmployeeId: empMatch?.id || '',
    matchedOfficeId: offMatch?.id || '',
    position: row.position.trim() || empMatch?.position || '',
    employeeCode: row.employeeCode.trim() || empMatch?.employeeCode || '',
    travelDays:
      row.departureDate && row.returnDate && row.departureDate !== 'INVALID' && row.returnDate !== 'INVALID'
        ? calculateTravelDays(row.departureDate, row.returnDate)
        : 1,
    applicableCount,
    validationStatus,
    errors,
    warnings,
  };
}

export async function parseExcelImportFile(
  file: File,
  employees: Employee[],
  offices: Office[],
  existingRecords: TravelRecord[],
  masterRequirements: DocumentaryRequirement[]
): Promise<ParsedImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

  const seenKeys = new Set<string>();
  const results: ParsedImportRow[] = [];

  for (let idx = 0; idx < rawRows.length; idx++) {
    const raw = rawRows[idx];
    const rowNumber = idx + 2; // 1-based + header row

    const applicableRequirementFlags: Record<string, boolean> = {};
    for (const req of masterRequirements.filter((r) => r.status === 'active')) {
      const mapping = EXCEL_TO_REQUIREMENT_MATCH.find((m) =>
        m.keywords.some((kw) => req.name.toLowerCase().includes(kw))
      );
      let flag = false;
      if (mapping) {
        const cellVal = String(raw[mapping.col] ?? '').trim().toUpperCase();
        if (cellVal && cellVal !== 'YES' && cellVal !== 'NO') {
          // Handled as invalid value below
        }
        flag = cellVal === 'YES';
      }
      applicableRequirementFlags[req.id] = flag;
    }

    const baseRow = {
      rowNumber,
      employeeName: String(raw['Employee Name'] ?? '').trim(),
      officeName: String(raw['Office/Division/Unit'] ?? '').trim(),
      position: String(raw['Position/Designation'] ?? '').trim(),
      employeeCode: String(raw['Employee ID'] ?? '').trim(),
      destination: String(raw['Destination/Location'] ?? '').trim(),
      purpose: String(raw['Purpose of Travel'] ?? '').trim(),
      departureDate: normalizeExcelDate(raw['Date of Departure']),
      returnDate: normalizeExcelDate(raw['Date of Return']),
      travelOrderNumber: String(raw['Travel Order Number'] ?? '').trim(),
      travelOrderDate: normalizeExcelDate(raw['Travel Order Date']),
      remarks: String(raw['Remarks'] ?? '').trim(),
      applicableRequirementFlags,
    };

    const validated = validateParsedImportRow(baseRow, employees, offices, existingRecords, seenKeys);

    // Check explicit YES/NO validity for documentary requirement columns
    for (const m of EXCEL_TO_REQUIREMENT_MATCH) {
      const val = String(raw[m.col] ?? '').trim().toUpperCase();
      if (val !== '' && val !== 'YES' && val !== 'NO') {
        validated.errors.push(`Column "${m.col}" must be YES or NO (found "${val}")`);
        validated.validationStatus = 'Invalid';
      }
    }

    results.push(validated);
  }

  return results;
}

export interface ParsedBulkUpdateRow {
  rowNumber: number;
  tevRefNumber: string;
  matchedRecord: TravelRecord | null;
  changes: Array<{ field: string; label: string; oldVal: string; newVal: string }>;
  updatesPayload: {
    destination: string;
    purpose: string;
    departureDate: string;
    returnDate: string;
    travelOrderNumber: string;
    travelOrderDate: string;
    submissionDate: string;
    processingOfficer: string;
    remarks: string;
  } | null;
  validationStatus: 'Valid' | 'Warning' | 'Invalid';
  message: string;
}

export async function parseBulkUpdateExcelFile(
  file: File,
  existingRecords: TravelRecord[]
): Promise<ParsedBulkUpdateRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

  return rawRows.map((raw, idx) => {
    const rowNumber = idx + 2;
    const ref = String(raw['TEV Reference Number'] ?? '').trim();
    if (!ref) {
      return {
        rowNumber,
        tevRefNumber: '—',
        matchedRecord: null,
        changes: [],
        updatesPayload: null,
        validationStatus: 'Invalid',
        message: 'Missing TEV Reference Number',
      };
    }

    const rec = existingRecords.find((r) => r.tevRefNumber.toLowerCase() === ref.toLowerCase());
    if (!rec) {
      return {
        rowNumber,
        tevRefNumber: ref,
        matchedRecord: null,
        changes: [],
        updatesPayload: null,
        validationStatus: 'Invalid',
        message: `TEV Reference Number "${ref}" not found`,
      };
    }

    const dep = normalizeExcelDate(raw['Date of Departure']) || rec.departureDate;
    const ret = normalizeExcelDate(raw['Date of Return']) || rec.returnDate;
    const toDate = raw['Travel Order Date'] ? normalizeExcelDate(raw['Travel Order Date']) : rec.travelOrderDate;
    const subDate = raw['Date of Submission'] ? normalizeExcelDate(raw['Date of Submission']) : rec.submissionDate;

    if (dep === 'INVALID' || ret === 'INVALID' || toDate === 'INVALID' || subDate === 'INVALID') {
      return {
        rowNumber,
        tevRefNumber: ref,
        matchedRecord: rec,
        changes: [],
        updatesPayload: null,
        validationStatus: 'Invalid',
        message: 'Invalid date format (expected YYYY-MM-DD)',
      };
    }
    if (ret < dep) {
      return {
        rowNumber,
        tevRefNumber: ref,
        matchedRecord: rec,
        changes: [],
        updatesPayload: null,
        validationStatus: 'Invalid',
        message: 'Date of Return cannot be earlier than Date of Departure',
      };
    }

    const nextPayload = {
      destination: String(raw['Destination/Location'] || rec.destination).trim(),
      purpose: String(raw['Purpose of Travel'] || rec.purpose).trim(),
      departureDate: dep,
      returnDate: ret,
      travelOrderNumber: String(raw['Travel Order Number'] ?? rec.travelOrderNumber).trim(),
      travelOrderDate: toDate,
      submissionDate: subDate,
      processingOfficer: String(raw['Processing Officer'] ?? rec.processingOfficer).trim(),
      remarks: String(raw['Remarks'] ?? rec.remarks).trim(),
    };

    const changes: Array<{ field: string; label: string; oldVal: string; newVal: string }> = [];
    const checks: Array<[keyof typeof nextPayload, string, string]> = [
      ['destination', 'Destination', rec.destination],
      ['purpose', 'Purpose', rec.purpose],
      ['departureDate', 'Departure Date', rec.departureDate],
      ['returnDate', 'Return Date', rec.returnDate],
      ['travelOrderNumber', 'Travel Order No.', rec.travelOrderNumber],
      ['travelOrderDate', 'Travel Order Date', rec.travelOrderDate],
      ['submissionDate', 'Submission Date', rec.submissionDate],
      ['processingOfficer', 'Processing Officer', rec.processingOfficer],
      ['remarks', 'Remarks', rec.remarks],
    ];

    for (const [field, label, oldVal] of checks) {
      if (nextPayload[field] !== oldVal) {
        changes.push({ field, label, oldVal: oldVal || '—', newVal: nextPayload[field] || '—' });
      }
    }

    if (changes.length === 0) {
      return {
        rowNumber,
        tevRefNumber: rec.tevRefNumber,
        matchedRecord: rec,
        changes: [],
        updatesPayload: nextPayload,
        validationStatus: 'Warning',
        message: 'No field changes detected (signatures & approvals remain protected)',
      };
    }

    return {
      rowNumber,
      tevRefNumber: rec.tevRefNumber,
      matchedRecord: rec,
      changes,
      updatesPayload: nextPayload,
      validationStatus: 'Valid',
      message: `${changes.length} field(s) ready to update (signatures & approvals preserved)`,
    };
  });
}

export function exportRowsToExcel(
  filename: string,
  sheetName: string,
  rows: Array<Record<string, string | number>>
): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportRowsToCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildTravelRecordsExportRows(
  records: TravelRecord[],
  checklists: TravelRequirementChecklist[]
): Array<Record<string, string | number>> {
  return records.map((r) => {
    const items = checklists.filter((c) => c.tevId === r.id && c.applicable);
    const pendingList = items
      .filter((i) => !(i.prepared && i.submitted && i.signed && i.approved))
      .map((i) => i.requirementName)
      .join('; ');
    return {
      'TEV Reference Number': r.tevRefNumber,
      'Employee Name': r.employeeName,
      'Employee ID': r.employeeCode,
      'Office/Division': r.officeName,
      'Position': r.position,
      'Destination': r.destination,
      'Purpose': r.purpose,
      'Departure Date': r.departureDate,
      'Return Date': r.returnDate,
      'Travel Days': r.travelDays,
      'Travel Order No.': r.travelOrderNumber,
      'Applicable Requirements': r.applicableCount,
      'Completed Requirements': r.completedCount,
      'Compliance (%)': `${r.compliancePercentage}%`,
      'Overall Status': r.overallStatus,
      'Processing Officer': r.processingOfficer || '—',
      'Pending Requirements': pendingList || 'None',
    };
  });
}
