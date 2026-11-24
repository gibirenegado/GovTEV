import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  calculateChecklistCompliance,
  calculateOverallTevStatus,
  calculateTravelDays,
} from './tevCalculations';
import { TravelRequirementChecklist, UserProfile } from '../types/tev';

export const DEFAULT_DOCUMENTARY_REQUIREMENTS = [
  { id: 'req_to', code: 'TO', name: 'Travel Order', description: 'Approved official Travel Order authorizing the personnel trip.', sortOrder: 1, isDefault: true },
  { id: 'req_iot', code: 'IOT', name: 'Itinerary of Travel', description: 'Approved Itinerary of Travel detailing schedule and estimated expenses.', sortOrder: 2, isDefault: true },
  { id: 'req_ca', code: 'CA', name: 'Certificate of Appearance', description: 'Signed Certificate of Appearance issued by the visited office/agency.', sortOrder: 3, isDefault: true },
  { id: 'req_ctc', code: 'CTC', name: 'Certificate of Travel Completed', description: 'Certification attesting completion of official travel per itinerary.', sortOrder: 4, isDefault: true },
  { id: 'req_btor', code: 'BTOR', name: 'Back to Office Report', description: 'Narrative report summarizing accomplishments and outputs of the travel.', sortOrder: 5, isDefault: true },
  { id: 'req_ors', code: 'ORS', name: 'Obligation Request and Status (ORS)', description: 'Certified Obligation Request and Status covering travel funds.', sortOrder: 6, isDefault: true },
  { id: 'req_dv', code: 'DV', name: 'Disbursement Voucher', description: 'Approved Disbursement Voucher for reimbursement or liquidation.', sortOrder: 7, isDefault: true },
  { id: 'req_tt', code: 'TT', name: 'Trip Ticket', description: 'Official driver trip ticket when government vehicle was used.', sortOrder: 8, isDefault: false },
  { id: 'req_piot', code: 'PIOT', name: 'Proposed Itinerary of Travel', description: 'Initial proposed itinerary submitted prior to travel.', sortOrder: 9, isDefault: false },
  { id: 'req_atc', code: 'ATC', name: 'Authority to Travel Certification', description: 'Written authority to travel from the agency head or delegated official.', sortOrder: 10, isDefault: false },
  { id: 'req_or', code: 'OR', name: 'Official Receipts / Supporting Receipts', description: 'Original receipts for lodging, transport, tickets, and allowable expenses.', sortOrder: 11, isDefault: true },
  { id: 'req_osd', code: 'OSD', name: 'Other Supporting Documents', description: 'Boarding passes, event invitations, memoranda, or additional attachments.', sortOrder: 12, isDefault: false },
];

export const DEFAULT_OFFICES = [
  { id: 'off_pmu', code: 'PMU', name: 'Planning and Monitoring Unit', headName: 'Dir. Elena Villanueva' },
  { id: 'off_afd', code: 'AFD', name: 'Administrative and Finance Division', headName: 'Atty. Roberto Navarro' },
  { id: 'off_ots', code: 'OTS', name: 'Operations and Technical Services', headName: 'Engr. Marco Bautista' },
  { id: 'off_ord', code: 'ORD', name: 'Office of the Regional Director', headName: 'Dir. Carmela Mendoza' },
];

export const DEFAULT_EMPLOYEES = [
  { id: 'emp_jdc', employeeCode: 'EMP-2026-001', fullName: 'Juan Dela Cruz', officeId: 'off_pmu', officeName: 'Planning and Monitoring Unit', position: 'Senior Planning Officer' },
  { id: 'emp_msr', employeeCode: 'EMP-2026-002', fullName: 'Maria Santos-Reyes', officeId: 'off_afd', officeName: 'Administrative and Finance Division', position: 'Budget Officer III' },
  { id: 'emp_clm', employeeCode: 'EMP-2026-003', fullName: 'Carlos L. Magbanua', officeId: 'off_ots', officeName: 'Operations and Technical Services', position: 'Project Engineer II' },
  { id: 'emp_apg', employeeCode: 'EMP-2026-004', fullName: 'Angela P. Gonzales', officeId: 'off_ord', officeName: 'Office of the Regional Director', position: 'Executive Assistant IV' },
];

export const DEFAULT_TEMPLATES = [
  {
    id: 'tpl_standard',
    name: 'Standard Official Travel',
    description: 'Core documentary set for regular domestic official travel reimbursement.',
    requirementIds: ['req_to', 'req_iot', 'req_ca', 'req_ctc', 'req_btor', 'req_ors', 'req_dv', 'req_or'],
  },
  {
    id: 'tpl_local',
    name: 'Local Travel',
    description: 'Streamlined checklist for in-province or regional field monitoring trips.',
    requirementIds: ['req_to', 'req_iot', 'req_ca', 'req_ctc', 'req_ors', 'req_dv', 'req_tt', 'req_or'],
  },
  {
    id: 'tpl_foreign',
    name: 'Foreign Travel',
    description: 'Comprehensive compliance set including Authority to Travel and Proposed Itinerary.',
    requirementIds: ['req_to', 'req_iot', 'req_ca', 'req_ctc', 'req_btor', 'req_ors', 'req_dv', 'req_piot', 'req_atc', 'req_or', 'req_osd'],
  },
  {
    id: 'tpl_cash_adv',
    name: 'Travel with Cash Advance',
    description: 'Pre-travel cash advance liquidation and post-travel supporting vouchers.',
    requirementIds: ['req_to', 'req_iot', 'req_ca', 'req_ctc', 'req_btor', 'req_ors', 'req_dv', 'req_piot', 'req_or'],
  },
  {
    id: 'tpl_no_cash_adv',
    name: 'Travel without Cash Advance',
    description: 'Post-travel direct reimbursement without pre-travel proposed itinerary.',
    requirementIds: ['req_to', 'req_iot', 'req_ca', 'req_ctc', 'req_btor', 'req_ors', 'req_dv', 'req_or'],
  },
  {
    id: 'tpl_custom',
    name: 'Customized Requirements',
    description: 'Minimal baseline ready for transaction-specific requirement selection.',
    requirementIds: ['req_to', 'req_iot', 'req_ors', 'req_dv'],
  },
];

export async function seedInitialWorkspaceData(currentUser: UserProfile, includeSampleRecords = true): Promise<void> {
  const uid = currentUser.uid;
  const userName = currentUser.displayName;

  // Batch 1: Masterlists (Offices, Employees, Requirements, Templates, Settings)
  const batch1 = writeBatch(db);

  for (const off of DEFAULT_OFFICES) {
    batch1.set(doc(db, 'offices', off.id), {
      id: off.id,
      workspaceScope: 'gov-tev-office',
      name: off.name,
      code: off.code,
      headName: off.headName,
      status: 'active',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const emp of DEFAULT_EMPLOYEES) {
    batch1.set(doc(db, 'employees', emp.id), {
      id: emp.id,
      workspaceScope: 'gov-tev-office',
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      officeId: emp.officeId,
      officeName: emp.officeName,
      position: emp.position,
      status: 'active',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const req of DEFAULT_DOCUMENTARY_REQUIREMENTS) {
    batch1.set(doc(db, 'documentaryRequirements', req.id), {
      id: req.id,
      workspaceScope: 'gov-tev-office',
      code: req.code,
      name: req.name,
      description: req.description,
      isDefault: req.isDefault,
      isCustom: false,
      sortOrder: req.sortOrder,
      status: 'active',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const tpl of DEFAULT_TEMPLATES) {
    const names = tpl.requirementIds.map(
      (rid) => DEFAULT_DOCUMENTARY_REQUIREMENTS.find((r) => r.id === rid)?.name || rid
    );
    batch1.set(doc(db, 'requirementTemplates', tpl.id), {
      id: tpl.id,
      workspaceScope: 'gov-tev-office',
      name: tpl.name,
      description: tpl.description,
      requirementIds: tpl.requirementIds,
      requirementNames: names,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch1.set(doc(db, 'systemSettings', 'general'), {
    id: 'general',
    workspaceScope: 'gov-tev-office',
    agencyName: 'Department of Public Governance & Regional Operations',
    agencySubtitle: 'Office of the Regional Finance and Administrative Management Service',
    tevRefPrefix: 'TEV',
    tevRefSeparator: '-',
    overdueThresholdDays: 15,
    encoderCanImport: true,
    defaultRequirementIds: DEFAULT_DOCUMENTARY_REQUIREMENTS.filter((r) => r.isDefault).map((r) => r.id),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch1.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'masterlist_seed');
  }

  if (!includeSampleRecords) return;

  // Batch 2: Demonstration Sample TEV Records + Independent Checklists
  const batch2 = writeBatch(db);

  interface SampleSpec {
    id: string;
    tevRefNumber: string;
    employee: (typeof DEFAULT_EMPLOYEES)[0];
    destination: string;
    purpose: string;
    departureDate: string;
    returnDate: string;
    travelOrderNumber: string;
    travelOrderDate: string;
    submissionDate: string;
    processingOfficer: string;
    manualOnHold: boolean;
    remarks: string;
    stageMap: Record<string, { applicable: boolean; p?: boolean; s?: boolean; sig?: boolean; app?: boolean; ret?: boolean }>;
  }

  const samples: SampleSpec[] = [
    {
      id: 'tev_sample_jdc_palawan',
      tevRefNumber: 'TEV-2026-0001',
      employee: DEFAULT_EMPLOYEES[0],
      destination: 'Puerto Princesa City, Palawan',
      purpose: 'Regional Planning & Monitoring Assessment Workshop (Demonstration Sample Record)',
      departureDate: '2026-12-01',
      returnDate: '2026-12-03',
      travelOrderNumber: 'TO-2026-1142',
      travelOrderDate: '2026-11-25',
      submissionDate: '2026-12-05',
      processingOfficer: 'R. Mendoza (Accounting)',
      manualOnHold: false,
      remarks: 'Demonstration record matching Section 7 specification: Travel Order, IOT, ORS approved; CA, DV, OR submitted/pending signature; CTC & BTOR not yet prepared; Trip Ticket not applicable.',
      stageMap: {
        req_to: { applicable: true, p: true, s: true, sig: true, app: true },
        req_iot: { applicable: true, p: true, s: true, sig: true, app: true },
        req_ca: { applicable: true, p: true, s: true, sig: false, app: false },
        req_ctc: { applicable: true, p: false, s: false, sig: false, app: false },
        req_btor: { applicable: true, p: false, s: false, sig: false, app: false },
        req_ors: { applicable: true, p: true, s: true, sig: true, app: true },
        req_dv: { applicable: true, p: true, s: true, sig: false, app: false },
        req_tt: { applicable: false },
        req_piot: { applicable: false },
        req_atc: { applicable: false },
        req_or: { applicable: true, p: true, s: true, sig: false, app: false },
        req_osd: { applicable: false },
      },
    },
    {
      id: 'tev_sample_msr_cebu',
      tevRefNumber: 'TEV-2026-0002',
      employee: DEFAULT_EMPLOYEES[1],
      destination: 'Cebu City, Central Visayas',
      purpose: 'Annual Budget Execution & Treasury Reconciliation Summit (Demonstration Sample)',
      departureDate: '2026-10-12',
      returnDate: '2026-10-15',
      travelOrderNumber: 'TO-2026-0988',
      travelOrderDate: '2026-10-05',
      submissionDate: '2026-10-18',
      processingOfficer: 'L. Santos (Budget)',
      manualOnHold: false,
      remarks: 'All applicable documentary requirements fully prepared, submitted, signed, and approved.',
      stageMap: {
        req_to: { applicable: true, p: true, s: true, sig: true, app: true },
        req_iot: { applicable: true, p: true, s: true, sig: true, app: true },
        req_ca: { applicable: true, p: true, s: true, sig: true, app: true },
        req_ctc: { applicable: true, p: true, s: true, sig: true, app: true },
        req_btor: { applicable: true, p: true, s: true, sig: true, app: true },
        req_ors: { applicable: true, p: true, s: true, sig: true, app: true },
        req_dv: { applicable: true, p: true, s: true, sig: true, app: true },
        req_tt: { applicable: false },
        req_piot: { applicable: false },
        req_atc: { applicable: false },
        req_or: { applicable: true, p: true, s: true, sig: true, app: true },
        req_osd: { applicable: false },
      },
    },
    {
      id: 'tev_sample_clm_baguio',
      tevRefNumber: 'TEV-2026-0003',
      employee: DEFAULT_EMPLOYEES[2],
      destination: 'Baguio City, Benguet',
      purpose: 'Infrastructure Site Inspection & Field Verification (Demonstration Sample)',
      departureDate: '2026-10-20',
      returnDate: '2026-10-23',
      travelOrderNumber: 'TO-2026-1019',
      travelOrderDate: '2026-10-14',
      submissionDate: '2026-10-26',
      processingOfficer: 'R. Mendoza (Accounting)',
      manualOnHold: false,
      remarks: 'Awaiting final approval on Disbursement Voucher and ORS.',
      stageMap: {
        req_to: { applicable: true, p: true, s: true, sig: true, app: true },
        req_iot: { applicable: true, p: true, s: true, sig: true, app: true },
        req_ca: { applicable: true, p: true, s: true, sig: true, app: true },
        req_ctc: { applicable: true, p: true, s: true, sig: true, app: true },
        req_btor: { applicable: true, p: true, s: true, sig: true, app: false },
        req_ors: { applicable: true, p: true, s: true, sig: true, app: false },
        req_dv: { applicable: true, p: true, s: true, sig: true, app: false },
        req_tt: { applicable: true, p: true, s: true, sig: true, app: true },
        req_piot: { applicable: false },
        req_atc: { applicable: false },
        req_or: { applicable: true, p: true, s: true, sig: true, app: true },
        req_osd: { applicable: false },
      },
    },
    {
      id: 'tev_sample_apg_davao',
      tevRefNumber: 'TEV-2026-0004',
      employee: DEFAULT_EMPLOYEES[3],
      destination: 'Davao City, Davao del Sur',
      purpose: 'Inter-Agency Executive Coordination Conference (Demonstration Sample)',
      departureDate: '2026-11-02',
      returnDate: '2026-11-04',
      travelOrderNumber: 'TO-2026-1085',
      travelOrderDate: '2026-10-28',
      submissionDate: '',
      processingOfficer: 'L. Santos (Budget)',
      manualOnHold: true,
      remarks: 'Placed On Hold pending clarification on official receipt dates.',
      stageMap: {
        req_to: { applicable: true, p: true, s: true, sig: true, app: true },
        req_iot: { applicable: true, p: true, s: true, sig: false, app: false },
        req_ca: { applicable: true, p: true, s: false, sig: false, app: false },
        req_ctc: { applicable: true, p: false, s: false, sig: false, app: false },
        req_btor: { applicable: true, p: false, s: false, sig: false, app: false },
        req_ors: { applicable: true, p: true, s: false, sig: false, app: false },
        req_dv: { applicable: true, p: false, s: false, sig: false, app: false },
        req_tt: { applicable: false },
        req_piot: { applicable: false },
        req_atc: { applicable: true, p: true, s: true, sig: true, app: true },
        req_or: { applicable: true, p: true, s: true, sig: false, app: false, ret: true },
        req_osd: { applicable: false },
      },
    },
  ];

  for (const s of samples) {
    const checklistItems: TravelRequirementChecklist[] = DEFAULT_DOCUMENTARY_REQUIREMENTS.map((req) => {
      const cfg = s.stageMap[req.id] || { applicable: false };
      const prepared = Boolean(cfg.applicable && cfg.p);
      const submitted = Boolean(cfg.applicable && cfg.s);
      const signed = Boolean(cfg.applicable && cfg.sig);
      const approved = Boolean(cfg.applicable && cfg.app);
      const returnedForCorrection = Boolean(cfg.applicable && cfg.ret);

      return {
        id: `${s.id}_${req.id}`,
        workspaceScope: 'gov-tev-office',
        tevId: s.id,
        tevRefNumber: s.tevRefNumber,
        requirementId: req.id,
        requirementName: req.name,
        isCustom: false,
        sortOrder: req.sortOrder,
        applicable: cfg.applicable,
        prepared,
        submitted,
        signed,
        approved,
        returnedForCorrection,
        datePrepared: prepared ? s.travelOrderDate : '',
        dateSubmitted: submitted ? (s.submissionDate || s.returnDate) : '',
        dateSigned: signed ? (s.submissionDate || s.returnDate) : '',
        dateApproved: approved ? (s.submissionDate || s.returnDate) : '',
        signatoryName: signed ? 'Dir. Elena Villanueva' : '',
        approvingOfficerName: approved ? 'Dir. Carmela Mendoza' : '',
        remarks: returnedForCorrection ? 'Returned for receipt date clarification' : '',
        updatedBy: uid,
        updatedByName: userName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
    });

    const { applicableCount, completedCount, compliancePercentage } = calculateChecklistCompliance(checklistItems);
    const overallStatus = calculateOverallTevStatus(checklistItems, s.manualOnHold);

    batch2.set(doc(db, 'travelRecords', s.id), {
      id: s.id,
      workspaceScope: 'gov-tev-office',
      tevRefNumber: s.tevRefNumber,
      employeeId: s.employee.id,
      employeeCode: s.employee.employeeCode,
      employeeName: s.employee.fullName,
      officeId: s.employee.officeId,
      officeName: s.employee.officeName,
      position: s.employee.position,
      destination: s.destination,
      purpose: s.purpose,
      departureDate: s.departureDate,
      returnDate: s.returnDate,
      travelDays: calculateTravelDays(s.departureDate, s.returnDate),
      travelOrderNumber: s.travelOrderNumber,
      travelOrderDate: s.travelOrderDate,
      submissionDate: s.submissionDate,
      processingOfficer: s.processingOfficer,
      completionDate: overallStatus === 'Completed' ? '2026-10-22' : '',
      remarks: s.remarks,
      overallStatus,
      manualOnHold: s.manualOnHold,
      compliancePercentage,
      applicableCount,
      completedCount,
      isSampleData: true,
      createdBy: uid,
      createdByName: userName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    for (const item of checklistItems) {
      batch2.set(doc(db, 'travelRequirementChecklists', item.id), item);
    }
  }

  batch2.set(doc(db, 'activityLogs', `log_seed_${Date.now()}`), {
    id: `log_seed_${Date.now()}`,
    workspaceScope: 'gov-tev-office',
    action: 'SYSTEM_INITIALIZED',
    entityType: 'System',
    entityId: 'general',
    entityLabel: 'Workspace Masterlist & Sample Records',
    details: 'Initialized default documentary requirements, templates, offices, employees, and demonstration sample TEVs.',
    userId: uid,
    userName,
    userRole: currentUser.role,
    createdAt: serverTimestamp(),
  });

  try {
    await batch2.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'sample_data_seed');
  }
}
