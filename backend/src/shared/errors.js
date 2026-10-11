import grpc from '@grpc/grpc-js';
export class AppError extends Error {
  constructor(message, status = 400, grpcCode = grpc.status.INVALID_ARGUMENT) { super(message); this.name = 'AppError'; this.status = status; this.grpcCode = grpcCode; this.publicMessage = message; }
}
export const badRequest = message => new AppError(message, 400, grpc.status.INVALID_ARGUMENT);
export const unauthenticated = message => new AppError(message || 'Authentication required', 401, grpc.status.UNAUTHENTICATED);
export const forbidden = message => new AppError(message || 'Forbidden', 403, grpc.status.PERMISSION_DENIED);
export const notFound = message => new AppError(message || 'Not found', 404, grpc.status.NOT_FOUND);
export const conflict = message => new AppError(message || 'Conflict', 409, grpc.status.ALREADY_EXISTS);
export const unavailable = message => new AppError(message || 'Service unavailable', 503, grpc.status.UNAVAILABLE);
export function assert(condition, message, factory = badRequest) { if (!condition) throw factory(message); }
