import { createJsonClient, erpProto } from '../shared/grpc.js';

const config = {
  auth: process.env.AUTH_GRPC_ADDR || '127.0.0.1:50051',
  profile: process.env.PROFILE_GRPC_ADDR || '127.0.0.1:50052',
  academic: process.env.ACADEMIC_GRPC_ADDR || '127.0.0.1:50053',
  marks: process.env.MARKS_GRPC_ADDR || '127.0.0.1:50054',
  attendance: process.env.ATTENDANCE_GRPC_ADDR || '127.0.0.1:50055',
  paper: process.env.PAPER_GRPC_ADDR || '127.0.0.1:50056',
  notification: process.env.NOTIFICATION_GRPC_ADDR || '127.0.0.1:50057',
};
export const clients = {
  auth: createJsonClient(erpProto.AuthService, config.auth),
  profile: createJsonClient(erpProto.ProfileService, config.profile),
  academic: createJsonClient(erpProto.AcademicService, config.academic),
  marks: createJsonClient(erpProto.MarksService, config.marks),
  attendance: createJsonClient(erpProto.AttendanceService, config.attendance),
  paper: createJsonClient(erpProto.PaperService, config.paper),
  notification: createJsonClient(erpProto.NotificationService, config.notification),
};
