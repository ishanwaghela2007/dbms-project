function escaped(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Match a student identifier to a numeric value on the same extracted PDF line.
 * Ambiguous conflicting values are deliberately returned for manual review.
 */
export function findMarksForIdentifier(text, identifier, maxMarks) {
  if (!identifier) return { marks: null, pageNumber: null, confidence: 0, ambiguous: false, evidence: null };
  const idRegex = new RegExp(escaped(String(identifier).trim()), 'i');
  const lines = String(text).split(/\r?\n/);
  const found = [];
  let currentPage = null;
  lines.forEach((line) => {
    const pageMarker = String(line).match(/\[PAGE\s+page-(\d+)\.png\]/i);
    if (pageMarker) { currentPage = Number(pageMarker[1]); return; }
    const match = idRegex.exec(line);
    if (!match) return;
    const after = line.slice(match.index + match[0].length).trim();
    const numericMatches = [...after.matchAll(/(?:^|[^\w.])(-?\d{1,3}(?:\.\d{1,2})?)(?=$|[^\w.])/g)]
      .map(m => Number(m[1])).filter(n => Number.isFinite(n) && n >= 0);
    if (numericMatches.length) found.push({ marks: numericMatches[0], line: line.trim(), pageNumber: currentPage, confidence: after.length < 36 ? 0.88 : 0.68 });
  });
  if (found.length === 0) return { marks: null, pageNumber: null, confidence: 0, ambiguous: false, evidence: null };
  const distinct = [...new Set(found.map(x => x.marks))];
  if (found.length > 1 && distinct.length > 1) return { marks: null, pageNumber: found[0].pageNumber, confidence: 0.2, ambiguous: true, evidence: found.map(x=>x.line).join(' | ').slice(0,500) };
  const candidate = found[0];
  // Range validation is performed by the Marks Service against the assessment.
  return { marks: candidate.marks, pageNumber: candidate.pageNumber, confidence: candidate.confidence, ambiguous: found.length > 1, evidence: candidate.line.slice(0,500) };
}
