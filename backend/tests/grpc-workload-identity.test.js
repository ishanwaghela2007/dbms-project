import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceMetadata, verifyServiceMetadata } from '../src/shared/grpc.js';

test('accepts a workload token only for its intended service audience', () => {
  const metadata = createServiceMetadata('attendance');
  const claims = verifyServiceMetadata(metadata, 'attendance');

  assert.equal(claims?.sub, 'gateway');
  assert.equal(verifyServiceMetadata(metadata, 'marks'), null);
});

test('rejects a missing workload token', () => {
  const metadata = { get: () => [] };
  assert.equal(verifyServiceMetadata(metadata, 'auth'), null);
});
