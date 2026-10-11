"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BellRing, CalendarDays, CheckCircle2, ClipboardCheck, Clock3, FileCheck2, Users, UsersRound } from "lucide-react";
import { Card, PageHeading, StatCard, StatusPill } from "@/components/ui";
import { followups as demoFollowups, teacherDashboardSummary as demoSummary } from "@/lib/data/demo";
import { erpApi } from "@/lib/api/erp";
import { isDemoMode } from "@/lib/api/client";
import type { Followup, TeacherDashboardSummary } from "@/types/erp";

export default function TeacherDashboard() {
  const [summary, setSummary] = useState<TeacherDashboardSummary | null>(isDemoMode ? demoSummary : null);
  const [followupRows, setFollowupRows] = useState<Followup[]>(isDemoMode ? demoFollowups : []);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    Promise.all([erpApi.getTeacherDashboard(), erpApi.listFollowups()]).then(([dashboard, loadedFollowups]) => {
      if (!active) return;
      setSummary(dashboard);
      setFollowupRows(loadedFollowups);
    }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "Could not load teaching dashboard."); });
    return () => { active = false; };
  }, []);
  return <>
    {loadError && <div className="notice notice-danger" style={{ marginBottom: 14 }}><BellRing size={16}/><div><strong>Dashboard data unavailable</strong>{loadError}</div></div>}
    <PageHeading eyebrow="FACULTY WORKSPACE · OCTOBER 2026" title="Your teaching space" description="Everything you need for classes, student progress and follow-ups in one place." actions={<Link className="btn btn-primary btn-md" href="/teacher/attendance"><ClipboardCheck size={15}/> Take attendance</Link>} />
    <div className="stat-grid">
      <StatCard label="Assigned subjects" value={summary ? String(summary.assignedSubjects) : "—"} hint="2 class sections" icon={FileCheck2} color="blue" />
      <StatCard label="Students across classes" value={summary ? String(summary.studentsAcrossClasses) : "—"} hint="Active enrolments" icon={Users} color="green" />
      <StatCard label="Marks to finalize" value={summary ? String(summary.marksToFinalize) : "—"} hint="PDF review required" icon={CheckCircle2} color="violet" />
      <StatCard label="Low-attendance flags" value={summary ? String(summary.lowAttendanceFlags) : "—"} hint="Follow-up needed" icon={BellRing} color="amber" />
    </div>
    <div className="content-grid">
      <Card title="Today's classes" subtitle="Monday · Your teaching schedule" action={<button className="mini-link">Full timetable <ArrowRight size={13}/></button>}>
        <div className="list-stack">
          {[{time:"09:00 – 10:00",subject:"Data Structures",room:"Lab 3 · SY CSE A",state:"Completed",tone:"success",icon:"DS"},{time:"11:15 – 12:15",subject:"Database Management Systems",room:"Room 204 · SY CSE A",state:"Upcoming",tone:"info",icon:"DB"},{time:"14:00 – 15:00",subject:"Data Structures Tutorial",room:"Room 101 · SY CSE B",state:"Upcoming",tone:"info",icon:"DS"}].map(c=><div key={c.time} className="list-row"><div className="meeting-date"><strong style={{fontSize:12}}>{c.icon}</strong><small>CLASS</small></div><div className="list-row-main"><strong>{c.subject}</strong><p><Clock3 size={11} style={{verticalAlign:"-2px",marginRight:4}}/>{c.time} · {c.room}</p></div><StatusPill tone={c.tone as "success"|"info"}>{c.state}</StatusPill></div>)}
        </div>
      </Card>
      <Card title="Needs your attention" subtitle="A quick list of teaching tasks">
        <div className="list-stack">
          <div className="list-row"><div className="stat-icon stat-icon-violet" style={{width:34,height:34,margin:0}}><FileCheck2 size={17}/></div><div className="list-row-main"><strong>Mid-semester marks</strong><p>Review PDF extraction and confirm the final scores.</p></div><Link href="/teacher/marks" className="mini-link"><ArrowRight size={15}/></Link></div>
          <div className="list-row"><div className="stat-icon stat-icon-green" style={{width:34,height:34,margin:0}}><ClipboardCheck size={17}/></div><div className="list-row-main"><strong>Attendance register</strong><p>Submit today's register for the classes you taught.</p></div><Link href="/teacher/attendance" className="mini-link"><ArrowRight size={15}/></Link></div>
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
        <div className="meeting-card"><div className="meeting-date"><strong>13</strong><small>OCT</small></div><div className="meeting-info"><strong>Rohan Mehta · CSE2403</strong><p>Attendance follow-up · Data Structures</p><StatusPill tone="warning">Requested</StatusPill><div className="meeting-meta"><span><Clock3 size={11}/> 11:30 AM – 11:45 AM</span><span><CalendarDays size={11}/> Tuesday</span></div></div></div>
        <div className="divider"/><div className="notice notice-info"><Clock3 size={16}/><div><strong>Office hours reminder</strong>Publish your available slots so students can request a meeting.</div></div>
      </Card>
    </div>
    <Card title="Your assigned subjects" subtitle="Current academic year · 2026–27" action={<Link href="/admin/academics" className="mini-link">View allocation <ArrowRight size={13}/></Link>}>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Subject</th><th>Class</th><th>Students</th><th>Attendance average</th><th>Next action</th></tr></thead><tbody>{[{s:"Data Structures",c:"SY B.Tech CSE · A",n:62,a:79,href:"/teacher/attendance",action:"Take attendance"},{s:"Data Structures Tutorial",c:"SY B.Tech CSE · B",n:31,a:76,href:"/teacher/attendance",action:"Open register"},{s:"Design & Analysis of Algorithms",c:"SY B.Tech CSE · A",n:62,a:83,href:"/teacher/marks",action:"Manage marks"}].map(x=><tr key={x.s+x.c}><td><strong style={{color:"#444a61"}}>{x.s}</strong></td><td>{x.c}</td><td>{x.n}</td><td><div style={{display:"flex",alignItems:"center",gap:8}}><div className="progress-track" style={{width:73}}><div className="progress-fill progress-fill-green" style={{width:`${x.a}%`}}/></div><span>{x.a}%</span></div></td><td><Link className="mini-link" href={x.href}>{x.action} <ArrowRight size={12}/></Link></td></tr>)}</tbody></table></div>
    </Card>
  </>;
}
