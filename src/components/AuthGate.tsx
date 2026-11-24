import { ShieldCheck, FileCheck2, BarChart3, FileSpreadsheet, LogIn } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export function AuthGate() {
  const { signInWithGoogle, authError } = useWorkspace();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col lg:flex-row">
      <div className="lg:w-7/12 bg-slate-900 text-white p-8 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        <div>
          <div className="text-xs font-medium tracking-wider uppercase text-sky-400">
            Government Operations &amp; Financial Compliance
          </div>
          <h1 className="mt-4 text-3xl lg:text-4xl font-semibold tracking-tight text-white max-w-xl [text-wrap:balance]">
            Travel Expense Voucher Tracker, Recording, and Monitoring System
          </h1>
          <p className="mt-4 text-base text-slate-300 max-w-xl leading-relaxed">
            Centralized database for official travel transactions, customizable documentary checklists, independent stage tracking, bulk Excel encoding, and audit-ready reporting.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/80">
            <FileCheck2 className="w-5 h-5 text-sky-400" />
            <h2 className="mt-3 text-sm font-semibold text-white">4-Stage Document Tracking</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              Independent tracking for Prepared, Submitted, Signed, and Approved stages with signatory and approving officer records.
            </p>
          </div>
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/80">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h2 className="mt-3 text-sm font-semibold text-white">Real-Time Compliance Analytics</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              Live status distribution, office and employee monitoring, overdue escalation queues, and automated compliance percentages.
            </p>
          </div>
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/80">
            <FileSpreadsheet className="w-5 h-5 text-amber-400" />
            <h2 className="mt-3 text-sm font-semibold text-white">Bulk Excel Import &amp; Update</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              Download standardized 23-column templates, validate rows prior to commit, and export XLSX, CSV, and PDF reports.
            </p>
          </div>
          <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/80">
            <ShieldCheck className="w-5 h-5 text-purple-400" />
            <h2 className="mt-3 text-sm font-semibold text-white">Role-Based Access &amp; Audit Trail</h2>
            <p className="mt-1 text-xs text-slate-300 leading-relaxed">
              Secured Cloud Firestore rules supporting Administrator, Encoder/Staff, and Viewer roles with complete activity logging.
            </p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-800 text-xs text-slate-400">
          Authorized Government Office Operations Portal · Persistent Cloud Firestore Database
        </div>
      </div>

      <div className="lg:w-5/12 bg-white flex items-center justify-center p-8 lg:p-14">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Sign in to GovTEV Workspace
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Use your authorized Google account to access travel records, checklists, and monitoring reports.
          </p>

          {authError && (
            <div className="mt-4 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {authError}
            </div>
          )}

          <button
            type="button"
            onClick={signInWithGoogle}
            className="mt-6 w-full inline-flex items-center justify-center gap-3 px-5 py-3 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Sign in with Google
          </button>

          <div className="mt-8 pt-6 border-t border-slate-200 space-y-2.5 text-xs text-slate-600">
            <p className="font-medium text-slate-900">Access Roles Overview</p>
            <p>
              <span className="font-semibold text-slate-800">Administrator:</span> Full system configuration, employee/office directory, user role management, record deletion, and reporting.
            </p>
            <p>
              <span className="font-semibold text-slate-800">Encoder / Staff:</span> Record travels, update 4-stage documentary checklists, upload scanned attachments, and run bulk imports.
            </p>
            <p>
              <span className="font-semibold text-slate-800">Viewer:</span> Read-only monitoring across dashboard metrics, travel records, calendar, and permitted reports.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
