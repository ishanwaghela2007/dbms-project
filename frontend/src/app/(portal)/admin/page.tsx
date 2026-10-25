"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CircleAlert, FileCheck2, GraduationCap, Plus, UserPlus, Users, UsersRound } from "lucide-react";
import { Card, PageHeading, StatCard, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import type { AdminDashboardSummary, Student } from "@/types/erp";

const distributionColors = ["#647fe7", "#9c8ce5", "#51b79a", "#f0bd61"];
const distributionLabels = ["First year", "Second year", "Third year", "Final year"];

export default function AdminDashboard() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [studentRows, setStudentRows] = useState<Student[]>([]);
  const [adminName, setAdminName] = useState("Administrator");
  const [loadError, setLoadError] = useState("");
  const studentDistribution = useMemo(() => {
    const counts = [0, 0, 0, 0];
    for (const student of studentRows) {
      const semester = Number(String(student.semester).match(/\d+/)?.[0]);
      if (semester >= 1 && semester <= 8) counts[Math.ceil(semester / 2) - 1] += 1;
    }
    const total = counts.reduce((sum, count) => sum + count, 0);
    const segments = counts.reduce<{ start: number; end: number; color: string }[]>((items, count, index) => {
      const start = index === 0 ? 0 : items[index - 1].end;
      return [...items, { start, end: start + (total ? count / total * 100 : 25), color: distributionColors[index] }];
    }, []);
    return {
      total,
      rows: counts.map((count, index) => ({
        label: distributionLabels[index],
        count,
        percentage: total ? Math.round(count / total * 100) : 0,
        color: distributionColors[index],
      })),
      gradient: total
        ? `conic-gradient(${segments.map(({ start, end, color }) => `${color} ${start}% ${end}%`).join(",")})`
        : "conic-gradient(#edf0f7 0 100%)",
    };
  }, [studentRows]);
  const attendanceOverview = useMemo(() => {
    const years = distributionLabels.map((label, index) => ({ label, index, total: 0, sum: 0, students: 0 }));
    for (const student of studentRows) {
      const semester = Number(String(student.semester).match(/\d+/)?.[0]);
      const year = semester >= 1 && semester <= 8 ? years[Math.ceil(semester / 2) - 1] : undefined;
      if (!year || !student.attendanceSessions) continue;
      year.total += student.attendance;
      year.students += 1;
      year.sum += student.attendanceSessions;
    }
    const recorded = years.reduce((total, year) => total + year.students, 0);
    const totalSessions = years.reduce((total, year) => total + year.sum, 0);
    const average = recorded ? years.reduce((total, year) => total + year.total, 0) / recorded : null;
    return { average, recorded, totalSessions, years: years.map((year) => ({ ...year, average: year.students ? year.total / year.students : null })) };
  }, [studentRows]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("college_erp_user");
      if (stored) {
        const u = JSON.parse(stored);
        if (u.fullName || u.name) queueMicrotask(() => setAdminName(u.fullName || u.name));
      }
    } catch {}

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
    <PageHeading eyebrow="CAMPUS ADMINISTRATION" title={`Good morning, ${adminName} 👋`} description="Here's what's happening across your campus today." actions={<><Link className="btn btn-secondary btn-md" href="/admin/register"><UserPlus size={15}/> Register account</Link><Link className="btn btn-primary btn-md" href="/admin/students"><Plus size={16}/> Create student</Link></>} />
    <div className="stat-grid">
      <StatCard label="Total students" value={summary ? summary.totalStudents.toLocaleString() : (studentRows.length > 0 ? studentRows.length.toLocaleString() : "—")} hint="Enrolled students" trend={summary?.studentGrowthPercent ? `+${summary.studentGrowthPercent}%` : undefined} icon={Users} color="blue" />
      <StatCard label="Faculty members" value={summary ? summary.facultyMembers.toLocaleString() : "—"} hint="Active faculty" trend={summary?.facultyGrowthPercent ? `+${summary.facultyGrowthPercent}%` : undefined} icon={GraduationCap} color="green" />
      <StatCard label="Active courses" value={summary ? String(summary.activeCourses) : "—"} hint={`Across ${summary?.departments ?? "—"} departments`} icon={FileCheck2} color="violet" />
      <StatCard label="Attendance alerts" value={summary ? String(summary.attendanceAlerts) : "—"} hint="Need a follow-up" icon={CircleAlert} color="amber" />
    </div>

    <div className="content-grid">
      <Card title="Attendance overview" subtitle="Live average from finalized attendance registers" action={<div className="chart-legend"><span><i className="legend-key legend-blue"/>Recorded attendance</span><span><i className="legend-key legend-pale"/>Target 75%</span></div>}>
        {attendanceOverview.average === null ? <div className="empty-state"><div className="empty-icon"><CircleAlert size={24}/></div><h3>No finalized attendance yet</h3><p>This card updates after teachers finalize attendance registers.</p></div> : <>
          <div className="attendance-live-summary"><strong>{attendanceOverview.average.toFixed(1)}%</strong><span>Campus average</span><small>{attendanceOverview.recorded} students · {attendanceOverview.totalSessions} recorded sessions</small></div>
          <div className="live-attendance-list">
            {attendanceOverview.years.map((year) => <div className="live-attendance-row" key={year.label}><span>{year.label}</span><div className="progress-track"><div className="progress-fill" style={{ width: `${year.average ?? 0}%` }}/><i style={{ left: "75%" }} /></div><b>{year.average === null ? "No data" : `${year.average.toFixed(1)}%`}</b></div>)}
          </div>
        </>}
      </Card>
      <Card title="Student distribution" subtitle="Live enrollment by academic year" action={<Link className="mini-link" href="/admin/students">View students <ArrowRight size={13}/></Link>}>
        <div className="ring-layout">
          <div className="donut" style={{ background: studentRows.length ? studentDistribution.gradient : undefined }}><div className="donut-center"><strong>{studentRows.length ? studentDistribution.total.toLocaleString() : "—"}</strong><span>Live students</span></div></div>
          <div className="ring-legend">
            {studentDistribution.rows.map((row) => <div className="ring-legend-row" key={row.label}><i className="legend-swatch" style={{background:row.color}}/><span>{row.label}</span><b>{studentRows.length ? `${row.count} · ${row.percentage}%` : "—"}</b></div>)}
          </div>
        </div>
        <div className="notice notice-info"><CircleAlert size={16}/><div><strong>Semester registration is open</strong>Students can verify their details before the registration window closes on 24 October.</div></div>
      </Card>
    </div>

    <div className="content-grid">
      <Card title="Recently registered students" subtitle="Latest student profiles added to the ERP" action={<Link className="mini-link" href="/admin/students">View all <ArrowRight size={13}/></Link>}>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Student</th><th>Program</th><th>Semester</th><th>Status</th></tr></thead><tbody>{studentRows.slice(0,5).map((student,i)=><tr key={student.id}><td><div className="table-name"><div className={`avatar ${["avatar-blue","avatar-green","avatar-violet","avatar-amber","avatar-rose"][i]}`}>{student.name.split(" ").map(x=>x[0]).join("")}</div><div><strong>{student.name}</strong><small>{student.rollNo}</small></div></div></td><td>{student.program}</td><td>{student.semester}</td><td><StatusPill tone={student.status === "Active" ? "success" : "neutral"}>{student.status}</StatusPill></td></tr>)}</tbody></table>{studentRows.length === 0 && <p className="helper-text">No student records returned yet.</p>}</div>
      </Card>
      <Card
        title="Needs your attention"
        subtitle="Items that may require administrative action"
        action={
          summary && summary.attendanceAlerts > 0
            ? <span className="status status-warning">{summary.attendanceAlerts} alert{summary.attendanceAlerts !== 1 ? "s" : ""}</span>
            : <span className="status status-neutral">All clear</span>
        }
      >
        <div className="list-stack">
          <div className="list-row">
            <div className="stat-icon stat-icon-amber" style={{width:34,height:34,margin:0}}><CircleAlert size={17}/></div>
            <div className="list-row-main">
              <strong>Low attendance follow-ups</strong>
              <p>{summary ? `${summary.attendanceAlerts} student${summary.attendanceAlerts !== 1 ? "s" : ""} below the configured threshold.` : "Loading attendance data…"}</p>
            </div>
            <Link href="/admin/attendance-alerts" className="mini-link"><ArrowRight size={15}/></Link>
          </div>
          <div className="list-row">
            <div className="stat-icon stat-icon-violet" style={{width:34,height:34,margin:0}}><UsersRound size={17}/></div>
            <div className="list-row-main">
              <strong>Teaching assignments</strong>
              <p>Assign faculty to subject offerings for the current semester.</p>
            </div>
            <Link href="/admin/academics" className="mini-link"><ArrowRight size={15}/></Link>
          </div>
          <div className="list-row">
            <div className="stat-icon stat-icon-blue" style={{width:34,height:34,margin:0}}><FileCheck2 size={17}/></div>
            <div className="list-row-main">
              <strong>Results awaiting review</strong>
              <p>Check the marks board for PDF validations pending confirmation.</p>
            </div>
            <Link href="/teacher/marks" className="mini-link"><ArrowRight size={15}/></Link>
          </div>
          <div className="list-row">
            <div className="stat-icon stat-icon-green" style={{width:34,height:34,margin:0}}><GraduationCap size={17}/></div>
            <div className="list-row-main">
              <strong>Faculty directory</strong>
              <p>{summary ? `${summary.facultyMembers} faculty member${summary.facultyMembers !== 1 ? "s" : ""} registered.` : "View all faculty."}</p>
            </div>
            <Link href="/admin/teachers" className="mini-link"><ArrowRight size={15}/></Link>
          </div>
        </div>
      </Card>
    </div>
  </>;
}
