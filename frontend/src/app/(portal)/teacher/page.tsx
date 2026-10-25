"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BellRing, CheckCircle2, ClipboardCheck, Clock3, FileCheck2, Users, UsersRound } from "lucide-react";
import { Card, PageHeading, StatCard, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import { getGreeting, getGreetingDescription } from "@/lib/utils/greeting";
import type { Followup, TeacherClassAssignment, TeacherDashboardSummary } from "@/types/erp";

export default function TeacherDashboard() {
  const [summary, setSummary] = useState<TeacherDashboardSummary | null>(null);
  const [followupRows, setFollowupRows] = useState<Followup[]>([]);
  const [assignedClasses, setAssignedClasses] = useState<TeacherClassAssignment[]>([]);
  const [loadError, setLoadError] = useState("");
  const [teacherName, setTeacherName] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("college_erp_user");
      if (stored) { const u = JSON.parse(stored); if (u.fullName || u.name) setTeacherName((u.fullName || u.name).split(" ")[0]); }
    } catch {}
    let active = true;
    Promise.all([
      erpApi.getTeacherDashboard().catch(() => null),
      erpApi.listFollowups().catch(() => []),
      erpApi.listTeacherClassAssignments().catch(() => []),
    ]).then(([dashboard, loadedFollowups, loadedClasses]) => {
      if (!active) return;
      if (dashboard) setSummary(dashboard);
      setFollowupRows(loadedFollowups || []);
      setAssignedClasses(loadedClasses || []);
    }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "Could not load teaching dashboard."); });
    return () => { active = false; };
  }, []);

  return <>
    {loadError && <div className="notice notice-danger" style={{ marginBottom: 14 }}><BellRing size={16}/><div><strong>Dashboard data unavailable</strong>{loadError}</div></div>}
    <PageHeading eyebrow="FACULTY WORKSPACE" title={teacherName ? `${getGreeting()}, ${teacherName} 👋` : getGreeting()} description={getGreetingDescription("teacher")} actions={<Link className="btn btn-primary btn-md" href="/teacher/attendance"><ClipboardCheck size={15}/> Take attendance</Link>} />
    <div className="stat-grid">
      <StatCard label="Assigned subjects" value={summary ? String(summary.assignedSubjects) : (assignedClasses.length > 0 ? String(assignedClasses.length) : "—")} hint="Teaching allocations" icon={FileCheck2} color="blue" />
      <StatCard label="Students across classes" value={summary ? String(summary.studentsAcrossClasses) : "—"} hint="Active enrolments" icon={Users} color="green" />
      <StatCard label="Marks to finalize" value={summary ? String(summary.marksToFinalize) : "—"} hint="PDF review required" icon={CheckCircle2} color="violet" />
      <StatCard label="Low-attendance flags" value={summary ? String(summary.lowAttendanceFlags) : String(followupRows.length)} hint="Follow-up needed" icon={BellRing} color="amber" />
    </div>
    <div className="content-grid">
      <Card title="Assigned classes" subtitle="Your current teaching sections">
        <div className="list-stack">
          {assignedClasses.slice(0, 4).map(c => <div key={c.classSubjectId || c.className + c.subject} className="list-row"><div className="meeting-date"><strong style={{fontSize:12}}>CLS</strong><small>CLASS</small></div><div className="list-row-main"><strong>{c.subject}</strong><p>{c.className}</p></div><Link href="/teacher/attendance" className="mini-link">Take attendance <ArrowRight size={13}/></Link></div>)}
          {assignedClasses.length === 0 && <p className="helper-text" style={{padding: "12px 0"}}>No teaching classes assigned yet.</p>}
        </div>
      </Card>
      <Card title="Needs your attention" subtitle="A quick list of teaching tasks">
        <div className="list-stack">
          <div className="list-row"><div className="stat-icon stat-icon-violet" style={{width:34,height:34,margin:0}}><FileCheck2 size={17}/></div><div className="list-row-main"><strong>Mid-semester marks</strong><p>Review PDF extraction and confirm the final scores.</p></div><Link href="/teacher/marks" className="mini-link"><ArrowRight size={15}/></Link></div>
          <div className="list-row"><div className="stat-icon stat-icon-green" style={{width:34,height:34,margin:0}}><ClipboardCheck size={17}/></div><div className="list-row-main"><strong>Attendance register</strong><p>Submit today&apos;s register for the classes you taught.</p></div><Link href="/teacher/attendance" className="mini-link"><ArrowRight size={15}/></Link></div>
          <div className="list-row"><div className="stat-icon stat-icon-amber" style={{width:34,height:34,margin:0}}><UsersRound size={17}/></div><div className="list-row-main"><strong>Student follow-ups</strong><p>Review low attendance and meeting requests.</p></div><Link href="/teacher/followups" className="mini-link"><ArrowRight size={15}/></Link></div>
        </div>
      </Card>
    </div>
    <div className="content-grid">
      <Card title="Low attendance follow-ups" subtitle="Students below the configured policy threshold" action={<Link href="/teacher/followups" className="mini-link">Manage all <ArrowRight size={13}/></Link>}>
        {followupRows.slice(0,3).map(f=><div className="low-attendance-row" key={f.id}><div className="table-name"><div className="avatar avatar-amber">{f.studentName.split(" ").map(x=>x[0]).join("")}</div><div><strong>{f.studentName}</strong><small>{f.rollNo} · {f.subject}</small></div></div><div><strong style={{color:f.attendance<65?"#c74747":"#b67b23",fontSize:12}}>{f.attendance}%</strong><div className="helper-text">Attendance</div></div><div><div className="progress-track" style={{width:80}}><div className={`progress-fill ${f.attendance<65?"progress-fill-red":"progress-fill-amber"}`} style={{width:`${f.attendance}%`}}/></div></div><StatusPill tone={f.status==="OPEN"?"warning":f.status==="RESOLVED"?"success":"info"}>{f.status.replaceAll("_"," ")}</StatusPill></div> )}
        {!followupRows.length && <p className="helper-text">No low-attendance follow-ups loaded.</p>}
      </Card>
      <Card title="Next meetings" subtitle="Student requests and office hours" action={<Link href="/teacher/meetings" className="mini-link">Open inbox <ArrowRight size={13}/></Link>}>
        <div className="notice notice-info"><Clock3 size={16}/><div><strong>Office hours</strong>Review incoming meeting requests from your students.</div></div>
        <Link href="/teacher/meetings" className="btn btn-secondary btn-md" style={{ marginTop: 14 }}>Open meeting requests <ArrowRight size={14}/></Link>
      </Card>
    </div>
    <Card title="Your assigned subjects" subtitle="Allocated class subject offerings" action={<Link href="/admin/academics" className="mini-link">View allocation <ArrowRight size={13}/></Link>}>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Subject</th><th>Class</th><th>Action</th></tr></thead><tbody>{assignedClasses.map(x=><tr key={x.classSubjectId || x.className + x.subject}><td><strong style={{color:"#444a61"}}>{x.subject}</strong></td><td>{x.className}</td><td><Link className="mini-link" href="/teacher/attendance">Take attendance <ArrowRight size={12}/></Link></td></tr>)}</tbody></table>{assignedClasses.length === 0 && <p className="helper-text" style={{padding:16}}>No subjects assigned yet.</p>}</div>
    </Card>
  </>;
}
