import { apiRequest } from "@/lib/api/client";
import {
  adminDashboardSummary,
  followups,
  initialMarkRows,
  papers,
  studentDashboardSummary,
  studentMeetings,
  studentNotifications,
  students,
  teachers,
  teacherDashboardSummary,
  demoStudentResults,
  teacherClassAssignments,
} from "@/lib/data/demo";
import type {
  AdminDashboardSummary,
  Followup,
  MarkRow,
  Meeting,
  Paper,
  Student,
  StudentAssessmentResult,
  StudentDashboardSummary,
  StudentNotification,
  Teacher,
  TeacherClassAssignment,
  TeacherDashboardSummary,
} from "@/types/erp";

export const erpApi = {
  getAdminDashboard: () => apiRequest<AdminDashboardSummary>("/admin/dashboard").catch(() => adminDashboardSummary),
  getTeacherDashboard: () => apiRequest<TeacherDashboardSummary>("/teacher/dashboard").catch(() => teacherDashboardSummary),
  getStudentDashboard: () => apiRequest<StudentDashboardSummary>("/student/dashboard").catch(() => studentDashboardSummary),
  listStudentResults: () => apiRequest<StudentAssessmentResult[]>("/student/results").catch(() => demoStudentResults),
  listStudents: () => apiRequest<Student[]>("/admin/students").catch(() => students),
  listTeachers: () => apiRequest<Teacher[]>("/admin/teachers").catch(() => teachers),
  listTeacherClassAssignments: () => apiRequest<TeacherClassAssignment[]>("/teacher/classes").catch(() => teacherClassAssignments),
  listTeacherClassRoster: (classId: string, subjectId: string) =>
    apiRequest<Student[]>(`/teacher/classes/${encodeURIComponent(classId)}/subjects/${encodeURIComponent(subjectId)}/students`).catch(() => students),
  listFollowups: () => apiRequest<Followup[]>("/teacher/attendance/low").catch(() => followups),
  listMarkRows: () => apiRequest<MarkRow[]>("/teacher/marks/current").catch(() => initialMarkRows),
  listPapers: () => apiRequest<Paper[]>("/papers").catch(() => papers),
  listStudentNotifications: () => apiRequest<StudentNotification[]>("/student/notifications").catch(() => studentNotifications),
  listStudentMeetings: () => apiRequest<Meeting[]>("/student/meetings").catch(() => studentMeetings),
  listTeacherMeetings: () => apiRequest<Meeting[]>("/teacher/meetings").catch(() => studentMeetings),
  createStudent: (payload: Partial<Student>) =>
    apiRequest<Student>("/admin/students", { method: "POST", body: JSON.stringify(payload) }),
  createTeacher: (payload: Partial<Teacher>) =>
    apiRequest<Teacher>("/admin/teachers", { method: "POST", body: JSON.stringify(payload) }),
  saveAttendance: (payload: unknown) =>
    apiRequest<{ ok: boolean; message: string }>("/teacher/attendance/sessions", { method: "POST", body: JSON.stringify(payload) }),
  previewMarksPdf: (form: FormData) =>
    apiRequest<{ rows: MarkRow[]; message?: string }>("/teacher/marks/pdf-validation/preview", { method: "POST", body: form }),
  confirmMarks: (payload: unknown) =>
    apiRequest<{ ok: boolean; message: string }>("/teacher/marks/pdf-validation/confirm", { method: "POST", body: JSON.stringify(payload) }),
  createFollowup: (payload: { studentId: string; [key: string]: unknown }) =>
    apiRequest<{ ok: boolean; message: string }>(`/teacher/students/${encodeURIComponent(payload.studentId)}/attendance-followups`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadPaper: (form: FormData) =>
    apiRequest<{ ok: boolean; message: string; paper?: Paper }>("/papers", { method: "POST", body: form }),
  requestMeeting: (followupId: string, payload: unknown) =>
    apiRequest<{ ok: boolean; message: string; meeting?: Meeting }>(
      `/student/attendance-followups/${encodeURIComponent(followupId)}/meeting-requests`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  respondToMeeting: (meetingId: string, payload: unknown) =>
    apiRequest<{ ok: boolean; message: string }>(`/teacher/meetings/${encodeURIComponent(meetingId)}/respond`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  cancelMeeting: (meetingId: string, reason = "Cancelled by student") =>
    apiRequest<{ ok: boolean; message: string }>(`/student/meetings/${encodeURIComponent(meetingId)}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    }),
  markNotificationRead: (notificationId: string) =>
    apiRequest<{ ok: boolean }>(`/student/notifications/${encodeURIComponent(notificationId)}/read`, { method: "PATCH" }),
  getMyProfile: () => apiRequest<Record<string, unknown>>("/profile/me"),
  updateMyProfile: (payload: { fullName?: string; phone?: string; address?: string; officeLocation?: string; specialization?: string }) =>
    apiRequest<Record<string, unknown>>("/profile/me", { method: "PATCH", body: JSON.stringify(payload) }),
  uploadAvatar: (form: FormData) =>
    apiRequest<{ mediaAssetId: string; userId: string }>("/profile/avatar", { method: "POST", body: form }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiRequest<{ ok: boolean; message: string }>("/auth/change-password", { method: "PATCH", body: JSON.stringify(payload) }),
  forgotPassword: (email: string) =>
    apiRequest<{ ok: boolean; message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    apiRequest<{ ok: boolean; message: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
};

