"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, MapPin, MessageSquare, XCircle } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import { isDemoMode } from "@/lib/api/client";
import { studentMeetings as seedMeetings } from "@/lib/data/demo";
import type { Meeting } from "@/types/erp";

export default function TeacherMeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>(isDemoMode ? seedMeetings : []);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    erpApi.listTeacherMeetings().then(data => { if (active) setMeetings(data); }).catch(error => { if (active) setNotice(error instanceof Error ? error.message : "Could not load meeting requests."); });
    return () => { active = false; };
  }, []);
  async function respond(meeting: Meeting, action: "ACCEPT" | "DECLINE" | "PROPOSE_ALTERNATIVE") {
    setBusy(meeting.id); setNotice("");
    try {
      const responseMessage = responses[meeting.id] || (action === "ACCEPT" ? "Your meeting is confirmed." : action === "DECLINE" ? "Please choose another available slot." : "Please choose the alternate time offered to you.");
      const result = await erpApi.respondToMeeting(meeting.id, { action, responseMessage, alternateSlotId: action === "PROPOSE_ALTERNATIVE" ? "slot-neha-20261014-1500" : undefined });
      const status: Meeting["status"] = action === "ACCEPT" ? "CONFIRMED" : action === "DECLINE" ? "DECLINED" : "RESCHEDULE_PROPOSED";
      setMeetings(current => current.map(item => item.id === meeting.id ? { ...item, status, message: responseMessage } : item));
      setNotice(result.message || `Meeting ${status.toLowerCase().replaceAll("_", " ")}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to update meeting."); }
    finally { setBusy(""); }
  }
  const pending = meetings.filter(meeting => meeting.status === "REQUESTED" || meeting.status === "RESCHEDULE_PROPOSED");
  const history = meetings.filter(meeting => !pending.includes(meeting));
  return <>
    <PageHeading eyebrow="TEACHING SPACE" title="Meeting requests" description="Review student appointments linked to attendance follow-ups and respond with a confirmed or alternative time." />
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-icon stat-icon-amber"><CalendarClock size={20}/></div><div className="stat-value">{pending.filter(meeting => meeting.status === "REQUESTED").length}</div><div className="stat-label">Awaiting your response</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-green"><CheckCircle2 size={20}/></div><div className="stat-value">{meetings.filter(meeting => meeting.status === "CONFIRMED").length}</div><div className="stat-label">Confirmed meetings</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-blue"><MessageSquare size={20}/></div><div className="stat-value">{meetings.length}</div><div className="stat-label">Total requests</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-violet"><Clock3 size={20}/></div><div className="stat-value">15 min</div><div className="stat-label">Default slot length</div></div>
    </div>
    <Card title="Pending requests" subtitle="Accept, decline or propose an alternative appointment slot.">
      <div className="stack" style={{ gap: 12 }}>
        {pending.map(meeting => <div className="card" key={meeting.id} style={{ boxShadow: "none", padding: 16 }}>
          <div className="meeting-card" style={{ border: 0, padding: 0 }}>
            <div className="meeting-date"><strong>{meeting.date.slice(8)}</strong><small>{new Date(`${meeting.date}T12:00:00`).toLocaleString("en", { month: "short" }).toUpperCase()}</small></div>
            <div className="meeting-info"><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><strong>{meeting.studentName}</strong><StatusPill tone="warning">{meeting.status.replaceAll("_", " ")}</StatusPill></div><p>{meeting.subject} · {meeting.studentId}</p><div className="meeting-meta"><span><Clock3 size={11}/>{meeting.time}</span><span><MapPin size={11}/>{meeting.location}</span></div><p>{meeting.message || "No message provided."}</p></div>
          </div>
          <div className="field" style={{ marginTop: 12 }}><label>Response message (optional)</label><textarea rows={2} maxLength={500} value={responses[meeting.id] ?? ""} onChange={event => setResponses(current => ({ ...current, [meeting.id]: event.target.value }))} placeholder="Add a note for the student…"/></div>
          <div className="button-row" style={{ justifyContent: "flex-end", marginTop: 12 }}><Button variant="danger" size="sm" disabled={busy === meeting.id} onClick={() => void respond(meeting, "DECLINE")}><XCircle size={14}/> Decline</Button><Button variant="secondary" size="sm" disabled={busy === meeting.id} onClick={() => void respond(meeting, "PROPOSE_ALTERNATIVE")}><CalendarClock size={14}/> Propose alternate</Button><Button size="sm" disabled={busy === meeting.id} onClick={() => void respond(meeting, "ACCEPT")}><CheckCircle2 size={14}/> Accept meeting</Button></div>
        </div>)}
        {pending.length === 0 && <div className="empty-state"><div className="empty-icon"><CalendarClock size={24}/></div><h3>No pending meeting requests</h3><p>New requests linked to your assigned classes will appear here.</p></div>}
      </div>
    </Card>
    <Card title="Meeting history" subtitle="Past responses remain available for audit."><div className="stack" style={{ gap: 8 }}>{history.map(meeting => <div className="list-row" key={meeting.id}><div className="stat-icon stat-icon-green" style={{ width: 34, height: 34, margin: 0 }}><CheckCircle2 size={17}/></div><div className="list-row-main"><strong>{meeting.studentName} · {meeting.subject}</strong><p>{meeting.date} · {meeting.time}</p></div><StatusPill tone={meeting.status === "CONFIRMED" ? "success" : "neutral"}>{meeting.status.replaceAll("_", " ")}</StatusPill></div>)}</div></Card>
    {notice && <div className="notice notice-info" style={{ marginTop: 14 }}><MessageSquare size={16}/><div>{notice}</div></div>}
  </>;
}
