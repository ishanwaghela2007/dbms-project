"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, CheckCircle2, Clock3, MapPin, Plus, XCircle } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import type { Meeting } from "@/types/erp";

const slots = [
  { id: "slot-neha-20261012-1400", label: "Monday, 12 Oct · 2:00–2:15 PM", date: "2026-10-12", time: "2:00 PM – 2:15 PM", teacher: "Prof. Neha Kulkarni", location: "Faculty Room 204", subject: "Data Structures", followup: "fu-001" },
  { id: "slot-neha-20261013-1130", label: "Tuesday, 13 Oct · 11:30–11:45 AM", date: "2026-10-13", time: "11:30 AM – 11:45 AM", teacher: "Prof. Neha Kulkarni", location: "Faculty Room 204", subject: "Data Structures", followup: "fu-001" },
  { id: "slot-aditya-20261014-1500", label: "Wednesday, 14 Oct · 3:00–3:15 PM", date: "2026-10-14", time: "3:00 PM – 3:15 PM", teacher: "Dr. Aditya Rao", location: "Faculty Room 312", subject: "Database Management Systems", followup: "fu-003" },
];

function tone(status: Meeting["status"]): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "CONFIRMED" || status === "COMPLETED") return "success";
  if (status === "REQUESTED" || status === "RESCHEDULE_PROPOSED") return "warning";
  if (status === "DECLINED" || status.startsWith("CANCELLED") || status === "NO_SHOW") return "danger";
  return "neutral";
}

export default function StudentMeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [slotId, setSlotId] = useState(slots[1].id);
  const [message, setMessage] = useState("I would like to discuss my attendance and how to improve it.");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    erpApi.listStudentMeetings().then(data => { if (active) setMeetings(data); }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load meetings."); });
    return () => { active = false; };
  }, []);
  const selectedSlot = slots.find(slot => slot.id === slotId) ?? slots[1];

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      const response = await erpApi.requestMeeting(selectedSlot.followup, { slotId: selectedSlot.id, message });
      const refreshed = await erpApi.listStudentMeetings().catch(() => null);
      if (refreshed) {
        setMeetings(refreshed);
      } else if (response?.meeting) {
        setMeetings(current => [response.meeting!, ...current]);
      }
      setNotice(response.message || "Meeting request submitted. It is pending teacher approval.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to request a meeting."); }
    finally { setSaving(false); }
  }

  async function cancel(meeting: Meeting) {
    setError(""); setNotice("");
    try { const response = await erpApi.cancelMeeting(meeting.id); setMeetings(current => current.map(item => item.id === meeting.id ? { ...item, status: "CANCELLED_BY_STUDENT" } : item)); setNotice(response.message || "Meeting cancelled."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to cancel meeting."); }
  }

  return <>
    <PageHeading eyebrow="STUDENT SUPPORT" title="Teacher meetings" description="Request a time with the teacher named in your low-attendance alert. The request is not confirmed until the teacher accepts it." />
    <div className="page-two-col">
      <Card title="Request an appointment" subtitle="Choose an available slot from the assigned teacher.">
        <form className="stack" style={{ gap: 15 }} onSubmit={submit}>
          <div className="notice notice-warning"><CalendarClock size={16}/><div><strong>Attendance follow-up</strong>Data Structures attendance is below the example 75% threshold. Your meeting request will be linked to this follow-up.</div></div>
          <div className="field"><label>Available appointment slot *</label><select required value={slotId} onChange={event => setSlotId(event.target.value)}>{slots.map(slot => <option key={slot.id} value={slot.id}>{slot.label} · {slot.teacher}</option>)}</select></div>
          <div className="field"><label>Person to meet</label><input value={selectedSlot.teacher} readOnly/></div>
          <div className="field"><label>Location</label><input value={selectedSlot.location} readOnly/></div>
          <div className="field"><label>Message (optional)</label><textarea value={message} maxLength={500} rows={4} onChange={event => setMessage(event.target.value)} placeholder="What would you like to discuss?"/></div>
          <Button type="submit" disabled={saving}><Plus size={15}/>{saving ? "Submitting…" : "Request meeting"}</Button>
          <p className="helper-text">The real backend must reserve the slot transactionally and reject it if another student has already requested it.</p>
        </form>
      </Card>
      <Card title="Before you meet" subtitle="Use the appointment to agree on practical next steps.">
        <div className="list-stack"><div className="simple-list-item"><div className="stat-icon stat-icon-amber" style={{ width: 34, height: 34, margin: 0 }}><Clock3 size={17}/></div><div><strong>Bring context</strong><p>Be ready to discuss missed lectures, timetable conflicts or approved absences.</p></div></div><div className="simple-list-item"><div className="stat-icon stat-icon-blue" style={{ width: 34, height: 34, margin: 0 }}><MapPin size={17}/></div><div><strong>Check the location</strong><p>The agreed room or online meeting details will appear once your appointment is confirmed.</p></div></div><div className="simple-list-item"><div className="stat-icon stat-icon-green" style={{ width: 34, height: 34, margin: 0 }}><CheckCircle2 size={17}/></div><div><strong>Wait for confirmation</strong><p>A request is pending until the teacher accepts the appointment.</p></div></div></div>
      </Card>
    </div>
    <Card title="My appointment requests" subtitle="Track pending, confirmed and previous meetings.">
      <div className="stack" style={{ gap: 12 }}>{meetings.map(meeting => <div className="meeting-card" key={meeting.id}><div className="meeting-date"><strong>{meeting.date.slice(8)}</strong><small>{new Date(`${meeting.date}T12:00:00`).toLocaleString("en", { month: "short" }).toUpperCase()}</small></div><div className="meeting-info"><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><strong>{meeting.teacherName}</strong><StatusPill tone={tone(meeting.status)}>{meeting.status.replaceAll("_", " ")}</StatusPill></div><p>{meeting.subject} · {meeting.location}</p><div className="meeting-meta"><span><Clock3 size={11}/>{meeting.time}</span><span><MapPin size={11}/>{meeting.location}</span></div>{meeting.message && <p>“{meeting.message}”</p>}{meeting.status === "REQUESTED" && <div style={{ marginTop: 10 }}><Button variant="danger" size="sm" onClick={() => void cancel(meeting)}><XCircle size={14}/> Cancel request</Button></div>}</div></div>)}{meetings.length === 0 && <p className="helper-text">You have not requested a meeting yet.</p>}</div>
    </Card>
    {(notice || error) && <div className={`notice ${error ? "notice-danger" : "notice-success"}`} style={{ marginTop: 14 }}><CheckCircle2 size={16}/><div>{error || notice}</div></div>}
  </>;
}
