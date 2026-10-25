"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, CheckCircle2, Clock3, MapPin, Plus, XCircle } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import { apiRequest } from "@/lib/api/client";
import type { Followup, Meeting } from "@/types/erp";

function tone(status: Meeting["status"]): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "CONFIRMED" || status === "COMPLETED") return "success";
  if (status === "REQUESTED" || status === "RESCHEDULE_PROPOSED") return "warning";
  if (status === "DECLINED" || status.startsWith("CANCELLED") || status === "NO_SHOW") return "danger";
  return "neutral";
}

export default function StudentMeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [selectedFollowupId, setSelectedFollowupId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [subject, setSubject] = useState("");
  const [meetingDate, setMeetingDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [meetingTime, setMeetingTime] = useState("11:30 AM – 11:45 AM");
  const [location, setLocation] = useState("Faculty Office / Department Cabin");
  const [message, setMessage] = useState("I would like to discuss my academic progress and attendance.");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      erpApi.listStudentMeetings().catch(() => []),
      apiRequest<Followup[]>("/student/attendance-followups").catch(() => []),
    ]).then(([meetingList, followupList]) => {
      if (!active) return;
      if (meetingList) setMeetings(meetingList);
      if (followupList && followupList.length > 0) {
        setFollowups(followupList);
        setSelectedFollowupId(followupList[0].id);
        setTeacherName(followupList[0].teacherName || followupList[0].contact || "Assigned Teacher");
        setSubject(followupList[0].subject || "Academic Course");
      }
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : "Could not load meeting information.");
    });
    return () => { active = false; };
  }, []);

  function handleFollowupChange(fId: string) {
    setSelectedFollowupId(fId);
    const found = followups.find(f => f.id === fId);
    if (found) {
      setTeacherName(found.teacherName || found.contact || "Assigned Teacher");
      setSubject(found.subject || "Academic Course");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const targetFollowupId = selectedFollowupId || "attendance-review";
      const response = await erpApi.requestMeeting(targetFollowupId, {
        teacherName,
        subject,
        date: meetingDate,
        time: meetingTime,
        location,
        message,
        idempotencyKey: `mtg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      });
      const refreshed = await erpApi.listStudentMeetings().catch(() => null);
      if (refreshed) {
        setMeetings(refreshed);
      } else if (response?.meeting) {
        setMeetings(current => [response.meeting!, ...current]);
      } else {
        setMeetings(current => [
          {
            id: `mtg-${Date.now()}`,
            studentId: "me",
            studentName: "Student",
            teacherName,
            subject,
            date: meetingDate,
            time: meetingTime,
            location,
            status: "REQUESTED",
            message,
          },
          ...current,
        ]);
      }
      setNotice(response.message || "Meeting request submitted. It is pending faculty review.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to request a meeting.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(meeting: Meeting) {
    setError("");
    setNotice("");
    try {
      const response = await erpApi.cancelMeeting(meeting.id);
      setMeetings(current => current.map(item => item.id === meeting.id ? { ...item, status: "CANCELLED_BY_STUDENT" } : item));
      setNotice(response.message || "Meeting cancelled.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to cancel meeting.");
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="STUDENT SUPPORT"
        title="Teacher meetings"
        description="Request an appointment with your faculty member to discuss attendance, coursework or academic guidance."
      />
      <div className="page-two-col">
        <Card title="Request an appointment" subtitle="Enter your meeting details and preferred discussion topic.">
          <form className="stack" style={{ gap: 15 }} onSubmit={submit}>
            {followups.length > 0 && (
              <div className="field">
                <label>Related attendance follow-up</label>
                <select value={selectedFollowupId} onChange={e => handleFollowupChange(e.target.value)}>
                  {followups.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.subject} · {f.teacherName || f.contact} ({f.attendance}% attendance)
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field-grid">
              <div className="field">
                <label>Faculty member *</label>
                <input
                  required
                  value={teacherName}
                  onChange={e => setTeacherName(e.target.value)}
                  placeholder="e.g. Prof. Faculty Name"
                />
              </div>
              <div className="field">
                <label>Subject / course *</label>
                <input
                  required
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="e.g. Database Management Systems"
                />
              </div>
            </div>
            <div className="field-grid">
              <div className="field">
                <label>Preferred date *</label>
                <input
                  type="date"
                  required
                  value={meetingDate}
                  onChange={e => setMeetingDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Preferred time slot *</label>
                <select value={meetingTime} onChange={e => setMeetingTime(e.target.value)}>
                  <option>10:00 AM – 10:15 AM</option>
                  <option>11:30 AM – 11:45 AM</option>
                  <option>02:00 PM – 02:15 PM</option>
                  <option>03:30 PM – 03:45 PM</option>
                  <option>04:30 PM – 04:45 PM</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Location</label>
              <input value={location} onChange={e => setLocation(e.target.value)} />
            </div>
            <div className="field">
              <label>Discussion agenda (optional)</label>
              <textarea
                value={message}
                maxLength={500}
                rows={3}
                onChange={event => setMessage(event.target.value)}
                placeholder="What would you like to discuss with the teacher?"
              />
            </div>
            <Button type="submit" disabled={saving}>
              <Plus size={15} />
              {saving ? "Submitting…" : "Request meeting"}
            </Button>
          </form>
        </Card>
        <Card title="Before you meet" subtitle="Use the appointment to agree on practical next steps.">
          <div className="list-stack">
            <div className="simple-list-item">
              <div className="stat-icon stat-icon-amber" style={{ width: 34, height: 34, margin: 0 }}>
                <Clock3 size={17} />
              </div>
              <div>
                <strong>Bring context</strong>
                <p>Be ready to discuss missed lectures, coursework questions, or approved leaves.</p>
              </div>
            </div>
            <div className="simple-list-item">
              <div className="stat-icon stat-icon-blue" style={{ width: 34, height: 34, margin: 0 }}>
                <MapPin size={17} />
              </div>
              <div>
                <strong>Check location</strong>
                <p>The confirmed room or virtual link will show once your appointment is accepted.</p>
              </div>
            </div>
            <div className="simple-list-item">
              <div className="stat-icon stat-icon-green" style={{ width: 34, height: 34, margin: 0 }}>
                <CheckCircle2 size={17} />
              </div>
              <div>
                <strong>Wait for confirmation</strong>
                <p>A request stays pending until the faculty member approves the time slot.</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
      <Card title="My appointment requests" subtitle="Track pending, confirmed and previous meetings.">
        <div className="stack" style={{ gap: 12 }}>
          {meetings.map(meeting => (
            <div className="meeting-card" key={meeting.id}>
              <div className="meeting-date">
                <strong>{meeting.date ? meeting.date.slice(8) : "—"}</strong>
                <small>
                  {meeting.date
                    ? new Date(`${meeting.date}T12:00:00`).toLocaleString("en", { month: "short" }).toUpperCase()
                    : "MTG"}
                </small>
              </div>
              <div className="meeting-info">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{meeting.teacherName}</strong>
                  <StatusPill tone={tone(meeting.status)}>{meeting.status.replaceAll("_", " ")}</StatusPill>
                </div>
                <p>{meeting.subject} · {meeting.location}</p>
                <div className="meeting-meta">
                  <span><Clock3 size={11} />{meeting.time}</span>
                  <span><MapPin size={11} />{meeting.location}</span>
                </div>
                {meeting.message && <p>“{meeting.message}”</p>}
                {meeting.status === "REQUESTED" && (
                  <div style={{ marginTop: 10 }}>
                    <Button variant="danger" size="sm" onClick={() => void cancel(meeting)}>
                      <XCircle size={14} /> Cancel request
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {meetings.length === 0 && (
            <p className="helper-text">You have not requested a meeting yet.</p>
          )}
        </div>
      </Card>
      {(notice || error) && (
        <div className={`notice ${error ? "notice-danger" : "notice-success"}`} style={{ marginTop: 14 }}>
          <CheckCircle2 size={16} />
          <div>{error || notice}</div>
        </div>
      )}
    </>
  );
}
