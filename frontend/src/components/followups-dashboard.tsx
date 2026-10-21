"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarClock, CheckCircle2, MessageSquare, Search, Send, UsersRound } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import type { Followup } from "@/types/erp";

export default function FollowupsDashboard({ adminView = false }: { adminView?: boolean }) {
  const [rows, setRows] = useState<Followup[]>([]);
  const [search, setSearch] = useState("");
  const [threshold, setThreshold] = useState("75");
  const [selectedContact, setSelectedContact] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    erpApi.listFollowups().then(data => { if (active) setRows(data); }).catch(error => { if (active) setNotice(error instanceof Error ? error.message : "Could not load attendance follow-ups."); });
    return () => { active = false; };
  }, []);
  const filtered = useMemo(() => rows.filter(row => row.attendance < Number(threshold) && `${row.studentName} ${row.rollNo} ${row.subject} ${row.teacherName}`.toLowerCase().includes(search.toLowerCase())), [rows, threshold, search]);
  const openCount = rows.filter(row => row.status !== "RESOLVED").length;

  async function tagStudent(row: Followup) {
    setBusyId(row.id); setNotice("");
    const contact = selectedContact[row.id] || row.teacherName;
    const reason = reasons[row.id] || "Attendance below the configured threshold";
    try {
      await erpApi.createFollowup({ studentId: row.studentId, classSubjectId: row.subject, reason, attendancePercent: row.attendance, requiredPercent: Number(threshold), contactTeacherName: contact });
      setRows(current => current.map(item => item.id === row.id ? { ...item, status: "OPEN", contact } : item));
      setNotice(`Follow-up tag submitted for ${row.studentName}. In live mode, the student notification is created by the backend.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to create follow-up."); }
    finally { setBusyId(""); }
  }

  function setStatus(rowId: string, status: Followup["status"], message: string) {
    setRows(current => current.map(row => row.id === rowId ? { ...row, status } : row));
    setMessages(current => ({ ...current, [rowId]: message }));
  }

  return <>
    <PageHeading eyebrow={adminView ? "ADMINISTRATION" : "STUDENT SUPPORT"} title={adminView ? "Attendance alerts" : "Student follow-ups"} description={adminView ? "Monitor low-attendance cases and see whether students have been contacted." : "Flag students below the attendance threshold, notify them, and manage requests to meet."} actions={<Button variant="secondary" onClick={() => setNotice("Attendance percentage should be calculated from finalized sessions by the Attendance Service.")}><BellRing size={15}/> Alert policy</Button>} />
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-icon stat-icon-blue"><UsersRound size={20}/></div><div className="stat-value">{filtered.length}</div><div className="stat-label">Students below {threshold}%</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-amber"><BellRing size={20}/></div><div className="stat-value">{openCount}</div><div className="stat-label">Open follow-ups</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-violet"><CalendarClock size={20}/></div><div className="stat-value">{rows.filter(row => row.status === "MEETING_REQUESTED").length}</div><div className="stat-label">Meeting requests</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-green"><CheckCircle2 size={20}/></div><div className="stat-value">{rows.filter(row => row.status === "RESOLVED").length}</div><div className="stat-label">Resolved cases</div></div>
    </div>
    <Card title="Attendance follow-up register" subtitle="A tag creates a student-facing alert that names the person to meet." action={<StatusPill tone="warning">Policy threshold: {threshold}%</StatusPill>}>
      <div className="toolbar">
        <label className="input-wrap" style={{ flex: "1 1 260px", maxWidth: 450 }}><Search size={15}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search student, roll number or subject"/></label>
        <label className="input-wrap"><span style={{ fontSize: 10, whiteSpace: "nowrap" }}>Below</span><select value={threshold} onChange={event => setThreshold(event.target.value)} style={{ border: 0, background: "transparent", color: "#6b7280" }}><option value="65">65%</option><option value="70">70%</option><option value="75">75%</option><option value="80">80%</option></select></label>
      </div>
      <div className="stack" style={{ gap: 12, marginTop: 14 }}>
        {filtered.map(row => <div className="card" key={row.id} style={{ boxShadow: "none", padding: 16 }}>
          <div className="low-attendance-row" style={{ paddingTop: 0 }}>
            <div className="table-name"><div className="avatar avatar-amber">{row.studentName.split(" ").map(part => part[0]).join("")}</div><div><strong>{row.studentName}</strong><small>{row.rollNo} · {row.subject}</small></div></div>
            <div><strong style={{ color: row.attendance < 65 ? "#c74747" : "#b87916", fontSize: 15 }}>{row.attendance}%</strong><div className="helper-text">Attendance</div></div>
            <div><div className="progress-track" style={{ width: "100%", maxWidth: 100 }}><div className={row.attendance < 65 ? "progress-fill progress-fill-red" : "progress-fill progress-fill-amber"} style={{ width: `${row.attendance}%` }}/></div><div className="helper-text">Required {threshold}%</div></div>
            <StatusPill tone={row.status === "RESOLVED" ? "success" : row.status === "OPEN" ? "warning" : "info"}>{row.status.replaceAll("_", " ")}</StatusPill>
          </div>
          <div className="field-grid" style={{ marginTop: 13 }}>
            <div className="field"><label>Person the student should meet</label><select value={selectedContact[row.id] ?? row.contact ?? row.teacherName} onChange={event => setSelectedContact(current => ({ ...current, [row.id]: event.target.value }))}><option value={row.teacherName}>{row.teacherName} · Subject teacher</option><option value="Class Mentor">Assigned class mentor</option><option value="Department Coordinator">Department coordinator</option></select></div>
            <div className="field"><label>Follow-up reason</label><select value={reasons[row.id] ?? "Attendance below the configured threshold"} onChange={event => setReasons(current => ({ ...current, [row.id]: event.target.value }))}><option>Attendance below the configured threshold</option><option>Attendance has dropped since last review</option><option>Student meeting requested</option><option>Review medical / approved absence</option></select></div>
          </div>
          {!adminView && <div className="button-row" style={{ justifyContent: "flex-end", marginTop: 12 }}><Button variant="secondary" size="sm" onClick={() => setStatus(row.id, "RESOLVED", "Follow-up marked resolved.")}>Mark resolved</Button><Button size="sm" disabled={busyId === row.id} onClick={() => void tagStudent(row)}>{busyId === row.id ? "Saving…" : <><Send size={14}/> Tag & notify student</>}</Button></div>}
          {row.status === "MEETING_REQUESTED" && <div className="notice notice-info" style={{ marginTop: 12 }}><CalendarClock size={16}/><div><strong>Meeting requested</strong>The student has requested a meeting. Review it in the meetings queue and confirm or propose another time.</div><Button size="sm" variant="secondary" onClick={() => setStatus(row.id, "ACKNOWLEDGED", "Meeting request opened for review.")}>Review request</Button></div>}
          {messages[row.id] && <p className="helper-text">{messages[row.id]}</p>}
        </div>)}
        {filtered.length === 0 && <div className="empty-state"><div className="empty-icon"><Search size={24}/></div><h3>No students match this filter</h3><p>Adjust the threshold or search query.</p></div>}
      </div>
    </Card>
    {notice && <div className="notice notice-info" style={{ marginTop: 14 }}><MessageSquare size={16}/><div>{notice}</div><button className="text-button" onClick={() => setNotice("")}>Dismiss</button></div>}
    <Card title="Workflow rules" subtitle="Keep alerts useful and accountable"><div className="list-stack"><div className="simple-list-item"><div className="stat-icon stat-icon-amber" style={{ width: 32, height: 32, margin: 0 }}><BellRing size={16}/></div><div><strong>Alert the student</strong><p>The alert should show the current attendance, threshold, subject and named contact person.</p></div></div><div className="simple-list-item"><div className="stat-icon stat-icon-blue" style={{ width: 32, height: 32, margin: 0 }}><CalendarClock size={16}/></div><div><strong>Meeting requests need teacher response</strong><p>Booking is not final until a teacher accepts the slot. Store all status changes for audit.</p></div></div></div></Card>
  </>;
}
