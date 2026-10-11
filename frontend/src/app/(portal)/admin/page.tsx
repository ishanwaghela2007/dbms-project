"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, CircleAlert, Clock3, FileCheck2, GraduationCap, Plus, Users, UsersRound } from "lucide-react";
import { Card, PageHeading, StatCard, StatusPill } from "@/components/ui";
import { adminDashboardSummary as demoSummary, students as demoStudents } from "@/lib/data/demo";
import { erpApi } from "@/lib/api/erp";
import { isDemoMode } from "@/lib/api/client";
import type { AdminDashboardSummary, Student } from "@/types/erp";

const chartPoints = "0,108 37,88 75,95 112,68 150,78 187,53 225,61 262,44 300,56 337,27 375,37 412,17";

export default function AdminDashboard() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(isDemoMode ? demoSummary : null);
  const [studentRows, setStudentRows] = useState<Student[]>(isDemoMode ? demoStudents : []);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    Promise.all([erpApi.getAdminDashboard(), erpApi.listStudents()]).then(([dashboard, loadedStudents]) => {
      if (!active) return;
      setSummary(dashboard);
      setStudentRows(loadedStudents);
    }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "Could not load dashboard data."); });
    return () => { active = false; };
  }, []);
  return <>
    {loadError && <div className="notice notice-danger" style={{ marginBottom: 14 }}><CircleAlert size={16}/><div><strong>Dashboard data unavailable</strong>{loadError}</div></div>}
    <PageHeading eyebrow="SATURDAY, 10 OCTOBER 2026" title="Good morning, Ishan 👋" description="Here's what's happening across your campus today." actions={<><button className="btn btn-secondary btn-md"><CalendarDays size={15}/> This semester <ChevronDown size={14}/></button><Link className="btn btn-primary btn-md" href="/admin/students"><Plus size={16}/> Create student</Link></>} />
    <div className="stat-grid">
      <StatCard label="Total students" value={summary ? summary.totalStudents.toLocaleString() : "—"} hint="vs last semester" trend={summary ? `+${summary.studentGrowthPercent}%` : undefined} icon={Users} color="blue" />
      <StatCard label="Faculty members" value={summary ? summary.facultyMembers.toLocaleString() : "—"} hint="vs last semester" trend={summary ? `+${summary.facultyGrowthPercent}%` : undefined} icon={GraduationCap} color="green" />
      <StatCard label="Active courses" value={summary ? String(summary.activeCourses) : "—"} hint={`Across ${summary?.departments ?? "—"} departments`} icon={FileCheck2} color="violet" />
      <StatCard label="Attendance alerts" value={summary ? String(summary.attendanceAlerts) : "—"} hint="Need a follow-up" trend={isDemoMode ? "-4.6%" : undefined} icon={CircleAlert} color="amber" />
    </div>

    <div className="content-grid">
      <Card title="Attendance overview" subtitle="Average attendance across the last 12 weeks" action={<div className="chart-legend"><span><i className="legend-key legend-blue"/>This semester</span><span><i className="legend-key legend-pale"/>Target 75%</span></div>}>
        <div className="chart-wrap">
          <svg className="line-chart" viewBox="0 0 420 145" preserveAspectRatio="none" role="img" aria-label="Attendance trend increasing over 12 weeks">
            {[20,48,76,104,132].map(y => <line key={y} x1="0" x2="420" y1={y} y2={y} stroke="#edf0f7" strokeDasharray="3 4" />)}
            <line x1="0" x2="420" y1="58" y2="58" stroke="#d9b46c" strokeDasharray="5 4" />
            <polygon points={`0,140 ${chartPoints} 420,140`} fill="url(#attendanceFill)" opacity=".72" />
            <defs><linearGradient id="attendanceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6682ed" stopOpacity=".25"/><stop offset="100%" stopColor="#6682ed" stopOpacity="0"/></linearGradient></defs>
            <polyline points={chartPoints} fill="none" stroke="#647fe7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {chartPoints.split(" ").map((point, i) => { const [x,y] = point.split(","); return <circle key={i} cx={x} cy={y} r={i === 11 ? 4.5 : 2.7} fill={i === 11 ? "#fff" : "#647fe7"} stroke="#647fe7" strokeWidth={i === 11 ? 2.5 : 0} />; })}
          </svg>
        </div>
        <div className="chart-bottom-labels"><span>Week 01</span><span>Week 03</span><span>Week 05</span><span>Week 07</span><span>Week 09</span><span>Week 12</span></div>
        <div className="divider" />
        <div className="button-row"><span className="trend trend-up"><ArrowUpRight size={12} style={{verticalAlign:"-2px"}}/> 6.8%</span><span className="helper-text">Attendance is trending up compared with the previous term.</span></div>
      </Card>
      <Card title="Student distribution" subtitle="Enrollment by academic year · distribution preview" action={<button className="mini-link">View report <ArrowRight size={13}/></button>}>
        <div className="ring-layout">
          <div className="donut"><div className="donut-center"><strong>{summary ? summary.totalStudents.toLocaleString() : "—"}</strong><span>Total students</span></div></div>
          <div className="ring-legend">
            {[{label:"First year",value:"32%",color:"#647fe7"},{label:"Second year",value:"26%",color:"#9c8ce5"},{label:"Third year",value:"24%",color:"#51b79a"},{label:"Final year",value:"18%",color:"#f0bd61"}].map(r=><div className="ring-legend-row" key={r.label}><i className="legend-swatch" style={{background:r.color}}/><span>{r.label}</span><b>{r.value}</b></div>)}
          </div>
        </div>
        <div className="notice notice-info"><CircleAlert size={16}/><div><strong>Semester registration is open</strong>Students can verify their details before the registration window closes on 24 October.</div></div>
      </Card>
    </div>

    <div className="content-grid">
      <Card title="Recently registered students" subtitle="Latest student profiles added to the ERP" action={<Link className="mini-link" href="/admin/students">View all <ArrowRight size={13}/></Link>}>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Student</th><th>Program</th><th>Semester</th><th>Status</th></tr></thead><tbody>{studentRows.slice(0,5).map((student,i)=><tr key={student.id}><td><div className="table-name"><div className={`avatar ${["avatar-blue","avatar-green","avatar-violet","avatar-amber","avatar-rose"][i]}`}>{student.name.split(" ").map(x=>x[0]).join("")}</div><div><strong>{student.name}</strong><small>{student.rollNo}</small></div></div></td><td>{student.program}</td><td>{student.semester}</td><td><StatusPill tone={student.status === "Active" ? "success" : "neutral"}>{student.status}</StatusPill></td></tr>)}</tbody></table>{studentRows.length === 0 && <p className="helper-text">No student records returned yet.</p>}</div>
      </Card>
      <Card title="Needs your attention" subtitle="Items that may require administrative action" action={<span className="status status-warning">4 pending</span>}>
        <div className="list-stack">
          <div className="list-row"><div className="stat-icon stat-icon-amber" style={{width:34,height:34,margin:0}}><CircleAlert size={17}/></div><div className="list-row-main"><strong>Low attendance follow-ups</strong><p>27 students are below the configured threshold.</p></div><Link href="/admin/attendance-alerts" className="mini-link"><ArrowRight size={15}/></Link></div>
          <div className="list-row"><div className="stat-icon stat-icon-violet" style={{width:34,height:34,margin:0}}><UsersRound size={17}/></div><div className="list-row-main"><strong>Teacher assignments</strong><p>2 classes still need a subject teacher.</p></div><Link href="/admin/academics" className="mini-link"><ArrowRight size={15}/></Link></div>
          <div className="list-row"><div className="stat-icon stat-icon-blue" style={{width:34,height:34,margin:0}}><FileCheck2 size={17}/></div><div className="list-row-main"><strong>Results awaiting review</strong><p>1 marksheet validation is not finalized.</p></div><Link href="/teacher/marks" className="mini-link"><ArrowRight size={15}/></Link></div>
          <div className="list-row"><div className="stat-icon stat-icon-green" style={{width:34,height:34,margin:0}}><Clock3 size={17}/></div><div className="list-row-main"><strong>Faculty availability</strong><p>Next week's office hours are being updated.</p></div><Link href="/admin/teachers" className="mini-link"><ArrowRight size={15}/></Link></div>
        </div>
      </Card>
    </div>
  </>;
}
