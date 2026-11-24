import { TEVOverallStatus, TravelRecord, TravelRequirementChecklist } from '../types/tev';

export function calculateTravelDays(departureDate: string, returnDate: string): number {
  if (!departureDate || !returnDate) return 1;
  const start = new Date(`${departureDate}T00:00:00`);
  const end = new Date(`${returnDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const diffMs = end.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return days >= 1 ? days : 1;
}

export function isItemCompleted(item: Pick<TravelRequirementChecklist, 'applicable' | 'prepared' | 'submitted' | 'signed' | 'approved'>): boolean {
  return Boolean(item.applicable && item.prepared && item.submitted && item.signed && item.approved);
}

export function calculateChecklistCompliance(items: TravelRequirementChecklist[]): {
  applicableCount: number;
  completedCount: number;
  compliancePercentage: number;
} {
  const applicable = items.filter((item) => item.applicable);
  const applicableCount = applicable.length;
  if (applicableCount === 0) {
    return { applicableCount: 0, completedCount: 0, compliancePercentage: 0 };
  }
  const completedCount = applicable.filter((item) => isItemCompleted(item)).length;
  const compliancePercentage = Math.round((completedCount / applicableCount) * 100);
  return { applicableCount, completedCount, compliancePercentage };
}

export function calculateOverallTevStatus(
  items: TravelRequirementChecklist[],
  manualOnHold: boolean
): TEVOverallStatus {
  if (manualOnHold) {
    return 'On Hold';
  }
  const applicable = items.filter((item) => item.applicable);
  if (applicable.length === 0) {
    return 'Not Started';
  }

  const allCompleted = applicable.every((item) => isItemCompleted(item));
  if (allCompleted) {
    return 'Completed';
  }

  const anyTouched = applicable.some(
    (item) => item.prepared || item.submitted || item.signed || item.approved
  );
  if (!anyTouched) {
    return 'Not Started';
  }

  if (applicable.some((item) => item.signed && !item.approved)) {
    return 'For Approval';
  }
  if (applicable.some((item) => item.submitted && !item.signed)) {
    return 'For Signature';
  }
  if (applicable.some((item) => item.prepared && !item.submitted)) {
    return 'For Submission';
  }

  return 'In Progress';
}

export function getRequirementStageVisual(item: TravelRequirementChecklist): {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
} {
  if (!item.applicable) {
    return {
      label: 'Not Applicable',
      bgClass: 'bg-slate-100',
      textClass: 'text-slate-500',
      borderClass: 'border-slate-200',
    };
  }
  if (item.returnedForCorrection) {
    return {
      label: 'Returned / Overdue',
      bgClass: 'bg-red-50',
      textClass: 'text-red-700',
      borderClass: 'border-red-200',
    };
  }
  if (item.prepared && item.submitted && item.signed && item.approved) {
    return {
      label: 'Approved / Completed',
      bgClass: 'bg-emerald-50',
      textClass: 'text-emerald-700',
      borderClass: 'border-emerald-200',
    };
  }
  if (item.signed) {
    return {
      label: item.approved ? 'Approved (Unsigned Stage)' : 'Signed · Awaiting Approval',
      bgClass: 'bg-purple-50',
      textClass: 'text-purple-700',
      borderClass: 'border-purple-200',
    };
  }
  if (item.submitted) {
    return {
      label: 'Submitted · Pending Signature',
      bgClass: 'bg-amber-50',
      textClass: 'text-amber-700',
      borderClass: 'border-amber-200',
    };
  }
  if (item.prepared) {
    return {
      label: 'Prepared · For Submission',
      bgClass: 'bg-blue-50',
      textClass: 'text-blue-700',
      borderClass: 'border-blue-200',
    };
  }
  return {
    label: 'Not Yet Prepared',
    bgClass: 'bg-slate-100',
    textClass: 'text-slate-600',
    borderClass: 'border-slate-200',
  };
}

export function getOverallStatusStyle(status: TEVOverallStatus): {
  bgClass: string;
  textClass: string;
  borderClass: string;
  chartColor: string;
} {
  switch (status) {
    case 'Completed':
      return {
        bgClass: 'bg-emerald-50',
        textClass: 'text-emerald-700',
        borderClass: 'border-emerald-200',
        chartColor: '#16a34a',
      };
    case 'For Approval':
      return {
        bgClass: 'bg-purple-50',
        textClass: 'text-purple-700',
        borderClass: 'border-purple-200',
        chartColor: '#7c3aed',
      };
    case 'For Signature':
      return {
        bgClass: 'bg-amber-50',
        textClass: 'text-amber-700',
        borderClass: 'border-amber-200',
        chartColor: '#d97706',
      };
    case 'For Submission':
      return {
        bgClass: 'bg-sky-50',
        textClass: 'text-sky-700',
        borderClass: 'border-sky-200',
        chartColor: '#0284c7',
      };
    case 'In Progress':
      return {
        bgClass: 'bg-blue-50',
        textClass: 'text-blue-700',
        borderClass: 'border-blue-200',
        chartColor: '#2563eb',
      };
    case 'On Hold':
      return {
        bgClass: 'bg-red-50',
        textClass: 'text-red-700',
        borderClass: 'border-red-200',
        chartColor: '#dc2626',
      };
    case 'Not Started':
    default:
      return {
        bgClass: 'bg-slate-100',
        textClass: 'text-slate-700',
        borderClass: 'border-slate-200',
        chartColor: '#64748b',
      };
  }
}

export function getDaysPending(record: TravelRecord): number {
  if (record.overallStatus === 'Completed') return 0;
  const referenceDateStr = record.returnDate || record.departureDate;
  if (!referenceDateStr) return 0;
  const refDate = new Date(`${referenceDateStr}T00:00:00`);
  if (Number.isNaN(refDate.getTime())) return 0;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((today.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

export function isTevOverdue(
  record: TravelRecord,
  items: TravelRequirementChecklist[],
  overdueThresholdDays: number
): boolean {
  if (record.overallStatus === 'Completed') return false;
  if (items.some((i) => i.applicable && i.returnedForCorrection)) return true;
  const days = getDaysPending(record);
  return days > overdueThresholdDays;
}

export function checkOverlappingTravel(
  employeeId: string,
  departureDate: string,
  returnDate: string,
  existingRecords: TravelRecord[],
  excludeTevId?: string
): TravelRecord[] {
  if (!employeeId || !departureDate || !returnDate) return [];
  return existingRecords.filter((rec) => {
    if (excludeTevId && rec.id === excludeTevId) return false;
    if (rec.employeeId !== employeeId) return false;
    return !(returnDate < rec.departureDate || departureDate > rec.returnDate);
  });
}

export function generateTevRefNumber(
  existingRecords: TravelRecord[],
  prefix = 'TEV',
  separator = '-',
  year = new Date().getFullYear()
): string {
  const cleanPrefix = prefix.trim() || 'TEV';
  const cleanSep = separator || '-';
  const basePattern = `${cleanPrefix}${cleanSep}${year}${cleanSep}`;
  let maxSeq = 0;
  for (const rec of existingRecords) {
    if (rec.tevRefNumber.startsWith(basePattern)) {
      const tail = rec.tevRefNumber.slice(basePattern.length);
      const parsed = parseInt(tail, 10);
      if (!Number.isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }
  let nextSeq = maxSeq + 1;
  let candidate = `${basePattern}${String(nextSeq).padStart(4, '0')}`;
  const existingSet = new Set(existingRecords.map((r) => r.tevRefNumber.toUpperCase()));
  while (existingSet.has(candidate.toUpperCase())) {
    nextSeq += 1;
    candidate = `${basePattern}${String(nextSeq).padStart(4, '0')}`;
  }
  return candidate;
}

export function getOutstandingSummary(
  record: TravelRecord,
  items: TravelRequirementChecklist[]
): string {
  if (record.manualOnHold) return 'Manually placed On Hold';
  const applicable = items.filter((i) => i.applicable);
  if (applicable.length === 0) return 'No applicable requirements selected';
  const returned = applicable.filter((i) => i.returnedForCorrection);
  if (returned.length > 0) {
    return `Returned: ${returned.map((i) => i.requirementName).slice(0, 2).join(', ')}`;
  }
  const pendingApproval = applicable.filter((i) => i.signed && !i.approved);
  if (pendingApproval.length > 0) {
    return `For Approval (${pendingApproval.length}): ${pendingApproval[0].requirementName}`;
  }
  const pendingSig = applicable.filter((i) => i.submitted && !i.signed);
  if (pendingSig.length > 0) {
    return `For Signature (${pendingSig.length}): ${pendingSig[0].requirementName}`;
  }
  const pendingSub = applicable.filter((i) => i.prepared && !i.submitted);
  if (pendingSub.length > 0) {
    return `For Submission (${pendingSub.length}): ${pendingSub[0].requirementName}`;
  }
  const notPrepared = applicable.filter((i) => !i.prepared);
  if (notPrepared.length > 0) {
    return `Not Prepared (${notPrepared.length}): ${notPrepared[0].requirementName}`;
  }
  return 'All requirements completed';
}

export function sanitizeId(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return cleaned.slice(0, 120) || `id_${Date.now()}`;
}

export function createClientId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return sanitizeId(`${prefix}_${Date.now()}_${rand}`);
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTimestamp(ts: any): string {
  if (!ts) return '—';
  let date: Date;
  if (typeof ts?.toDate === 'function') {
    date = ts.toDate();
  } else if (ts instanceof Date) {
    date = ts;
  } else {
    date = new Date(ts);
  }
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
