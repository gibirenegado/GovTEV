export type UserRole = 'admin' | 'encoder' | 'viewer';
export type RecordActiveStatus = 'active' | 'inactive';

export type TEVOverallStatus =
  | 'Not Started'
  | 'In Progress'
  | 'For Submission'
  | 'For Signature'
  | 'For Approval'
  | 'Completed'
  | 'On Hold';

export type NavSection =
  | 'dashboard'
  | 'travel-records'
  | 'add-tev'
  | 'bulk-import'
  | 'documentary-requirements'
  | 'employees'
  | 'offices'
  | 'templates'
  | 'calendar'
  | 'reports'
  | 'activity-logs'
  | 'user-management'
  | 'settings';

export type AllowedFileExtension = 'pdf' | 'jpg' | 'jpeg' | 'png' | 'docx' | 'xlsx';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: RecordActiveStatus;
  officeName: string;
  createdAt: any;
  updatedAt: any;
}

export interface Office {
  id: string;
  workspaceScope: 'gov-tev-office';
  name: string;
  code: string;
  headName: string;
  status: RecordActiveStatus;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

export interface Employee {
  id: string;
  workspaceScope: 'gov-tev-office';
  employeeCode: string;
  fullName: string;
  officeId: string;
  officeName: string;
  position: string;
  status: RecordActiveStatus;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

export interface DocumentaryRequirement {
  id: string;
  workspaceScope: 'gov-tev-office';
  code: string;
  name: string;
  description: string;
  isDefault: boolean;
  isCustom: boolean;
  sortOrder: number;
  status: RecordActiveStatus;
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

export interface RequirementTemplate {
  id: string;
  workspaceScope: 'gov-tev-office';
  name: string;
  description: string;
  requirementIds: string[];
  requirementNames: string[];
  createdBy: string;
  createdAt: any;
  updatedAt: any;
}

export interface TravelRecord {
  id: string;
  workspaceScope: 'gov-tev-office';
  tevRefNumber: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  officeId: string;
  officeName: string;
  position: string;
  destination: string;
  purpose: string;
  departureDate: string;
  returnDate: string;
  travelDays: number;
  travelOrderNumber: string;
  travelOrderDate: string;
  submissionDate: string;
  processingOfficer: string;
  completionDate: string;
  remarks: string;
  overallStatus: TEVOverallStatus;
  manualOnHold: boolean;
  compliancePercentage: number;
  applicableCount: number;
  completedCount: number;
  isSampleData: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: any;
  updatedAt: any;
}

export interface TravelRequirementChecklist {
  id: string;
  workspaceScope: 'gov-tev-office';
  tevId: string;
  tevRefNumber: string;
  requirementId: string;
  requirementName: string;
  isCustom: boolean;
  sortOrder: number;
  applicable: boolean;
  prepared: boolean;
  submitted: boolean;
  signed: boolean;
  approved: boolean;
  returnedForCorrection: boolean;
  datePrepared: string;
  dateSubmitted: string;
  dateSigned: string;
  dateApproved: string;
  signatoryName: string;
  approvingOfficerName: string;
  remarks: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: any;
  updatedAt: any;
}

export interface AttachmentRecord {
  id: string;
  workspaceScope: 'gov-tev-office';
  tevId: string;
  tevRefNumber: string;
  checklistItemId: string;
  requirementName: string;
  fileName: string;
  fileType: string;
  fileExtension: AllowedFileExtension;
  fileSize: number;
  version: number;
  isLatest: boolean;
  dataUrl: string;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: any;
  updatedAt: any;
}

export interface ImportHistoryRecord {
  id: string;
  workspaceScope: 'gov-tev-office';
  fileName: string;
  mode: 'import' | 'update';
  totalRecords: number;
  successCount: number;
  failedCount: number;
  errorsSummary: string[];
  importedBy: string;
  importedByName: string;
  createdAt: any;
}

export interface ActivityLogRecord {
  id: string;
  workspaceScope: 'gov-tev-office';
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  details: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  createdAt: any;
}

export interface SystemSettings {
  id: string;
  workspaceScope: 'gov-tev-office';
  agencyName: string;
  agencySubtitle: string;
  tevRefPrefix: string;
  tevRefSeparator: string;
  overdueThresholdDays: number;
  encoderCanImport: boolean;
  defaultRequirementIds: string[];
  updatedBy: string;
  updatedAt: any;
}

export interface DashboardFilters {
  officeId: string;
  employeeId: string;
  dateFrom: string;
  dateTo: string;
  year: string;
  status: string;
  requirementName: string;
  processingStage: string;
}

export interface TravelRecordFilters {
  search: string;
  employeeId: string;
  officeId: string;
  destination: string;
  dateFrom: string;
  dateTo: string;
  month: string;
  year: string;
  overallStatus: string;
  processingOfficer: string;
  specialFilter: '' | 'ongoing' | 'pending-docs' | 'for-signature' | 'for-approval' | 'overdue';
}
