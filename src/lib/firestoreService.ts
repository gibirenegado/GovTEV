import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  calculateChecklistCompliance,
  calculateOverallTevStatus,
  calculateTravelDays,
  createClientId,
  todayIsoDate,
} from './tevCalculations';
import {
  AllowedFileExtension,
  AttachmentRecord,
  DocumentaryRequirement,
  Employee,
  Office,
  RequirementTemplate,
  SystemSettings,
  TravelRecord,
  TravelRequirementChecklist,
  UserProfile,
  UserRole,
} from '../types/tev';

export async function logActivity(
  user: UserProfile,
  action: string,
  entityType: string,
  entityId: string,
  entityLabel: string,
  details: string
): Promise<void> {
  const id = createClientId('log');
  try {
    await setDoc(doc(db, 'activityLogs', id), {
      id,
      workspaceScope: 'gov-tev-office',
      action: action.slice(0, 100),
      entityType: entityType.slice(0, 60),
      entityId: entityId.slice(0, 128),
      entityLabel: entityLabel.slice(0, 200),
      details: details.slice(0, 600),
      userId: user.uid,
      userName: user.displayName.slice(0, 150),
      userRole: user.role,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `activityLogs/${id}`);
  }
}

export async function createTravelRecordWithChecklist(
  user: UserProfile,
  payload: {
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
    travelOrderNumber: string;
    travelOrderDate: string;
    submissionDate: string;
    processingOfficer: string;
    remarks: string;
    isSampleData?: boolean;
  },
  selectedChecklistDefs: Array<{
    requirementId: string;
    requirementName: string;
    isCustom: boolean;
    sortOrder: number;
    applicable: boolean;
  }>
): Promise<string> {
  const tevId = createClientId('tev');
  const batch = writeBatch(db);
  const travelDays = calculateTravelDays(payload.departureDate, payload.returnDate);

  const items: TravelRequirementChecklist[] = selectedChecklistDefs.map((def, index) => ({
    id: `${tevId}_${def.requirementId}_${index}`,
    workspaceScope: 'gov-tev-office',
    tevId,
    tevRefNumber: payload.tevRefNumber.trim(),
    requirementId: def.requirementId,
    requirementName: def.requirementName.trim().slice(0, 150),
    isCustom: def.isCustom,
    sortOrder: def.sortOrder,
    applicable: def.applicable,
    prepared: false,
    submitted: false,
    signed: false,
    approved: false,
    returnedForCorrection: false,
    datePrepared: '',
    dateSubmitted: '',
    dateSigned: '',
    dateApproved: '',
    signatoryName: '',
    approvingOfficerName: '',
    remarks: '',
    updatedBy: user.uid,
    updatedByName: user.displayName.slice(0, 150),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));

  const { applicableCount, completedCount, compliancePercentage } = calculateChecklistCompliance(items);
  const overallStatus = calculateOverallTevStatus(items, false);

  batch.set(doc(db, 'travelRecords', tevId), {
    id: tevId,
    workspaceScope: 'gov-tev-office',
    tevRefNumber: payload.tevRefNumber.trim().slice(0, 64),
    employeeId: payload.employeeId,
    employeeCode: payload.employeeCode.slice(0, 50),
    employeeName: payload.employeeName.slice(0, 150),
    officeId: payload.officeId,
    officeName: payload.officeName.slice(0, 150),
    position: payload.position.slice(0, 150),
    destination: payload.destination.trim().slice(0, 200),
    purpose: payload.purpose.trim().slice(0, 500),
    departureDate: payload.departureDate,
    returnDate: payload.returnDate,
    travelDays,
    travelOrderNumber: payload.travelOrderNumber.trim().slice(0, 80),
    travelOrderDate: payload.travelOrderDate || '',
    submissionDate: payload.submissionDate || '',
    processingOfficer: payload.processingOfficer.trim().slice(0, 150),
    completionDate: '',
    remarks: payload.remarks.trim().slice(0, 1000),
    overallStatus,
    manualOnHold: false,
    compliancePercentage,
    applicableCount,
    completedCount,
    isSampleData: Boolean(payload.isSampleData),
    createdBy: user.uid,
    createdByName: user.displayName.slice(0, 150),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const item of items) {
    batch.set(doc(db, 'travelRequirementChecklists', item.id), item);
  }

  const logId = createClientId('log');
  batch.set(doc(db, 'activityLogs', logId), {
    id: logId,
    workspaceScope: 'gov-tev-office',
    action: 'TEV_CREATED',
    entityType: 'TravelRecord',
    entityId: tevId,
    entityLabel: `${payload.tevRefNumber} · ${payload.employeeName}`,
    details: `Created TEV for ${payload.destination} (${payload.departureDate} to ${payload.returnDate}) with ${applicableCount} applicable requirement(s).`,
    userId: user.uid,
    userName: user.displayName.slice(0, 150),
    userRole: user.role,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return tevId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `travelRecords/${tevId}`);
  }
}

export async function updateTravelRecordDetails(
  user: UserProfile,
  tev: TravelRecord,
  updates: {
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
    travelOrderNumber: string;
    travelOrderDate: string;
    submissionDate: string;
    processingOfficer: string;
    completionDate: string;
    remarks: string;
  }
): Promise<void> {
  const travelDays = calculateTravelDays(updates.departureDate, updates.returnDate);
  try {
    await updateDoc(doc(db, 'travelRecords', tev.id), {
      employeeId: updates.employeeId,
      employeeCode: updates.employeeCode.slice(0, 50),
      employeeName: updates.employeeName.slice(0, 150),
      officeId: updates.officeId,
      officeName: updates.officeName.slice(0, 150),
      position: updates.position.slice(0, 150),
      destination: updates.destination.trim().slice(0, 200),
      purpose: updates.purpose.trim().slice(0, 500),
      departureDate: updates.departureDate,
      returnDate: updates.returnDate,
      travelDays,
      travelOrderNumber: updates.travelOrderNumber.trim().slice(0, 80),
      travelOrderDate: updates.travelOrderDate || '',
      submissionDate: updates.submissionDate || '',
      processingOfficer: updates.processingOfficer.trim().slice(0, 150),
      completionDate: updates.completionDate || '',
      remarks: updates.remarks.trim().slice(0, 1000),
      updatedAt: serverTimestamp(),
    });
    await logActivity(
      user,
      'TEV_UPDATED',
      'TravelRecord',
      tev.id,
      `${tev.tevRefNumber} · ${updates.employeeName}`,
      `Updated travel details for destination ${updates.destination} (${updates.departureDate} to ${updates.returnDate}).`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `travelRecords/${tev.id}`);
  }
}

export async function syncTravelRecordFromChecklist(
  user: UserProfile,
  tev: TravelRecord,
  allChecklistItemsForTev: TravelRequirementChecklist[],
  manualOnHoldOverride?: boolean
): Promise<void> {
  const manualOnHold = manualOnHoldOverride !== undefined ? manualOnHoldOverride : tev.manualOnHold;
  const { applicableCount, completedCount, compliancePercentage } =
    calculateChecklistCompliance(allChecklistItemsForTev);
  const overallStatus = calculateOverallTevStatus(allChecklistItemsForTev, manualOnHold);
  const completionDate =
    overallStatus === 'Completed' ? tev.completionDate || todayIsoDate() : '';

  try {
    await updateDoc(doc(db, 'travelRecords', tev.id), {
      overallStatus,
      manualOnHold,
      compliancePercentage,
      applicableCount,
      completedCount,
      completionDate,
      updatedAt: serverTimestamp(),
    });
    if (manualOnHoldOverride !== undefined && manualOnHoldOverride !== tev.manualOnHold) {
      await logActivity(
        user,
        manualOnHold ? 'TEV_PLACED_ON_HOLD' : 'TEV_HOLD_RELEASED',
        'TravelRecord',
        tev.id,
        `${tev.tevRefNumber} · ${tev.employeeName}`,
        manualOnHold
          ? 'Manually placed TEV on hold.'
          : `Released manual hold; recalculated status is ${overallStatus}.`
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `travelRecords/${tev.id}`);
  }
}

export async function updateChecklistItemAndSyncTev(
  user: UserProfile,
  tev: TravelRecord,
  currentTevChecklist: TravelRequirementChecklist[],
  itemId: string,
  patch: Partial<
    Pick<
      TravelRequirementChecklist,
      | 'requirementName'
      | 'sortOrder'
      | 'applicable'
      | 'prepared'
      | 'submitted'
      | 'signed'
      | 'approved'
      | 'returnedForCorrection'
      | 'datePrepared'
      | 'dateSubmitted'
      | 'dateSigned'
      | 'dateApproved'
      | 'signatoryName'
      | 'approvingOfficerName'
      | 'remarks'
    >
  >,
  auditDescription: string
): Promise<void> {
  const updatedList = currentTevChecklist.map((item) =>
    item.id === itemId ? { ...item, ...patch } : item
  );
  const { applicableCount, completedCount, compliancePercentage } =
    calculateChecklistCompliance(updatedList);
  const overallStatus = calculateOverallTevStatus(updatedList, tev.manualOnHold);
  const completionDate =
    overallStatus === 'Completed' ? tev.completionDate || todayIsoDate() : '';

  const batch = writeBatch(db);
  batch.update(doc(db, 'travelRequirementChecklists', itemId), {
    ...patch,
    updatedBy: user.uid,
    updatedByName: user.displayName.slice(0, 150),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'travelRecords', tev.id), {
    overallStatus,
    manualOnHold: tev.manualOnHold,
    compliancePercentage,
    applicableCount,
    completedCount,
    completionDate,
    updatedAt: serverTimestamp(),
  });

  const logId = createClientId('log');
  batch.set(doc(db, 'activityLogs', logId), {
    id: logId,
    workspaceScope: 'gov-tev-office',
    action: 'CHECKLIST_UPDATED',
    entityType: 'TravelRequirementChecklist',
    entityId: tev.id,
    entityLabel: `${tev.tevRefNumber} · ${tev.employeeName}`,
    details: auditDescription.slice(0, 600),
    userId: user.uid,
    userName: user.displayName.slice(0, 150),
    userRole: user.role,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `travelRequirementChecklists/${itemId}`);
  }
}

export async function bulkToggleChecklistApplicable(
  user: UserProfile,
  tev: TravelRecord,
  currentTevChecklist: TravelRequirementChecklist[],
  applicableIds: Set<string>,
  auditSummary: string
): Promise<void> {
  const updatedList = currentTevChecklist.map((item) => ({
    ...item,
    applicable: applicableIds.has(item.requirementId) || applicableIds.has(item.id),
  }));
  const { applicableCount, completedCount, compliancePercentage } =
    calculateChecklistCompliance(updatedList);
  const overallStatus = calculateOverallTevStatus(updatedList, tev.manualOnHold);
  const completionDate =
    overallStatus === 'Completed' ? tev.completionDate || todayIsoDate() : '';

  const batch = writeBatch(db);
  for (const item of updatedList) {
    batch.update(doc(db, 'travelRequirementChecklists', item.id), {
      applicable: item.applicable,
      updatedBy: user.uid,
      updatedByName: user.displayName.slice(0, 150),
      updatedAt: serverTimestamp(),
    });
  }
  batch.update(doc(db, 'travelRecords', tev.id), {
    overallStatus,
    manualOnHold: tev.manualOnHold,
    compliancePercentage,
    applicableCount,
    completedCount,
    completionDate,
    updatedAt: serverTimestamp(),
  });
  const logId = createClientId('log');
  batch.set(doc(db, 'activityLogs', logId), {
    id: logId,
    workspaceScope: 'gov-tev-office',
    action: 'CHECKLIST_APPLICABILITY_UPDATED',
    entityType: 'TravelRecord',
    entityId: tev.id,
    entityLabel: `${tev.tevRefNumber} · ${tev.employeeName}`,
    details: auditSummary.slice(0, 600),
    userId: user.uid,
    userName: user.displayName.slice(0, 150),
    userRole: user.role,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `travelRecords/${tev.id}`);
  }
}

export async function addCustomChecklistItemToTev(
  user: UserProfile,
  tev: TravelRecord,
  currentTevChecklist: TravelRequirementChecklist[],
  requirementName: string
): Promise<void> {
  const reqId = createClientId('custom_req');
  const itemId = createClientId('chk');
  const sortOrder =
    currentTevChecklist.reduce((max, i) => Math.max(max, i.sortOrder), 0) + 1;

  const newItem: TravelRequirementChecklist = {
    id: itemId,
    workspaceScope: 'gov-tev-office',
    tevId: tev.id,
    tevRefNumber: tev.tevRefNumber,
    requirementId: reqId,
    requirementName: requirementName.trim().slice(0, 150),
    isCustom: true,
    sortOrder,
    applicable: true,
    prepared: false,
    submitted: false,
    signed: false,
    approved: false,
    returnedForCorrection: false,
    datePrepared: '',
    dateSubmitted: '',
    dateSigned: '',
    dateApproved: '',
    signatoryName: '',
    approvingOfficerName: '',
    remarks: '',
    updatedBy: user.uid,
    updatedByName: user.displayName.slice(0, 150),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const updatedList = [...currentTevChecklist, newItem];
  const { applicableCount, completedCount, compliancePercentage } =
    calculateChecklistCompliance(updatedList);
  const overallStatus = calculateOverallTevStatus(updatedList, tev.manualOnHold);

  const batch = writeBatch(db);
  batch.set(doc(db, 'travelRequirementChecklists', itemId), newItem);
  batch.update(doc(db, 'travelRecords', tev.id), {
    overallStatus,
    manualOnHold: tev.manualOnHold,
    compliancePercentage,
    applicableCount,
    completedCount,
    completionDate: '',
    updatedAt: serverTimestamp(),
  });
  const logId = createClientId('log');
  batch.set(doc(db, 'activityLogs', logId), {
    id: logId,
    workspaceScope: 'gov-tev-office',
    action: 'CUSTOM_REQUIREMENT_ADDED',
    entityType: 'TravelRequirementChecklist',
    entityId: tev.id,
    entityLabel: `${tev.tevRefNumber} · ${requirementName}`,
    details: `Added custom requirement "${requirementName}" to ${tev.tevRefNumber}.`,
    userId: user.uid,
    userName: user.displayName.slice(0, 150),
    userRole: user.role,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `travelRequirementChecklists/${itemId}`);
  }
}

export async function deleteCustomChecklistItemFromTev(
  user: UserProfile,
  tev: TravelRecord,
  currentTevChecklist: TravelRequirementChecklist[],
  item: TravelRequirementChecklist
): Promise<void> {
  const remaining = currentTevChecklist.filter((i) => i.id !== item.id);
  const { applicableCount, completedCount, compliancePercentage } =
    calculateChecklistCompliance(remaining);
  const overallStatus = calculateOverallTevStatus(remaining, tev.manualOnHold);
  const completionDate =
    overallStatus === 'Completed' ? tev.completionDate || todayIsoDate() : '';

  const batch = writeBatch(db);
  batch.delete(doc(db, 'travelRequirementChecklists', item.id));
  batch.update(doc(db, 'travelRecords', tev.id), {
    overallStatus,
    manualOnHold: tev.manualOnHold,
    compliancePercentage,
    applicableCount,
    completedCount,
    completionDate,
    updatedAt: serverTimestamp(),
  });
  const logId = createClientId('log');
  batch.set(doc(db, 'activityLogs', logId), {
    id: logId,
    workspaceScope: 'gov-tev-office',
    action: 'CUSTOM_REQUIREMENT_DELETED',
    entityType: 'TravelRequirementChecklist',
    entityId: tev.id,
    entityLabel: `${tev.tevRefNumber} · ${item.requirementName}`,
    details: `Removed custom requirement "${item.requirementName}" from ${tev.tevRefNumber}.`,
    userId: user.uid,
    userName: user.displayName.slice(0, 150),
    userRole: user.role,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `travelRequirementChecklists/${item.id}`);
  }
}

export async function deleteTravelRecordCascade(
  user: UserProfile,
  tev: TravelRecord,
  checklistItems: TravelRequirementChecklist[],
  attachments: AttachmentRecord[]
): Promise<void> {
  const ops: Array<{ type: 'delete'; path: string; id: string }> = [
    ...checklistItems.map((i) => ({ type: 'delete' as const, path: 'travelRequirementChecklists', id: i.id })),
    ...attachments.map((a) => ({ type: 'delete' as const, path: 'attachments', id: a.id })),
    { type: 'delete' as const, path: 'travelRecords', id: tev.id },
  ];

  // Chunk into batches of 400
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      batch.delete(doc(db, op.path, op.id));
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `travelRecords/${tev.id}`);
    }
  }

  await logActivity(
    user,
    'TEV_DELETED',
    'TravelRecord',
    tev.id,
    `${tev.tevRefNumber} · ${tev.employeeName}`,
    `Deleted TEV record (${tev.destination}, ${tev.departureDate}) along with ${checklistItems.length} checklist items and ${attachments.length} attachment(s).`
  );
}

export async function deleteAllSampleRecords(
  user: UserProfile,
  travelRecords: TravelRecord[],
  allChecklists: TravelRequirementChecklist[],
  allAttachments: AttachmentRecord[]
): Promise<number> {
  const sampleTevs = travelRecords.filter((t) => t.isSampleData);
  if (sampleTevs.length === 0) return 0;
  const sampleTevIds = new Set(sampleTevs.map((t) => t.id));
  const sampleChecklists = allChecklists.filter((c) => sampleTevIds.has(c.tevId));
  const sampleAttachments = allAttachments.filter((a) => sampleTevIds.has(a.tevId));

  const refs = [
    ...sampleChecklists.map((c) => doc(db, 'travelRequirementChecklists', c.id)),
    ...sampleAttachments.map((a) => doc(db, 'attachments', a.id)),
    ...sampleTevs.map((t) => doc(db, 'travelRecords', t.id)),
  ];

  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + 400)) {
      batch.delete(ref);
    }
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'travelRecords/sample_cleanup');
    }
  }

  await logActivity(
    user,
    'SAMPLE_RECORDS_DELETED',
    'TravelRecord',
    'sample_batch',
    `${sampleTevs.length} Demonstration Sample TEVs`,
    `Administrator deleted ${sampleTevs.length} demonstration sample TEV record(s).`
  );
  return sampleTevs.length;
}

export async function uploadAttachmentDocument(
  user: UserProfile,
  tev: TravelRecord,
  checklistItem: TravelRequirementChecklist,
  file: File,
  existingAttachmentsForItem: AttachmentRecord[]
): Promise<void> {
  const ext = (file.name.split('.').pop() || '').toLowerCase() as AllowedFileExtension;
  const allowed: AllowedFileExtension[] = ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx'];
  if (!allowed.includes(ext)) {
    throw new Error('Unsupported file format. Allowed: PDF, JPG, JPEG, PNG, DOCX, XLSX.');
  }
  if (file.size > 620 * 1024) {
    throw new Error('File size exceeds 620 KB Firestore document limit. Please compress or upload a smaller scan.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

  if (dataUrl.length > 895000) {
    throw new Error('Encoded file size exceeds database limit. Please upload a smaller file.');
  }

  const nextVersion =
    existingAttachmentsForItem.reduce((max, a) => Math.max(max, a.version), 0) + 1;
  const attId = createClientId('att');
  const batch = writeBatch(db);

  for (const prev of existingAttachmentsForItem) {
    if (prev.isLatest) {
      batch.update(doc(db, 'attachments', prev.id), {
        isLatest: false,
        updatedAt: serverTimestamp(),
      });
    }
  }

  batch.set(doc(db, 'attachments', attId), {
    id: attId,
    workspaceScope: 'gov-tev-office',
    tevId: tev.id,
    tevRefNumber: tev.tevRefNumber,
    checklistItemId: checklistItem.id,
    requirementName: checklistItem.requirementName,
    fileName: file.name.slice(0, 200),
    fileType: (file.type || 'application/octet-stream').slice(0, 120),
    fileExtension: ext,
    fileSize: file.size,
    version: nextVersion,
    isLatest: true,
    dataUrl,
    uploadedBy: user.uid,
    uploadedByName: user.displayName.slice(0, 150),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const logId = createClientId('log');
  batch.set(doc(db, 'activityLogs', logId), {
    id: logId,
    workspaceScope: 'gov-tev-office',
    action: nextVersion > 1 ? 'DOCUMENT_REPLACED' : 'DOCUMENT_UPLOADED',
    entityType: 'Attachment',
    entityId: attId,
    entityLabel: `${tev.tevRefNumber} · ${checklistItem.requirementName}`,
    details: `${nextVersion > 1 ? 'Uploaded replacement v' + nextVersion : 'Uploaded'} "${file.name}" (${Math.round(file.size / 1024)} KB).`,
    userId: user.uid,
    userName: user.displayName.slice(0, 150),
    userRole: user.role,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `attachments/${attId}`);
  }
}

export async function deleteAttachmentRecord(
  user: UserProfile,
  attachment: AttachmentRecord
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'attachments', attachment.id));
    await logActivity(
      user,
      'DOCUMENT_DELETED',
      'Attachment',
      attachment.id,
      `${attachment.tevRefNumber} · ${attachment.requirementName}`,
      `Deleted attachment "${attachment.fileName}" (v${attachment.version}).`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `attachments/${attachment.id}`);
  }
}

export async function saveOffice(
  user: UserProfile,
  office: Partial<Office> & { name: string; code: string; headName: string; status: 'active' | 'inactive' }
): Promise<string> {
  const id = office.id || createClientId('off');
  const isNew = !office.id;
  try {
    if (isNew) {
      await setDoc(doc(db, 'offices', id), {
        id,
        workspaceScope: 'gov-tev-office',
        name: office.name.trim().slice(0, 150),
        code: office.code.trim().toUpperCase().slice(0, 32),
        headName: office.headName.trim().slice(0, 150),
        status: office.status,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'offices', id), {
        name: office.name.trim().slice(0, 150),
        code: office.code.trim().toUpperCase().slice(0, 32),
        headName: office.headName.trim().slice(0, 150),
        status: office.status,
        updatedAt: serverTimestamp(),
      });
    }
    await logActivity(
      user,
      isNew ? 'OFFICE_CREATED' : 'OFFICE_UPDATED',
      'Office',
      id,
      `${office.code} · ${office.name}`,
      `${isNew ? 'Added' : 'Updated'} office/division (${office.status}).`
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, `offices/${id}`);
  }
}

export async function saveEmployee(
  user: UserProfile,
  emp: Partial<Employee> & {
    employeeCode: string;
    fullName: string;
    officeId: string;
    officeName: string;
    position: string;
    status: 'active' | 'inactive';
  }
): Promise<string> {
  const id = emp.id || createClientId('emp');
  const isNew = !emp.id;
  try {
    if (isNew) {
      await setDoc(doc(db, 'employees', id), {
        id,
        workspaceScope: 'gov-tev-office',
        employeeCode: emp.employeeCode.trim().slice(0, 50),
        fullName: emp.fullName.trim().slice(0, 150),
        officeId: emp.officeId,
        officeName: emp.officeName.trim().slice(0, 150),
        position: emp.position.trim().slice(0, 150),
        status: emp.status,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'employees', id), {
        employeeCode: emp.employeeCode.trim().slice(0, 50),
        fullName: emp.fullName.trim().slice(0, 150),
        officeId: emp.officeId,
        officeName: emp.officeName.trim().slice(0, 150),
        position: emp.position.trim().slice(0, 150),
        status: emp.status,
        updatedAt: serverTimestamp(),
      });
    }
    await logActivity(
      user,
      isNew ? 'EMPLOYEE_CREATED' : 'EMPLOYEE_UPDATED',
      'Employee',
      id,
      `${emp.employeeCode} · ${emp.fullName}`,
      `${isNew ? 'Registered' : 'Updated'} employee in ${emp.officeName} (${emp.status}).`
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, `employees/${id}`);
  }
}

export async function deleteEmployeeRecord(user: UserProfile, emp: Employee): Promise<void> {
  try {
    await deleteDoc(doc(db, 'employees', emp.id));
    await logActivity(
      user,
      'EMPLOYEE_DELETED',
      'Employee',
      emp.id,
      `${emp.employeeCode} · ${emp.fullName}`,
      `Deleted employee record from ${emp.officeName}.`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `employees/${emp.id}`);
  }
}

export async function saveDocumentaryRequirement(
  user: UserProfile,
  req: Partial<DocumentaryRequirement> & {
    code: string;
    name: string;
    description: string;
    isDefault: boolean;
    isCustom: boolean;
    sortOrder: number;
    status: 'active' | 'inactive';
  }
): Promise<string> {
  const id = req.id || createClientId('req');
  const isNew = !req.id;
  try {
    if (isNew) {
      await setDoc(doc(db, 'documentaryRequirements', id), {
        id,
        workspaceScope: 'gov-tev-office',
        code: req.code.trim().toUpperCase().slice(0, 32),
        name: req.name.trim().slice(0, 150),
        description: req.description.trim().slice(0, 400),
        isDefault: req.isDefault,
        isCustom: req.isCustom,
        sortOrder: req.sortOrder,
        status: req.status,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'documentaryRequirements', id), {
        code: req.code.trim().toUpperCase().slice(0, 32),
        name: req.name.trim().slice(0, 150),
        description: req.description.trim().slice(0, 400),
        isDefault: req.isDefault,
        sortOrder: req.sortOrder,
        status: req.status,
        updatedAt: serverTimestamp(),
      });
    }
    await logActivity(
      user,
      isNew ? 'REQUIREMENT_CREATED' : 'REQUIREMENT_UPDATED',
      'DocumentaryRequirement',
      id,
      `${req.code} · ${req.name}`,
      `${isNew ? 'Added' : 'Updated'} documentary requirement masterlist item.`
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, `documentaryRequirements/${id}`);
  }
}

export async function deleteDocumentaryRequirement(
  user: UserProfile,
  req: DocumentaryRequirement
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'documentaryRequirements', req.id));
    await logActivity(
      user,
      'REQUIREMENT_DELETED',
      'DocumentaryRequirement',
      req.id,
      `${req.code} · ${req.name}`,
      'Deleted documentary requirement from masterlist.'
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `documentaryRequirements/${req.id}`);
  }
}

export async function saveRequirementTemplate(
  user: UserProfile,
  tpl: Partial<RequirementTemplate> & {
    name: string;
    description: string;
    requirementIds: string[];
    requirementNames: string[];
  }
): Promise<string> {
  const id = tpl.id || createClientId('tpl');
  const isNew = !tpl.id;
  try {
    if (isNew) {
      await setDoc(doc(db, 'requirementTemplates', id), {
        id,
        workspaceScope: 'gov-tev-office',
        name: tpl.name.trim().slice(0, 150),
        description: tpl.description.trim().slice(0, 400),
        requirementIds: tpl.requirementIds.slice(0, 50),
        requirementNames: tpl.requirementNames.slice(0, 50),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'requirementTemplates', id), {
        name: tpl.name.trim().slice(0, 150),
        description: tpl.description.trim().slice(0, 400),
        requirementIds: tpl.requirementIds.slice(0, 50),
        requirementNames: tpl.requirementNames.slice(0, 50),
        updatedAt: serverTimestamp(),
      });
    }
    await logActivity(
      user,
      isNew ? 'TEMPLATE_CREATED' : 'TEMPLATE_UPDATED',
      'RequirementTemplate',
      id,
      tpl.name,
      `${isNew ? 'Saved' : 'Updated'} requirement template with ${tpl.requirementIds.length} requirement(s).`
    );
    return id;
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, `requirementTemplates/${id}`);
  }
}

export async function deleteRequirementTemplate(
  user: UserProfile,
  tpl: RequirementTemplate
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'requirementTemplates', tpl.id));
    await logActivity(
      user,
      'TEMPLATE_DELETED',
      'RequirementTemplate',
      tpl.id,
      tpl.name,
      'Deleted requirement template.'
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `requirementTemplates/${tpl.id}`);
  }
}

export async function updateUserRoleAndStatus(
  adminUser: UserProfile,
  targetUser: UserProfile,
  role: UserRole,
  status: 'active' | 'inactive',
  officeName: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', targetUser.uid), {
      role,
      status,
      officeName: officeName.trim().slice(0, 150),
      updatedAt: serverTimestamp(),
    });
    await logActivity(
      adminUser,
      'USER_ROLE_UPDATED',
      'UserProfile',
      targetUser.uid,
      `${targetUser.displayName} (${targetUser.email})`,
      `Updated user access to role="${role}", status="${status}".`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}

export async function saveSystemSettings(
  adminUser: UserProfile,
  settings: Omit<SystemSettings, 'id' | 'workspaceScope' | 'updatedBy' | 'updatedAt'>
): Promise<void> {
  try {
    await setDoc(
      doc(db, 'systemSettings', 'general'),
      {
        id: 'general',
        workspaceScope: 'gov-tev-office',
        agencyName: settings.agencyName.trim().slice(0, 150),
        agencySubtitle: settings.agencySubtitle.trim().slice(0, 200),
        tevRefPrefix: settings.tevRefPrefix.trim().toUpperCase().slice(0, 20),
        tevRefSeparator: settings.tevRefSeparator.slice(0, 5),
        overdueThresholdDays: settings.overdueThresholdDays,
        encoderCanImport: settings.encoderCanImport,
        defaultRequirementIds: settings.defaultRequirementIds.slice(0, 50),
        updatedBy: adminUser.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    await logActivity(
      adminUser,
      'SETTINGS_UPDATED',
      'SystemSettings',
      'general',
      settings.agencyName,
      `Updated TEV format (${settings.tevRefPrefix}${settings.tevRefSeparator}YYYY${settings.tevRefSeparator}0001) and overdue threshold (${settings.overdueThresholdDays} days).`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'systemSettings/general');
  }
}

export async function recordImportHistory(
  user: UserProfile,
  entry: {
    fileName: string;
    mode: 'import' | 'update';
    totalRecords: number;
    successCount: number;
    failedCount: number;
    errorsSummary: string[];
  }
): Promise<void> {
  const id = createClientId('imp');
  try {
    await setDoc(doc(db, 'importHistory', id), {
      id,
      workspaceScope: 'gov-tev-office',
      fileName: entry.fileName.slice(0, 200),
      mode: entry.mode,
      totalRecords: entry.totalRecords,
      successCount: entry.successCount,
      failedCount: entry.failedCount,
      errorsSummary: entry.errorsSummary.slice(0, 50).map((s) => s.slice(0, 300)),
      importedBy: user.uid,
      importedByName: user.displayName.slice(0, 150),
      createdAt: serverTimestamp(),
    });
    await logActivity(
      user,
      entry.mode === 'import' ? 'BULK_EXCEL_IMPORT' : 'BULK_EXCEL_UPDATE',
      'ImportHistory',
      id,
      entry.fileName,
      `${entry.mode === 'import' ? 'Imported' : 'Bulk updated'} ${entry.successCount} of ${entry.totalRecords} row(s); ${entry.failedCount} failed/skipped.`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `importHistory/${id}`);
  }
}
