import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  RotateCcw,
  FileSpreadsheet,
  FileText,
  Printer,
  Eye,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  buildTravelRecordsExportRows,
  exportRowsToCsv,
  exportRowsToExcel,
} from '../lib/excelService';
import { exportTableToPdf } from '../lib/pdfService';
import {
  getDaysPending,
  getOutstandingSummary,
  getOverallStatusStyle,
  isItemCompleted,
  isTevOverdue,
} from '../lib/tevCalculations';
import {
  DashboardFilters,
  TEVOverallStatus,
  TravelRecordFilters,
} from '../types/tev';

interface DashboardViewProps {
  onNavigateToRecords: (partialFilter: Partial<TravelRecordFilters>) => void;
  onViewTev: (tevId: string) => void;
}

const ALL_STATUSES: TEVOverallStatus[] = [
  'Not Started',
  'In Progress',
  'For Submission',
  'For Signature',
  'For Approval',
  'Completed',
  'On Hold',
];

const INITIAL_DASH_FILTERS: DashboardFilters = {
  officeId: '',
  employeeId: '',
  dateFrom: '',
  dateTo: '',
  year: '',
  status: '',
  requirementName: '',
  processingStage: '',
};

export function DashboardView({
  onNavigateToRecords,
  onViewTev,
}: DashboardViewProps) {
  const {
    travelRecords,
    checklists,
    offices,
    employees,
    documentaryRequirements,
    settings,
    dataLoading,
  } = useWorkspace();

  const [filters, setFilters] = useState<DashboardFilters>(INITIAL_DASH_FILTERS);
  const [periodPreset, setPeriodPreset] = useState<string>('all');

  const years = useMemo(() => {
    const set = new Set<string>();
    travelRecords.forEach((r) => {
      if (r.departureDate) set.add(r.departureDate.slice(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [travelRecords]);

  const applyPeriodPreset = (preset: string) => {
    setPeriodPreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed
    const pad = (n: number) => String(n).padStart(2, '0');
    const lastDayOfMonth = (yr: number, mo: number) =>
      new Date(yr, mo + 1, 0).getDate();

    if (preset === 'all') {
      setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', year: '' }));
    } else if (preset === 'current-month') {
      const from = `${y}-${pad(m + 1)}-01`;
      const to = `${y}-${pad(m + 1)}-${pad(lastDayOfMonth(y, m))}`;
      setFilters((f) => ({ ...f, dateFrom: from, dateTo: to, year: '' }));
    } else if (preset === 'prev-month') {
      const prevDate = new Date(y, m - 1, 1);
      const py = prevDate.getFullYear();
      const pm = prevDate.getMonth();
      const from = `${py}-${pad(pm + 1)}-01`;
      const to = `${py}-${pad(pm + 1)}-${pad(lastDayOfMonth(py, pm))}`;
      setFilters((f) => ({ ...f, dateFrom: from, dateTo: to, year: '' }));
    } else if (preset === 'current-quarter') {
      const qStartMonth = Math.floor(m / 3) * 3;
      const qEndMonth = qStartMonth + 2;
      const from = `${y}-${pad(qStartMonth + 1)}-01`;
      const to = `${y}-${pad(qEndMonth + 1)}-${pad(lastDayOfMonth(y, qEndMonth))}`;
      setFilters((f) => ({ ...f, dateFrom: from, dateTo: to, year: '' }));
    } else if (preset === 'current-year') {
      setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', year: String(y) }));
    } else if (preset === 'prev-year') {
      setFilters((f) => ({ ...f, dateFrom: '', dateTo: '', year: String(y - 1) }));
    }
  };

  const filteredRecords = useMemo(() => {
    return travelRecords.filter((rec) => {
      const recItems = checklists.filter((c) => c.tevId === rec.id);
      if (filters.officeId && rec.officeId !== filters.officeId) return false;
      if (filters.employeeId && rec.employeeId !== filters.employeeId) return false;
      if (filters.dateFrom && rec.departureDate < filters.dateFrom) return false;
      if (filters.dateTo && rec.returnDate > filters.dateTo) return false;
      if (filters.year && !rec.departureDate.startsWith(filters.year)) return false;
      if (filters.status && rec.overallStatus !== filters.status) return false;

      if (filters.requirementName) {
        const hasReq = recItems.some(
          (i) => i.applicable && i.requirementName === filters.requirementName
        );
        if (!hasReq) return false;
      }

      if (filters.processingStage) {
        const stage = filters.processingStage;
        const matchStage = recItems.some((i) => {
          if (!i.applicable) return false;
          if (stage === 'not-prepared') return !i.prepared;
          if (stage === 'prepared') return i.prepared && !i.submitted;
          if (stage === 'submitted') return i.submitted && !i.signed;
          if (stage === 'signed') return i.signed && !i.approved;
          if (stage === 'approved') return isItemCompleted(i);
          if (stage === 'returned') return i.returnedForCorrection;
          return true;
        });
        if (!matchStage) return false;
      }

      return true;
    });
  }, [travelRecords, checklists, filters]);

  const filteredTevIds = useMemo(
    () => new Set(filteredRecords.map((r) => r.id)),
    [filteredRecords]
  );

  const filteredChecklists = useMemo(
    () => checklists.filter((c) => filteredTevIds.has(c.tevId)),
    [checklists, filteredTevIds]
  );

  // A. 9 Summary KPI Counts
  const kpis = useMemo(() => {
    const total = filteredRecords.length;
    const completed = filteredRecords.filter((r) => r.overallStatus === 'Completed').length;
    const ongoing = filteredRecords.filter(
      (r) => !['Completed', 'Not Started', 'On Hold'].includes(r.overallStatus)
    ).length;
    const notStarted = filteredRecords.filter((r) => r.overallStatus === 'Not Started').length;
    const pendingDocs = filteredRecords.filter((r) => r.applicableCount > r.completedCount).length;
    const forSignature = filteredRecords.filter((r) => {
      const items = filteredChecklists.filter((c) => c.tevId === r.id);
      return r.overallStatus === 'For Signature' || items.some((i) => i.applicable && i.submitted && !i.signed);
    }).length;
    const forApproval = filteredRecords.filter((r) => {
      const items = filteredChecklists.filter((c) => c.tevId === r.id);
      return r.overallStatus === 'For Approval' || items.some((i) => i.applicable && i.signed && !i.approved);
    }).length;
    const onHold = filteredRecords.filter((r) => r.overallStatus === 'On Hold').length;
    const overdue = filteredRecords.filter((r) => {
      const items = filteredChecklists.filter((c) => c.tevId === r.id);
      return isTevOverdue(r, items, settings.overdueThresholdDays);
    }).length;

    return {
      total,
      completed,
      ongoing,
      notStarted,
      pendingDocs,
      forSignature,
      forApproval,
      onHold,
      overdue,
    };
  }, [filteredRecords, filteredChecklists, settings.overdueThresholdDays]);

  // B. Status Distribution
  const statusDistribution = useMemo(() => {
    const total = filteredRecords.length || 1;
    return ALL_STATUSES.map((status) => {
      const count = filteredRecords.filter((r) => r.overallStatus === status).length;
      return {
        name: status,
        value: count,
        percentage: Math.round((count / total) * 100),
        color: getOverallStatusStyle(status).chartColor,
      };
    });
  }, [filteredRecords]);

  // C. Documentary Requirements Monitoring
  const docMonitoring = useMemo(() => {
    const reqNames = documentaryRequirements
      .filter((r) => r.status === 'active')
      .map((r) => r.name);

    return reqNames.map((name) => {
      const items = filteredChecklists.filter((c) => c.requirementName === name && c.applicable);
      const totalApplicable = items.length;
      const approved = items.filter((i) => isItemCompleted(i)).length;
      const signed = items.filter((i) => i.signed && !isItemCompleted(i)).length;
      const submitted = items.filter((i) => i.submitted && !i.signed).length;
      const prepared = items.filter((i) => i.prepared && !i.submitted).length;
      const notPrepared = items.filter((i) => !i.prepared).length;
      const pending = totalApplicable - approved;

      return {
        name: name.length > 22 ? `${name.slice(0, 20)}...` : name,
        fullName: name,
        totalApplicable,
        prepared: items.filter((i) => i.prepared).length,
        submitted: items.filter((i) => i.submitted).length,
        signed: items.filter((i) => i.signed).length,
        approved,
        pending,
        // mutually exclusive stacked bar segments
        segApproved: approved,
        segSigned: signed,
        segSubmitted: submitted,
        segPrepared: prepared,
        segNotPrepared: notPrepared,
      };
    });
  }, [documentaryRequirements, filteredChecklists]);

  // D. Monitoring by Office/Division
  const officeStats = useMemo(() => {
    const map = new Map<
      string,
      {
        officeId: string;
        officeName: string;
        total: number;
        completed: number;
        inProgress: number;
        forSignature: number;
        forApproval: number;
        onHold: number;
        complianceSum: number;
      }
    >();

    for (const rec of filteredRecords) {
      const key = rec.officeName;
      const cur = map.get(key) || {
        officeId: rec.officeId,
        officeName: rec.officeName,
        total: 0,
        completed: 0,
        inProgress: 0,
        forSignature: 0,
        forApproval: 0,
        onHold: 0,
        complianceSum: 0,
      };
      cur.total += 1;
      if (rec.overallStatus === 'Completed') cur.completed += 1;
      else if (rec.overallStatus === 'For Signature') cur.forSignature += 1;
      else if (rec.overallStatus === 'For Approval') cur.forApproval += 1;
      else if (rec.overallStatus === 'On Hold') cur.onHold += 1;
      else if (rec.overallStatus !== 'Not Started') cur.inProgress += 1;
      cur.complianceSum += rec.compliancePercentage;
      map.set(key, cur);
    }

    return Array.from(map.values())
      .map((s) => ({
        ...s,
        avgCompliance: s.total > 0 ? Math.round(s.complianceSum / s.total) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredRecords]);

  // E. Monitoring by Employee
  const employeeStats = useMemo(() => {
    const map = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        officeName: string;
        total: number;
        completed: number;
        pending: number;
        complianceSum: number;
        latestDate: string;
      }
    >();

    for (const rec of filteredRecords) {
      const cur = map.get(rec.employeeId) || {
        employeeId: rec.employeeId,
        employeeName: rec.employeeName,
        officeName: rec.officeName,
        total: 0,
        completed: 0,
        pending: 0,
        complianceSum: 0,
        latestDate: rec.departureDate,
      };
      cur.total += 1;
      if (rec.overallStatus === 'Completed') cur.completed += 1;
      else cur.pending += 1;
      cur.complianceSum += rec.compliancePercentage;
      if (rec.departureDate > cur.latestDate) cur.latestDate = rec.departureDate;
      map.set(rec.employeeId, cur);
    }

    return Array.from(map.values())
      .map((e) => ({
        ...e,
        avgCompliance: e.total > 0 ? Math.round(e.complianceSum / e.total) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredRecords]);

  // F. Monthly & Yearly Charts
  const monthlyStats = useMemo(() => {
    const map = new Map<string, { month: string; total: number; completed: number; pending: number }>();
    for (const rec of filteredRecords) {
      const mKey = rec.departureDate ? rec.departureDate.slice(0, 7) : 'Unknown';
      const cur = map.get(mKey) || { month: mKey, total: 0, completed: 0, pending: 0 };
      cur.total += 1;
      if (rec.overallStatus === 'Completed') cur.completed += 1;
      else cur.pending += 1;
      map.set(mKey, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredRecords]);

  const yearlyStats = useMemo(() => {
    const map = new Map<string, { year: string; total: number; completed: number; pending: number }>();
    for (const rec of filteredRecords) {
      const yKey = rec.departureDate ? rec.departureDate.slice(0, 4) : 'Unknown';
      const cur = map.get(yKey) || { year: yKey, total: 0, completed: 0, pending: 0 };
      cur.total += 1;
      if (rec.overallStatus === 'Completed') cur.completed += 1;
      else cur.pending += 1;
      map.set(yKey, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.year.localeCompare(b.year));
  }, [filteredRecords]);

  // G. TEVs Requiring Immediate Attention
  const attentionRows = useMemo(() => {
    return filteredRecords
      .filter((rec) => {
        if (rec.overallStatus === 'Completed') return false;
        const items = filteredChecklists.filter((c) => c.tevId === rec.id);
        const hasMissing = items.some((i) => i.applicable && !isItemCompleted(i));
        const hasOrsDvIncomplete = items.some(
          (i) =>
            i.applicable &&
            (i.requirementName.includes('ORS') || i.requirementName.includes('Disbursement Voucher')) &&
            !isItemCompleted(i)
        );
        return (
          rec.manualOnHold ||
          rec.overallStatus === 'For Signature' ||
          rec.overallStatus === 'For Approval' ||
          hasOrsDvIncomplete ||
          hasMissing ||
          isTevOverdue(rec, items, settings.overdueThresholdDays)
        );
      })
      .map((rec) => {
        const items = filteredChecklists.filter((c) => c.tevId === rec.id);
        const daysPending = getDaysPending(rec);
        const outstanding = getOutstandingSummary(rec, items);
        return { rec, daysPending, outstanding };
      })
      .sort((a, b) => b.daysPending - a.daysPending);
  }, [filteredRecords, filteredChecklists, settings.overdueThresholdDays]);

  const summaryCards: Array<{
    label: string;
    value: number;
    tone: string;
    onClick: () => void;
  }> = [
    {
      label: 'Total TEVs',
      value: kpis.total,
      tone: 'text-slate-900',
      onClick: () => onNavigateToRecords({ overallStatus: '', specialFilter: '' }),
    },
    {
      label: 'Completed TEVs',
      value: kpis.completed,
      tone: 'text-emerald-700',
      onClick: () => onNavigateToRecords({ overallStatus: 'Completed', specialFilter: '' }),
    },
    {
      label: 'Ongoing TEVs',
      value: kpis.ongoing,
      tone: 'text-blue-700',
      onClick: () => onNavigateToRecords({ overallStatus: '', specialFilter: 'ongoing' }),
    },
    {
      label: 'Not Started',
      value: kpis.notStarted,
      tone: 'text-slate-600',
      onClick: () => onNavigateToRecords({ overallStatus: 'Not Started', specialFilter: '' }),
    },
    {
      label: 'Pending Documents',
      value: kpis.pendingDocs,
      tone: 'text-amber-700',
      onClick: () => onNavigateToRecords({ overallStatus: '', specialFilter: 'pending-docs' }),
    },
    {
      label: 'For Signature',
      value: kpis.forSignature,
      tone: 'text-amber-600',
      onClick: () => onNavigateToRecords({ overallStatus: '', specialFilter: 'for-signature' }),
    },
    {
      label: 'For Approval',
      value: kpis.forApproval,
      tone: 'text-purple-700',
      onClick: () => onNavigateToRecords({ overallStatus: '', specialFilter: 'for-approval' }),
    },
    {
      label: 'On Hold',
      value: kpis.onHold,
      tone: 'text-red-700',
      onClick: () => onNavigateToRecords({ overallStatus: 'On Hold', specialFilter: '' }),
    },
    {
      label: 'Overdue / Incomplete',
      value: kpis.overdue,
      tone: 'text-red-600',
      onClick: () => onNavigateToRecords({ overallStatus: '', specialFilter: 'overdue' }),
    },
  ];

  const handleExportExcel = () => {
    exportRowsToExcel(
      'GovTEV_Dashboard_Summary',
      'Filtered_TEVs',
      buildTravelRecordsExportRows(filteredRecords, filteredChecklists)
    );
  };

  const handleExportCsv = () => {
    const rows = buildTravelRecordsExportRows(filteredRecords, filteredChecklists);
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    exportRowsToCsv(
      'GovTEV_Dashboard_Summary.csv',
      headers,
      rows.map((r) => headers.map((h) => r[h]))
    );
  };

  const handleExportPdf = () => {
    const headers = ['TEV Ref', 'Employee', 'Office', 'Destination', 'Dates', 'Compliance', 'Status'];
    const rows = filteredRecords.map((r) => [
      r.tevRefNumber,
      r.employeeName,
      r.officeName,
      r.destination,
      `${r.departureDate} to ${r.returnDate}`,
      `${r.compliancePercentage}%`,
      r.overallStatus,
    ]);
    exportTableToPdf(
      'TEV Monitoring Dashboard Report',
      `Filtered records: ${filteredRecords.length}`,
      headers,
      rows,
      'GovTEV_Dashboard_Report.pdf',
      settings.agencyName
    );
  };

  if (dataLoading && travelRecords.length === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 9 }).map((_, idx) => (
            <div key={idx} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action & Export Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            TEV Monitoring Overview
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time compliance figures across {filteredRecords.length} filtered travel transaction(s)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /> Export PDF
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

      {/* H. Dashboard-Wide Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700">Dashboard Filters</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              ['all', 'All Time'],
              ['current-month', 'Current Month'],
              ['prev-month', 'Previous Month'],
              ['current-quarter', 'Current Quarter'],
              ['current-year', 'Current Year'],
              ['prev-year', 'Previous Year'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPeriodPreset(id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  periodPreset === id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={filters.officeId}
            onChange={(e) => setFilters({ ...filters, officeId: e.target.value })}
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
            onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All TEV Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={filters.requirementName}
            onChange={(e) => setFilters({ ...filters, requirementName: e.target.value })}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Documentary Requirements</option>
            {documentaryRequirements.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            value={filters.processingStage}
            onChange={(e) => setFilters({ ...filters, processingStage: e.target.value })}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Processing Stages</option>
            <option value="not-prepared">Not Yet Prepared</option>
            <option value="prepared">Prepared (Awaiting Submission)</option>
            <option value="submitted">Submitted (Awaiting Signature)</option>
            <option value="signed">Signed (Awaiting Approval)</option>
            <option value="approved">Approved / Completed</option>
            <option value="returned">Returned for Correction</option>
          </select>

          <select
            value={filters.year}
            onChange={(e) => {
              setPeriodPreset('custom');
              setFilters({ ...filters, year: e.target.value });
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

          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => {
              setPeriodPreset('custom');
              setFilters({ ...filters, dateFrom: e.target.value });
            }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-num"
            title="Date From"
          />

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => {
                setPeriodPreset('custom');
                setFilters({ ...filters, dateTo: e.target.value });
              }}
              className="flex-1 min-w-0 px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-num"
              title="Date To"
            />
            <button
              type="button"
              onClick={() => {
                setPeriodPreset('all');
                setFilters(INITIAL_DASH_FILTERS);
              }}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* A. 9 Clickable Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
        {summaryCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-400 transition-colors cursor-pointer group"
          >
            <div className="text-[11px] font-medium text-slate-500 leading-tight min-h-[28px]">
              {card.label}
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-1">
              <span className={`text-2xl font-semibold font-mono-num ${card.tone}`}>
                {card.value}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 transition-colors no-print" />
            </div>
          </button>
        ))}
      </div>

      {/* B & C: Status Distribution + Documentary Requirements Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900">TEV Status Distribution</h3>
          <p className="text-xs text-slate-500 mt-0.5">Count and percentage share across workflow stages</p>
          <div className="h-56 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusDistribution.filter((d) => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={2}
                >
                  {statusDistribution
                    .filter((d) => d.value > 0)
                    .map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 divide-y divide-slate-100 text-xs">
            {statusDistribution.map((s) => (
              <div key={s.name} className="py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-slate-700">{s.name}</span>
                </div>
                <div className="font-mono-num text-slate-900 font-medium">
                  {s.value} <span className="text-slate-400">({s.percentage}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            Documentary Requirements Monitoring
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Applicable requirement counts by processing stage across filtered TEVs
          </p>
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={docMonitoring} margin={{ top: 10, right: 10, left: -15, bottom: 45 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#475569' }}
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 10, fill: '#475569' }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="segApproved" name="Approved" stackId="a" fill="#16a34a" />
                <Bar dataKey="segSigned" name="Signed" stackId="a" fill="#7c3aed" />
                <Bar dataKey="segSubmitted" name="Submitted" stackId="a" fill="#d97706" />
                <Bar dataKey="segPrepared" name="Prepared" stackId="a" fill="#2563eb" />
                <Bar dataKey="segNotPrepared" name="Not Prepared" stackId="a" fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2 px-2.5">Requirement</th>
                  <th className="py-2 px-2 text-right">Applicable</th>
                  <th className="py-2 px-2 text-right">Prepared</th>
                  <th className="py-2 px-2 text-right">Submitted</th>
                  <th className="py-2 px-2 text-right">Signed</th>
                  <th className="py-2 px-2 text-right">Approved</th>
                  <th className="py-2 px-2 text-right">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docMonitoring.map((d) => (
                  <tr key={d.fullName} className="hover:bg-slate-50">
                    <td className="py-1.5 px-2.5 font-medium text-slate-800">{d.fullName}</td>
                    <td className="py-1.5 px-2 text-right font-mono-num">{d.totalApplicable}</td>
                    <td className="py-1.5 px-2 text-right font-mono-num text-blue-700">{d.prepared}</td>
                    <td className="py-1.5 px-2 text-right font-mono-num text-amber-700">{d.submitted}</td>
                    <td className="py-1.5 px-2 text-right font-mono-num text-purple-700">{d.signed}</td>
                    <td className="py-1.5 px-2 text-right font-mono-num text-emerald-700">{d.approved}</td>
                    <td className="py-1.5 px-2 text-right font-mono-num text-red-700">{d.pending}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* F. Monthly & Yearly Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900">TEV Monitoring by Month</h3>
          <p className="text-xs text-slate-500 mt-0.5">Recorded, completed, and pending TEVs per month</p>
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyStats} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="total" name="Total Recorded" fill="#0f172a" />
                <Bar dataKey="completed" name="Completed" fill="#16a34a" />
                <Bar dataKey="pending" name="Pending" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-900">TEVs by Year</h3>
          <p className="text-xs text-slate-500 mt-0.5">Annual volume and completion comparison</p>
          <div className="h-64 mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearlyStats} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="completed" name="Completed" fill="#16a34a" />
                <Bar dataKey="pending" name="Pending" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* G. TEVs Requiring Immediate Attention */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              TEVs Requiring Immediate Attention ({attentionRows.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500">Prioritized by longest pending duration</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-3">TEV Ref No.</th>
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Office / Division</th>
                <th className="py-2.5 px-3">Destination</th>
                <th className="py-2.5 px-3">Travel Date</th>
                <th className="py-2.5 px-3">Outstanding Requirement</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Days Pending</th>
                <th className="py-2.5 px-3 text-right no-print">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {attentionRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    All filtered TEVs are fully completed.
                  </td>
                </tr>
              ) : (
                attentionRows.slice(0, 12).map(({ rec, daysPending, outstanding }) => {
                  const style = getOverallStatusStyle(rec.overallStatus);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                        {rec.tevRefNumber}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                        {rec.employeeName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{rec.officeName}</td>
                      <td className="py-2.5 px-3 text-slate-700">{rec.destination}</td>
                      <td className="py-2.5 px-3 font-mono-num text-slate-600 whitespace-nowrap">
                        {rec.departureDate}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-[240px] truncate" title={outstanding}>
                        {outstanding}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border ${style.bgClass} ${style.textClass} ${style.borderClass}`}
                        >
                          {rec.overallStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-num font-semibold text-red-600">
                        {daysPending}d
                      </td>
                      <td className="py-2.5 px-3 text-right no-print">
                        <button
                          type="button"
                          onClick={() => onViewTev(rec.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 cursor-pointer"
                        >
                          <Eye className="w-3 h-3" /> View Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* D & E: Monitoring by Office and Employee */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">TEV Monitoring by Office / Division</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Office / Division</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                  <th className="py-2.5 px-2 text-right">Done</th>
                  <th className="py-2.5 px-2 text-right">In Prog.</th>
                  <th className="py-2.5 px-2 text-right">Sig.</th>
                  <th className="py-2.5 px-2 text-right">Appr.</th>
                  <th className="py-2.5 px-2 text-right">Hold</th>
                  <th className="py-2.5 px-3 text-right">Avg %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {officeStats.map((o) => (
                  <tr key={o.officeName} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => onNavigateToRecords({ officeId: o.officeId })}
                        className="font-medium text-sky-700 hover:underline text-left cursor-pointer"
                      >
                        {o.officeName}
                      </button>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono-num">{o.total}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-emerald-700">{o.completed}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-blue-700">{o.inProgress}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-amber-700">{o.forSignature}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-purple-700">{o.forApproval}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-red-700">{o.onHold}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-semibold">{o.avgCompliance}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">TEV Monitoring by Employee</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Employee Name</th>
                  <th className="py-2.5 px-3">Office / Division</th>
                  <th className="py-2.5 px-2 text-right">Total</th>
                  <th className="py-2.5 px-2 text-right">Done</th>
                  <th className="py-2.5 px-2 text-right">Pending</th>
                  <th className="py-2.5 px-2 text-right">Avg %</th>
                  <th className="py-2.5 px-3 text-right">Latest Travel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {employeeStats.map((e) => (
                  <tr key={e.employeeId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => onNavigateToRecords({ employeeId: e.employeeId })}
                        className="font-medium text-sky-700 hover:underline text-left cursor-pointer"
                      >
                        {e.employeeName}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 truncate max-w-[140px]">{e.officeName}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num">{e.total}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-emerald-700">{e.completed}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num text-amber-700">{e.pending}</td>
                    <td className="py-2.5 px-2 text-right font-mono-num font-semibold">{e.avgCompliance}%</td>
                    <td className="py-2.5 px-3 text-right font-mono-num text-slate-600 whitespace-nowrap">{e.latestDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Travel Records */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Recent Travel Records</h3>
          <button
            type="button"
            onClick={() => onNavigateToRecords({})}
            className="text-xs font-medium text-sky-700 hover:underline cursor-pointer no-print"
          >
            View All Records
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-3">TEV Ref</th>
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Destination</th>
                <th className="py-2.5 px-3">Dates</th>
                <th className="py-2.5 px-3 text-right">Compliance</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right no-print">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRecords.slice(0, 6).map((r) => {
                const st = getOverallStatusStyle(r.overallStatus);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-900">{r.tevRefNumber}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{r.employeeName}</td>
                    <td className="py-2.5 px-3 text-slate-600">{r.destination}</td>
                    <td className="py-2.5 px-3 font-mono-num text-slate-600">{r.departureDate} – {r.returnDate}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-semibold">{r.compliancePercentage}%</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold border ${st.bgClass} ${st.textClass} ${st.borderClass}`}>
                        {r.overallStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right no-print">
                      <button
                        type="button"
                        onClick={() => onViewTev(r.id)}
                        className="text-sky-700 hover:underline font-medium cursor-pointer"
                      >
                        Open Checklist
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
