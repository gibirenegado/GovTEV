# Security Specification — GovTEV Tracker & Monitoring System

## 1. Data Invariants
1. **Identity & RBAC**: Every user profile in `/users/{userId}` can only be read by its owner or an active Administrator. Non-administrators cannot self-assign `admin` or `encoder` roles on registration (strictly `role == 'viewer'` unless bootstrapped admin).
2. **Referential Integrity**: Every `/travelRequirementChecklists/{checklistId}` and `/attachments/{attachmentId}` must reference an existing `/travelRecords/{tevId}` (`exists()` enforced on create). Every `/travelRecords/{tevId}` must reference an existing `/employees/{employeeId}` and `/offices/{officeId}`.
3. **Immutable Audit Trail**: `/activityLogs/{logId}` and `/importHistory/{importId}` are append-only; updates and deletes are strictly forbidden (`allow update, delete: if false;`).
4. **Stage Separation & Terminal Locking**: Checklist items separate `prepared`, `submitted`, `signed`, and `approved` booleans. Once a `TravelRecord` reaches `overallStatus == 'Completed'`, non-admins cannot alter its core fields without explicit admin override.
5. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must equal `request.time` on creation/update, and `createdAt` and `createdBy` remain immutable after creation.
6. **Size & Payload Bounds**: Every string field enforces strict `.size()` caps, IDs match `^[a-zA-Z0-9_\-]+$`, arrays are capped at `<= 50` elements, and `hasAll` / `hasOnly` reject shadow fields.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Self-Privilege Escalation**: Non-admin creating `/users/{uid}` with `role: "admin"`.
2. **Role Tampering**: Viewer/Encoder updating own `/users/{uid}` to `role: "admin"`.
3. **PII Snooping**: Non-admin reading `/users/{otherUid}` or listing `/users`.
4. **Unverified Email Bypass**: Request with `email: "gibi.renegado@gmail.com"` and `email_verified: false`.
5. **Shadow Field Injection**: Creating a `/travelRecords/{id}` with an extra `"isApprovedOverride": true` field.
6. **ID Poisoning**: Creating `/travelRecords/invalid$id!with*spaces` or a 1,500-char ID.
7. **Orphaned Checklist Item**: Creating `/travelRequirementChecklists/{id}` with nonexistent `tevId`.
8. **Client Timestamp Forgery**: Creating `/travelRecords/{id}` with backdated `createdAt` instead of `request.time`.
9. **Audit Log Tampering**: Attempting `update` or `delete` on `/activityLogs/{id}` even as admin.
10. **Viewer Mutation**: A `viewer` user attempting to create or update `/travelRecords/{id}` or `/travelRequirementChecklists/{id}`.
11. **Oversized Attachment / Payload Exhaustion**: Attempting to upload an attachment exceeding 900,000 chars or invalid extension (`exe`).
12. **Encoder Admin-Only Escalation**: An `encoder` attempting to delete `/travelRecords/{id}`, modify `/systemSettings/{id}`, or create `/offices/{id}`.
