import type { AdminDashboardSummary, Followup, MarkRow, Meeting, Paper, Student, StudentAssessmentResult, StudentDashboardSummary, StudentNotification, SubjectProgress, Teacher, TeacherClassAssignment, TeacherDashboardSummary } from "@/types/erp";

export const students: Student[] = [
  { id: "stu-001", rollNo: "CSE2401", name: "Aarav Shah", email: "aarav.shah@college.edu", department: "Computer Science and Engineering", program: "B.Tech Computer Science and Engineering", semester: "Semester 3", division: "A", attendance: 68, status: "Active" },
  { id: "stu-002", rollNo: "CSE2402", name: "Diya Patel", email: "diya.patel@college.edu", department: "Computer Science and Engineering", program: "B.Tech Computer Science and Engineering", semester: "Semester 3", division: "A", attendance: 92, status: "Active" },
  { id: "stu-003", rollNo: "CSE2403", name: "Rohan Mehta", email: "rohan.mehta@college.edu", department: "Computer Science and Engineering", program: "B.Tech Computer Science and Engineering", semester: "Semester 3", division: "A", attendance: 61, status: "Active" },
  { id: "stu-004", rollNo: "CSE2404", name: "Ananya Desai", email: "ananya.desai@college.edu", department: "Computer Science and Engineering", program: "B.Tech Computer Science and Engineering", semester: "Semester 3", division: "A", attendance: 73, status: "Active" },
  { id: "stu-005", rollNo: "CSE2405", name: "Kabir Joshi", email: "kabir.joshi@college.edu", department: "Computer Science and Engineering", program: "B.Tech Computer Science and Engineering", semester: "Semester 3", division: "A", attendance: 85, status: "Active" },
  { id: "stu-006", rollNo: "CE2401", name: "Mira Shah", email: "mira.shah@college.edu", department: "Computer Engineering", program: "B.Tech Computer Engineering", semester: "Semester 3", division: "B", attendance: 71, status: "Active" },
  { id: "stu-007", rollNo: "CE2402", name: "Neel Desai", email: "neel.desai@college.edu", department: "Computer Engineering", program: "B.Tech Computer Engineering", semester: "Semester 3", division: "B", attendance: 89, status: "Active" },
  { id: "stu-008", rollNo: "EXTC2301", name: "Tara Kulkarni", email: "tara.kulkarni@college.edu", department: "EXTC", program: "B.Tech EXTC", semester: "Semester 5", division: "A", attendance: 96, status: "Active" },
];

export const teachers: Teacher[] = [
  { id: "fac-001", employeeId: "FAC-1024", name: "Prof. Neha Kulkarni", email: "neha.kulkarni@college.edu", department: "Computer Science and Engineering", designation: "Assistant Professor", subjects: ["Data Structures", "Design & Analysis of Algorithms"], status: "Active" },
  { id: "fac-002", employeeId: "FAC-1031", name: "Dr. Aditya Rao", email: "aditya.rao@college.edu", department: "Computer Science and Engineering", designation: "Associate Professor", subjects: ["Database Management Systems", "Operating Systems"], status: "Active" },
  { id: "fac-003", employeeId: "FAC-1048", name: "Prof. Simran Kapoor", email: "simran.kapoor@college.edu", department: "Mathematics", designation: "Assistant Professor", subjects: ["Engineering Mathematics III"], status: "Active" },
  { id: "fac-004", employeeId: "FAC-1088", name: "Prof. Vikram Iyer", email: "vikram.iyer@college.edu", department: "EXTC", designation: "Lecturer", subjects: ["Computer Networks", "Web Technology"], status: "Inactive" },
];

export const initialMarkRows: MarkRow[] = [
  { studentId: "stu-001", rollNo: "CSE2401", studentName: "Aarav Shah", enteredMarks: "78", pdfMarks: 78, maxMarks: 100, status: "match", evidence: "Page 1 · Row 4 · Confidence 98%" },
  { studentId: "stu-002", rollNo: "CSE2402", studentName: "Diya Patel", enteredMarks: "65", pdfMarks: 68, maxMarks: 100, status: "discrepancy", evidence: "Page 1 · Row 5 · Confidence 97%" },
  { studentId: "stu-003", rollNo: "CSE2403", studentName: "Rohan Mehta", enteredMarks: "105", pdfMarks: 100, maxMarks: 100, status: "invalid", evidence: "Page 1 · Row 6 · Maximum marks exceeded" },
  { studentId: "stu-004", rollNo: "CSE2404", studentName: "Ananya Desai", enteredMarks: "72", pdfMarks: null, maxMarks: 100, status: "not_found", evidence: "No confident student match found" },
  { studentId: "stu-005", rollNo: "CSE2405", studentName: "Kabir Joshi", enteredMarks: "67", pdfMarks: 67, maxMarks: 100, status: "match", evidence: "Page 2 · Row 1 · Confidence 96%" },
];

export const followups: Followup[] = [
  { id: "fu-001", studentId: "stu-001", studentName: "Aarav Shah", rollNo: "CSE2401", subject: "Data Structures", attendance: 68, teacherName: "Prof. Neha Kulkarni", status: "OPEN", contact: "Prof. Neha Kulkarni" },
  { id: "fu-002", studentId: "stu-003", studentName: "Rohan Mehta", rollNo: "CSE2403", subject: "Data Structures", attendance: 61, teacherName: "Prof. Neha Kulkarni", status: "MEETING_REQUESTED", contact: "Prof. Neha Kulkarni" },
  { id: "fu-003", studentId: "stu-004", studentName: "Ananya Desai", rollNo: "CSE2404", subject: "DBMS", attendance: 73, teacherName: "Dr. Aditya Rao", status: "ACKNOWLEDGED", contact: "Class Mentor" },
];

export const chartAttendance = [38, 52, 43, 68, 58, 74, 63, 83, 69, 86, 78, 92];


export const papers: Paper[] = [
  { id: "paper-001", title: "Data Structures · Mid-Semester Examination", subject: "Data Structures", semester: "Semester 3", academicYear: "2026–27", category: "Question paper", uploadedBy: "Prof. Neha Kulkarni", uploadedAt: "2026-10-02", fileName: "ds-mse-oct-2026.pdf", access: "Published" },
  { id: "paper-002", title: "DBMS · Unit Test 2 Answer Key", subject: "Database Management Systems", semester: "Semester 3", academicYear: "2026–27", category: "Answer key", uploadedBy: "Dr. Aditya Rao", uploadedAt: "2026-10-04", fileName: "dbms-ut2-key.pdf", access: "Restricted" },
  { id: "paper-003", title: "Algorithms · Practice Set 01", subject: "Design & Analysis of Algorithms", semester: "Semester 3", academicYear: "2026–27", category: "Study material", uploadedBy: "Prof. Neha Kulkarni", uploadedAt: "2026-09-24", fileName: "algorithms-practice.pdf", access: "Published" },
  { id: "paper-004", title: "Computer Networks · End-Semester 2025", subject: "Computer Networks", semester: "Semester 5", academicYear: "2025–26", category: "Question paper", uploadedBy: "Prof. Vikram Iyer", uploadedAt: "2026-09-17", fileName: "cn-eSE-2025.pdf", access: "Published" },
];

export const studentNotifications: StudentNotification[] = [
  { id: "ntf-001", title: "Low attendance warning", message: "Your attendance in Data Structures is below the college policy threshold. Please meet your assigned subject teacher to discuss a plan to improve it.", kind: "attendance", createdAt: "2026-10-09T09:30:00+05:30", isRead: false, attendance: 68, requiredAttendance: 75, subject: "Data Structures", contactName: "Prof. Neha Kulkarni", contactRole: "Subject teacher", contactLocation: "Faculty Room 204", followupId: "fu-001" },
  { id: "ntf-002", title: "Meeting request update", message: "Your meeting request is waiting for teacher approval.", kind: "meeting", createdAt: "2026-10-08T15:00:00+05:30", isRead: false, subject: "Data Structures", contactName: "Prof. Neha Kulkarni", followupId: "fu-003" },
  { id: "ntf-003", title: "MSE results published", message: "Results for Database Management Systems · Unit Test 2 are available.", kind: "result", createdAt: "2026-10-05T12:00:00+05:30", isRead: true, subject: "Database Management Systems" },
];

export const studentMeetings: Meeting[] = [
  { id: "mtg-001", studentId: "stu-001", studentName: "Aarav Shah", teacherName: "Prof. Neha Kulkarni", subject: "Data Structures", date: "2026-10-13", time: "11:30 AM – 11:45 AM", location: "Faculty Room 204", status: "REQUESTED", message: "I would like to discuss my attendance and how to improve it." },
];


export const adminDashboardSummary: AdminDashboardSummary = {
  totalStudents: 2486, facultyMembers: 142, activeCourses: 38, attendanceAlerts: 27,
  departments: 6, studentGrowthPercent: 8.2, facultyGrowthPercent: 3.4,
};

export const teacherDashboardSummary: TeacherDashboardSummary = {
  assignedSubjects: 4, studentsAcrossClasses: 126, marksToFinalize: 2, lowAttendanceFlags: followups.length,
};

export const demoSubjectProgress: SubjectProgress[] = [
  { name: "Data Structures", code: "CSE203", score: 78, max: 100, attendance: 68 },
  { name: "Database Management Systems", code: "CSE205", score: 84, max: 100, attendance: 92 },
  { name: "Design & Analysis of Algorithms", code: "CSE207", score: 71, max: 100, attendance: 85 },
  { name: "Engineering Mathematics III", code: "MAT203", score: 66, max: 100, attendance: 73 },
];

export const demoStudentResults: StudentAssessmentResult[] = [
  { id: "res-001", subject: "Database Management Systems", code: "CSE205", assessment: "Unit Test 2", obtained: 84, max: 100, status: "Published" },
  { id: "res-002", subject: "Data Structures", code: "CSE203", assessment: "Unit Test 1", obtained: 78, max: 100, status: "Published" },
  { id: "res-003", subject: "Design & Analysis of Algorithms", code: "CSE207", assessment: "Assignment 1", obtained: 71, max: 100, status: "Published" },
  { id: "res-004", subject: "Engineering Mathematics III", code: "MAT203", assessment: "Class Test 1", obtained: 66, max: 100, status: "Published" },
  { id: "res-005", subject: "Operating Systems", code: "CSE209", assessment: "Unit Test 1", obtained: null, max: 100, status: "Awaiting publication" },
];

export const studentDashboardSummary: StudentDashboardSummary = {
  currentAttendance: 79.5,
  averageScore: 74.8,
  activeSubjects: 6,
  subjects: demoSubjectProgress,
  recentResults: demoStudentResults,
};

export const teacherClassAssignments: TeacherClassAssignment[] = [
  { id: "ta-001", classId: "class-sy-cse-a", subjectId: "subject-ds", classSubjectId: "offering-ds-sy-cse-a", className: "SY B.Tech Computer Science and Engineering · A", subject: "Data Structures", semester: "Semester 3", academicYear: "2026–27" },
  { id: "ta-002", classId: "class-sy-cse-a", subjectId: "subject-dbms", classSubjectId: "offering-dbms-sy-cse-a", className: "SY B.Tech Computer Science and Engineering · A", subject: "Database Management Systems", semester: "Semester 3", academicYear: "2026–27" },
  { id: "ta-003", classId: "class-sy-ce-b", subjectId: "subject-cn", classSubjectId: "offering-cn-sy-ce-b", className: "SY B.Tech Computer Engineering · B", subject: "Computer Networks", semester: "Semester 3", academicYear: "2026–27" },
  { id: "ta-004", classId: "class-ty-extc-a", subjectId: "subject-daa", classSubjectId: "offering-daa-ty-extc-a", className: "TY B.Tech EXTC · A", subject: "Design & Analysis of Algorithms", semester: "Semester 5", academicYear: "2026–27" },
];
