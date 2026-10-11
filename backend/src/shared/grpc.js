import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { logger } from './logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const protoPath = path.resolve(here, '../../protos/erp.proto');
const definition = protoLoader.loadSync(protoPath, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true, bytes: Buffer });
export const erpProto = grpc.loadPackageDefinition(definition).collegeerp.v1;
const maxBytes = Number(process.env.GRPC_MAX_MESSAGE_BYTES || 16 * 1024 * 1024);

export function createJsonClient(Service, address) {
  return new Service(address, grpc.credentials.createInsecure(), {
    'grpc.max_receive_message_length': maxBytes,
    'grpc.max_send_message_length': maxBytes,
  });
}

export function rpc(client, method, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!client || typeof client[method] !== 'function') return reject(new Error(`gRPC method unavailable: ${method}`));
    client[method]({ payloadJson: JSON.stringify(payload) }, (error, response) => {
      if (error) return reject(error);
      try { resolve(JSON.parse(response?.payloadJson || '{}')); }
      catch (parseError) { reject(new Error(`Invalid JSON from gRPC ${method}: ${parseError.message}`)); }
    });
  });
}

export function sendError(callback, error) {
  const code = error.grpcCode ?? (error.code === 'ER_DUP_ENTRY' ? grpc.status.ALREADY_EXISTS : error.code === 'ER_NO_REFERENCED_ROW_2' ? grpc.status.FAILED_PRECONDITION : grpc.status.INTERNAL);
  const message = error.publicMessage || (code === grpc.status.INTERNAL ? 'Internal service error' : error.message);
  if (code === grpc.status.INTERNAL) logger.error({ err: error.message, stack: error.stack }, 'gRPC handler failed');
  callback({ code, message, details: message });
}

export function jsonHandler(handler) {
  return async (call, callback) => {
    try {
      const input = JSON.parse(call.request?.payloadJson || '{}');
      const result = await handler(input, call);
      callback(null, { payloadJson: JSON.stringify(result ?? {}) });
    } catch (error) { sendError(callback, error); }
  };
}

export function startGrpcService({ name, address, Service, handlers }) {
  const server = new grpc.Server({
    'grpc.max_receive_message_length': maxBytes,
    'grpc.max_send_message_length': maxBytes,
  });
  const implementation = Object.fromEntries(Object.entries(handlers).map(([method, fn]) => [method, jsonHandler(fn)]));
  server.addService(Service.service, implementation);
  const bindAddress = address || '127.0.0.1:0';
  server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) { logger.fatal({ err: err.message, name }, 'Could not bind gRPC service'); process.exit(1); }
    server.start();
    logger.info({ name, bindAddress, port }, 'gRPC service started');
  });
  const shutdown = () => server.tryShutdown(() => process.exit(0));
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  return server;
}
