import React, { useMemo, useState } from 'react';
import { Plus, Edit3, Trash2, Search, Eye } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  deleteDocumentaryRequirement,
  deleteEmployeeRecord,
  deleteRequirementTemplate,
  saveDocumentaryRequirement,
  saveEmployee,
  saveOffice,
  saveRequirementTemplate,
} from '../lib/firestoreService';
import {
  DocumentaryRequirement,
  Employee,
  Office,
  RequirementTemplate,
} from '../types/tev';

export function DocumentaryRequirementsView() {
  const { currentUser, documentaryRequirements, showToast } = useWorkspace();
  const isAdmin = currentUser?.role === 'admin';

  const [editing, setEditing] = useState<DocumentaryRequirement | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [sortOrder, setSortOrder] = useState(13);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [showForm, setShowForm] = useState(false);

  const openNew = () => {
    setEditing(null);
    setCode('');
    setName('');
    setDescription('');
    setIsDefault(true);
    setSortOrder(documentaryRequirements.length + 1);
    setStatus('active');
    setShowForm(true);
  };

  const openEdit = (req: DocumentaryRequirement) => {
    setEditing(req);
    setCode(req.code);
    setName(req.name);
    setDescription(req.description);
    setIsDefault(req.isDefault);
    setSortOrder(req.sortOrder);
    setStatus(req.status);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isAdmin) return;
    try {
      await saveDocumentaryRequirement(currentUser, {
        id: editing?.id,
        code,
        name,
        description,
        isDefault,
        isCustom: editing ? editing.isCustom : true,
        sortOrder: Number(sortOrder) || 1,
        status,
      });
      setShowForm(false);
      showToast('success', editing ? 'Requirement updated.' : 'Requirement added to masterlist.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save requirement.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Documentary Requirements Masterlist</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Default documentary checklist definitions for new travels. Changes do not alter existing TEV records.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Requirement
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {editing ? `Edit Requirement: ${editing.name}` : 'New Masterlist Requirement'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Code</label>
              <input required value={code} onChange={(e) => setCode(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Requirement Name</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Order</label>
                <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Default applicable for new TEVs
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer">Save</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="py-3 px-3">#</th>
              <th className="py-3 px-3">Code</th>
              <th className="py-3 px-3">Requirement Name</th>
              <th className="py-3 px-3">Description</th>
              <th className="py-3 px-3">Default</th>
              <th className="py-3 px-3">Status</th>
              {isAdmin && <th className="py-3 px-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {documentaryRequirements.map((req) => (
              <tr key={req.id} className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-mono-num text-slate-500">{req.sortOrder}</td>
                <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-900">{req.code}</td>
                <td className="py-2.5 px-3 font-medium text-slate-900">{req.name}</td>
                <td className="py-2.5 px-3 text-slate-600">{req.description || '—'}</td>
                <td className="py-2.5 px-3">{req.isDefault ? 'Yes' : 'Optional'}</td>
                <td className="py-2.5 px-3 capitalize">{req.status}</td>
                {isAdmin && (
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button type="button" onClick={() => openEdit(req)} className="p-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!currentUser) return;
                        await deleteDocumentaryRequirement(currentUser, req);
                        showToast('success', 'Requirement deleted.');
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmployeesView({
  onViewEmployeeTravels,
  onViewTev,
}: {
  onViewEmployeeTravels: (employeeId: string) => void;
  onViewTev: (tevId: string) => void;
}) {
  const { currentUser, employees, offices, travelRecords, showToast } = useWorkspace();
  const isAdmin = currentUser?.role === 'admin';

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [employeeCode, setEmployeeCode] = useState('');
  const [fullName, setFullName] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [historyEmp, setHistoryEmp] = useState<Employee | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        !q ||
        e.fullName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.officeName.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q)
    );
  }, [employees, search]);

  const openNew = () => {
    setEditing(null);
    setEmployeeCode(`EMP-${new Date().getFullYear()}-${String(employees.length + 1).padStart(3, '0')}`);
    setFullName('');
    setOfficeId(offices[0]?.id || '');
    setPosition('');
    setStatus('active');
    setShowForm(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setEmployeeCode(emp.employeeCode);
    setFullName(emp.fullName);
    setOfficeId(emp.officeId);
    setPosition(emp.position);
    setStatus(emp.status);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isAdmin) return;
    const off = offices.find((o) => o.id === officeId);
    if (!off) {
      showToast('error', 'Select a valid office.');
      return;
    }
    try {
      await saveEmployee(currentUser, {
        id: editing?.id,
        employeeCode,
        fullName,
        officeId: off.id,
        officeName: off.name,
        position,
        status,
      });
      setShowForm(false);
      showToast('success', editing ? 'Employee updated.' : 'Employee registered.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save employee.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Employee Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered government personnel available for TEV recording and monitoring
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Register Employee
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {editing ? `Edit Employee: ${editing.fullName}` : 'Register New Employee'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input required value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="Employee ID" className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num" />
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full Name" className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <select required value={officeId} onChange={(e) => setOfficeId(e.target.value)} className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
              <option value="">Select Office...</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <input required value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position / Designation" className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer">Save Employee</button>
          </div>
        </form>
      )}

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees by name, ID, office, or position..."
          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="py-3 px-3">Employee ID</th>
              <th className="py-3 px-3">Full Name</th>
              <th className="py-3 px-3">Office / Division</th>
              <th className="py-3 px-3">Position / Designation</th>
              <th className="py-3 px-3 text-right">TEVs</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.map((emp) => {
              const count = travelRecords.filter((t) => t.employeeId === emp.id).length;
              return (
                <tr key={emp.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-900">{emp.employeeCode}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">{emp.fullName}</td>
                  <td className="py-2.5 px-3 text-slate-600">{emp.officeName}</td>
                  <td className="py-2.5 px-3 text-slate-600">{emp.position}</td>
                  <td className="py-2.5 px-3 text-right font-mono-num">{count}</td>
                  <td className="py-2.5 px-3 capitalize">
                    <span className={emp.status === 'active' ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2">
                    <button type="button" onClick={() => setHistoryEmp(emp)} className="text-sky-700 hover:underline font-medium cursor-pointer">
                      History
                    </button>
                    <button type="button" onClick={() => onViewEmployeeTravels(emp.id)} className="text-slate-700 hover:underline cursor-pointer">
                      Filter Records
                    </button>
                    {isAdmin && (
                      <>
                        <button type="button" onClick={() => openEdit(emp)} className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"><Edit3 className="w-3.5 h-3.5 inline" /></button>
                        {count === 0 && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!currentUser) return;
                              await deleteEmployeeRecord(currentUser, emp);
                              showToast('success', 'Employee deleted.');
                            }}
                            className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {historyEmp && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{historyEmp.fullName} — Travel History</h3>
                <p className="text-xs text-slate-500">{historyEmp.officeName} · {historyEmp.position}</p>
              </div>
              <button type="button" onClick={() => setHistoryEmp(null)} className="text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer">Close</button>
            </div>
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-200 text-xs">
              {travelRecords.filter((t) => t.employeeId === historyEmp.id).length === 0 ? (
                <p className="p-6 text-center text-slate-500">No travel records found for this employee.</p>
              ) : (
                travelRecords
                  .filter((t) => t.employeeId === historyEmp.id)
                  .map((t) => (
                    <div key={t.id} className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono-num font-semibold text-slate-900">{t.tevRefNumber} · {t.destination}</div>
                        <div className="text-slate-500">{t.departureDate} to {t.returnDate} · {t.officeName}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryEmp(null);
                          onViewTev(t.id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-sky-700 bg-sky-50 border border-sky-200 rounded cursor-pointer"
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function OfficesView({ onViewOfficeTravels }: { onViewOfficeTravels: (officeId: string) => void }) {
  const { currentUser, offices, employees, travelRecords, showToast } = useWorkspace();
  const isAdmin = currentUser?.role === 'admin';

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Office | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [headName, setHeadName] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const openNew = () => {
    setEditing(null);
    setCode('');
    setName('');
    setHeadName('');
    setStatus('active');
    setShowForm(true);
  };

  const openEdit = (off: Office) => {
    setEditing(off);
    setCode(off.code);
    setName(off.name);
    setHeadName(off.headName);
    setStatus(off.status);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !isAdmin) return;
    try {
      await saveOffice(currentUser, {
        id: editing?.id,
        code,
        name,
        headName,
        status,
      });
      setShowForm(false);
      showToast('success', editing ? 'Office updated.' : 'Office added.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save office.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Offices &amp; Divisions</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Organizational units. Historical travel records retain their recorded office snapshot.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Office / Division
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code (e.g., PMU)" className="px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num" />
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Office / Division Name" className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input value={headName} onChange={(e) => setHeadName(e.target.value)} placeholder="Division Head" className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer">Save Office</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <th className="py-3 px-3">Code</th>
              <th className="py-3 px-3">Office / Division Name</th>
              <th className="py-3 px-3">Division Head</th>
              <th className="py-3 px-3 text-right">Employees</th>
              <th className="py-3 px-3 text-right">Recorded TEVs</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {offices.map((off) => {
              const empCount = employees.filter((e) => e.officeId === off.id).length;
              const tevCount = travelRecords.filter((t) => t.officeId === off.id).length;
              return (
                <tr key={off.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono-num font-semibold text-slate-900">{off.code}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">{off.name}</td>
                  <td className="py-2.5 px-3 text-slate-600">{off.headName || '—'}</td>
                  <td className="py-2.5 px-3 text-right font-mono-num">{empCount}</td>
                  <td className="py-2.5 px-3 text-right font-mono-num">{tevCount}</td>
                  <td className="py-2.5 px-3 capitalize">{off.status}</td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-2">
                    <button type="button" onClick={() => onViewOfficeTravels(off.id)} className="text-sky-700 hover:underline font-medium cursor-pointer">
                      View TEVs
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => openEdit(off)} className="p-1 text-slate-600 hover:text-slate-900 cursor-pointer"><Edit3 className="w-3.5 h-3.5 inline" /></button>
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

export function TemplatesView() {
  const { currentUser, requirementTemplates, documentaryRequirements, showToast } = useWorkspace();
  const canManage = currentUser?.role === 'admin' || currentUser?.role === 'encoder';

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RequirementTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const activeReqs = documentaryRequirements.filter((r) => r.status === 'active');

  const openNew = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setSelectedIds(activeReqs.filter((r) => r.isDefault).map((r) => r.id));
    setShowForm(true);
  };

  const openEdit = (tpl: RequirementTemplate) => {
    setEditing(tpl);
    setName(tpl.name);
    setDescription(tpl.description);
    setSelectedIds(tpl.requirementIds);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !canManage) return;
    const names = selectedIds.map((id) => activeReqs.find((r) => r.id === id)?.name || id);
    try {
      await saveRequirementTemplate(currentUser, {
        id: editing?.id,
        name,
        description,
        requirementIds: selectedIds,
        requirementNames: names,
      });
      setShowForm(false);
      showToast('success', editing ? 'Template updated.' : 'Template created.');
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to save template.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Requirement Templates</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reusable combinations of documentary requirements. Editing templates never alters existing TEVs.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create Template
          </button>
        )}
      </div>

      {showForm && canManage && (
        <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Template Name" className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeReqs.map((r) => {
              const checked = selectedIds.includes(r.id);
              return (
                <label key={r.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds((prev) => [...prev, r.id]);
                      else setSelectedIds((prev) => prev.filter((id) => id !== r.id));
                    }}
                  />
                  <span>{r.name}</span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs border border-slate-300 rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer">Save Template</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {requirementTemplates.map((tpl) => {
          const canEditThis =
            currentUser?.role === 'admin' ||
            (currentUser?.role === 'encoder' && tpl.createdBy === currentUser.uid);
          return (
            <div key={tpl.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{tpl.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{tpl.description || '—'}</p>
                  </div>
                  {canEditThis && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(tpl)} className="p-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!currentUser) return;
                          await deleteRequirementTemplate(currentUser, tpl);
                          showToast('success', 'Template deleted.');
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-3 text-xs text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-900">{tpl.requirementNames.length} Applicable:</span>{' '}
                  {tpl.requirementNames.join(' · ') || 'None'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
