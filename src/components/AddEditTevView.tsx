import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckSquare, Plus, Save, ArrowLeft } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  createTravelRecordWithChecklist,
  updateTravelRecordDetails,
} from '../lib/firestoreService';
import {
  calculateTravelDays,
  checkOverlappingTravel,
  createClientId,
  generateTevRefNumber,
  todayIsoDate,
} from '../lib/tevCalculations';
import { TravelRecord } from '../types/tev';

interface AddEditTevViewProps {
  editingRecord?: TravelRecord | null;
  onSuccess: (tevId: string) => void;
  onCancel: () => void;
}

export function AddEditTevView({ editingRecord, onSuccess, onCancel }: AddEditTevViewProps) {
  const {
    currentUser,
    employees,
    offices,
    documentaryRequirements,
    requirementTemplates,
    travelRecords,
    settings,
    showToast,
  } = useWorkspace();

  const isEditing = Boolean(editingRecord);
  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'active'), [employees]);
  const activeOffices = useMemo(() => offices.filter((o) => o.status === 'active'), [offices]);
  const activeRequirements = useMemo(
    () => documentaryRequirements.filter((r) => r.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder),
    [documentaryRequirements]
  );

  const [employeeId, setEmployeeId] = useState(editingRecord?.employeeId || '');
  const [employeeCode, setEmployeeCode] = useState(editingRecord?.employeeCode || '');
  const [employeeName, setEmployeeName] = useState(editingRecord?.employeeName || '');
  const [officeId, setOfficeId] = useState(editingRecord?.officeId || '');
  const [officeName, setOfficeName] = useState(editingRecord?.officeName || '');
  const [position, setPosition] = useState(editingRecord?.position || '');
  const [overrideOffice, setOverrideOffice] = useState(false);

  const [destination, setDestination] = useState(editingRecord?.destination || '');
  const [purpose, setPurpose] = useState(editingRecord?.purpose || '');
  const [departureDate, setDepartureDate] = useState(editingRecord?.departureDate || todayIsoDate());
  const [returnDate, setReturnDate] = useState(editingRecord?.returnDate || todayIsoDate());
  const [travelOrderNumber, setTravelOrderNumber] = useState(editingRecord?.travelOrderNumber || '');
  const [travelOrderDate, setTravelOrderDate] = useState(editingRecord?.travelOrderDate || '');
  const [tevRefNumber, setTevRefNumber] = useState(
    editingRecord?.tevRefNumber ||
      generateTevRefNumber(travelRecords, settings.tevRefPrefix, settings.tevRefSeparator)
  );
  const [submissionDate, setSubmissionDate] = useState(editingRecord?.submissionDate || '');
  const [processingOfficer, setProcessingOfficer] = useState(editingRecord?.processingOfficer || '');
  const [completionDate, setCompletionDate] = useState(editingRecord?.completionDate || '');
  const [remarks, setRemarks] = useState(editingRecord?.remarks || '');

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [applicableMap, setApplicableMap] = useState<Record<string, boolean>>({});
  const [customRequirements, setCustomRequirements] = useState<Array<{ id: string; name: string }>>([]);
  const [customInput, setCustomInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing && activeRequirements.length > 0 && Object.keys(applicableMap).length === 0) {
      const defaults = new Set(settings.defaultRequirementIds || []);
      const map: Record<string, boolean> = {};
      for (const req of activeRequirements) {
        map[req.id] = defaults.size > 0 ? defaults.has(req.id) : req.isDefault;
      }
      setApplicableMap(map);
    }
  }, [activeRequirements, isEditing, settings.defaultRequirementIds]);

  const handleSelectEmployee = (empId: string) => {
    setEmployeeId(empId);
    const emp = employees.find((e) => e.id === empId);
    if (emp) {
      setEmployeeName(emp.fullName);
      setEmployeeCode(emp.employeeCode);
      setPosition(emp.position);
      if (!overrideOffice) {
        setOfficeId(emp.officeId);
        setOfficeName(emp.officeName);
      }
    }
  };

  const handleSelectOffice = (offId: string) => {
    setOfficeId(offId);
    const off = offices.find((o) => o.id === offId);
    if (off) {
      setOfficeName(off.name);
    }
  };

  const handleApplyTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = requirementTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    const set = new Set(tpl.requirementIds);
    const nextMap: Record<string, boolean> = {};
    for (const req of activeRequirements) {
      nextMap[req.id] = set.has(req.id);
    }
    setApplicableMap(nextMap);
  };

  const handleAddCustom = () => {
    if (!customInput.trim()) return;
    const id = createClientId('custom_req');
    setCustomRequirements((prev) => [...prev, { id, name: customInput.trim() }]);
    setApplicableMap((prev) => ({ ...prev, [id]: true }));
    setCustomInput('');
  };

  const travelDays = calculateTravelDays(departureDate, returnDate);

  const overlappingRecords = useMemo(
    () =>
      checkOverlappingTravel(
        employeeId,
        departureDate,
        returnDate,
        travelRecords,
        editingRecord?.id
      ),
    [employeeId, departureDate, returnDate, travelRecords, editingRecord?.id]
  );

  const duplicateRef = useMemo(() => {
    if (isEditing) return false;
    return travelRecords.some(
      (r) => r.tevRefNumber.toLowerCase() === tevRefNumber.trim().toLowerCase()
    );
  }, [isEditing, tevRefNumber, travelRecords]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!employeeId || !officeId) {
      showToast('error', 'Please select a registered employee and office.');
      return;
    }
    if (!destination.trim() || !purpose.trim()) {
      showToast('error', 'Destination and Purpose of Travel are required.');
      return;
    }
    if (returnDate < departureDate) {
      showToast('error', 'Date of Return cannot be earlier than Date of Departure.');
      return;
    }
    if (duplicateRef) {
      showToast('error', `TEV Reference Number "${tevRefNumber}" already exists.`);
      return;
    }

    setSaving(true);
    try {
      if (isEditing && editingRecord) {
        await updateTravelRecordDetails(currentUser, editingRecord, {
          employeeId,
          employeeCode,
          employeeName,
          officeId,
          officeName,
          position,
          destination,
          purpose,
          departureDate,
          returnDate,
          travelOrderNumber,
          travelOrderDate,
          submissionDate,
          processingOfficer,
          completionDate,
          remarks,
        });
        showToast('success', `Updated TEV record ${editingRecord.tevRefNumber}.`);
        onSuccess(editingRecord.id);
      } else {
        const defs = [
          ...activeRequirements.map((req) => ({
            requirementId: req.id,
            requirementName: req.name,
            isCustom: req.isCustom,
            sortOrder: req.sortOrder,
            applicable: Boolean(applicableMap[req.id]),
          })),
          ...customRequirements.map((c, idx) => ({
            requirementId: c.id,
            requirementName: c.name,
            isCustom: true,
            sortOrder: activeRequirements.length + idx + 1,
            applicable: Boolean(applicableMap[c.id]),
          })),
        ];

        const newId = await createTravelRecordWithChecklist(
          currentUser,
          {
            tevRefNumber,
            employeeId,
            employeeCode,
            employeeName,
            officeId,
            officeName,
            position,
            destination,
            purpose,
            departureDate,
            returnDate,
            travelOrderNumber,
            travelOrderDate,
            submissionDate,
            processingOfficer,
            remarks,
            isSampleData: false,
          },
          defs
        );
        showToast('success', `Created TEV record ${tevRefNumber}.`);
        onSuccess(newId);
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save travel record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {isEditing ? `Edit Travel Record — ${editingRecord?.tevRefNumber}` : 'Record New Travel & TEV'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Official travel details and independent documentary requirements configuration.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      </div>

      {overlappingRecords.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Schedule Overlap Warning:</span> {employeeName} already has travel recorded during these dates ({overlappingRecords.map((o) => `${o.tevRefNumber}: ${o.departureDate} to ${o.returnDate}`).join('; ')}). Verify before saving.
          </div>
        </div>
      )}

      {/* A. Employee Information */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <h3 className="text-sm font-semibold text-slate-900">1. Employee &amp; Office Information</h3>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={overrideOffice}
              onChange={(e) => setOverrideOffice(e.target.checked)}
              className="rounded border-slate-300"
            />
            Override office for this travel only (preserves historical records)
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Select Employee <span className="text-red-600">*</span>
            </label>
            <select
              required
              value={employeeId}
              onChange={(e) => handleSelectEmployee(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Choose registered employee...</option>
              {activeEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode}) — {emp.officeName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Office / Division / Unit <span className="text-red-600">*</span>
            </label>
            <select
              required
              value={officeId}
              disabled={!overrideOffice && Boolean(employeeId)}
              onChange={(e) => handleSelectOffice(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
            >
              <option value="">Select office...</option>
              {activeOffices.map((off) => (
                <option key={off.id} value={off.id}>
                  {off.name} ({off.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Position / Designation</label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Employee ID</label>
            <input
              type="text"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
        </div>
      </section>

      {/* B. Travel Information */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
          2. Travel &amp; Administrative Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              TEV Reference Number <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              disabled={isEditing}
              value={tevRefNumber}
              onChange={(e) => setTevRefNumber(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num disabled:bg-slate-100"
            />
            {duplicateRef && (
              <p className="mt-1 text-xs text-red-600">Duplicate reference number detected.</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Destination / Location of Travel <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g., Puerto Princesa City, Palawan"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Purpose of Travel <span className="text-red-600">*</span>
            </label>
            <textarea
              required
              rows={2}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Official purpose, workshop, field inspection, or conference details..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Date of Departure <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              required
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Date of Return <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              required
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Number of Travel Days</label>
            <input
              type="text"
              readOnly
              value={`${travelDays} ${travelDays === 1 ? 'day' : 'days'}`}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 font-mono-num text-slate-700"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Travel Order Number</label>
            <input
              type="text"
              value={travelOrderNumber}
              onChange={(e) => setTravelOrderNumber(e.target.value)}
              placeholder="e.g., TO-2026-1142"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Travel Order Date</label>
            <input
              type="date"
              value={travelOrderDate}
              onChange={(e) => setTravelOrderDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Date of Submission</label>
            <input
              type="date"
              value={submissionDate}
              onChange={(e) => setSubmissionDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Processing Officer</label>
            <input
              type="text"
              value={processingOfficer}
              onChange={(e) => setProcessingOfficer(e.target.value)}
              placeholder="e.g., R. Mendoza (Accounting)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {isEditing && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date of Completion</label>
              <input
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
              />
            </div>
          )}

          <div className={isEditing ? 'md:col-span-1' : 'md:col-span-2'}>
            <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional administrative remarks..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </section>

      {/* C. Customizable Documentary Requirements (on Create) */}
      {!isEditing && (
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                3. Applicable Documentary Requirements Checklist
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Select which requirements apply to this travel. All applicable items start as Not Yet Prepared.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleApplyTemplate(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Apply Requirement Template...</option>
                {requirementTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  activeRequirements.forEach((r) => (next[r.id] = true));
                  customRequirements.forEach((c) => (next[c.id] = true));
                  setApplicableMap(next);
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setApplicableMap({})}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeRequirements.map((req) => (
              <label
                key={req.id}
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                  applicableMap[req.id]
                    ? 'bg-sky-50/70 border-sky-200'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(applicableMap[req.id])}
                  onChange={(e) =>
                    setApplicableMap((prev) => ({ ...prev, [req.id]: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-slate-300"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900">{req.name}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{req.code}</div>
                </div>
              </label>
            ))}

            {customRequirements.map((c) => (
              <label
                key={c.id}
                className="flex items-start gap-2.5 p-3 rounded-lg border bg-sky-50/70 border-sky-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={Boolean(applicableMap[c.id])}
                  onChange={(e) =>
                    setApplicableMap((prev) => ({ ...prev, [c.id]: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-slate-300"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900">{c.name}</div>
                  <div className="text-[11px] text-sky-700 mt-0.5">Custom Requirement</div>
                </div>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Add custom requirement (optional)..."
              className="flex-1 min-w-[220px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={handleAddCustom}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Custom
            </button>
          </div>
        </section>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || duplicateRef}
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
        >
          {isEditing ? <Save className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Travel Record & Checklist'}
        </button>
      </div>
    </form>
  );
}
