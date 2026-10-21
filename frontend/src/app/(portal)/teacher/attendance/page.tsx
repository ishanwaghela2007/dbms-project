"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, Download, FileSpreadsheet, LoaderCircle, Search, Trash2, UploadCloud } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import type { AttendanceStatus, Student, TeacherClassAssignment } from "@/types/erp";

type RegisterStatus = AttendanceStatus | "";
type ImportRow = { key: string; rowNumber: number; rollNo: string; studentName: string; status: RegisterStatus; issue?: string; isMissing?: boolean };

const statuses: { value: AttendanceStatus; label: string }[] = [
  { value: "PRESENT", label: "Present" }, { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "Late" }, { value: "EXCUSED", label: "Excused" },
];

function normalizeHeader(value: unknown) { return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, ""); }
function parseStatus(value: unknown): RegisterStatus {
  const status = String(value ?? "").trim().toUpperCase();
  if (["PRESENT", "P", "YES", "Y", "1"].includes(status)) return "PRESENT";
  if (["ABSENT", "A", "NO", "N", "0"].includes(status)) return "ABSENT";
  if (["LATE", "L"].includes(status)) return "LATE";
  if (["EXCUSED", "E", "MEDICAL", "ON DUTY", "OD"].includes(status)) return "EXCUSED";
  return "";
}

export default function TeacherAttendancePage() {
  const [activeTab, setActiveTab] = useState<"manual" | "excel">("manual");
  const [assignments, setAssignments] = useState<TeacherClassAssignment[]>([]);
  const [className, setClassName] = useState("");
  const [subject, setSubject] = useState("");
  const [roster, setRoster] = useState<Student[]>([]);
  const selectedAssignment = assignments.find(assignment => assignment.className === className && assignment.subject === subject);
  const selectedClassId = selectedAssignment?.classId;
  const selectedSubjectId = selectedAssignment?.subjectId;
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [lectureNo, setLectureNo] = useState("1");
  const [manualStates, setManualStates] = useState<Record<string, RegisterStatus>>({});
  const [search, setSearch] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    erpApi.listTeacherClassAssignments().then(data => {
      if (!active) return;
      setAssignments(data);
      if (data.length > 0) { setClassName(data[0].className); setSubject(data[0].subject); }
      else { setClassName(""); setSubject(""); }
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load assigned classes."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedClassId || !selectedSubjectId) { queueMicrotask(() => setRoster([])); return; }
    let active = true;
    erpApi.listTeacherClassRoster(selectedClassId, selectedSubjectId).then(data => {
      if (active) { setRoster(data); setManualStates({}); setImportRows([]); setFileName(""); }
    }).catch(e => { if (active) { setRoster([]); setError(e instanceof Error ? e.message : "Could not load the class roster."); } });
    return () => { active = false; };
  }, [selectedClassId, selectedSubjectId]);

  const classOptions = [...new Set(assignments.map(assignment => assignment.className))];
  const subjectOptions = assignments.filter(assignment => assignment.className === className);
  const filteredRoster = roster.filter(student => `${student.name} ${student.rollNo} ${student.email}`.toLowerCase().includes(search.toLowerCase()));
  const manualCounts = useMemo(() => {
    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, UNMARKED: 0 };
    roster.forEach(student => { const state = manualStates[student.id]; if (!state) counts.UNMARKED++; else counts[state]++; });
    return counts;
  }, [roster, manualStates]);

  function changeContext(nextClass: string, nextSubject = subject) {
    const matching = assignments.find(assignment => assignment.className === nextClass && assignment.subject === nextSubject)
      ?? assignments.find(assignment => assignment.className === nextClass);
    setClassName(matching?.className ?? nextClass);
    setSubject(matching?.subject ?? nextSubject);
    setManualStates({}); setImportRows([]); setFileName(""); setMessage(""); setError("");
  }

  function downloadTemplate() {
    const template = roster.map(student => ({ roll_no: student.rollNo, student_name: student.name, status: "" }));
    const worksheet = XLSX.utils.json_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
    XLSX.writeFile(workbook, `attendance-template-${className.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx`);
  }

  async function parseExcel(file?: File) {
    setError(""); setMessage(""); setImportRows([]);
    if (!file) return;
    const allowed = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!allowed) { setError("Upload an .xlsx, .xls or .csv file."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("The attendance file must be 10 MB or smaller."); return; }
    setIsParsing(true); setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("The workbook does not contain a readable sheet.");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
      if (!raw.length) throw new Error("No attendance rows found. Include a header row and student rows.");
      const rollKeyCandidates = new Set(["rollno", "enrollmentno", "enrollmentnumber", "studentid", "rollnumber"]);
      const statusKeyCandidates = new Set(["status", "attendance", "attendancestatus"]);
      const rosterMap = new Map(roster.map(student => [student.rollNo.toUpperCase(), student]));
      const mapped: ImportRow[] = [];
      const seen = new Set<string>();
      raw.forEach((rawRow, index) => {
        const entries = Object.entries(rawRow);
        const rollEntry = entries.find(([key]) => rollKeyCandidates.has(normalizeHeader(key)));
        const statusEntry = entries.find(([key]) => statusKeyCandidates.has(normalizeHeader(key)));
        const rollNo = String(rollEntry?.[1] ?? "").trim().toUpperCase();
        const status = parseStatus(statusEntry?.[1]);
        const student = rosterMap.get(rollNo);
        let issue = "";
        if (!rollNo) issue = "Missing roll number";
        else if (seen.has(rollNo)) issue = "Duplicate roll number in file";
        else if (!student) issue = "Roll number not found in selected class";
        if (!status) issue = issue ? `${issue}; invalid or missing status` : "Invalid or missing status";
        seen.add(rollNo);
        mapped.push({ key: `file-${index + 2}-${rollNo || "unknown"}`, rowNumber: index + 2, rollNo, studentName: student?.name ?? "Unmatched student", status, issue: issue || undefined });
      });
      const includedKnownRolls = new Set(mapped.filter(row => rosterMap.has(row.rollNo) && !mapped.some(other => other !== row && other.rollNo === row.rollNo && other.rowNumber < row.rowNumber)).map(row => row.rollNo));
      roster.filter(student => !includedKnownRolls.has(student.rollNo.toUpperCase())).forEach((student, index) => mapped.push({ key: `missing-${student.id}`, rowNumber: raw.length + index + 2, rollNo: student.rollNo, studentName: student.name, status: "", issue: "Not present in file — select a status after reviewing", isMissing: true }));
      setImportRows(mapped);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read the attendance file."); }
    finally { setIsParsing(false); }
  }

  function updateImportRow(key: string, patch: Partial<ImportRow>) {
    setImportRows(current => current.map(row => row.key === key ? { ...row, ...patch, issue: patch.issue ?? row.issue } : row));
    setMessage("");
  }

  const validImportRows = useMemo(() => {
    const rosterMap = new Map(roster.map(student => [student.rollNo.toUpperCase(), student]));
    const rollCounts = new Map<string, number>();
    importRows.forEach(row => { const roll = row.rollNo.trim().toUpperCase(); if (roll) rollCounts.set(roll, (rollCounts.get(roll) ?? 0) + 1); });
    return importRows.map(row => {
      const roll = row.rollNo.trim().toUpperCase();
      const student = rosterMap.get(roll);
      const duplicate = (rollCounts.get(roll) ?? 0) > 1;
      const issue = !roll ? "Enter a roll number" : !student ? "Roll number not in selected class" : duplicate ? "Duplicate roll number — remove or correct duplicate" : !row.status ? "Choose a status" : "";
      return { ...row, studentId: student?.id, studentName: student?.name ?? row.studentName, issue, valid: Boolean(student && !duplicate && row.status) };
    });
  }, [importRows, roster]);
  const importValid = validImportRows.length === roster.length && validImportRows.every(row => row.valid);

  async function saveManual() {
    setError(""); setMessage("");
    if (!selectedAssignment) { setError("Choose one of your assigned class-subject offerings."); return; }
    if (!roster.length) { setError("No students were returned for this assigned class."); return; }
    if (manualCounts.UNMARKED > 0) { setError(`Mark every student before saving. ${manualCounts.UNMARKED} still need a status.`); return; }
    setSaving(true);
    try {
      const result = await erpApi.saveAttendance({ classSubjectId: selectedAssignment.classSubjectId, sessionDate, lectureNo: Number(lectureNo), entryMode: "MANUAL", status: "DRAFT", records: roster.map(student => ({ studentId: student.id, rollNo: student.rollNo, status: manualStates[student.id] })) });
      setMessage(result.message ?? "Attendance register saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save attendance."); }
    finally { setSaving(false); }
  }

  async function saveImport() {
    setError(""); setMessage("");
    if (!selectedAssignment) { setError("Choose one of your assigned class-subject offerings."); return; }
    if (!importValid) { setError("Resolve all unmatched, duplicate and unmarked rows before confirming the import."); return; }
    setSaving(true);
    try {
      const result = await erpApi.saveAttendance({ classSubjectId: selectedAssignment.classSubjectId, sessionDate, lectureNo: Number(lectureNo), entryMode: "EXCEL", sourceFileName: fileName, status: "DRAFT", records: validImportRows.map(row => ({ studentId: row.studentId, rollNo: row.rollNo, status: row.status })) });
      setMessage(result.message ?? "Excel attendance imported.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to import attendance."); }
    finally { setSaving(false); }
  }

  const onExcelChange = (event: ChangeEvent<HTMLInputElement>) => { void parseExcel(event.target.files?.[0]); event.target.value = ""; };

  return <>
    <PageHeading eyebrow="TEACHING SPACE" title="Attendance register" description="Take class attendance manually or import an Excel register. Review validation results before saving." actions={<Button variant="secondary" onClick={downloadTemplate}><Download size={15}/> Download template</Button>} />
    <Card title="Register details" subtitle="Attendance is recorded for an assigned class-subject offering, date and lecture number.">
      <div className="field-grid">
        <div className="field"><label>Class / section</label><select value={className} disabled={!classOptions.length} onChange={event => changeContext(event.target.value)}>{!classOptions.length && <option value="">No assigned classes</option>}{classOptions.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="field"><label>Subject</label><select value={subject} disabled={!subjectOptions.length} onChange={event => changeContext(className, event.target.value)}>{!subjectOptions.length && <option value="">No assigned subjects</option>}{subjectOptions.map(item => <option key={item.id} value={item.subject}>{item.subject}</option>)}</select></div>
        <div className="field"><label>Session date</label><input type="date" value={sessionDate} onChange={event => setSessionDate(event.target.value)} /></div>
        <div className="field"><label>Lecture number</label><input type="number" min="1" max="12" value={lectureNo} onChange={event => setLectureNo(event.target.value)} /></div>
      </div>
    </Card>
    <div className="tabs" style={{ marginTop: 18 }}><button className={`tab-button ${activeTab === "manual" ? "active" : ""}`} onClick={() => { setActiveTab("manual"); setMessage(""); setError(""); }}><ClipboardCheck size={14} style={{ verticalAlign: "-3px", marginRight: 7 }}/>Manual register</button><button className={`tab-button ${activeTab === "excel" ? "active" : ""}`} onClick={() => { setActiveTab("excel"); setMessage(""); setError(""); }}><FileSpreadsheet size={14} style={{ verticalAlign: "-3px", marginRight: 7 }}/>Import Excel / CSV</button></div>

    {activeTab === "manual" ? <>
      <div className="validation-summary">
        <div className="validation-stat"><strong>{roster.length}</strong><span>Students in class</span></div>
        <div className="validation-stat"><strong style={{ color: "#16856b" }}>{manualCounts.PRESENT}</strong><span>Present</span></div>
        <div className="validation-stat"><strong style={{ color: "#c74747" }}>{manualCounts.ABSENT}</strong><span>Absent</span></div>
        <div className="validation-stat"><strong style={{ color: manualCounts.UNMARKED ? "#b87916" : "#16856b" }}>{manualCounts.UNMARKED}</strong><span>Awaiting status</span></div>
      </div>
      <Card title="Mark attendance" subtitle="P = present, A = absent, L = late, E = excused. Missing statuses must be completed before saving." action={<div className="button-row"><Button size="sm" variant="secondary" onClick={() => setManualStates(Object.fromEntries(roster.map(student => [student.id, "PRESENT"] as const)))}>Mark all present</Button><Button size="sm" variant="secondary" onClick={() => setManualStates({})}>Clear</Button></div>}>
        <div className="toolbar"><label className="input-wrap" style={{ flex: "1 1 240px", maxWidth: 420 }}><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or roll number" /></label></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Student</th><th>Roll number</th><th>Attendance status</th></tr></thead><tbody>{filteredRoster.map(student => <tr key={student.id}><td><div className="table-name"><div className="avatar avatar-blue">{student.name.split(" ").map(part => part[0]).join("")}</div><div><strong>{student.name}</strong><small>{student.email}</small></div></div></td><td><strong>{student.rollNo}</strong></td><td><div className="pill-row">{statuses.map(item => <button key={item.value} type="button" className={`chip ${manualStates[student.id] === item.value ? "chip-active" : ""}`} onClick={() => { setManualStates(current => ({ ...current, [student.id]: item.value })); setMessage(""); }}>{item.label}</button>)}</div></td></tr>)}</tbody></table></div>
        <div className="button-row" style={{ justifyContent: "space-between", marginTop: 18 }}><span className="helper-text">{className} · {subject} · {sessionDate}</span><Button onClick={() => void saveManual()} disabled={saving}>{saving ? "Saving…" : "Save attendance register"}</Button></div>
      </Card>
    </> : <>
      <Card title="Import attendance sheet" subtitle="Use the downloaded template or a workbook with roll_no and status columns.">
        <label className="file-dropzone" htmlFor="attendance-import" style={{ cursor: isParsing ? "wait" : "pointer" }}><span className="file-icon">{isParsing ? <LoaderCircle size={22} className="spin"/> : <UploadCloud size={22}/>}</span><h3>{isParsing ? "Reading workbook…" : fileName || "Choose attendance workbook"}</h3><p>Excel .xlsx / .xls or CSV · 10 MB maximum</p><input id="attendance-import" type="file" accept=".xlsx,.xls,.csv" onChange={onExcelChange} disabled={isParsing}/></label>
        <div className="notice notice-info" style={{ marginTop: 14 }}><FileSpreadsheet size={16}/><div><strong>Expected columns</strong>Required: <code>roll_no</code> and <code>status</code>. Status values: PRESENT, ABSENT, LATE or EXCUSED. Students missing from the file are added as unmarked rows so they are not silently treated as absent.</div></div>
      </Card>
      {importRows.length > 0 && <Card title="Review import preview" subtitle="Fix unmatched or duplicate roll numbers and select a status for every student before committing." action={<StatusPill tone={importValid ? "success" : "warning"}>{validImportRows.filter(r => r.valid).length}/{roster.length} matched</StatusPill>}>
        <div className="notice notice-warning" style={{ marginBottom: 14 }}><AlertTriangle size={16}/><div><strong>Nothing has been saved yet</strong>Changes are only committed after you confirm this preview.</div></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Excel row</th><th>Roll number</th><th>Student</th><th>Status</th><th>Validation</th><th></th></tr></thead><tbody>{validImportRows.map(row => <tr key={row.key}><td>{row.rowNumber}</td><td><input style={{ width: 108 }} aria-label={`Roll number row ${row.rowNumber}`} value={row.rollNo} onChange={event => updateImportRow(row.key, { rollNo: event.target.value.toUpperCase() })}/></td><td>{row.studentName}</td><td><select aria-label={`Attendance status row ${row.rowNumber}`} value={row.status} onChange={event => updateImportRow(row.key, { status: event.target.value as RegisterStatus })}><option value="">Choose status</option>{statuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></td><td>{row.valid ? <StatusPill tone="success">Valid</StatusPill> : <span className="status status-warning">{row.issue}</span>}</td><td><button className="icon-button" aria-label={`Remove row ${row.rowNumber}`} onClick={() => setImportRows(current => current.filter(item => item.key !== row.key))}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>
        <div className="button-row" style={{ justifyContent: "space-between", marginTop: 18 }}><span className="helper-text">{validImportRows.filter(row => row.status === "ABSENT").length} absent · {validImportRows.filter(row => row.status === "PRESENT").length} present · {validImportRows.filter(row => !row.status).length} unmarked</span><Button disabled={!importValid || saving} onClick={() => void saveImport()}>{saving ? "Importing…" : "Confirm & import attendance"}</Button></div>
      </Card>}
    </>}
    {(error || message) && <div className={`notice ${error ? "notice-danger" : "notice-success"}`} style={{ marginTop: 14 }}>{error ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>}<div><strong>{error ? "Please review" : "Saved"}</strong>{error || message}</div></div>}
    <Card title="Register safeguards" subtitle="Rules applied before attendance is committed"><div className="list-stack"><div className="simple-list-item"><div className="stat-icon stat-icon-green" style={{ width: 32, height: 32, margin: 0 }}><Check size={16}/></div><div><strong>One record per student per lecture</strong><p>Unique constraints prevent duplicate attendance rows for the same session.</p></div></div><div className="simple-list-item"><div className="stat-icon stat-icon-blue" style={{ width: 32, height: 32, margin: 0 }}><ShieldCheckIcon/></div><div><strong>Teacher assignment is verified on the backend</strong><p>The browser never decides which class a teacher is authorized to mark.</p></div></div></div></Card>
  </>;
}

function ShieldCheckIcon() { return <ClipboardCheck size={16}/>; }
