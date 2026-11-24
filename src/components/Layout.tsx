import React, { useState } from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  FilePlus2,
  FileSpreadsheet,
  ClipboardList,
  Users,
  Building2,
  Layers,
  CalendarDays,
  BarChart3,
  History,
  UserCog,
  Settings,
  LogOut,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { NavSection } from '../types/tev';

interface LayoutProps {
  activeNav: NavSection;
  onNavigate: (nav: NavSection) => void;
  onQuickAddTev: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  encoderOrAdmin?: boolean;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'travel-records', label: 'Travel Records', icon: FolderKanban },
  { id: 'add-tev', label: 'Add New TEV', icon: FilePlus2, encoderOrAdmin: true },
  { id: 'bulk-import', label: 'Bulk Excel Import', icon: FileSpreadsheet, encoderOrAdmin: true },
  { id: 'documentary-requirements', label: 'Documentary Requirements', icon: ClipboardList },
  { id: 'employees', label: 'Employees', icon: Users },
  { id: 'offices', label: 'Offices/Divisions', icon: Building2 },
  { id: 'templates', label: 'Requirement Templates', icon: Layers },
  { id: 'calendar', label: 'Travel Calendar', icon: CalendarDays },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'activity-logs', label: 'Activity Logs', icon: History },
  { id: 'user-management', label: 'User Management', icon: UserCog, adminOnly: true },
  { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
];

export function Layout({ activeNav, onNavigate, onQuickAddTev, children }: LayoutProps) {
  const { currentUser, logout, settings, toastMessage, clearToast } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!currentUser) return false;
    if (item.adminOnly && currentUser.role !== 'admin') return false;
    if (item.encoderOrAdmin && currentUser.role === 'viewer') return false;
    if (
      item.id === 'bulk-import' &&
      currentUser.role === 'encoder' &&
      !settings.encoderCanImport
    ) {
      return false;
    }
    return true;
  });

  const activeLabel = NAV_ITEMS.find((n) => n.id === activeNav)?.label || 'Dashboard';

  const handleSelectNav = (id: NavSection) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden no-print"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Dark Navy Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-semibold tracking-tight text-white truncate">
              GovTEV Monitor
            </div>
            <div className="text-xs text-slate-400 truncate mt-0.5">
              {settings.agencyName}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white lg:hidden cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="text-xs font-semibold text-white truncate">
            {currentUser?.displayName}
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">
            {currentUser?.email}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-300">
            <span className="capitalize font-medium text-sky-400">
              {currentUser?.role} Account
            </span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, primary action on right */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">TEV System</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="text-base font-semibold text-slate-900 truncate">
                {activeLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {currentUser?.role !== 'viewer' && activeNav !== 'add-tev' && (
              <button
                type="button"
                onClick={onQuickAddTev}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                Record New TEV
              </button>
            )}
          </div>
        </header>

        {/* Global Toast Feedback */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 max-w-md no-print">
            <div
              className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border shadow-md text-sm ${
                toastMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : toastMessage.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-slate-900 border-slate-800 text-white'
              }`}
            >
              {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
              {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
              {toastMessage.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />}
              <span className="flex-1">{toastMessage.text}</span>
              <button
                type="button"
                onClick={clearToast}
                className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
