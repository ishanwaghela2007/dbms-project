import test from 'node:test';
import assert from 'node:assert/strict';
import { findMarksForIdentifier } from '../src/services/marks/mark-matcher.js';

test('extracts a score after an enrollment identifier', () => {
  const result = findMarksForIdentifier('CSE2401  Ishan Waghela 78/100', 'CSE2401', 100);
  assert.equal(result.marks, 78);
  assert.equal(result.ambiguous, false);
  assert.match(result.evidence, /CSE2401/);
});

test('keeps page number from OCR page markers', () => {
  const result = findMarksForIdentifier('[PAGE page-3.png]\nCSE2402 Diya Patel 65 / 100', 'CSE2402', 100);
  assert.equal(result.marks, 65);
  assert.equal(result.pageNumber, 3);
});

test('flags conflicting repeated values as ambiguous', () => {
  const result = findMarksForIdentifier('CSE2403 Rohan 55\nCSE2403 Rohan 58', 'CSE2403', 100);
  assert.equal(result.marks, null);
  assert.equal(result.ambiguous, true);
});

test('returns a reviewable missing result when no score follows identifier', () => {
  const result = findMarksForIdentifier('CSE2404 Ananya ABSENT', 'CSE2404', 100);
  assert.equal(result.marks, null);
  assert.equal(result.ambiguous, false);
});

test('escapes punctuation in an identifier instead of treating it as regex syntax', () => {
  const result = findMarksForIdentifier('CSE.24.05 Kabir 91', 'CSE.24.05', 100);
  assert.equal(result.marks, 91);
});
