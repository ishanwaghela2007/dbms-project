import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { logger } from './logger.js';
import { config } from '../config/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const protoPath = path.resolve(here, '../../protos/erp.proto');
const definition = protoLoader.loadSync(protoPath, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true, bytes: Buffer });
export const erpProto = grpc.loadPackageDefinition(definition).collegeerp.v1;
const maxBytes = Number(process.env.GRPC_MAX_MESSAGE_BYTES || 16 * 1024 * 1024);

function loadTlsCredentials() {
  return {
    ca: readFileSync(config.grpcTlsCaPath),
    cert: readFileSync(config.grpcTlsCertPath),
    key: readFileSync(config.grpcTlsKeyPath),
  };
}

function clientCredentials() {
  if (config.grpcSecurityMode === 'insecure') return grpc.credentials.createInsecure();
  const tls = loadTlsCredentials();
  return grpc.credentials.createSsl(tls.ca, tls.key, tls.cert);
}

function serverCredentials() {
  if (config.grpcSecurityMode === 'insecure') return grpc.ServerCredentials.createInsecure();
  const tls = loadTlsCredentials();
  return grpc.ServerCredentials.createSsl(tls.ca, [{ private_key: tls.key, cert_chain: tls.cert }], true);
}

export function createServiceMetadata(targetService) {
  const metadata = new grpc.Metadata();
  const token = jwt.sign(
    { sub: config.serviceName, jti: randomUUID() },
    config.serviceAuthSecret,
    { issuer: 'college-erp-internal', audience: targetService, expiresIn: config.serviceAuthTtl },
  );
  metadata.set('x-service-authorization', `Bearer ${token}`);
  return metadata;
}

export function verifyServiceMetadata(metadata, targetService) {
  const raw = metadata.get('x-service-authorization')[0];
  const token = typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : null;
  if (!token) return null;
  try {
    const claims = jwt.verify(token, config.serviceAuthSecret, { issuer: 'college-erp-internal', audience: targetService });
    return typeof claims === 'object' && typeof claims.sub === 'string' ? claims : null;
  } catch {
    return null;
  }
}

export function createJsonClient(Service, address, targetService) {
  if (!targetService) throw new Error('A target service identity is required for every gRPC client');
  const client = new Service(address, clientCredentials(), {
    'grpc.max_receive_message_length': maxBytes,
    'grpc.max_send_message_length': maxBytes,
  });
  client.__targetService = targetService;
  return client;
}

export function rpc(client, method, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!client || typeof client[method] !== 'function') return reject(new Error(`gRPC method unavailable: ${method}`));
    const metadata = createServiceMetadata(client.__targetService);
    client[method]({ payloadJson: JSON.stringify(payload) }, metadata, (error, response) => {
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

export function jsonHandler(handler, serviceName) {
  return async (call, callback) => {
    try {
      const caller = verifyServiceMetadata(call.metadata, serviceName);
      if (!caller) {
        return callback({ code: grpc.status.UNAUTHENTICATED, message: 'Verified service identity is required' });
      }
      const input = JSON.parse(call.request?.payloadJson || '{}');
      const result = await handler(input, call, caller);
      callback(null, { payloadJson: JSON.stringify(result ?? {}) });
    } catch (error) { sendError(callback, error); }
  };
}

export function startGrpcService({ name, serviceName, address, Service, handlers }) {
  const server = new grpc.Server({
    'grpc.max_receive_message_length': maxBytes,
    'grpc.max_send_message_length': maxBytes,
  });
  const identity = serviceName || name;
  if (config.serviceName !== identity) {
    throw new Error(`SERVICE_NAME=${config.serviceName} does not match ${name}'s required identity (${identity})`);
  }
  const implementation = Object.fromEntries(Object.entries(handlers).map(([method, fn]) => [method, jsonHandler(fn, identity)]));
  server.addService(Service.service, implementation);
  const bindAddress = address || '127.0.0.1:0';
  server.bindAsync(bindAddress, serverCredentials(), (err, port) => {
    if (err) { logger.fatal({ err: err.message, name }, 'Could not bind gRPC service'); process.exit(1); }
    server.start();
    logger.info({ name, bindAddress, port }, 'gRPC service started');
  });

  // M-3 fix: hard-kill after 10 s so a hung handler never blocks pod/systemd shutdown.
  // L-6 fix: register signal handlers exactly once, not once per startGrpcService() call.
  const shutdown = () => {
    const hard = setTimeout(() => {
      logger.warn({ name }, 'gRPC graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, 10_000);
    hard.unref(); // don't let this timer keep the event loop alive normally
    server.tryShutdown(() => {
      clearTimeout(hard);
      process.exit(0);
    });
  };
  // Remove any previously registered listeners before adding new ones (L-6).
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}
