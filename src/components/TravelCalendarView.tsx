import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { TravelRecord } from '../types/tev';

interface TravelCalendarViewProps {
  onViewTev: (tevId: string) => void;
}

type CalendarMode = 'month' | 'week' | 'day';

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function TravelCalendarView({ onViewTev }: TravelCalendarViewProps) {
  const { travelRecords, offices, employees } = useWorkspace();

  const [mode, setMode] = useState<CalendarMode>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => new Date(2026, 11, 1)); // Dec 2026 default so sample Palawan travel is visible immediately, user can jump to Today
  const [officeId, setOfficeId] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const filtered = useMemo(() => {
    return travelRecords.filter((r) => {
      if (officeId && r.officeId !== officeId) return false;
      if (employeeId && r.employeeId !== employeeId) return false;
      return true;
    });
  }, [travelRecords, officeId, employeeId]);

  // Identify overlapping schedules across filtered travels
  const overlappingIds = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < filtered.length; i++) {
      for (let j = i + 1; j < filtered.length; j++) {
        const a = filtered[i];
        const b = filtered[j];
        if (
          a.employeeId === b.employeeId &&
          !(a.returnDate < b.departureDate || a.departureDate > b.returnDate)
        ) {
          set.add(a.id);
          set.add(b.id);
        }
      }
    }
    return set;
  }, [filtered]);

  const getVisualBadge = (rec: TravelRecord) => {
    const today = toIso(new Date());
    if (rec.overallStatus === 'Completed') {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (rec.overallStatus === 'On Hold') {
      return 'bg-red-50 text-red-800 border-red-200';
    }
    if (rec.departureDate > today) {
      return 'bg-sky-50 text-sky-800 border-sky-200';
    }
    return 'bg-amber-50 text-amber-800 border-amber-200';
  };

  const eventsOnDate = (iso: string) =>
    filtered.filter((r) => r.departureDate <= iso && r.returnDate >= iso);

  const navigateCursor = (delta: number) => {
    const d = new Date(cursorDate);
    if (mode === 'month') d.setMonth(d.getMonth() + delta);
    else if (mode === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    setCursorDate(d);
  };

  const monthGridDays = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const gridStart = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, idx) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + idx);
      return d;
    });
  }, [cursorDate]);

  const weekDays = useMemo(() => {
    const d = new Date(cursorDate);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(start);
      x.setDate(start.getDate() + i);
      return x;
    });
  }, [cursorDate]);

  const headerTitle =
    mode === 'month'
      ? cursorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : mode === 'week'
      ? `Week of ${toIso(weekDays[0])} to ${toIso(weekDays[6])}`
      : cursorDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Official Travel Calendar</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Schedule visibility across Completed, Ongoing, Upcoming, and On Hold travels
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {(['month', 'week', 'day'] as CalendarMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1 text-xs font-semibold rounded-md capitalize cursor-pointer ${
                  mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCursorDate(new Date())}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            Today
          </button>
        </div>
      </div>

      {/* Filters & Legend */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={officeId}
            onChange={(e) => setOfficeId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Offices / Divisions</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>

          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">All Employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Ongoing
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Upcoming
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> On Hold
          </span>
        </div>
      </div>

      {overlappingIds.size > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          Overlapping employee travel schedules detected on the calendar (marked with warning indicator).
        </div>
      )}

      {/* Calendar Navigation Header */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigateCursor(-1)}
            className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-semibold text-slate-900">{headerTitle}</h3>
          <button
            type="button"
            onClick={() => navigateCursor(1)}
            className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {mode === 'month' && (
          <div className="grid grid-cols-7 border-collapse">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                className="py-2 px-2 text-center text-xs font-semibold text-slate-500 bg-slate-50 border-b border-r border-slate-200 last:border-r-0"
              >
                {d}
              </div>
            ))}
            {monthGridDays.map((d) => {
              const iso = toIso(d);
              const inMonth = d.getMonth() === cursorDate.getMonth();
              const dayEvents = eventsOnDate(iso);
              return (
                <div
                  key={iso}
                  className={`min-h-[108px] p-1.5 border-b border-r border-slate-200 text-xs ${
                    inMonth ? 'bg-white' : 'bg-slate-50/70 text-slate-400'
                  }`}
                >
                  <div className="font-mono-num text-[11px] font-semibold mb-1">{d.getDate()}</div>
                  <div className="space-y-1">
                    {dayEvents.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onViewTev(ev.id)}
                        className={`w-full text-left px-1.5 py-1 rounded border text-[11px] truncate cursor-pointer ${getVisualBadge(
                          ev
                        )}`}
                        title={`${ev.employeeName} — ${ev.destination} (${ev.overallStatus})`}
                      >
                        {overlappingIds.has(ev.id) ? '⚠ ' : ''}
                        {ev.employeeName} · {ev.destination}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {mode === 'week' && (
          <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            {weekDays.map((d) => {
              const iso = toIso(d);
              const dayEvents = eventsOnDate(iso);
              return (
                <div key={iso} className="min-h-[260px] p-3 space-y-2">
                  <div className="text-xs font-semibold text-slate-800 border-b border-slate-100 pb-1.5">
                    {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  {dayEvents.length === 0 ? (
                    <p className="text-xs text-slate-400">No travel scheduled</p>
                  ) : (
                    dayEvents.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => onViewTev(ev.id)}
                        className={`w-full text-left p-2 rounded-lg border text-xs cursor-pointer ${getVisualBadge(
                          ev
                        )}`}
                      >
                        <div className="font-semibold truncate">{ev.employeeName}</div>
                        <div className="text-[11px] truncate">{ev.destination}</div>
                        <div className="text-[10px] font-mono-num mt-0.5">{ev.tevRefNumber}</div>
                      </button>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}

        {mode === 'day' && (
          <div className="p-5 space-y-3">
            {eventsOnDate(toIso(cursorDate)).length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">
                No official travels scheduled on {toIso(cursorDate)}.
              </p>
            ) : (
              eventsOnDate(toIso(cursorDate)).map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onViewTev(ev.id)}
                  className={`w-full text-left p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 cursor-pointer ${getVisualBadge(
                    ev
                  )}`}
                >
                  <div>
                    <div className="text-sm font-semibold">
                      {ev.employeeName} — {ev.destination}
                    </div>
                    <div className="text-xs mt-0.5">
                      {ev.officeName} · {ev.purpose}
                    </div>
                  </div>
                  <div className="text-right font-mono-num text-xs">
                    <div className="font-semibold">{ev.tevRefNumber}</div>
                    <div>
                      {ev.departureDate} to {ev.returnDate} ({ev.overallStatus})
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
