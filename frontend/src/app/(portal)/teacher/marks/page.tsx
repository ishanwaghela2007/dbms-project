"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { AlertTriangle, Check, CheckCircle2, FileCheck2, LoaderCircle, ShieldCheck, Upload, XCircle } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import type { MarkRow, ValidationStatus } from "@/types/erp";

const assessments = [
  { id: "mse-ds-2026", label: "Data Structures · Mid-Semester Examination", max: 100 },
  { id: "unit-dbms-2026", label: "DBMS · Unit Test 2", max: 30 },
  { id: "practical-ds-2026", label: "Data Structures · Practical Examination", max: 50 },
];

function statusFor(row: MarkRow): ValidationStatus {
  const entered = Number(row.enteredMarks);
  if (row.enteredMarks.trim() === "" || !Number.isFinite(entered) || entered < 0 || entered > row.maxMarks) return "invalid";
  if (row.pdfMarks === null) return "not_found";
  return entered === row.pdfMarks ? "match" : "discrepancy";
}

function statusTone(status: ValidationStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "match") return "success";
  if (status === "not_found" || status === "ambiguous") return "neutral";
  if (status === "invalid") return "danger";
  return "warning";
}

function statusLabel(status: ValidationStatus) {
  return ({ match: "Match", discrepancy: "Discrepancy", not_found: "Not found in PDF", ambiguous: "Ambiguous match", invalid: "Invalid marks" })[status];
}

export default function TeacherMarksPage() {
  const [assessmentId, setAssessmentId] = useState(assessments[0].id);
  const [rows, setRows] = useState<MarkRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [extractionMessage, setExtractionMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const selectedAssessment = assessments.find(a => a.id === assessmentId) ?? assessments[0];
  const computedRows = useMemo(() => rows.map(row => ({ ...row, status: statusFor(row) })), [rows]);
  const counts = useMemo(() => ({
    match: computedRows.filter(r => r.status === "match").length,
    review: computedRows.filter(r => ["discrepancy", "not_found", "ambiguous"].includes(r.status)).length,
    invalid: computedRows.filter(r => r.status === "invalid").length,
    confirmed: computedRows.filter(r => r.confirmed).length,
  }), [computedRows]);
  const readyToSave = computedRows.length > 0 && computedRows.every(row => {
    const valid = row.status !== "invalid";
    const exceptionHasReason = row.status === "match" || Boolean(row.overrideReason?.trim());
    return valid && exceptionHasReason && row.confirmed === true;
  });

  async function handlePdf(file?: File) {
    setError(""); setSaveMessage(""); setExtractionMessage("");
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF marksheet or evaluated answer-sheet file."); return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("The PDF must be 15 MB or smaller."); return;
    }
    setLoading(true); setFileName(file.name);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("assessmentId", assessmentId);
      body.append("maxMarks", String(selectedAssessment.max));
      const result = await erpApi.previewMarksPdf(body);
      const normalized = result.rows.map(row => ({ ...row, confirmed: false, overrideReason: "" }));
      setRows(normalized);
      setExtractionMessage(result.message ?? "PDF extraction finished. Review every row before saving.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF validation failed. Please try again.");
    } finally { setLoading(false); }
  }

  function updateRow(studentId: string, patch: Partial<MarkRow>) {
    setRows(current => current.map(row => row.studentId === studentId ? { ...row, ...patch, confirmed: patch.confirmed ?? false } : row));
    setSaveMessage("");
  }

  function confirmRow(row: MarkRow) {
    const status = statusFor(row);
    if (status === "invalid") {
      setError(`${row.studentName}: enter a valid score between 0 and ${row.maxMarks}.`); return;
    }
    if (status !== "match" && !row.overrideReason?.trim()) {
      setError(`${row.studentName}: add a review/override reason before confirming this row.`); return;
    }
    setError("");
    setRows(current => current.map(item => item.studentId === row.studentId ? { ...item, confirmed: !item.confirmed } : item));
  }

  async function saveMarks() {
    setError(""); setSaveMessage("");
    if (!readyToSave) { setError("Resolve invalid marks, add reasons for exceptions and confirm every row before saving."); return; }
    setSaving(true);
    try {
      const result = await erpApi.confirmMarks({
        assessmentId,
        sourcePdfName: fileName,
        teacherConfirmed: true,
        rows: computedRows.map(row => ({ studentId: row.studentId, rollNo: row.rollNo, marksObtained: Number(row.enteredMarks), pdfMarks: row.pdfMarks, maxMarks: row.maxMarks, validationStatus: row.status, evidence: row.evidence, overrideReason: row.overrideReason, confirmed: row.confirmed })),
      });
      setSaveMessage(result.message || "Confirmed marks submitted for saving.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save marks."); }
    finally { setSaving(false); }
  }

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => { void handlePdf(event.target.files?.[0]); event.target.value = ""; };

  return <>
    <PageHeading eyebrow="ASSESSMENT WORKSPACE" title="Marks & results" description="Extract awarded marks from a PDF, compare the scores you entered, and confirm every record before it is saved." actions={<Button variant="secondary" onClick={() => { setRows([]); setFileName(""); setExtractionMessage(""); setError(""); setSaveMessage(""); }}><XCircle size={15}/> Reset review</Button>} />

    <div className="page-two-col">
      <Card title="1. Choose assessment" subtitle="Marks are compared against the matching assessment and its maximum score.">
        <div className="stack" style={{ gap: 15 }}>
          <div className="field"><label>Assessment *</label><select value={assessmentId} onChange={event => { setAssessmentId(event.target.value); setRows([]); setFileName(""); setExtractionMessage(""); setSaveMessage(""); }}><option value={assessments[0].id}>{assessments[0].label}</option><option value={assessments[1].id}>{assessments[1].label}</option><option value={assessments[2].id}>{assessments[2].label}</option></select></div>
          <div className="field-grid"><div className="field"><label>Class / section</label><input readOnly value="SY B.Tech CSE · Division A" /></div><div className="field"><label>Maximum marks</label><input readOnly value={String(selectedAssessment.max)} /></div></div>
          <div className="notice notice-info"><ShieldCheck size={16}/><div><strong>Authorized assessment</strong>Only assigned teachers can validate and submit marks for their subject offering. The backend must verify this even if the UI shows the assignment.</div></div>
        </div>
      </Card>
      <Card title="2. Upload official PDF" subtitle="Use an official marksheet or evaluated answer-sheet PDF containing student identifiers and awarded marks.">
        <label className="file-dropzone" htmlFor="marks-pdf-upload" style={{ cursor: loading ? "wait" : "pointer", opacity: loading ? .7 : 1 }}>
          <span className="file-icon">{loading ? <LoaderCircle size={22} className="spin"/> : <Upload size={22}/>}</span>
          <h3>{loading ? "Extracting and matching marks…" : fileName || "Choose a PDF to validate"}</h3>
          <p>PDF only · Up to 15 MB · Text extraction with OCR fallback</p>
          <input id="marks-pdf-upload" type="file" accept="application/pdf,.pdf" onChange={onFileInput} disabled={loading} />
        </label>
        {extractionMessage && <div className="notice notice-success" style={{ marginTop: 12 }}><CheckCircle2 size={16}/><div><strong>Extraction preview ready</strong>{extractionMessage}</div></div>}
      </Card>
    </div>

    {error && <div className="notice notice-danger" style={{ marginTop: 16 }}><AlertTriangle size={16}/><div><strong>Action required</strong>{error}</div></div>}
    {rows.length > 0 ? <>
      <div className="validation-summary">
        <div className="validation-stat"><strong>{computedRows.length}</strong><span>Student rows detected</span></div>
        <div className="validation-stat"><strong style={{ color: "#16856b" }}>{counts.match}</strong><span>Matching scores</span></div>
        <div className="validation-stat"><strong style={{ color: "#b87916" }}>{counts.review}</strong><span>Need teacher review</span></div>
        <div className="validation-stat"><strong style={{ color: "#bf4343" }}>{counts.invalid}</strong><span>Invalid score entries</span></div>
      </div>
      <Card title="3. Compare and confirm marks" subtitle="Evidence comes from the uploaded document. No score is saved until you confirm all rows." action={<StatusPill tone={readyToSave ? "success" : "warning"}>{counts.confirmed}/{computedRows.length} confirmed</StatusPill>}>
        <div className="notice notice-warning" style={{ marginBottom: 14 }}><AlertTriangle size={16}/><div><strong>Human review is required</strong>PDF extraction can misread digits or match the wrong student. Verify the student ID and source evidence before confirming a score.</div></div>
        <div className="validation-table-head"><span>Student</span><span>Entered marks</span><span>PDF marks</span><span>Validation</span></div>
        {computedRows.map(row => {
          const status = statusFor(row);
          const requiresReason = status !== "match";
          return <div className="validation-row" key={row.studentId} style={{ alignItems: "start" }}>
            <div><strong>{row.studentName}</strong><small>{row.rollNo} · {row.evidence ?? "No source location provided"}</small></div>
            <div className="field"><input aria-label={`Entered marks for ${row.studentName}`} type="number" min={0} max={row.maxMarks} step="0.5" value={row.enteredMarks} onChange={event => updateRow(row.studentId, { enteredMarks: event.target.value, confirmed: false })} /><small>Max {row.maxMarks}</small></div>
            <div><strong>{row.pdfMarks === null ? "—" : `${row.pdfMarks} / ${row.maxMarks}`}</strong><small>Extracted value</small></div>
            <div className="stack" style={{ gap: 8 }}><StatusPill tone={statusTone(status)}>{statusLabel(status)}</StatusPill>{requiresReason && <textarea aria-label={`Review reason for ${row.studentName}`} placeholder="Reason for mismatch / manual verification…" value={row.overrideReason ?? ""} onChange={event => updateRow(row.studentId, { overrideReason: event.target.value, confirmed: false })} rows={2} />}{row.evidence?.toLowerCase().includes("confidence") && <small>{row.evidence}</small>}<Button size="sm" variant={row.confirmed ? "secondary" : "primary"} disabled={status === "invalid" || (requiresReason && !row.overrideReason?.trim())} onClick={() => confirmRow(row)}>{row.confirmed ? <><Check size={14}/> Confirmed</> : <><ShieldCheck size={14}/> Confirm row</>}</Button></div>
          </div>;
        })}
        <div className="button-row" style={{ justifyContent: "space-between", marginTop: 18 }}><span className="helper-text">Every row must be reviewed. Exceptions require a reason.</span><Button disabled={!readyToSave || saving} onClick={() => void saveMarks()}>{saving ? "Saving…" : "Confirm & save marks"}</Button></div>
        {saveMessage && <div className="notice notice-success" style={{ marginTop: 14 }}><CheckCircle2 size={16}/><div><strong>Submission result</strong>{saveMessage}</div></div>}
      </Card>
    </> : <Card title="Validation results will appear here" subtitle="Upload an assessment PDF to extract student identifiers and awarded marks."><div className="empty-state"><div className="empty-icon"><FileCheck2 size={24}/></div><h3>No PDF reviewed yet</h3><p>Choose the relevant assessment, upload its official marksheet or evaluated answer sheets, and inspect the matched rows here.</p></div></Card>}
  </>;
}
