"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Bell, BellRing, CalendarClock, CheckCheck, Clock3, FileCheck2, Info } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import { isDemoMode } from "@/lib/api/client";
import { studentNotifications as seedNotifications } from "@/lib/data/demo";
import type { StudentNotification } from "@/types/erp";

export default function StudentNotificationsPage() {
  const [items, setItems] = useState<StudentNotification[]>(isDemoMode ? seedNotifications : []);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    erpApi.listStudentNotifications().then(data => { if (active) setItems(data); }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Could not load notifications."); });
    return () => { active = false; };
  }, []);
  async function markRead(item: StudentNotification) {
    try { await erpApi.markNotificationRead(item.id); setItems(current => current.map(notification => notification.id === item.id ? { ...notification, isRead: true } : notification)); setMessage("Notification marked as read."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not update notification."); }
  }
  const unread = items.filter(item => !item.isRead).length;
  const iconFor = (kind: StudentNotification["kind"]) => kind === "attendance" ? <AlertTriangle size={19}/> : kind === "meeting" ? <CalendarClock size={19}/> : kind === "result" ? <FileCheck2 size={19}/> : <Info size={19}/>;
  return <>
    <PageHeading eyebrow="STUDENT PORTAL" title="Notifications" description="Attendance warnings, meeting updates and academic announcements." actions={<Button variant="secondary" onClick={() => Promise.all(items.filter(item => !item.isRead).map(markRead))}><CheckCheck size={15}/> Mark all read</Button>} />
    <div className="stat-grid"><div className="stat-card"><div className="stat-icon stat-icon-amber"><BellRing size={20}/></div><div className="stat-value">{unread}</div><div className="stat-label">Unread notifications</div></div><div className="stat-card"><div className="stat-icon stat-icon-red"><AlertTriangle size={20}/></div><div className="stat-value">{items.filter(item => item.kind === "attendance").length}</div><div className="stat-label">Attendance alerts</div></div><div className="stat-card"><div className="stat-icon stat-icon-blue"><CalendarClock size={20}/></div><div className="stat-value">{items.filter(item => item.kind === "meeting").length}</div><div className="stat-label">Meeting updates</div></div><div className="stat-card"><div className="stat-icon stat-icon-green"><FileCheck2 size={20}/></div><div className="stat-value">{items.filter(item => item.kind === "result").length}</div><div className="stat-label">Result updates</div></div></div>
    <Card title="Your inbox" subtitle="Alerts are created by the ERP backend and are visible only to their recipient.">
      <div className="stack" style={{ gap: 12 }}>{items.map(item => <div key={item.id} className="card" style={{ boxShadow: "none", padding: 16, borderColor: item.isRead ? "#eaecf4" : "#e2e7ff", background: item.isRead ? "#fff" : "#fcfcff" }}>
        <div className="list-row" style={{ alignItems: "flex-start", padding: 0, border: 0 }}><div className={`stat-icon ${item.kind === "attendance" ? "stat-icon-amber" : item.kind === "meeting" ? "stat-icon-blue" : "stat-icon-green"}`} style={{ width: 40, height: 40, margin: 0 }}>{iconFor(item.kind)}</div><div className="list-row-main"><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><strong>{item.title}</strong>{!item.isRead && <StatusPill tone="info">New</StatusPill>}</div><p>{item.message}</p><div className="meeting-meta"><span><Clock3 size={11}/>{new Date(item.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>{item.subject && <span>{item.subject}</span>}</div></div><button className="icon-button" aria-label="Mark notification as read" onClick={() => void markRead(item)}><CheckCheck size={16}/></button></div>
        {item.kind === "attendance" && <div className="page-two-col" style={{ marginTop: 15 }}><div className="notice notice-warning"><AlertTriangle size={16}/><div><strong>Attendance: {item.attendance}%</strong>Required: {item.requiredAttendance}%. Please speak with your assigned contact.</div></div><div className="notice notice-info"><Bell size={16}/><div><strong>{item.contactName}</strong>{item.contactRole} · {item.contactLocation}</div></div></div>}
        {item.kind === "attendance" && <div className="button-row" style={{ justifyContent: "flex-end", marginTop: 12 }}><Link href="/student/meetings" className="btn btn-primary btn-sm"><CalendarClock size={14}/> Request a meeting</Link></div>}
        {item.kind === "meeting" && <div className="button-row" style={{ justifyContent: "flex-end", marginTop: 12 }}><Link href="/student/meetings" className="btn btn-secondary btn-sm">View meeting status</Link></div>}
      </div>)}</div>
      {message && <div className="notice notice-success" style={{ marginTop: 14 }}><CheckCheck size={16}/><div>{message}</div></div>}
    </Card>
  </>;
}
