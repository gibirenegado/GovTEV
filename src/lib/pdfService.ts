import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TravelRecord, TravelRequirementChecklist } from '../types/tev';
import { getRequirementStageVisual } from './tevCalculations';

export function exportTableToPdf(
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  filename: string,
  agencyName = 'Government Office TEV Monitoring System'
): void {
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });

  doc.setFillColor(15, 23, 42); // Dark Navy
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 56, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(agencyName, 32, 24);
  doc.setFontSize(14);
  doc.text(title, 32, 43);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.text(`${subtitle} · Generated ${new Date().toLocaleString()}`, 32, 74);

  autoTable(doc, {
    startY: 88,
    head: [headers],
    body: rows.map((r) => r.map((c) => String(c ?? '—'))),
    styles: { fontSize: 8, cellPadding: 5, textColor: [15, 23, 42] },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 32, right: 32 },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function exportIndividualTevPdf(
  record: TravelRecord,
  checklist: TravelRequirementChecklist[],
  agencyName = 'Government Office TEV Monitoring System'
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 68, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(agencyName, 36, 26);
  doc.setFontSize(15);
  doc.text(`TRAVEL EXPENSE VOUCHER (TEV) SUMMARY — ${record.tevRefNumber}`, 36, 48);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);

  const infoRows = [
    ['Employee Name', record.employeeName, 'TEV Reference No.', record.tevRefNumber],
    ['Employee ID', record.employeeCode || '—', 'Overall Status', record.overallStatus],
    ['Office / Division', record.officeName, 'Compliance Rate', `${record.compliancePercentage}% (${record.completedCount}/${record.applicableCount})`],
    ['Position / Designation', record.position || '—', 'Travel Order No.', record.travelOrderNumber || '—'],
    ['Destination', record.destination, 'Travel Dates', `${record.departureDate} to ${record.returnDate} (${record.travelDays} days)`],
    ['Processing Officer', record.processingOfficer || '—', 'Submission Date', record.submissionDate || '—'],
    ['Purpose of Travel', record.purpose, 'Completion Date', record.completionDate || '—'],
  ];

  autoTable(doc, {
    startY: 84,
    body: infoRows,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 5 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 105 },
      1: { cellWidth: 155 },
      2: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 105 },
      3: { cellWidth: 155 },
    },
    margin: { left: 36, right: 36 },
  });

  const sortedChecklist = [...checklist].sort((a, b) => a.sortOrder - b.sortOrder);
  const chkRows = sortedChecklist.map((item) => {
    const visual = getRequirementStageVisual(item);
    return [
      item.requirementName,
      item.applicable ? 'Applicable' : 'N/A',
      item.applicable ? (item.prepared ? `Yes (${item.datePrepared || '—'})` : 'No') : '—',
      item.applicable ? (item.submitted ? `Yes (${item.dateSubmitted || '—'})` : 'No') : '—',
      item.applicable ? (item.signed ? `Yes (${item.dateSigned || '—'})` : 'No') : '—',
      item.applicable ? (item.approved ? `Yes (${item.dateApproved || '—'})` : 'No') : '—',
      item.signatoryName || item.approvingOfficerName || '—',
      visual.label,
    ];
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 260;

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Documentary Requirements Checklist', 36, finalY + 24);

  autoTable(doc, {
    startY: finalY + 34,
    head: [['Requirement', 'Scope', 'Prepared', 'Submitted', 'Signed', 'Approved', 'Signatory / Approver', 'Stage']],
    body: chkRows,
    styles: { fontSize: 7.5, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 36, right: 36 },
  });

  if (record.remarks) {
    const afterTableY = (doc as any).lastAutoTable?.finalY || 600;
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Remarks: ${record.remarks}`, 36, afterTableY + 22, { maxWidth: 520 });
  }

  doc.save(`${record.tevRefNumber}_Summary.pdf`);
}
