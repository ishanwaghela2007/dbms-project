import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const targetService = (process.env.SERVICE_NAME || 'all').toLowerCase();

const serviceMap = {
  gateway: 'src/gateway/server.js',
  auth: 'src/services/auth/index.js',
  profile: 'src/services/profile/index.js',
  academic: 'src/services/academic/index.js',
  marks: 'src/services/marks/index.js',
  attendance: 'src/services/attendance/index.js',
  paper: 'src/services/paper/index.js',
  notification: 'src/services/notification/index.js',
};

// If a specific single microservice is requested (e.g. on Render Private Service or Railway worker)
if (targetService !== 'all' && targetService !== 'gateway-all' && serviceMap[targetService]) {
  console.log(`[runner] Launching single service: ${targetService}`);
  await import(path.join(rootDir, serviceMap[targetService]));
} else {
  // Otherwise, run all microservices + API gateway in this container (All-in-One deployment)
  console.log('[runner] Launching all-in-one College ERP stack...');

  const children = [];

  function startChild(name, relPath) {
    const fullPath = path.join(rootDir, relPath);
    const child = fork(fullPath, [], {
      env: {
        ...process.env,
        SERVICE_NAME: name,
      },
      stdio: 'inherit',
    });

    child.on('exit', (code, signal) => {
      console.warn(`[runner] Service ${name} exited with code ${code} / signal ${signal}`);
      if (name === 'gateway' && code !== 0) {
        // If the main public gateway exits, shut down the container
        process.exit(code || 1);
      }
    });

    children.push(child);
  }

  // 1. Start all 7 gRPC microservices first
  const microservices = [
    ['auth', serviceMap.auth],
    ['profile', serviceMap.profile],
    ['academic', serviceMap.academic],
    ['marks', serviceMap.marks],
    ['attendance', serviceMap.attendance],
    ['paper', serviceMap.paper],
    ['notification', serviceMap.notification],
  ];

  for (const [name, filePath] of microservices) {
    startChild(name, filePath);
  }

  // 2. Start Gateway slightly after to allow gRPC sockets to bind
  setTimeout(() => {
    startChild('gateway', serviceMap.gateway);
  }, 1000);

  function shutdown(signal) {
    console.log(`[runner] Received ${signal}, shutting down all services...`);
    for (const child of children) {
      try {
        child.kill(signal);
      } catch {
        // ignore
      }
    }
    setTimeout(() => process.exit(0), 3000);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
