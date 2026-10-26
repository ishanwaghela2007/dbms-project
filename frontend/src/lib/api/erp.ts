import { apiRequest } from "@/lib/api/client";
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
  getAdminDashboard: () => apiRequest<AdminDashboardSummary>("/admin/dashboard"),
  getTeacherDashboard: () => apiRequest<TeacherDashboardSummary>("/teacher/dashboard"),
  getStudentDashboard: () => apiRequest<StudentDashboardSummary>("/student/dashboard"),
  listStudentResults: () => apiRequest<StudentAssessmentResult[]>("/student/results"),
  listStudents: () => apiRequest<Student[]>("/admin/students"),
  listTeachers: () => apiRequest<Teacher[]>("/admin/teachers"),
  listTeacherClassAssignments: () => apiRequest<TeacherClassAssignment[]>("/teacher/classes"),
  listTeacherClassRoster: (classId: string, subjectId: string) =>
    apiRequest<Student[]>(`/teacher/classes/${encodeURIComponent(classId)}/subjects/${encodeURIComponent(subjectId)}/students`),
  listFollowups: () => apiRequest<Followup[]>("/teacher/attendance/low"),
  listMarkRows: () => apiRequest<MarkRow[]>("/teacher/marks/current"),
  listPapers: () => apiRequest<Paper[]>("/papers"),
  listStudentNotifications: () => apiRequest<StudentNotification[]>("/student/notifications"),
  listStudentMeetings: () => apiRequest<Meeting[]>("/student/meetings"),
  listTeacherMeetings: () => apiRequest<Meeting[]>("/teacher/meetings"),
  createStudent: (payload: Partial<Student>) =>
    apiRequest<Student>("/admin/students", { method: "POST", body: JSON.stringify(payload) }),
  createTeacher: (payload: Partial<Teacher>) =>
    apiRequest<Teacher>("/admin/teachers", { method: "POST", body: JSON.stringify(payload) }),
  saveAttendance: (payload: unknown) =>
    apiRequest<{ ok: boolean; message: string }>("/teacher/attendance/sessions", { method: "POST", body: JSON.stringify(payload) }),
  previewMarksPdf: (form: FormData) =>
    apiRequest<{ jobId: string; status: string; message?: string }>("/teacher/marks/pdf-validation/preview", { method: "POST", body: form }),
  getMarksValidation: (jobId: string) =>
    apiRequest<{ job: { status: string; error_message?: string }; rows: MarkRow[]; message?: string }>(`/teacher/marks/pdf-validation/${encodeURIComponent(jobId)}`),
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
    apiRequest<{ mediaAssetId: string; userId: string; avatarUrl: string; avatarPublicId: string }>("/profile/avatar", { method: "POST", body: form }),
  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    apiRequest<{ ok: boolean; message: string }>("/auth/change-password", { method: "PATCH", body: JSON.stringify(payload) }),
  forgotPassword: (email: string) =>
    apiRequest<{ ok: boolean; message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) =>
    apiRequest<{ ok: boolean; message: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  register: (payload: { fullName: string; email: string; password: string; accountType?: string; departmentId?: string; programId?: string; enrollmentNo?: string; employeeId?: string; autoActivate?: boolean; currentYear?: number; currentSemester?: string | number; division?: string; designation?: string }) =>
    apiRequest<{ success: boolean; message: string; email: string; isActive?: boolean }>("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  verifyEmail: (token: string) =>
    apiRequest<{ success: boolean; message: string; email?: string; fullName?: string }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: (email: string) =>
    apiRequest<{ success: boolean; message: string; alreadyActive?: boolean }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) }),
  acceptInvitation: (payload: { token: string; password: string }) =>
    apiRequest<{ success: boolean; message: string; email?: string }>("/auth/accept-invitation", { method: "POST", body: JSON.stringify(payload) }),
};

