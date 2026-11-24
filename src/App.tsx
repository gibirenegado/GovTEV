import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { AuthGate } from './components/AuthGate';
import { Layout } from './components/Layout';
import { DashboardView } from './components/DashboardView';
import { TravelRecordsView } from './components/TravelRecordsView';
import { AddEditTevView } from './components/AddEditTevView';
import { TevDetailDrawer } from './components/TevDetailDrawer';
import { BulkImportView } from './components/BulkImportView';
import { TravelCalendarView } from './components/TravelCalendarView';
import { ReportsView } from './components/ReportsView';
import {
  DocumentaryRequirementsView,
  EmployeesView,
  OfficesView,
  TemplatesView,
} from './components/MasterlistViews';
import {
  ActivityLogsView,
  SettingsView,
  UserManagementView,
} from './components/AdminGovernanceViews';
import { NavSection, TravelRecord, TravelRecordFilters } from './types/tev';

const INITIAL_RECORD_FILTERS: TravelRecordFilters = {
  search: '',
  employeeId: '',
  officeId: '',
  destination: '',
  dateFrom: '',
  dateTo: '',
  month: '',
  year: '',
  overallStatus: '',
  processingOfficer: '',
  specialFilter: '',
};

function AppShell() {
  const { firebaseUser, currentUser, authReady, logout } = useWorkspace();

  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [recordFilters, setRecordFilters] = useState<TravelRecordFilters>(INITIAL_RECORD_FILTERS);
  const [selectedTevId, setSelectedTevId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<TravelRecord | null>(null);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600">Initializing GovTEV Workspace...</div>
      </div>
    );
  }

  if (!firebaseUser || !currentUser) {
    return <AuthGate />;
  }

  if (currentUser.status === 'inactive') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Account Deactivated</h2>
          <p className="text-xs text-slate-600">
            Your account ({currentUser.email}) is currently inactive. Please contact your system administrator to restore access.
          </p>
          <button
            type="button"
            onClick={logout}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const handleNavigate = (nav: NavSection) => {
    if (nav !== 'add-tev') {
      setEditingRecord(null);
    }
    setActiveNav(nav);
  };

  const handleNavigateToRecords = (partialFilter: Partial<TravelRecordFilters>) => {
    setRecordFilters({ ...INITIAL_RECORD_FILTERS, ...partialFilter });
    setActiveNav('travel-records');
  };

  const handleStartEditTev = (tev: TravelRecord) => {
    setSelectedTevId(null);
    setEditingRecord(tev);
    setActiveNav('add-tev');
  };

  return (
    <Layout
      activeNav={activeNav}
      onNavigate={handleNavigate}
      onQuickAddTev={() => {
        setEditingRecord(null);
        setActiveNav('add-tev');
      }}
    >
      {activeNav === 'dashboard' && (
        <DashboardView
          onNavigateToRecords={handleNavigateToRecords}
          onViewTev={(id) => setSelectedTevId(id)}
        />
      )}

      {activeNav === 'travel-records' && (
        <TravelRecordsView
          filters={recordFilters}
          onChangeFilters={setRecordFilters}
          onResetFilters={() => setRecordFilters(INITIAL_RECORD_FILTERS)}
          onViewTev={(id) => setSelectedTevId(id)}
          onEditTev={handleStartEditTev}
        />
      )}

      {activeNav === 'add-tev' && (
        <AddEditTevView
          editingRecord={editingRecord}
          onSuccess={(tevId) => {
            setEditingRecord(null);
            setActiveNav('travel-records');
            setSelectedTevId(tevId);
          }}
          onCancel={() => {
            setEditingRecord(null);
            setActiveNav('travel-records');
          }}
        />
      )}

      {activeNav === 'bulk-import' && <BulkImportView />}
      {activeNav === 'documentary-requirements' && <DocumentaryRequirementsView />}

      {activeNav === 'employees' && (
        <EmployeesView
          onViewEmployeeTravels={(employeeId) => handleNavigateToRecords({ employeeId })}
          onViewTev={(id) => setSelectedTevId(id)}
        />
      )}

      {activeNav === 'offices' && (
        <OfficesView
          onViewOfficeTravels={(officeId) => handleNavigateToRecords({ officeId })}
        />
      )}

      {activeNav === 'templates' && <TemplatesView />}

      {activeNav === 'calendar' && (
        <TravelCalendarView onViewTev={(id) => setSelectedTevId(id)} />
      )}

      {activeNav === 'reports' && <ReportsView />}
      {activeNav === 'activity-logs' && <ActivityLogsView />}
      {activeNav === 'user-management' && <UserManagementView />}
      {activeNav === 'settings' && <SettingsView />}

      {selectedTevId && (
        <TevDetailDrawer
          tevId={selectedTevId}
          onClose={() => setSelectedTevId(null)}
          onEditTev={handleStartEditTev}
        />
      )}
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider>
    </ErrorBoundary>
  );
}
