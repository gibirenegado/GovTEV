import React, { useState } from 'react';
import {
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  downloadBulkImportTemplate,
  downloadBulkUpdateTemplate,
  exportRowsToExcel,
  parseBulkUpdateExcelFile,
  parseExcelImportFile,
  ParsedBulkUpdateRow,
  ParsedImportRow,
  validateParsedImportRow,
} from '../lib/excelService';
import {
  createTravelRecordWithChecklist,
  recordImportHistory,
  saveEmployee,
  saveOffice,
  updateTravelRecordDetails,
} from '../lib/firestoreService';
import {
  formatTimestamp,
  generateTevRefNumber,
} from '../lib/tevCalculations';

export function BulkImportView() {
  const {
    currentUser,
    employees,
    offices,
    travelRecords,
    documentaryRequirements,
    importHistory,
    settings,
    showToast,
  } = useWorkspace();

  const [mode, setMode] = useState<'import' | 'update'>('import');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [updateRows, setUpdateRows] = useState<ParsedBulkUpdateRow[]>([]);
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);

  const activeRequirements = documentaryRequirements
    .filter((r) => r.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSelectedFileName(file.name);
    setEditingRowIdx(null);

    try {
      if (mode === 'import') {
        const parsed = await parseExcelImportFile(
          file,
          employees,
          offices,
          travelRecords,
          documentaryRequirements
        );
        setImportRows(parsed);
        setUpdateRows([]);
        showToast('info', `Parsed ${parsed.length} row(s) from "${file.name}". Review validation status before confirming.`);
      } else {
        const parsed = await parseBulkUpdateExcelFile(file, travelRecords);
        setUpdateRows(parsed);
        setImportRows([]);
        showToast('info', `Analyzed ${parsed.length} row(s) for bulk update.`);
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to parse spreadsheet.');
    }
  };

  const handleRevalidateRow = (idx: number, patch: Partial<ParsedImportRow>) => {
    setImportRows((prev) => {
      const next = [...prev];
      const target = { ...next[idx], ...patch };
      const seenKeys = new Set<string>();
      next.forEach((r, i) => {
        if (i !== idx) {
          seenKeys.add(
            `${r.employeeName.trim().toLowerCase()}|${r.departureDate}|${r.returnDate}|${r.destination.trim().toLowerCase()}`
          );
        }
      });
      next[idx] = validateParsedImportRow(
        target,
        employees,
        offices,
        travelRecords,
        seenKeys
      );
      return next;
    });
  };

  const handleConfirmImport = async () => {
    if (!currentUser || processing) return;
    const validRows = importRows.filter((r) => r.validationStatus !== 'Invalid');
    const invalidRows = importRows.filter((r) => r.validationStatus === 'Invalid');
    if (validRows.length === 0) {
      showToast('error', 'No valid rows available to import.');
      return;
    }

    setProcessing(true);
    let successCount = 0;
    const errorSummaries: string[] = invalidRows.map(
      (r) => `Row ${r.rowNumber} (${r.employeeName || 'Unknown'}): ${r.errors.join('; ')}`
    );

    const runningRecords = [...travelRecords];

    try {
      for (const row of validRows) {
        try {
          const refNumber = generateTevRefNumber(
            runningRecords,
            settings.tevRefPrefix,
            settings.tevRefSeparator
          );
          const emp = employees.find((e) => e.id === row.matchedEmployeeId)!;
          const off = offices.find((o) => o.id === row.matchedOfficeId)!;

          const checklistDefs = activeRequirements.map((req) => ({
            requirementId: req.id,
            requirementName: req.name,
            isCustom: req.isCustom,
            sortOrder: req.sortOrder,
            applicable: Boolean(row.applicableRequirementFlags[req.id]),
          }));

          const newId = await createTravelRecordWithChecklist(
            currentUser,
            {
              tevRefNumber: refNumber,
              employeeId: emp.id,
              employeeCode: row.employeeCode || emp.employeeCode,
              employeeName: emp.fullName,
              officeId: off.id,
              officeName: off.name,
              position: row.position || emp.position,
              destination: row.destination,
              purpose: row.purpose,
              departureDate: row.departureDate,
              returnDate: row.returnDate,
              travelOrderNumber: row.travelOrderNumber,
              travelOrderDate: row.travelOrderDate,
              submissionDate: '',
              processingOfficer: '',
              remarks: row.remarks,
              isSampleData: false,
            },
            checklistDefs
          );

          runningRecords.push({
            id: newId,
            tevRefNumber: refNumber,
          } as any);
          successCount += 1;
        } catch (err: any) {
          errorSummaries.push(`Row ${row.rowNumber}: ${err?.message || 'Save failed'}`);
        }
      }

      await recordImportHistory(currentUser, {
        fileName: selectedFileName || 'bulk_import.xlsx',
        mode: 'import',
        totalRecords: importRows.length,
        successCount,
        failedCount: importRows.length - successCount,
        errorsSummary: errorSummaries,
      });

      showToast(
        'success',
        `Imported ${successCount} TEV record(s). ${importRows.length - successCount} skipped.`
      );
      setImportRows([]);
      setSelectedFileName('');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmBulkUpdate = async () => {
    if (!currentUser || processing) return;
    const rowsToUpdate = updateRows.filter(
      (r) => r.validationStatus === 'Valid' && r.matchedRecord && r.updatesPayload
    );
    if (rowsToUpdate.length === 0) {
      showToast('error', 'No valid changes detected to update.');
      return;
    }

    setProcessing(true);
    let successCount = 0;
    const errorSummaries: string[] = updateRows
      .filter((r) => r.validationStatus === 'Invalid')
      .map((r) => `Row ${r.rowNumber} (${r.tevRefNumber}): ${r.message}`);

    try {
      for (const row of rowsToUpdate) {
        const rec = row.matchedRecord!;
        const payload = row.updatesPayload!;
        try {
          await updateTravelRecordDetails(currentUser, rec, {
            employeeId: rec.employeeId,
            employeeCode: rec.employeeCode,
            employeeName: rec.employeeName,
            officeId: rec.officeId,
            officeName: rec.officeName,
            position: rec.position,
            destination: payload.destination,
            purpose: payload.purpose,
            departureDate: payload.departureDate,
            returnDate: payload.returnDate,
            travelOrderNumber: payload.travelOrderNumber,
            travelOrderDate: payload.travelOrderDate,
            submissionDate: payload.submissionDate,
            processingOfficer: payload.processingOfficer,
            completionDate: rec.completionDate,
            remarks: payload.remarks,
          });
          successCount += 1;
        } catch (err: any) {
          errorSummaries.push(`Row ${row.rowNumber} (${rec.tevRefNumber}): ${err?.message || 'Update failed'}`);
        }
      }

      await recordImportHistory(currentUser, {
        fileName: selectedFileName || 'bulk_update.xlsx',
        mode: 'update',
        totalRecords: updateRows.length,
        successCount,
        failedCount: updateRows.length - successCount,
        errorsSummary: errorSummaries,
      });

      showToast('success', `Bulk updated ${successCount} TEV record(s) with signature/approval statuses preserved.`);
      setUpdateRows([]);
      setSelectedFileName('');
    } finally {
      setProcessing(false);
    }
  };

  const validCount = importRows.filter((r) => r.validationStatus === 'Valid').length;
  const warningCount = importRows.filter((r) => r.validationStatus === 'Warning').length;
  const invalidCount = importRows.filter((r) => r.validationStatus === 'Invalid').length;

  const missingEntriesCount = importRows.filter(
    (r) => !r.matchedEmployeeId || !r.matchedOfficeId
  ).length;

  const handleAutoRegisterMissing = async () => {
    if (!currentUser || currentUser.role !== 'admin' || processing) return;
    setProcessing(true);
    try {
      const localOffices = [...offices];
      const localEmployees = [...employees];

      for (const row of importRows) {
        if (!row.officeName.trim()) continue;
        let off = localOffices.find(
          (o) =>
            o.name.toLowerCase() === row.officeName.trim().toLowerCase() ||
            o.code.toLowerCase() === row.officeName.trim().toLowerCase()
        );
        if (!off) {
          const code = row.officeName
            .trim()
            .split(/\s+/)
            .map((w) => w[0]?.toUpperCase() || '')
            .join('')
            .slice(0, 8) || 'OFF';
          const offId = await saveOffice(currentUser, {
            name: row.officeName.trim(),
            code,
            headName: '',
            status: 'active',
          });
          off = {
            id: offId,
            workspaceScope: 'gov-tev-office',
            name: row.officeName.trim(),
            code,
            headName: '',
            status: 'active',
            createdBy: currentUser.uid,
            createdAt: null,
            updatedAt: null,
          };
          localOffices.push(off);
        }

        if (row.employeeName.trim()) {
          const empExists = localEmployees.find(
            (e) =>
              (row.employeeCode &&
                e.employeeCode.toLowerCase() === row.employeeCode.trim().toLowerCase()) ||
              e.fullName.toLowerCase() === row.employeeName.trim().toLowerCase()
          );
          if (!empExists) {
            const empCode =
              row.employeeCode.trim() ||
              `EMP-${new Date().getFullYear()}-${String(localEmployees.length + 1).padStart(3, '0')}`;
            const empId = await saveEmployee(currentUser, {
              employeeCode: empCode,
              fullName: row.employeeName.trim(),
              officeId: off.id,
              officeName: off.name,
              position: row.position.trim() || 'Staff',
              status: 'active',
            });
            localEmployees.push({
              id: empId,
              workspaceScope: 'gov-tev-office',
              employeeCode: empCode,
              fullName: row.employeeName.trim(),
              officeId: off.id,
              officeName: off.name,
              position: row.position.trim() || 'Staff',
              status: 'active',
              createdBy: currentUser.uid,
              createdAt: null,
              updatedAt: null,
            });
          }
        }
      }

      const seenKeys = new Set<string>();
      setImportRows((prev) =>
        prev.map((r) =>
          validateParsedImportRow(r, localEmployees, localOffices, travelRecords, seenKeys)
        )
      );
      showToast('success', 'Registered missing offices/employees and re-validated rows.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to register missing entries.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Bulk Excel Import &amp; Record Updates
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Download the 23-column standardized Excel template, validate records before commit, or bulk update existing TEVs.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode('import');
              setUpdateRows([]);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'import' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Bulk New TEV Import
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('update');
              setImportRows([]);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'update' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Bulk Update Existing TEVs
          </button>
        </div>
      </div>

      {/* Template & Upload Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <h3 className="text-sm font-semibold text-slate-900">
            {mode === 'import'
              ? 'Step 1: Download Template & Upload Encoded Spreadsheet (.xlsx / .csv)'
              : 'Step 1: Download Current TEVs Sheet & Upload Updated Values'}
          </h3>
          <p className="text-xs text-slate-600">
            {mode === 'import'
              ? 'Includes all 23 required columns and an Instructions worksheet. Imported rows initialize all applicable documentary requirements as Not Yet Prepared.'
              : 'Uses TEV Reference Number as the unique identifier. Signature and approval statuses are never overwritten during bulk updates.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              mode === 'import'
                ? downloadBulkImportTemplate()
                : downloadBulkUpdateTemplate(travelRecords)
            }
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {mode === 'import' ? 'Download Excel Template' : 'Download Update Sheet'}
          </button>

          <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer">
            <Upload className="w-4 h-4" />
            Upload Excel / CSV File
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>
      </div>

      {/* Import Preview Table */}
      {mode === 'import' && importRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Import Preview — {selectedFileName}
              </h3>
              <div className="mt-1 flex items-center gap-4 text-xs">
                <span className="text-emerald-700 font-medium">Valid: {validCount}</span>
                <span className="text-amber-700 font-medium">Warnings: {warningCount}</span>
                <span className="text-red-700 font-medium">Invalid: {invalidCount}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentUser?.role === 'admin' && missingEntriesCount > 0 && (
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleAutoRegisterMissing}
                  className="px-3 py-2 text-xs font-medium text-sky-800 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 cursor-pointer"
                >
                  Register Missing Employees/Offices ({missingEntriesCount})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setImportRows([]);
                  setSelectedFileName('');
                }}
                className="px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={processing || validCount + warningCount === 0}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {processing
                  ? 'Importing...'
                  : `Confirm Import (${validCount + warningCount} Valid Rows)`}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Row</th>
                  <th className="py-2.5 px-3">Employee Name</th>
                  <th className="py-2.5 px-3">Office / Division</th>
                  <th className="py-2.5 px-3">Destination</th>
                  <th className="py-2.5 px-3">Travel Dates</th>
                  <th className="py-2.5 px-3 text-right">App. Req.</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Remarks / Errors</th>
                  <th className="py-2.5 px-3 text-right">Fix Row</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {importRows.map((row, idx) => (
                  <React.Fragment key={row.rowNumber}>
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono-num text-slate-500">#{row.rowNumber}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{row.employeeName || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-600">{row.officeName || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-700">{row.destination || '—'}</td>
                      <td className="py-2.5 px-3 font-mono-num text-slate-600 whitespace-nowrap">
                        {row.departureDate || '—'} to {row.returnDate || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num">{row.applicableCount}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.validationStatus === 'Valid' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                            <CheckCircle2 className="w-3 h-3" /> Valid
                          </span>
                        )}
                        {row.validationStatus === 'Warning' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                            <AlertTriangle className="w-3 h-3" /> Warning
                          </span>
                        )}
                        {row.validationStatus === 'Invalid' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-semibold">
                            <XCircle className="w-3 h-3" /> Invalid
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[280px]">
                        {[...row.errors, ...row.warnings].join(' · ') || 'Ready to import'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingRowIdx(editingRowIdx === idx ? null : idx)}
                          className="text-sky-700 hover:underline font-medium cursor-pointer"
                        >
                          {editingRowIdx === idx ? 'Done' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                    {editingRowIdx === idx && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="p-4 border-t border-slate-200">
                          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            <select
                              value={row.employeeName}
                              onChange={(e) => {
                                const emp = employees.find((em) => em.fullName === e.target.value);
                                handleRevalidateRow(idx, {
                                  employeeName: e.target.value,
                                  employeeCode: emp?.employeeCode || row.employeeCode,
                                  officeName: emp?.officeName || row.officeName,
                                });
                              }}
                              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                            >
                              <option value={row.employeeName}>{row.employeeName || 'Select Employee...'}</option>
                              {employees.map((em) => (
                                <option key={em.id} value={em.fullName}>
                                  {em.fullName}
                                </option>
                              ))}
                            </select>
                            <select
                              value={row.officeName}
                              onChange={(e) => handleRevalidateRow(idx, { officeName: e.target.value })}
                              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                            >
                              <option value={row.officeName}>{row.officeName || 'Select Office...'}</option>
                              {offices.map((of) => (
                                <option key={of.id} value={of.name}>
                                  {of.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={row.destination}
                              onChange={(e) => handleRevalidateRow(idx, { destination: e.target.value })}
                              placeholder="Destination"
                              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                            />
                            <input
                              type="date"
                              value={row.departureDate === 'INVALID' ? '' : row.departureDate}
                              onChange={(e) => handleRevalidateRow(idx, { departureDate: e.target.value })}
                              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono-num"
                            />
                            <input
                              type="date"
                              value={row.returnDate === 'INVALID' ? '' : row.returnDate}
                              onChange={(e) => handleRevalidateRow(idx, { returnDate: e.target.value })}
                              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono-num"
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk Update Diff Preview */}
      {mode === 'update' && updateRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Bulk Update Diff Preview — {selectedFileName}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Only travel metadata fields are updated. Existing checklist signatures and approvals remain protected.
              </p>
            </div>
            <button
              type="button"
              disabled={processing || updateRows.filter((r) => r.validationStatus === 'Valid').length === 0}
              onClick={handleConfirmBulkUpdate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {processing ? 'Applying Updates...' : 'Confirm Bulk Update'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Row</th>
                  <th className="py-2.5 px-3">TEV Ref No.</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Original vs Updated Values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {updateRows.map((u) => (
                  <tr key={u.rowNumber}>
                    <td className="py-2.5 px-3 font-mono-num">#{u.rowNumber}</td>
                    <td className="py-2.5 px-3 font-mono-num font-semibold">{u.tevRefNumber}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded font-semibold border ${
                          u.validationStatus === 'Valid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : u.validationStatus === 'Warning'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {u.validationStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {u.changes.length === 0 ? (
                        <span className="text-slate-600">{u.message}</span>
                      ) : (
                        <div className="space-y-1">
                          {u.changes.map((c) => (
                            <div key={c.field}>
                              <span className="font-semibold text-slate-800">{c.label}:</span>{' '}
                              <span className="line-through text-slate-400">{c.oldVal}</span>{' '}
                              <span className="text-emerald-700 font-medium">→ {c.newVal}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* E. Import History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Import &amp; Bulk Update History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-3">File Name</th>
                <th className="py-2.5 px-3">Mode</th>
                <th className="py-2.5 px-3">Date &amp; Time</th>
                <th className="py-2.5 px-3 text-right">Total</th>
                <th className="py-2.5 px-3 text-right">Success</th>
                <th className="py-2.5 px-3 text-right">Failed</th>
                <th className="py-2.5 px-3">Imported By</th>
                <th className="py-2.5 px-3 text-right">Error Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {importHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No bulk imports recorded yet.
                  </td>
                </tr>
              ) : (
                importHistory.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-900">{h.fileName}</td>
                    <td className="py-2.5 px-3 capitalize">{h.mode}</td>
                    <td className="py-2.5 px-3 font-mono-num text-slate-600">{formatTimestamp(h.createdAt)}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num">{h.totalRecords}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-emerald-700">{h.successCount}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-red-700">{h.failedCount}</td>
                    <td className="py-2.5 px-3 text-slate-700">{h.importedByName}</td>
                    <td className="py-2.5 px-3 text-right">
                      {h.errorsSummary.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            exportRowsToExcel(
                              `Import_Errors_${h.id}`,
                              'Errors',
                              h.errorsSummary.map((msg, i) => ({ '#': i + 1, Error: msg }))
                            )
                          }
                          className="text-sky-700 hover:underline font-medium cursor-pointer"
                        >
                          Download ({h.errorsSummary.length})
                        </button>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
