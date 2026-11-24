import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { seedInitialWorkspaceData } from '../lib/seedData';
import {
  ActivityLogRecord,
  AttachmentRecord,
  DocumentaryRequirement,
  Employee,
  ImportHistoryRecord,
  Office,
  RequirementTemplate,
  SystemSettings,
  TravelRecord,
  TravelRequirementChecklist,
  UserProfile,
} from '../types/tev';

interface WorkspaceContextValue {
  firebaseUser: User | null;
  currentUser: UserProfile | null;
  authReady: boolean;
  dataLoading: boolean;
  authError: string;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  offices: Office[];
  employees: Employee[];
  documentaryRequirements: DocumentaryRequirement[];
  requirementTemplates: RequirementTemplate[];
  travelRecords: TravelRecord[];
  checklists: TravelRequirementChecklist[];
  attachments: AttachmentRecord[];
  importHistory: ImportHistoryRecord[];
  activityLogs: ActivityLogRecord[];
  users: UserProfile[];
  settings: SystemSettings;
  toastMessage: { type: 'success' | 'error' | 'info'; text: string } | null;
  showToast: (type: 'success' | 'error' | 'info', text: string) => void;
  clearToast: () => void;
}

const DEFAULT_SETTINGS: SystemSettings = {
  id: 'general',
  workspaceScope: 'gov-tev-office',
  agencyName: 'Department of Public Governance & Regional Operations',
  agencySubtitle: 'Office of the Regional Finance and Administrative Management Service',
  tevRefPrefix: 'TEV',
  tevRefSeparator: '-',
  overdueThresholdDays: 15,
  encoderCanImport: true,
  defaultRequirementIds: ['req_to', 'req_iot', 'req_ca', 'req_ctc', 'req_btor', 'req_ors', 'req_dv', 'req_or'],
  updatedBy: '',
  updatedAt: null,
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const [offices, setOffices] = useState<Office[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [documentaryRequirements, setDocumentaryRequirements] = useState<DocumentaryRequirement[]>([]);
  const [requirementTemplates, setRequirementTemplates] = useState<RequirementTemplate[]>([]);
  const [travelRecords, setTravelRecords] = useState<TravelRecord[]>([]);
  const [checklists, setChecklists] = useState<TravelRequirementChecklist[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistoryRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const seededAttemptedRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 4500);
  };

  const clearToast = () => setToastMessage(null);

  const signInWithGoogle = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err?.message || 'Sign-in failed. Please allow popups and try again.');
    }
  };

  const logout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setOffices([]);
    setEmployees([]);
    setDocumentaryRequirements([]);
    setRequirementTemplates([]);
    setTravelRecords([]);
    setChecklists([]);
    setAttachments([]);
    setImportHistory([]);
    setActivityLogs([]);
    setUsers([]);
  };

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      setFirebaseUser(user);
      if (!user) {
        setCurrentUser(null);
        setAuthReady(true);
        setDataLoading(false);
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(userRef);
        const isBootAdmin = user.email === 'gibi.renegado@gmail.com' && user.emailVerified;
        if (!snap.exists()) {
          const newProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || user.email?.split('@')[0] || 'Office Staff',
            role: isBootAdmin ? 'admin' : 'viewer',
            status: 'active',
            officeName: isBootAdmin ? 'Office of the Regional Director' : 'General Administration',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userRef, newProfile);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }

      unsubUserDoc = onSnapshot(
        userRef,
        (docSnap) => {
          if (docSnap.exists()) {
            setCurrentUser(docSnap.data() as UserProfile);
          }
          setAuthReady(true);
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser || currentUser.status !== 'active') {
      return;
    }

    setDataLoading(true);
    const scopeFilter = where('workspaceScope', '==', 'gov-tev-office');
    let initializedOfficesCheck = false;
    let officesAreEmpty = false;

    const maybeAutoSeed = async () => {
      if (
        initializedOfficesCheck &&
        officesAreEmpty &&
        currentUser.role === 'admin' &&
        !seededAttemptedRef.current
      ) {
        seededAttemptedRef.current = true;
        await seedInitialWorkspaceData(currentUser, true);
      }
    };

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, 'offices'), scopeFilter),
        (snap) => {
          const rows = snap.docs.map((d) => d.data() as Office).sort((a, b) => a.name.localeCompare(b.name));
          setOffices(rows);
          initializedOfficesCheck = true;
          officesAreEmpty = snap.empty;
          if (snap.empty) void maybeAutoSeed();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'offices')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'employees'), scopeFilter),
        (snap) => {
          const rows = snap.docs.map((d) => d.data() as Employee).sort((a, b) => a.fullName.localeCompare(b.fullName));
          setEmployees(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'employees')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'documentaryRequirements'), scopeFilter),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as DocumentaryRequirement)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          setDocumentaryRequirements(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'documentaryRequirements')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'requirementTemplates'), scopeFilter),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as RequirementTemplate)
            .sort((a, b) => a.name.localeCompare(b.name));
          setRequirementTemplates(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'requirementTemplates')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'travelRecords'), scopeFilter),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as TravelRecord)
            .sort((a, b) => (b.departureDate || '').localeCompare(a.departureDate || ''));
          setTravelRecords(rows);
          setDataLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'travelRecords')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'travelRequirementChecklists'), scopeFilter),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as TravelRequirementChecklist)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          setChecklists(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'travelRequirementChecklists')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'attachments'), scopeFilter),
        (snap) => {
          const rows = snap.docs.map((d) => d.data() as AttachmentRecord);
          setAttachments(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'attachments')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'importHistory'), scopeFilter),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as ImportHistoryRecord)
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setImportHistory(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'importHistory')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'activityLogs'), scopeFilter),
        (snap) => {
          const rows = snap.docs
            .map((d) => d.data() as ActivityLogRecord)
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setActivityLogs(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'activityLogs')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'systemSettings'), scopeFilter),
        (snap) => {
          if (!snap.empty) {
            setSettings(snap.docs[0].data() as SystemSettings);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'systemSettings')
      )
    );

    if (currentUser.role === 'admin') {
      unsubs.push(
        onSnapshot(
          collection(db, 'users'),
          (snap) => {
            const rows = snap.docs
              .map((d) => d.data() as UserProfile)
              .sort((a, b) => a.displayName.localeCompare(b.displayName));
            setUsers(rows);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'users')
        )
      );
    }

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [authReady, currentUser?.uid, currentUser?.role, currentUser?.status]);

  return (
    <WorkspaceContext.Provider
      value={{
        firebaseUser,
        currentUser,
        authReady,
        dataLoading,
        authError,
        signInWithGoogle,
        logout,
        offices,
        employees,
        documentaryRequirements,
        requirementTemplates,
        travelRecords,
        checklists,
        attachments,
        importHistory,
        activityLogs,
        users,
        settings,
        toastMessage,
        showToast,
        clearToast,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return ctx;
}
