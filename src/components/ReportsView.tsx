import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { exportRowsToCsv, exportRowsToExcel } from '../lib/excelService';
import { exportTableToPdf } from '../lib/pdfService';
import {
  getDaysPending,
  isItemCompleted,
  isTevOverdue,
} from '../lib/tevCalculations';

type ReportType =
  | 'masterlist'
  | 'by-employee'
  | 'by-office'
  | 'by-month-year'
  | 'completed'
  | 'pending'
  | 'incomplete-docs'
  | 'pending-signature'
  | 'pending-approval'
  | 'overdue'
  | 'compliance'
  | 'doc-summary'
  | 'by-officer';

const REPORT_OPTIONS: Array<{ id: ReportType; label: string }> = [
  { id: 'masterlist', label: '1. Masterlist of All TEVs' },
  { id: 'by-employee', label: '2. TEVs by Employee' },
  { id: 'by-office', label: '3. TEVs by Office / Division' },
  { id: 'by-month-year', label: '4. TEVs by Month and Year' },
  { id: 'completed', label: '5. Completed TEVs Report' },
  { id: 'pending', label: '6. Pending TEVs Report' },
  { id: 'incomplete-docs', label: '7. Incomplete Documentary Requirements Report' },
  { id: 'pending-signature', label: '8. Pending Signature Report' },
  { id: 'pending-approval', label: '9. Pending Approval Report' },
  { id: 'overdue', label: '10. Overdue TEVs Report' },
  { id: 'compliance', label: '11. TEV Compliance Report' },
  { id: 'doc-summary', label: '12. Documentary Requirements Summary' },
  { id: 'by-officer', label: '13. TEV Monitoring by Processing Officer' },
];

export function ReportsView() {
  const {
    travelRecords,
    checklists,
    offices,
    employees,
    documentaryRequirements,
    settings,
  } = useWorkspace();

  const [reportType, setReportType] = useState<ReportType>('masterlist');
  const [officeId, setOfficeId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredRecords = useMemo(() => {
    return travelRecords.filter((r) => {
      if (officeId && r.officeId !== officeId) return false;
      if (employeeId && r.employeeId !== employeeId) return false;
      if (dateFrom && r.departureDate < dateFrom) return false;
      if (dateTo && r.returnDate > dateTo) return false;
      return true;
    });
  }, [travelRecords, officeId, employeeId, dateFrom, dateTo]);

  const filteredIds = useMemo(() => new Set(filteredRecords.map((r) => r.id)), [filteredRecords]);
  const filteredChecklists = useMemo(
    () => checklists.filter((c) => filteredIds.has(c.tevId)),
    [checklists, filteredIds]
  );

  const reportData = useMemo((): {
    title: string;
    headers: string[];
    rows: Array<Array<string | number>>;
  } => {
    const label = REPORT_OPTIONS.find((o) => o.id === reportType)?.label || 'TEV Report';

    if (reportType === 'by-employee') {
      const map = new Map<string, { name: string; office: string; total: number; done: number; pending: number; sum: number }>();
      filteredRecords.forEach((r) => {
        const cur = map.get(r.employeeId) || { name: r.employeeName, office: r.officeName, total: 0, done: 0, pending: 0, sum: 0 };
        cur.total += 1;
        if (r.overallStatus === 'Completed') cur.done += 1;
        else cur.pending += 1;
        cur.sum += r.compliancePercentage;
        map.set(r.employeeId, cur);
      });
      return {
        title: label,
        headers: ['Employee Name', 'Office / Division', 'Total TEVs', 'Completed', 'Pending', 'Avg Compliance (%)'],
        rows: Array.from(map.values()).map((x) => [
          x.name,
          x.office,
          x.total,
          x.done,
          x.pending,
          `${Math.round(x.sum / (x.total || 1))}%`,
        ]),
      };
    }

    if (reportType === 'by-office') {
      const map = new Map<string, { office: string; total: number; done: number; pending: number; hold: number; sum: number }>();
      filteredRecords.forEach((r) => {
        const cur = map.get(r.officeName) || { office: r.officeName, total: 0, done: 0, pending: 0, hold: 0, sum: 0 };
        cur.total += 1;
        if (r.overallStatus === 'Completed') cur.done += 1;
        else if (r.overallStatus === 'On Hold') cur.hold += 1;
        else cur.pending += 1;
        cur.sum += r.compliancePercentage;
        map.set(r.officeName, cur);
      });
      return {
        title: label,
        headers: ['Office / Division', 'Total TEVs', 'Completed', 'Pending', 'On Hold', 'Avg Compliance (%)'],
        rows: Array.from(map.values()).map((x) => [
          x.office,
          x.total,
          x.done,
          x.pending,
          x.hold,
          `${Math.round(x.sum / (x.total || 1))}%`,
        ]),
      };
    }

    if (reportType === 'by-month-year') {
      const map = new Map<string, { period: string; total: number; done: number; pending: number; sum: number }>();
      filteredRecords.forEach((r) => {
        const p = r.departureDate ? r.departureDate.slice(0, 7) : 'Unknown';
        const cur = map.get(p) || { period: p, total: 0, done: 0, pending: 0, sum: 0 };
        cur.total += 1;
        if (r.overallStatus === 'Completed') cur.done += 1;
        else cur.pending += 1;
        cur.sum += r.compliancePercentage;
        map.set(p, cur);
      });
      return {
        title: label,
        headers: ['Year-Month', 'Total TEVs', 'Completed', 'Pending', 'Avg Compliance (%)'],
        rows: Array.from(map.values())
          .sort((a, b) => a.period.localeCompare(b.period))
          .map((x) => [x.period, x.total, x.done, x.pending, `${Math.round(x.sum / (x.total || 1))}%`]),
      };
    }

    if (reportType === 'doc-summary') {
      return {
        title: label,
        headers: ['Documentary Requirement', 'Total Applicable', 'Prepared', 'Submitted', 'Signed', 'Approved', 'Pending'],
        rows: documentaryRequirements.map((req) => {
          const items = filteredChecklists.filter((c) => c.requirementName === req.name && c.applicable);
          const approved = items.filter((i) => isItemCompleted(i)).length;
          return [
            req.name,
            items.length,
            items.filter((i) => i.prepared).length,
            items.filter((i) => i.submitted).length,
            items.filter((i) => i.signed).length,
            approved,
            items.length - approved,
          ];
        }),
      };
    }

    if (reportType === 'by-officer') {
      const map = new Map<string, { officer: string; total: number; done: number; pending: number; sum: number }>();
      filteredRecords.forEach((r) => {
        const key = r.processingOfficer || 'Unassigned';
        const cur = map.get(key) || { officer: key, total: 0, done: 0, pending: 0, sum: 0 };
        cur.total += 1;
        if (r.overallStatus === 'Completed') cur.done += 1;
        else cur.pending += 1;
        cur.sum += r.compliancePercentage;
        map.set(key, cur);
      });
      return {
        title: label,
        headers: ['Processing Officer', 'Assigned TEVs', 'Completed', 'Pending', 'Avg Compliance (%)'],
        rows: Array.from(map.values()).map((x) => [
          x.officer,
          x.total,
          x.done,
          x.pending,
          `${Math.round(x.sum / (x.total || 1))}%`,
        ]),
      };
    }

    // Record-level filtered reports
    let subset = filteredRecords;
    if (reportType === 'completed') {
      subset = filteredRecords.filter((r) => r.overallStatus === 'Completed');
    } else if (reportType === 'pending') {
      subset = filteredRecords.filter((r) => r.overallStatus !== 'Completed');
    } else if (reportType === 'incomplete-docs') {
      subset = filteredRecords.filter((r) => r.applicableCount > r.completedCount);
    } else if (reportType === 'pending-signature') {
      subset = filteredRecords.filter((r) => {
        const items = filteredChecklists.filter((c) => c.tevId === r.id);
        return r.overallStatus === 'For Signature' || items.some((i) => i.applicable && i.submitted && !i.signed);
      });
    } else if (reportType === 'pending-approval') {
      subset = filteredRecords.filter((r) => {
        const items = filteredChecklists.filter((c) => c.tevId === r.id);
        return r.overallStatus === 'For Approval' || items.some((i) => i.applicable && i.signed && !i.approved);
      });
    } else if (reportType === 'overdue') {
      subset = filteredRecords.filter((r) => {
        const items = filteredChecklists.filter((c) => c.tevId === r.id);
        return isTevOverdue(r, items, settings.overdueThresholdDays);
      });
    }

    return {
      title: label,
      headers: [
        'TEV Ref No.',
        'Employee Name',
        'Office / Division',
        'Destination',
        'Travel Dates',
        'Days',
        'Applicable',
        'Completed',
        'Compliance (%)',
        'Overall Status',
        'Days Pending',
      ],
      rows: subset.map((r) => [
        r.tevRefNumber,
        r.employeeName,
        r.officeName,
        r.destination,
        `${r.departureDate} to ${r.returnDate}`,
        r.travelDays,
        r.applicableCount,
        r.completedCount,
        `${r.compliancePercentage}%`,
        r.overallStatus,
        getDaysPending(r),
      ]),
    };
  }, [reportType, filteredRecords, filteredChecklists, documentaryRequirements, settings.overdueThresholdDays]);

  const handleExportExcel = () => {
    const objRows = reportData.rows.map((r) => {
      const obj: Record<string, string | number> = {};
      reportData.headers.forEach((h, i) => {
        obj[h] = r[i];
      });
      return obj;
    });
    exportRowsToExcel(`GovTEV_${reportType}_Report`, reportType, objRows);
  };

  const handleExportCsv = () => {
    exportRowsToCsv(`GovTEV_${reportType}_Report.csv`, reportData.headers, reportData.rows);
  };

  const handleExportPdf = () => {
    exportTableToPdf(
      reportData.title,
      `Rows: ${reportData.rows.length}`,
      reportData.headers,
      reportData.rows,
      `GovTEV_${reportType}_Report.pdf`,
      settings.agencyName
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Reports &amp; Export Center</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Generate audit-ready TEV compliance, signature, approval, and documentary summary reports
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> Print Report
          </button>
        </div>
      </div>

      {/* Report Selector & Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 no-print">
        <div className="lg:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Report Type</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-medium"
          >
            {REPORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Office / Division</label>
          <select
            value={officeId}
            onChange={(e) => setOfficeId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Offices</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Employee</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
        </div>
      </div>

      {/* Report Output Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden print-container">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">{settings.agencyName}</div>
            <h3 className="text-base font-semibold text-slate-900">{reportData.title}</h3>
          </div>
          <span className="text-xs font-mono-num text-slate-500">
            {reportData.rows.length} row(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                {reportData.headers.map((h) => (
                  <th key={h} className="py-2.5 px-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reportData.rows.length === 0 ? (
                <tr>
                  <td colSpan={reportData.headers.length} className="py-10 text-center text-slate-500">
                    No records match this report criteria.
                  </td>
                </tr>
              ) : (
                reportData.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2.5 px-3 text-slate-700 font-mono-num">
                        {cell}
                      </td>
                    ))}
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
