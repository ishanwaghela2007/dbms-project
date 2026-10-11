export type Role = "admin" | "teacher" | "student";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export type ValidationStatus = "match" | "discrepancy" | "not_found" | "ambiguous" | "invalid";

export interface Student {
  id: string;
  rollNo: string;
  name: string;
  email: string;
  department: string;
  program: string;
  semester: string;
  division: string;
  attendance: number;
  status: "Active" | "Inactive";
  avatar?: string;
}

export interface Teacher {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  subjects: string[];
  status: "Active" | "Inactive";
}

export interface MarkRow {
  studentId: string;
  rollNo: string;
  studentName: string;
  enteredMarks: string;
  pdfMarks: number | null;
  maxMarks: number;
  status: ValidationStatus;
  evidence?: string;
  confirmed?: boolean;
  overrideReason?: string;
}

export interface Followup {
  id: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  subject: string;
  attendance: number;
  teacherName: string;
  status: "OPEN" | "ACKNOWLEDGED" | "MEETING_REQUESTED" | "RESOLVED";
  contact: string;
}


export interface Paper {
  id: string;
  title: string;
  subject: string;
  semester: string;
  academicYear: string;
  category: "Question paper" | "Answer key" | "Study material";
  uploadedBy: string;
  uploadedAt: string;
  fileName: string;
  access: "Published" | "Restricted" | "Draft";
}

export interface StudentNotification {
  id: string;
  title: string;
  message: string;
  kind: "attendance" | "meeting" | "result" | "general";
  createdAt: string;
  isRead: boolean;
  attendance?: number;
  requiredAttendance?: number;
  subject?: string;
  contactName?: string;
  contactRole?: string;
  contactLocation?: string;
  followupId?: string;
}

export interface Meeting {
  id: string;
  studentId: string;
  studentName: string;
  teacherName: string;
  subject: string;
  date: string;
  time: string;
  location: string;
  status: "REQUESTED" | "CONFIRMED" | "DECLINED" | "RESCHEDULE_PROPOSED" | "CANCELLED_BY_STUDENT" | "CANCELLED_BY_TEACHER" | "COMPLETED" | "NO_SHOW";
  message?: string;
}


export interface AdminDashboardSummary {
  totalStudents: number;
  facultyMembers: number;
  activeCourses: number;
  attendanceAlerts: number;
  departments: number;
  studentGrowthPercent: number;
  facultyGrowthPercent: number;
}

export interface TeacherDashboardSummary {
  assignedSubjects: number;
  studentsAcrossClasses: number;
  marksToFinalize: number;
  lowAttendanceFlags: number;
}

export interface SubjectProgress {
  name: string;
  code: string;
  score: number;
  max: number;
  attendance: number;
}

export interface StudentAssessmentResult {
  id: string;
  subject: string;
  code: string;
  assessment: string;
  obtained: number | null;
  max: number;
  status: "Published" | "Awaiting publication";
}

export interface StudentDashboardSummary {
  currentAttendance: number;
  averageScore: number;
  activeSubjects: number;
  subjects: SubjectProgress[];
  recentResults: StudentAssessmentResult[];
}

export interface TeacherClassAssignment {
  id: string;
  classId: string;
  subjectId: string;
  classSubjectId: string;
  className: string;
  subject: string;
  semester: string;
  academicYear: string;
}
