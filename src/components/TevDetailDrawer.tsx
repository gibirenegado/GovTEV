import React, { useMemo, useState } from 'react';
import {
  X,
  Check,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  Plus,
  PauseCircle,
  PlayCircle,
  Printer,
  FileDown,
  Edit3,
  AlertTriangle,
  History,
  Save,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  addCustomChecklistItemToTev,
  bulkToggleChecklistApplicable,
  deleteAttachmentRecord,
  deleteCustomChecklistItemFromTev,
  saveRequirementTemplate,
  syncTravelRecordFromChecklist,
  updateChecklistItemAndSyncTev,
  uploadAttachmentDocument,
} from '../lib/firestoreService';
import { exportIndividualTevPdf } from '../lib/pdfService';
import {
  getOverallStatusStyle,
  getRequirementStageVisual,
  todayIsoDate,
} from '../lib/tevCalculations';
import { AttachmentRecord, TravelRecord, TravelRequirementChecklist } from '../types/tev';

interface TevDetailDrawerProps {
  tevId: string;
  onClose: () => void;
  onEditTev: (tev: TravelRecord) => void;
}

export function TevDetailDrawer({ tevId, onClose, onEditTev }: TevDetailDrawerProps) {
  const {
    currentUser,
    travelRecords,
    checklists,
    attachments,
    requirementTemplates,
    settings,
    showToast,
  } = useWorkspace();

  const tev = useMemo(() => travelRecords.find((t) => t.id === tevId), [travelRecords, tevId]);
  const tevItems = useMemo(
    () =>
      checklists
        .filter((c) => c.tevId === tevId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [checklists, tevId]
  );
  const tevAttachments = useMemo(
    () => attachments.filter((a) => a.tevId === tevId),
    [attachments, tevId]
  );

  const [newCustomReqName, setNewCustomReqName] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemName, setEditingItemName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveTplName, setSaveTplName] = useState('');
  const [showSaveTplModal, setShowSaveTplModal] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentRecord | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!tev || !currentUser) return null;

  const isAdmin = currentUser.role === 'admin';
  const canEdit =
    isAdmin || (currentUser.role === 'encoder' && tev.overallStatus !== 'Completed');
  const statusStyle = getOverallStatusStyle(tev.overallStatus);

  const handleToggleStage = async (
    item: TravelRequirementChecklist,
    stage: 'prepared' | 'submitted' | 'signed' | 'approved' | 'returnedForCorrection' | 'applicable'
  ) => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const nextVal = !item[stage];
      const patch: Record<string, any> = { [stage]: nextVal };
      const today = todayIsoDate();

      if (stage === 'prepared' && nextVal && !item.datePrepared) patch.datePrepared = today;
      if (stage === 'submitted' && nextVal && !item.dateSubmitted) patch.dateSubmitted = today;
      if (stage === 'signed' && nextVal && !item.dateSigned) patch.dateSigned = today;
      if (stage === 'approved' && nextVal && !item.dateApproved) patch.dateApproved = today;

      const labelMap: Record<string, string> = {
        applicable: nextVal ? 'Marked Applicable' : 'Marked Not Applicable',
        prepared: nextVal ? 'Marked Prepared' : 'Unchecked Prepared',
        submitted: nextVal ? 'Marked Submitted' : 'Unchecked Submitted',
        signed: nextVal ? 'Marked Signed' : 'Unchecked Signed',
        approved: nextVal ? 'Marked Approved' : 'Unchecked Approved',
        returnedForCorrection: nextVal ? 'Flagged Returned/Overdue' : 'Cleared Return Flag',
      };

      await updateChecklistItemAndSyncTev(
        currentUser,
        tev,
        tevItems,
        item.id,
        patch,
        `${item.requirementName}: ${labelMap[stage]}`
      );
      showToast('success', `${item.requirementName} updated.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update checklist status.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateMetadataField = async (
    item: TravelRequirementChecklist,
    patch: Partial<
      Pick<
        TravelRequirementChecklist,
        | 'datePrepared'
        | 'dateSubmitted'
        | 'dateSigned'
        | 'dateApproved'
        | 'signatoryName'
        | 'approvingOfficerName'
        | 'remarks'
      >
    >
  ) => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      await updateChecklistItemAndSyncTev(
        currentUser,
        tev,
        tevItems,
        item.id,
        patch,
        `Updated metadata/signatory/remarks for ${item.requirementName}.`
      );
      showToast('success', `Saved details for ${item.requirementName}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save requirement metadata.');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectAll = async (selectAll: boolean) => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const ids = selectAll ? new Set(tevItems.map((i) => i.id)) : new Set<string>();
      await bulkToggleChecklistApplicable(
        currentUser,
        tev,
        tevItems,
        ids,
        selectAll ? 'Selected all documentary requirements as applicable.' : 'Deselected all documentary requirements.'
      );
      showToast('success', selectAll ? 'All requirements marked applicable.' : 'All requirements deselected.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update applicability.');
    } finally {
      setBusy(false);
    }
  };

  const handleApplyTemplate = async () => {
    if (!canEdit || !selectedTemplateId || busy) return;
    const tpl = requirementTemplates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    setBusy(true);
    try {
      const ids = new Set(tpl.requirementIds);
      await bulkToggleChecklistApplicable(
        currentUser,
        tev,
        tevItems,
        ids,
        `Applied requirement template "${tpl.name}".`
      );
      showToast('success', `Applied template "${tpl.name}".`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to apply template.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!saveTplName.trim() || busy) return;
    const applicableItems = tevItems.filter((i) => i.applicable);
    setBusy(true);
    try {
      await saveRequirementTemplate(currentUser, {
        name: saveTplName.trim(),
        description: `Saved from TEV ${tev.tevRefNumber}`,
        requirementIds: applicableItems.map((i) => i.requirementId),
        requirementNames: applicableItems.map((i) => i.requirementName),
      });
      setSaveTplName('');
      setShowSaveTplModal(false);
      showToast('success', 'Requirement template saved.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save template.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddCustomReq = async () => {
    if (!canEdit || !newCustomReqName.trim() || busy) return;
    setBusy(true);
    try {
      await addCustomChecklistItemToTev(currentUser, tev, tevItems, newCustomReqName.trim());
      setNewCustomReqName('');
      showToast('success', 'Custom documentary requirement added.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to add custom requirement.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCustomName = async (item: TravelRequirementChecklist) => {
    if (!canEdit || !editingItemName.trim() || busy) return;
    setBusy(true);
    try {
      await updateChecklistItemAndSyncTev(
        currentUser,
        tev,
        tevItems,
        item.id,
        { requirementName: editingItemName.trim() },
        `Renamed custom requirement to "${editingItemName.trim()}".`
      );
      setEditingItemId(null);
      showToast('success', 'Custom requirement renamed.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to rename requirement.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteCustomItem = async (item: TravelRequirementChecklist) => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      await deleteCustomChecklistItemFromTev(currentUser, tev, tevItems, item);
      showToast('success', `Removed "${item.requirementName}".`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to delete requirement.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleOnHold = async () => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      await syncTravelRecordFromChecklist(currentUser, tev, tevItems, !tev.manualOnHold);
      showToast('success', tev.manualOnHold ? 'Hold released.' : 'TEV placed On Hold.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update On Hold state.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = async (
    item: TravelRequirementChecklist,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEdit) return;
    setUploadingItemId(item.id);
    try {
      const existingForItem = tevAttachments.filter((a) => a.checklistItemId === item.id);
      await uploadAttachmentDocument(currentUser, tev, item, file, existingForItem);
      showToast('success', `Uploaded "${file.name}" for ${item.requirementName}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Upload failed.');
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleDeleteAttachment = async (att: AttachmentRecord) => {
    if (!isAdmin || busy) return;
    setBusy(true);
    try {
      await deleteAttachmentRecord(currentUser, att);
      showToast('success', `Deleted attachment "${att.fileName}".`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to delete attachment.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadAttachment = (att: AttachmentRecord) => {
    const a = document.createElement('a');
    a.href = att.dataUrl;
    a.download = att.fileName;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex justify-end overflow-hidden">
      <div className="w-full max-w-5xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col print-container">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 no-print">
          <div className="min-w-0">
            <div className="flex items-center gap-3 text-xs text-slate-300">
              <span className="font-mono-num font-semibold text-sky-400">{tev.tevRefNumber}</span>
              <span>·</span>
              <span>{tev.officeName}</span>
              {tev.isSampleData && (
                <>
                  <span>·</span>
                  <span className="text-amber-300 font-medium">Demonstration Sample Record</span>
                </>
              )}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white truncate">
              {tev.employeeName} — {tev.destination}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={handleToggleOnHold}
                  disabled={busy}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                    tev.manualOnHold
                      ? 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {tev.manualOnHold ? (
                    <>
                      <PlayCircle className="w-3.5 h-3.5" /> Release Hold
                    </>
                  ) : (
                    <>
                      <PauseCircle className="w-3.5 h-3.5" /> Place On Hold
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onEditTev(tev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 cursor-pointer whitespace-nowrap"
                >
                  <Edit3 className="w-3.5 h-3.5" /> Edit Info
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => exportIndividualTevPdf(tev, tevItems, settings.agencyName)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 cursor-pointer whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" /> Export PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" /> Print Summary
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              aria-label="Close details"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Agency Banner */}
        <div className="hidden print-only px-6 pt-4 pb-2 border-b border-slate-300">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{settings.agencyName}</div>
          <div className="text-lg font-bold text-slate-900">Travel Expense Voucher Summary — {tev.tevRefNumber}</div>
        </div>

        <div className="p-6 space-y-6">
          {/* Terminal Lock Notice for Non-Admin */}
          {tev.overallStatus === 'Completed' && !isAdmin && (
            <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 no-print">
              <Check className="w-4 h-4 shrink-0" />
              This TEV is Completed. Only an Administrator can modify or reopen completed transactions.
            </div>
          )}

          {/* Overview Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border border-slate-200 rounded-xl p-5 bg-slate-50/60">
            <div>
              <div className="text-xs text-slate-500">Employee &amp; Designation</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{tev.employeeName}</div>
              <div className="text-xs text-slate-600 mt-0.5">
                {tev.position || '—'} · <span className="font-mono-num">{tev.employeeCode || '—'}</span>
              </div>
              <div className="text-xs text-slate-600 mt-0.5">{tev.officeName}</div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Travel Schedule &amp; Order</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{tev.destination}</div>
              <div className="text-xs text-slate-600 font-mono-num mt-0.5">
                {tev.departureDate} to {tev.returnDate} ({tev.travelDays} {tev.travelDays === 1 ? 'day' : 'days'})
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                TO: <span className="font-mono-num">{tev.travelOrderNumber || '—'}</span> ({tev.travelOrderDate || '—'})
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Overall Status &amp; Compliance</div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold border ${statusStyle.bgClass} ${statusStyle.textClass} ${statusStyle.borderClass}`}
                >
                  {tev.overallStatus}
                </span>
                <span className="text-sm font-semibold font-mono-num text-slate-900">
                  {tev.applicableCount === 0
                    ? 'No Requirements Selected'
                    : `${tev.compliancePercentage}% (${tev.completedCount}/${tev.applicableCount})`}
                </span>
              </div>
              <div className="mt-2 h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    tev.compliancePercentage === 100 ? 'bg-emerald-600' : 'bg-sky-600'
                  }`}
                  style={{ width: `${tev.applicableCount === 0 ? 0 : tev.compliancePercentage}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Officer: {tev.processingOfficer || 'Unassigned'} · Submitted: <span className="font-mono-num">{tev.submissionDate || '—'}</span>
              </div>
            </div>

            <div className="md:col-span-3 pt-3 border-t border-slate-200 flex flex-wrap gap-6 text-xs text-slate-700">
              <div className="flex-1 min-w-[240px]">
                <span className="font-semibold text-slate-900">Purpose: </span>
                {tev.purpose}
              </div>
              {tev.remarks && (
                <div className="flex-1 min-w-[240px]">
                  <span className="font-semibold text-slate-900">Remarks: </span>
                  {tev.remarks}
                </div>
              )}
            </div>
          </div>

          {/* Checklist Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 no-print">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Documentary Requirements Checklist
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Prepared, Submitted, Signed, and Approved are tracked independently. All 4 stages must be completed for compliance.
              </p>
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Deselect All
                </button>

                <div className="flex items-center gap-1.5">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
                  >
                    <option value="">Apply saved template...</option>
                    {requirementTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleApplyTemplate}
                    disabled={!selectedTemplateId || busy}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  >
                    Apply
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSaveTplModal((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save as Template
                </button>
              </div>
            )}
          </div>

          {showSaveTplModal && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-3 no-print">
              <input
                type="text"
                value={saveTplName}
                onChange={(e) => setSaveTplName(e.target.value)}
                placeholder="Template name (e.g., Regional Field Inspection)"
                className="flex-1 min-w-[220px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              />
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                disabled={!saveTplName.trim() || busy}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                Save Template
              </button>
              <button
                type="button"
                onClick={() => setShowSaveTplModal(false)}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Checklist Table */}
          <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-3">App.</th>
                  <th className="py-3 px-3">Requirement Name</th>
                  <th className="py-3 px-2 text-center">Prepared</th>
                  <th className="py-3 px-2 text-center">Submitted</th>
                  <th className="py-3 px-2 text-center">Signed</th>
                  <th className="py-3 px-2 text-center">Approved</th>
                  <th className="py-3 px-3">Stage Status</th>
                  <th className="py-3 px-3 text-right no-print">Files &amp; Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {tevItems.map((item) => {
                  const visual = getRequirementStageVisual(item);
                  const itemAtts = tevAttachments.filter((a) => a.checklistItemId === item.id);
                  const latestAtt = itemAtts.find((a) => a.isLatest) || itemAtts[0];
                  const isExpanded = expandedItemId === item.id;

                  return (
                    <React.Fragment key={item.id}>
                      <tr className={`${item.applicable ? 'bg-white' : 'bg-slate-50/70 opacity-75'} hover:bg-slate-50`}>
                        <td className="py-3 px-3">
                          <input
                            type="checkbox"
                            checked={item.applicable}
                            disabled={!canEdit || busy}
                            onChange={() => handleToggleStage(item, 'applicable')}
                            className="w-4 h-4 rounded border-slate-300 text-slate-900 cursor-pointer"
                            aria-label={`Mark ${item.requirementName} applicable`}
                          />
                        </td>
                        <td className="py-3 px-3 min-w-[200px]">
                          {editingItemId === item.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingItemName}
                                onChange={(e) => setEditingItemName(e.target.value)}
                                className="px-2 py-1 text-xs border border-slate-300 rounded w-full"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveCustomName(item)}
                                className="px-2 py-1 text-xs bg-slate-900 text-white rounded cursor-pointer"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium text-slate-900">{item.requirementName}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {item.isCustom ? 'Custom requirement' : 'Standard requirement'}
                                {item.signatoryName && ` · Signatory: ${item.signatoryName}`}
                                {item.approvingOfficerName && ` · Approver: ${item.approvingOfficerName}`}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Independent 4-Stage Controls */}
                        {(['prepared', 'submitted', 'signed', 'approved'] as const).map((stage) => {
                          const checked = item[stage];
                          const activeColors = {
                            prepared: 'bg-blue-600 border-blue-600 text-white',
                            submitted: 'bg-amber-500 border-amber-500 text-white',
                            signed: 'bg-purple-600 border-purple-600 text-white',
                            approved: 'bg-emerald-600 border-emerald-600 text-white',
                          }[stage];

                          const dateVal =
                            stage === 'prepared'
                              ? item.datePrepared
                              : stage === 'submitted'
                              ? item.dateSubmitted
                              : stage === 'signed'
                              ? item.dateSigned
                              : item.dateApproved;

                          return (
                            <td key={stage} className="py-3 px-2 text-center">
                              <button
                                type="button"
                                disabled={!item.applicable || !canEdit || busy}
                                onClick={() => handleToggleStage(item, stage)}
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-md border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                                  checked
                                    ? activeColors
                                    : 'bg-white border-slate-300 text-slate-400 hover:border-slate-500'
                                }`}
                                title={`Toggle ${stage}`}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              {dateVal && (
                                <div className="text-[10px] font-mono-num text-slate-500 mt-0.5">
                                  {dateVal}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${visual.bgClass} ${visual.textClass} ${visual.borderClass}`}
                          >
                            {visual.label}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap no-print">
                          <div className="inline-flex items-center gap-1.5">
                            {latestAtt && (
                              <button
                                type="button"
                                onClick={() => setPreviewAttachment(latestAtt)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded hover:bg-sky-100 cursor-pointer"
                                title={`Preview ${latestAtt.fileName}`}
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span className="font-mono-num">v{latestAtt.version}</span>
                              </button>
                            )}
                            {canEdit && (
                              <label className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer">
                                <Upload className="w-3.5 h-3.5" />
                                <span>{uploadingItemId === item.id ? '...' : latestAtt ? 'Replace' : 'Upload'}</span>
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                                  className="hidden"
                                  onChange={(e) => handleFileUpload(item, e)}
                                  disabled={uploadingItemId === item.id}
                                />
                              </label>
                            )}
                            <button
                              type="button"
                              onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                              className="px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded hover:bg-slate-200 cursor-pointer"
                            >
                              {isExpanded ? 'Hide' : 'Details'}
                            </button>
                            {item.isCustom && canEdit && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItemId(item.id);
                                    setEditingItemName(item.requirementName);
                                  }}
                                  className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                                  title="Edit custom requirement"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCustomItem(item)}
                                  className="p-1 text-red-500 hover:text-red-700 cursor-pointer"
                                  title="Delete custom requirement"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Metadata & Attachment History Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 no-print">
                          <td colSpan={8} className="p-4 border-t border-slate-200">
                            <ExpandedChecklistEditor
                              item={item}
                              attachments={itemAtts}
                              canEdit={canEdit}
                              isAdmin={isAdmin}
                              busy={busy}
                              onSave={(patch) => handleUpdateMetadataField(item, patch)}
                              onToggleReturn={() => handleToggleStage(item, 'returnedForCorrection')}
                              onPreviewAttachment={setPreviewAttachment}
                              onDownloadAttachment={handleDownloadAttachment}
                              onDeleteAttachment={handleDeleteAttachment}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Custom Requirement */}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 no-print">
              <input
                type="text"
                value={newCustomReqName}
                onChange={(e) => setNewCustomReqName(e.target.value)}
                placeholder="Add custom requirement for this travel (e.g., Special Order, Foreign Currency Clearance)..."
                className="flex-1 min-w-[260px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              />
              <button
                type="button"
                onClick={handleAddCustomReq}
                disabled={!newCustomReqName.trim() || busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Custom Requirement
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Document Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-[60] bg-slate-950/75 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-900 text-white">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{previewAttachment.fileName}</div>
                <div className="text-xs text-slate-300">
                  {previewAttachment.requirementName} · Version {previewAttachment.version} ·{' '}
                  {Math.round(previewAttachment.fileSize / 1024)} KB
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadAttachment(previewAttachment)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-500 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="p-1.5 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 p-4 flex items-center justify-center min-h-[400px]">
              {['jpg', 'jpeg', 'png'].includes(previewAttachment.fileExtension) ? (
                <img
                  src={previewAttachment.dataUrl}
                  alt={previewAttachment.fileName}
                  className="max-w-full max-h-[70vh] object-contain rounded border border-slate-200 bg-white"
                />
              ) : previewAttachment.fileExtension === 'pdf' ? (
                <iframe
                  src={previewAttachment.dataUrl}
                  title={previewAttachment.fileName}
                  className="w-full h-[70vh] rounded border border-slate-200 bg-white"
                />
              ) : (
                <div className="text-center p-8 bg-white rounded-xl border border-slate-200 max-w-md">
                  <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="mt-3 text-sm font-medium text-slate-900">
                    {previewAttachment.fileName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Office documents (.{previewAttachment.fileExtension}) cannot be previewed inline. Click Download to open in your office suite.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandedChecklistEditor({
  item,
  attachments,
  canEdit,
  isAdmin,
  busy,
  onSave,
  onToggleReturn,
  onPreviewAttachment,
  onDownloadAttachment,
  onDeleteAttachment,
}: {
  item: TravelRequirementChecklist;
  attachments: AttachmentRecord[];
  canEdit: boolean;
  isAdmin: boolean;
  busy: boolean;
  onSave: (patch: Partial<TravelRequirementChecklist>) => void;
  onToggleReturn: () => void;
  onPreviewAttachment: (att: AttachmentRecord) => void;
  onDownloadAttachment: (att: AttachmentRecord) => void;
  onDeleteAttachment: (att: AttachmentRecord) => void;
}) {
  const [datePrepared, setDatePrepared] = useState(item.datePrepared);
  const [dateSubmitted, setDateSubmitted] = useState(item.dateSubmitted);
  const [dateSigned, setDateSigned] = useState(item.dateSigned);
  const [dateApproved, setDateApproved] = useState(item.dateApproved);
  const [signatoryName, setSignatoryName] = useState(item.signatoryName);
  const [approvingOfficerName, setApprovingOfficerName] = useState(item.approvingOfficerName);
  const [remarks, setRemarks] = useState(item.remarks);

  const sortedAtts = [...attachments].sort((a, b) => b.version - a.version);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Date Prepared</label>
          <input
            type="date"
            value={datePrepared}
            disabled={!canEdit}
            onChange={(e) => setDatePrepared(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white font-mono-num"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Date Submitted</label>
          <input
            type="date"
            value={dateSubmitted}
            disabled={!canEdit}
            onChange={(e) => setDateSubmitted(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white font-mono-num"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Date Signed</label>
          <input
            type="date"
            value={dateSigned}
            disabled={!canEdit}
            onChange={(e) => setDateSigned(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white font-mono-num"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Date Approved</label>
          <input
            type="date"
            value={dateApproved}
            disabled={!canEdit}
            onChange={(e) => setDateApproved(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white font-mono-num"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name of Signatory</label>
          <input
            type="text"
            value={signatoryName}
            disabled={!canEdit}
            onChange={(e) => setSignatoryName(e.target.value)}
            placeholder="e.g., Dir. Elena Villanueva"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Approving Officer</label>
          <input
            type="text"
            value={approvingOfficerName}
            disabled={!canEdit}
            onChange={(e) => setApprovingOfficerName(e.target.value)}
            placeholder="e.g., Dir. Carmela Mendoza"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
          <input
            type="text"
            value={remarks}
            disabled={!canEdit}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Document notes or findings"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
          />
        </div>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onToggleReturn}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer ${
              item.returnedForCorrection
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {item.returnedForCorrection ? 'Clear Returned / Overdue Flag' : 'Flag Returned for Correction'}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onSave({
                datePrepared,
                dateSubmitted,
                dateSigned,
                dateApproved,
                signatoryName,
                approvingOfficerName,
                remarks,
              })
            }
            className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 cursor-pointer"
          >
            Save Requirement Details
          </button>
        </div>
      )}

      {/* Attachment Version History */}
      <div className="pt-3 border-t border-slate-200">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
          <History className="w-3.5 h-3.5" />
          Attachment History ({sortedAtts.length})
        </div>
        {sortedAtts.length === 0 ? (
          <p className="text-xs text-slate-500">No files uploaded for this requirement yet. Supported: PDF, JPG, JPEG, PNG, DOCX, XLSX (up to 620 KB).</p>
        ) : (
          <div className="space-y-1.5">
            {sortedAtts.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900">{att.fileName}</span>
                  <span className="text-slate-500 ml-2 font-mono-num">
                    v{att.version} {att.isLatest ? '(Latest)' : '(Previous)'} · {Math.round(att.fileSize / 1024)} KB · by {att.uploadedByName}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreviewAttachment(att)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-sky-700 hover:bg-sky-50 rounded cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownloadAttachment(att)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-slate-700 hover:bg-slate-100 rounded cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onDeleteAttachment(att)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
