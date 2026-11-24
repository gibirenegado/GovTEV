import React, { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Save } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { saveSystemSettings, updateUserRoleAndStatus } from '../lib/firestoreService';
import { formatTimestamp } from '../lib/tevCalculations';
import { UserProfile, UserRole } from '../types/tev';

export function ActivityLogsView() {
  const { activityLogs } = useWorkspace();
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const entities = useMemo(() => {
    const s = new Set<string>();
    activityLogs.forEach((l) => s.add(l.entityType));
    return Array.from(s).sort();
  }, [activityLogs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return activityLogs.filter((l) => {
      if (entityFilter && l.entityType !== entityFilter) return false;
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        l.entityLabel.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.userName.toLowerCase().includes(q)
      );
    });
  }, [activityLogs, search, entityFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">System Activity &amp; Audit Logs</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Immutable chronological record of TEV creations, checklist updates, signatures, approvals, imports, and attachments
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs by action, TEV, user, or details..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Entity Types</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="py-3 px-3">Timestamp</th>
              <th className="py-3 px-3">User &amp; Role</th>
              <th className="py-3 px-3">Action</th>
              <th className="py-3 px-3">Target Record</th>
              <th className="py-3 px-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.slice(0, 200).map((log) => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-mono-num text-slate-500 whitespace-nowrap">
                  {formatTimestamp(log.createdAt)}
                </td>
                <td className="py-2.5 px-3 whitespace-nowrap">
                  <div className="font-medium text-slate-900">{log.userName}</div>
                  <div className="text-[11px] capitalize text-slate-500">{log.userRole}</div>
                </td>
                <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-800 whitespace-nowrap">
                  {log.action}
                </td>
                <td className="py-2.5 px-3 font-medium text-slate-900">{log.entityLabel}</td>
                <td className="py-2.5 px-3 text-slate-600">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UserManagementView() {
  const { currentUser, users, offices, showToast } = useWorkspace();
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<UserRole>('viewer');
  const [statusDraft, setStatusDraft] = useState<'active' | 'inactive'>('active');
  const [officeDraft, setOfficeDraft] = useState('');

  if (currentUser?.role !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
        Administrator privileges are required to manage user accounts.
      </div>
    );
  }

  const startEdit = (u: UserProfile) => {
    setEditingUid(u.uid);
    setRoleDraft(u.role);
    setStatusDraft(u.status);
    setOfficeDraft(u.officeName || '');
  };

  const handleSave = async (u: UserProfile) => {
    try {
      await updateUserRoleAndStatus(currentUser, u, roleDraft, statusDraft, officeDraft);
      setEditingUid(null);
      showToast('success', `Updated permissions for ${u.displayName}.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to update user role.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">User Management &amp; Role-Based Access</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Assign Administrator, Encoder/Staff, or Viewer permissions for authenticated Google accounts
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
            <ShieldCheck className="w-4 h-4 text-slate-700" /> Administrator
          </div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Full access across all modules, employee/office directory, masterlists, user roles, record deletion, and system settings.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-900">Encoder / Staff</div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Create and edit ongoing TEV records, update 4-stage documentary checklists, upload documents, and perform permitted bulk Excel imports.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-slate-900">Viewer</div>
          <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
            Read-only access to Dashboard analytics, Travel Records, documentary statuses, Travel Calendar, and Reports.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="py-3 px-3">User Name</th>
              <th className="py-3 px-3">Email</th>
              <th className="py-3 px-3">Office Assignment</th>
              <th className="py-3 px-3">Role</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map((u) => {
              const isEditing = editingUid === u.uid;
              return (
                <tr key={u.uid} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-medium text-slate-900">{u.displayName}</td>
                  <td className="py-2.5 px-3 text-slate-600">{u.email}</td>
                  <td className="py-2.5 px-3">
                    {isEditing ? (
                      <select value={officeDraft} onChange={(e) => setOfficeDraft(e.target.value)} className="px-2 py-1 border border-slate-300 rounded bg-white">
                        <option value="General Administration">General Administration</option>
                        {offices.map((o) => (
                          <option key={o.id} value={o.name}>{o.name}</option>
                        ))}
                      </select>
                    ) : (
                      u.officeName || '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3 capitalize">
                    {isEditing ? (
                      <select value={roleDraft} onChange={(e) => setRoleDraft(e.target.value as UserRole)} className="px-2 py-1 border border-slate-300 rounded bg-white">
                        <option value="admin">Administrator</option>
                        <option value="encoder">Encoder / Staff</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className="font-semibold text-slate-800">{u.role}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 capitalize">
                    {isEditing ? (
                      <select value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as any)} className="px-2 py-1 border border-slate-300 rounded bg-white">
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    ) : (
                      <span className={u.status === 'active' ? 'text-emerald-700 font-medium' : 'text-red-600'}>
                        {u.status}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {isEditing ? (
                      <div className="inline-flex gap-2">
                        <button type="button" onClick={() => handleSave(u)} className="px-2.5 py-1 bg-slate-900 text-white rounded cursor-pointer">Save</button>
                        <button type="button" onClick={() => setEditingUid(null)} className="px-2.5 py-1 border border-slate-300 rounded cursor-pointer">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => startEdit(u)} className="text-sky-700 hover:underline font-medium cursor-pointer">
                        Manage Access
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsView() {
  const { currentUser, settings, documentaryRequirements, showToast } = useWorkspace();

  const [agencyName, setAgencyName] = useState(settings.agencyName);
  const [agencySubtitle, setAgencySubtitle] = useState(settings.agencySubtitle);
  const [tevRefPrefix, setTevRefPrefix] = useState(settings.tevRefPrefix);
  const [tevRefSeparator, setTevRefSeparator] = useState(settings.tevRefSeparator);
  const [overdueThresholdDays, setOverdueThresholdDays] = useState(settings.overdueThresholdDays);
  const [encoderCanImport, setEncoderCanImport] = useState(settings.encoderCanImport);
  const [defaultReqIds, setDefaultReqIds] = useState<string[]>(settings.defaultRequirementIds || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAgencyName(settings.agencyName);
    setAgencySubtitle(settings.agencySubtitle);
    setTevRefPrefix(settings.tevRefPrefix);
    setTevRefSeparator(settings.tevRefSeparator);
    setOverdueThresholdDays(settings.overdueThresholdDays);
    setEncoderCanImport(settings.encoderCanImport);
    setDefaultReqIds(settings.defaultRequirementIds || []);
  }, [settings]);

  if (currentUser?.role !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
        Administrator privileges are required to modify system settings.
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSystemSettings(currentUser, {
        agencyName,
        agencySubtitle,
        tevRefPrefix,
        tevRefSeparator,
        overdueThresholdDays: Number(overdueThresholdDays) || 15,
        encoderCanImport,
        defaultRequirementIds: defaultReqIds,
      });
      showToast('success', 'System settings saved.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">System Settings &amp; Preferences</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure agency branding, TEV reference number format, overdue monitoring threshold, and default checklist items
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
          Agency &amp; Reference Number Format
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Agency / Office Name</label>
            <input required value={agencyName} onChange={(e) => setAgencyName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Division / Subtitle</label>
            <input value={agencySubtitle} onChange={(e) => setAgencySubtitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">TEV Reference Prefix</label>
            <input required value={tevRefPrefix} onChange={(e) => setTevRefPrefix(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Separator</label>
            <input required value={tevRefSeparator} onChange={(e) => setTevRefSeparator(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num" />
          </div>
        </div>
        <div className="text-xs text-slate-600">
          Preview Reference Format:{' '}
          <span className="font-mono-num font-semibold text-slate-900">
            {tevRefPrefix || 'TEV'}{tevRefSeparator || '-'}2026{tevRefSeparator || '-'}0001
          </span>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
          Monitoring Thresholds &amp; Permissions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Overdue Monitoring Threshold (Days after travel return)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={overdueThresholdDays}
              onChange={(e) => setOverdueThresholdDays(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer mt-4">
            <input
              type="checkbox"
              checked={encoderCanImport}
              onChange={(e) => setEncoderCanImport(e.target.checked)}
            />
            Allow Encoder/Staff accounts to execute Bulk Excel Imports
          </label>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-3">
          Default Documentary Requirements for New TEVs
        </h3>
        <p className="text-xs text-slate-500">
          Applies only when recording future TEVs; previously recorded TEVs remain unchanged.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {documentaryRequirements
            .filter((r) => r.status === 'active')
            .map((req) => {
              const checked = defaultReqIds.includes(req.id);
              return (
                <label key={req.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) setDefaultReqIds((prev) => [...prev, req.id]);
                      else setDefaultReqIds((prev) => prev.filter((id) => id !== req.id));
                    }}
                  />
                  <span>{req.name}</span>
                </label>
              );
            })}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save System Settings'}
        </button>
      </div>
    </form>
  );
}
