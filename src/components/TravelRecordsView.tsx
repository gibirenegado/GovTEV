import { useMemo, useState } from 'react';
import {
  Search,
  Eye,
  Edit3,
  CheckSquare,
  Upload,
  Printer,
  Trash2,
  RotateCcw,
  ArrowUpDown,
  FileSpreadsheet,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  deleteAllSampleRecords,
  deleteTravelRecordCascade,
} from '../lib/firestoreService';
import {
  buildTravelRecordsExportRows,
  exportRowsToExcel,
} from '../lib/excelService';
import { exportIndividualTevPdf } from '../lib/pdfService';
import {
  getOverallStatusStyle,
  isTevOverdue,
} from '../lib/tevCalculations';
import { TravelRecord, TravelRecordFilters } from '../types/tev';

interface TravelRecordsViewProps {
  filters: TravelRecordFilters;
  onChangeFilters: (next: TravelRecordFilters) => void;
  onResetFilters: () => void;
  onViewTev: (tevId: string) => void;
  onEditTev: (tev: TravelRecord) => void;
}

type SortKey = 'tevRefNumber' | 'employeeName' | 'departureDate' | 'compliancePercentage' | 'overallStatus';

export function TravelRecordsView({
  filters,
  onChangeFilters,
  onResetFilters,
  onViewTev,
  onEditTev,
}: TravelRecordsViewProps) {
  const {
    currentUser,
    travelRecords,
    checklists,
    attachments,
    employees,
    offices,
    settings,
    showToast,
  } = useWorkspace();

  const [sortKey, setSortKey] = useState<SortKey>('departureDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<TravelRecord | null>(null);
  const [busy, setBusy] = useState(false);

  const pageSize = 12;
  const isAdmin = currentUser?.role === 'admin';
  const canEdit = currentUser?.role !== 'viewer';

  const years = useMemo(() => {
    const set = new Set<string>();
    travelRecords.forEach((r) => {
      if (r.departureDate) set.add(r.departureDate.slice(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [travelRecords]);

  const officers = useMemo(() => {
    const set = new Set<string>();
    travelRecords.forEach((r) => {
      if (r.processingOfficer) set.add(r.processingOfficer);
    });
    return Array.from(set).sort();
  }, [travelRecords]);

  const filteredRecords = useMemo(() => {
    return travelRecords.filter((rec) => {
      const recChecklists = checklists.filter((c) => c.tevId === rec.id);
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hit =
          rec.tevRefNumber.toLowerCase().includes(q) ||
          rec.employeeName.toLowerCase().includes(q) ||
          rec.officeName.toLowerCase().includes(q) ||
          rec.destination.toLowerCase().includes(q) ||
          rec.travelOrderNumber.toLowerCase().includes(q) ||
          rec.purpose.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (filters.employeeId && rec.employeeId !== filters.employeeId) return false;
      if (filters.officeId && rec.officeId !== filters.officeId) return false;
      if (
        filters.destination &&
        !rec.destination.toLowerCase().includes(filters.destination.toLowerCase())
      ) {
        return false;
      }
      if (filters.dateFrom && rec.departureDate < filters.dateFrom) return false;
      if (filters.dateTo && rec.returnDate > filters.dateTo) return false;
      if (filters.year && !rec.departureDate.startsWith(filters.year)) return false;
      if (filters.month && rec.departureDate.slice(5, 7) !== filters.month) return false;
      if (filters.overallStatus && rec.overallStatus !== filters.overallStatus) return false;
      if (
        filters.processingOfficer &&
        rec.processingOfficer !== filters.processingOfficer
      ) {
        return false;
      }

      if (filters.specialFilter === 'ongoing') {
        if (['Completed', 'Not Started', 'On Hold'].includes(rec.overallStatus)) return false;
      } else if (filters.specialFilter === 'pending-docs') {
        if (rec.applicableCount <= rec.completedCount) return false;
      } else if (filters.specialFilter === 'for-signature') {
        const hasSig = recChecklists.some((c) => c.applicable && c.submitted && !c.signed);
        if (!hasSig && rec.overallStatus !== 'For Signature') return false;
      } else if (filters.specialFilter === 'for-approval') {
        const hasApp = recChecklists.some((c) => c.applicable && c.signed && !c.approved);
        if (!hasApp && rec.overallStatus !== 'For Approval') return false;
      } else if (filters.specialFilter === 'overdue') {
        if (!isTevOverdue(rec, recChecklists, settings.overdueThresholdDays)) return false;
      }

      return true;
    });
  }, [travelRecords, checklists, filters, settings.overdueThresholdDays]);

  const sortedRecords = useMemo(() => {
    const arr = [...filteredRecords];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'compliancePercentage') {
        cmp = a.compliancePercentage - b.compliancePercentage;
      } else {
        cmp = String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filteredRecords, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRecords = sortedRecords.slice((safePage - 1) * pageSize, safePage * pageSize);

  const sampleCount = useMemo(
    () => travelRecords.filter((r) => r.isSampleData).length,
    [travelRecords]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleConfirmDelete = async () => {
    if (!currentUser || !deleteTarget || !isAdmin || busy) return;
    setBusy(true);
    try {
      const recChks = checklists.filter((c) => c.tevId === deleteTarget.id);
      const recAtts = attachments.filter((a) => a.tevId === deleteTarget.id);
      await deleteTravelRecordCascade(currentUser, deleteTarget, recChks, recAtts);
      showToast('success', `Deleted TEV ${deleteTarget.tevRefNumber}.`);
      setDeleteTarget(null);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to delete TEV record.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSamples = async () => {
    if (!currentUser || !isAdmin || busy) return;
    setBusy(true);
    try {
      const count = await deleteAllSampleRecords(
        currentUser,
        travelRecords,
        checklists,
        attachments
      );
      showToast('success', `Removed ${count} demonstration sample record(s).`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to remove sample records.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Travel Records Database</h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Showing {filteredRecords.length} of {travelRecords.length} recorded TEV transactions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && sampleCount > 0 && (
            <button
              type="button"
              onClick={handleDeleteSamples}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Sample Records ({sampleCount})
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              exportRowsToExcel(
                'GovTEV_Travel_Records',
                'Travel_Records',
                buildTravelRecordsExportRows(sortedRecords, checklists)
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Filtered Excel
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => {
                setPage(1);
                onChangeFilters({ ...filters, search: e.target.value });
              }}
              placeholder="Search TEV Ref, Employee, Destination, TO No..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <select
            value={filters.officeId}
            onChange={(e) => {
              setPage(1);
              onChangeFilters({ ...filters, officeId: e.target.value });
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Offices / Divisions</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>

          <select
            value={filters.employeeId}
            onChange={(e) => {
              setPage(1);
              onChangeFilters({ ...filters, employeeId: e.target.value });
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Employees</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName}
              </option>
            ))}
          </select>

          <select
            value={filters.overallStatus}
            onChange={(e) => {
              setPage(1);
              onChangeFilters({ ...filters, overallStatus: e.target.value, specialFilter: '' });
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Overall Statuses</option>
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="For Submission">For Submission</option>
            <option value="For Signature">For Signature</option>
            <option value="For Approval">For Approval</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-1">
          <select
            value={filters.specialFilter}
            onChange={(e) => {
              setPage(1);
              onChangeFilters({ ...filters, specialFilter: e.target.value as any, overallStatus: '' });
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Requirement States</option>
            <option value="ongoing">Ongoing TEVs</option>
            <option value="pending-docs">Incomplete Requirements</option>
            <option value="for-signature">Pending Signatures</option>
            <option value="for-approval">Pending Approvals</option>
            <option value="overdue">Overdue / Returned</option>
          </select>

          <select
            value={filters.processingOfficer}
            onChange={(e) => {
              setPage(1);
              onChangeFilters({ ...filters, processingOfficer: e.target.value });
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Processing Officers</option>
            {officers.map((off) => (
              <option key={off} value={off}>
                {off}
              </option>
            ))}
          </select>

          <select
            value={filters.year}
            onChange={(e) => {
              setPage(1);
              onChangeFilters({ ...filters, year: e.target.value });
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            value={filters.month}
            onChange={(e) => {
              setPage(1);
              onChangeFilters({ ...filters, month: e.target.value });
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Months</option>
            {[
              ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
              ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
              ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
            ].map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => {
              setPage(1);
              onChangeFilters({ ...filters, dateFrom: e.target.value });
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-num"
            title="Departure From"
          />

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => {
                setPage(1);
                onChangeFilters({ ...filters, dateTo: e.target.value });
              }}
              className="flex-1 min-w-0 px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-num"
              title="Return To"
            />
            <button
              type="button"
              onClick={() => {
                setPage(1);
                onResetFilters();
              }}
              className="p-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              title="Reset Filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Travel Records Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-3">
                  <button type="button" onClick={() => handleSort('tevRefNumber')} className="inline-flex items-center gap-1 cursor-pointer">
                    TEV Ref <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-3">
                  <button type="button" onClick={() => handleSort('employeeName')} className="inline-flex items-center gap-1 cursor-pointer">
                    Employee <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-3">Office / Division</th>
                <th className="py-3 px-3">Destination</th>
                <th className="py-3 px-3">
                  <button type="button" onClick={() => handleSort('departureDate')} className="inline-flex items-center gap-1 cursor-pointer">
                    Travel Dates <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-3 text-right">Days</th>
                <th className="py-3 px-3 text-right">App.</th>
                <th className="py-3 px-3 text-right">Done</th>
                <th className="py-3 px-3">
                  <button type="button" onClick={() => handleSort('compliancePercentage')} className="inline-flex items-center gap-1 cursor-pointer">
                    Compliance <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-3">
                  <button type="button" onClick={() => handleSort('overallStatus')} className="inline-flex items-center gap-1 cursor-pointer">
                    Status <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {pagedRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    No travel records match the selected filters.
                  </td>
                </tr>
              ) : (
                pagedRecords.map((rec) => {
                  const style = getOverallStatusStyle(rec.overallStatus);
                  const recItems = checklists.filter((c) => c.tevId === rec.id);
                  const overdue = isTevOverdue(rec, recItems, settings.overdueThresholdDays);

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                        <div>{rec.tevRefNumber}</div>
                        {rec.isSampleData && (
                          <span className="text-[10px] font-sans font-medium text-amber-700">
                            Sample Data
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900 whitespace-nowrap">
                        {rec.employeeName}
                      </td>
                      <td className="py-3 px-3 text-slate-600 max-w-[160px] truncate" title={rec.officeName}>
                        {rec.officeName}
                      </td>
                      <td className="py-3 px-3 text-slate-700 max-w-[170px] truncate" title={rec.destination}>
                        {rec.destination}
                      </td>
                      <td className="py-3 px-3 font-mono-num text-slate-600 whitespace-nowrap">
                        {rec.departureDate} – {rec.returnDate}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num text-slate-700">
                        {rec.travelDays}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num text-slate-700">
                        {rec.applicableCount}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-num text-slate-700">
                        {rec.completedCount}
                      </td>
                      <td className="py-3 px-3 min-w-[120px]">
                        {rec.applicableCount === 0 ? (
                          <span className="text-slate-400">No Req. Selected</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  rec.compliancePercentage === 100 ? 'bg-emerald-600' : 'bg-sky-600'
                                }`}
                                style={{ width: `${rec.compliancePercentage}%` }}
                              />
                            </div>
                            <span className="font-mono-num font-semibold text-slate-800 w-9 text-right">
                              {rec.compliancePercentage}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${style.bgClass} ${style.textClass} ${style.borderClass}`}
                        >
                          {rec.overallStatus}
                        </span>
                        {overdue && (
                          <span className="ml-1.5 text-[10px] font-semibold text-red-600">
                            Overdue
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onViewTev(rec.id)}
                            className="p-1.5 text-slate-600 hover:text-sky-700 hover:bg-sky-50 rounded cursor-pointer"
                            title="View Details & Update Checklist"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (rec.overallStatus !== 'Completed' || isAdmin) && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditTev(rec)}
                                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                                title="Edit Travel Record"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onViewTev(rec.id)}
                                className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                                title="Update Checklist / Upload Documents"
                              >
                                <CheckSquare className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onViewTev(rec.id)}
                                className="p-1.5 text-slate-600 hover:text-purple-700 hover:bg-purple-50 rounded cursor-pointer"
                                title="Upload Documents"
                              >
                                <Upload className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              exportIndividualTevPdf(rec, recItems, settings.agencyName)
                            }
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                            title="Print / Download TEV Summary PDF"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(rec)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <span className="tabular-nums">
            Page {safePage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 border border-slate-200 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">
              Delete Travel Record?
            </h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-slate-900">
                {deleteTarget.tevRefNumber} ({deleteTarget.employeeName})
              </span>
              ? This will remove all associated documentary checklists and uploaded attachments.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 cursor-pointer"
              >
                {busy ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
