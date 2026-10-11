"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BellRing, BookOpen, CalendarClock, CheckCircle2, Clock3, FileCheck2, GraduationCap, TrendingUp } from "lucide-react";
import { Card, PageHeading, StatCard, StatusPill } from "@/components/ui";
import { studentMeetings as demoMeetings, studentNotifications as demoNotifications, studentDashboardSummary as demoSummary } from "@/lib/data/demo";
import { erpApi } from "@/lib/api/erp";
import { isDemoMode } from "@/lib/api/client";
import type { Meeting, StudentDashboardSummary, StudentNotification } from "@/types/erp";



export default function StudentDashboard() {
  const [summary, setSummary] = useState<StudentDashboardSummary | null>(isDemoMode ? demoSummary : null);
  const [notifications, setNotifications] = useState<StudentNotification[]>(isDemoMode ? demoNotifications : []);
  const [meetings, setMeetings] = useState<Meeting[]>(isDemoMode ? demoMeetings : []);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    Promise.all([erpApi.getStudentDashboard(), erpApi.listStudentNotifications(), erpApi.listStudentMeetings()]).then(([dashboard, loadedNotifications, loadedMeetings]) => {
      if (!active) return;
      setSummary(dashboard);
      setNotifications(loadedNotifications);
      setMeetings(loadedMeetings);
    }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "Could not load student dashboard."); });
    return () => { active = false; };
  }, []);
  const subjects = summary?.subjects ?? [];
  const alerts = notifications.filter(notification => !notification.isRead);
  const attendanceAlert = notifications.find(notification => notification.kind === "attendance" && !notification.isRead) ?? notifications.find(notification => notification.kind === "attendance");
  const recentResults = (summary?.recentResults ?? []).filter(result => result.status === "Published" && result.obtained !== null).slice(0, 3);
  return <>
    {loadError && <div className="notice notice-danger" style={{ marginBottom: 14 }}><BellRing size={16}/><div><strong>Dashboard data unavailable</strong>{loadError}</div></div>}
    <PageHeading eyebrow="STUDENT PORTAL · OCTOBER 2026" title={isDemoMode ? "Welcome back, Aarav 👋" : "Your academic overview"} description="Your academic progress, attendance and upcoming actions in one place." actions={<Link className="btn btn-primary btn-md" href="/student/notifications"><BellRing size={15}/> View notifications {alerts.length > 0 && <span className="nav-badge">{alerts.length}</span>}</Link>} />
    <div className="stat-grid">
      <StatCard label="Current attendance" value={summary ? `${summary.currentAttendance}%` : "—"} hint="Across current subjects" icon={TrendingUp} color="blue" />
      <StatCard label="Average assessment score" value={summary ? `${summary.averageScore}%` : "—"} hint="Published results only" icon={FileCheck2} color="green" />
      <StatCard label="Active subjects" value={summary ? String(summary.activeSubjects) : "—"} hint="Semester 3" icon={BookOpen} color="violet" />
      <StatCard label="Unread notifications" value={String(alerts.length)} hint="Needs your attention" icon={BellRing} color="amber" />
    </div>
    <div className="content-grid">
      <Card title="Attendance by subject" subtitle="Low attendance is highlighted so you can act early." action={<Link href="/student/notifications" className="mini-link">View alerts <ArrowRight size={13}/></Link>}>
        <div className="stack" style={{ gap: 17 }}>{subjects.map(subject => <div key={subject.code}><div className="progress-row"><strong>{subject.name}</strong><span style={{ color: subject.attendance < 75 ? "#b87916" : "#7b8298", fontWeight: 700 }}>{subject.attendance}%</span></div><div className="progress-track" style={{ height: 8 }}><div className={`progress-fill ${subject.attendance < 65 ? "progress-fill-red" : subject.attendance < 75 ? "progress-fill-amber" : "progress-fill-green"}`} style={{ width: `${subject.attendance}%` }}/></div>{subject.attendance < 75 && <div className="helper-text" style={{ color: "#b87916", marginTop: 5 }}>Below the 75% example threshold · see notification for next steps</div>}</div>)}</div>
      </Card>
      <Card title="Your next step" subtitle="Stay ahead of the semester">
        {attendanceAlert ? <div className="notice notice-warning"><BellRing size={17}/><div><strong>{attendanceAlert.title}</strong>{attendanceAlert.message} {attendanceAlert.contactName ? `Contact: ${attendanceAlert.contactName}.` : ""}</div></div> : <div className="notice notice-info"><CheckCircle2 size={17}/><div><strong>No active attendance alert</strong>Keep checking your subject attendance and course updates.</div></div>}
        <div style={{ marginTop: 14 }} className="simple-list-item"><div className="stat-icon stat-icon-blue" style={{ width: 34, height: 34, margin: 0 }}><CalendarClock size={17}/></div><div><strong>Book a teacher meeting</strong><p>Choose an available slot and wait for teacher confirmation.</p></div><Link className="mini-link" href="/student/meetings"><ArrowRight size={15}/></Link></div>
        <div className="simple-list-item"><div className="stat-icon stat-icon-green" style={{ width: 34, height: 34, margin: 0 }}><BookOpen size={17}/></div><div><strong>Review course material</strong><p>Question papers and permitted answer keys are in the library.</p></div><Link className="mini-link" href="/student/papers"><ArrowRight size={15}/></Link></div>
      </Card>
    </div>
    <Card title="Recent results" subtitle={isDemoMode ? "Sample results for the frontend preview." : "Most recently published assessment results."} action={<Link href="/student/results" className="mini-link">All results <ArrowRight size={13}/></Link>}>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Subject</th><th>Assessment</th><th>Score</th><th>Result</th></tr></thead><tbody>{recentResults.map(row=><tr key={row.id}><td><strong>{row.subject}</strong></td><td>{row.assessment}</td><td><strong>{row.obtained}/{row.max}</strong></td><td><StatusPill tone="success">Published</StatusPill></td></tr>)}</tbody></table>{recentResults.length === 0 && <p className="helper-text">No published results are available yet.</p>}</div>
    </Card>
    <div className="content-grid" style={{ marginTop: 18 }}>
      <Card title="Upcoming meeting" subtitle="Meeting requests are not final until accepted by the teacher.">{meetings.length ? meetings.map(meeting => <div key={meeting.id} className="meeting-card"><div className="meeting-date"><strong>{meeting.date.slice(8)}</strong><small>{new Date(`${meeting.date}T12:00:00`).toLocaleString("en", { month: "short" }).toUpperCase()}</small></div><div className="meeting-info"><strong>{meeting.teacherName}</strong><p>{meeting.subject} · {meeting.location}</p><StatusPill tone={meeting.status === "CONFIRMED" ? "success" : "warning"}>{meeting.status.replaceAll("_", " ")}</StatusPill><div className="meeting-meta"><span><Clock3 size={11}/>{meeting.time}</span></div></div></div>) : <p className="helper-text">No meetings scheduled.</p>}<Link href="/student/meetings" className="mini-link" style={{ display: "inline-flex", marginTop: 14 }}>Manage meetings <ArrowRight size={13}/></Link></Card>
      <Card title="Campus resources" subtitle="Quick access"><div className="list-stack"><Link href="/student/papers" className="list-row"><div className="stat-icon stat-icon-violet" style={{ width: 35, height: 35, margin: 0 }}><BookOpen size={17}/></div><div className="list-row-main"><strong>Papers library</strong><p>Find question papers and study material.</p></div><ArrowRight size={15}/></Link><Link href="/student/notifications" className="list-row"><div className="stat-icon stat-icon-amber" style={{ width: 35, height: 35, margin: 0 }}><BellRing size={17}/></div><div className="list-row-main"><strong>Notifications</strong><p>Attendance alerts and meeting updates.</p></div><ArrowRight size={15}/></Link><Link href="/student/settings" className="list-row"><div className="stat-icon stat-icon-blue" style={{ width: 35, height: 35, margin: 0 }}><GraduationCap size={17}/></div><div className="list-row-main"><strong>My profile</strong><p>Review your account and academic details.</p></div><ArrowRight size={15}/></Link></div></Card>
    </div>
  </>;
}
