"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BookOpen, Mail, Plus, Search, Trash2, UserRound, Users, X, BriefcaseBusiness } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import type { Teacher } from "@/types/erp";

export default function TeachersPage() {
  const [rows, setRows] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All departments");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ name: "", employeeId: "", email: "", department: "Computer Science and Engineering", designation: "Assistant Professor" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    erpApi.listTeachers().then(data => { if (active) setRows(data); }).catch(error => { if (active) setToast(error instanceof Error ? error.message : "Could not load teachers from the API."); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => rows.filter(t => (`${t.name} ${t.employeeId} ${t.email} ${t.subjects.join(" ")}`).toLowerCase().includes(search.toLowerCase()) && (department === "All departments" || t.department === department)), [rows, search, department]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try { const created = await erpApi.createTeacher({ ...form, subjects: [] }); setRows([created, ...rows]); setModalOpen(false); setToast("Teacher profile created. Assign subjects from Classes & subjects."); setForm({ name: "", employeeId: "", email: "", department: "Computer Science and Engineering", designation: "Assistant Professor" }); }
    catch (error) { setToast(error instanceof Error ? error.message : "Unable to create teacher."); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await erpApi.deleteTeacher(deleteTarget.id);
      setRows(prev => prev.filter(t => t.id !== deleteTarget.id));
      setToast(`Teacher account for ${deleteTarget.name} removed permanently.`);
      setDeleteTarget(null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to remove teacher account.");
    } finally {
      setDeleting(false);
    }
  }

  return <>
    <PageHeading eyebrow="FACULTY DIRECTORY" title="Teachers" description="Create faculty accounts, review staff profiles and keep teaching allocations up to date." actions={<Button onClick={() => setModalOpen(true)}><Plus size={16}/> Add teacher</Button>} />
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-icon stat-icon-blue"><Users size={20}/></div><div className="stat-value">{rows.length}</div><div className="stat-label">Faculty members</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-green"><UserRound size={20}/></div><div className="stat-value">{rows.filter(t=>t.status === "Active").length}</div><div className="stat-label">Active faculty</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-violet"><BookOpen size={20}/></div><div className="stat-value">{rows.reduce((n,t)=>n+(t.subjects||[]).length,0)}</div><div className="stat-label">Current subject assignments</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-amber"><BriefcaseBusiness size={20}/></div><div className="stat-value">{rows.filter(t=>(t.subjects||[]).length===0).length}</div><div className="stat-label">Awaiting subject allocation</div></div>
    </div>
    <Card title="Faculty directory" subtitle="Search by faculty name, employee ID, email or subject." action={<span className="status status-neutral">{filtered.length} records</span>}>
      <div className="toolbar"><label className="input-wrap" style={{flex:"1 1 280px",maxWidth:450}}><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search faculty..."/></label><label className="input-wrap"><BookOpen size={15}/><select value={department} onChange={e=>setDepartment(e.target.value)} style={{border:0,outline:0,background:"transparent",fontSize:11,color:"var(--heading)",minWidth:140}}><option>All departments</option><option>Computer Engineering</option><option>Computer Science and Engineering</option><option>EXTC</option><option>Information Technology</option></select></label></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Faculty member</th><th>Employee ID</th><th>Department / designation</th><th>Assigned subjects</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((t,i)=><tr key={t.id}><td><div className="table-name"><div className={`avatar ${["avatar-violet","avatar-blue","avatar-green","avatar-amber"][i%4]}`}>{t.name.replace("Prof. ","").replace("Dr. ","").split(" ").slice(0,2).map(x=>x[0]).join("")}</div><div><strong>{t.name}</strong><small>{t.email}</small></div></div></td><td><strong style={{color:"var(--heading)"}}>{t.employeeId}</strong></td><td><strong style={{display:"block",fontSize:10,color:"var(--heading)",fontWeight:600}}>{t.department}</strong><small style={{display:"block",fontSize:9,color:"var(--muted)",marginTop:4}}>{t.designation}</small></td><td><div className="pill-row">{t.subjects.length? t.subjects.map(s=><span className="chip" key={s}>{s}</span>):<span className="status status-warning">No assignments</span>}</div></td><td><StatusPill tone={t.status === "Active"?"success":"neutral"}>{t.status}</StatusPill></td><td><div style={{display:"flex",alignItems:"center",gap:8}}><button className="mini-link" onClick={()=>setToast(`${t.name} · ${t.email} · ${t.subjects.length} assigned subject(s). Use Classes & subjects to manage allocation.`)}>View details <X size={12} style={{transform:"rotate(45deg)"}}/></button><button type="button" className="icon-button" style={{color:"#ef4444",background:"rgba(239, 68, 68, 0.08)",border:"1px solid rgba(239, 68, 68, 0.2)",padding:"5px 8px",borderRadius:"8px",cursor:"pointer",transition:"all 0.15s ease"}} onClick={()=>setDeleteTarget(t)} title={`Remove account of ${t.name}`} aria-label={`Remove account of ${t.name}`}><Trash2 size={13}/></button></div></td></tr>)}</tbody></table></div>
      {filtered.length===0&&<div className="empty-state"><div className="empty-icon"><Search size={24}/></div><h3>No faculty found</h3><p>Change the search term or department filter.</p></div>}
    </Card>
    <div className="content-grid" style={{marginTop:18}}><Card title="Faculty setup checklist" subtitle="Recommended onboarding steps"><div className="list-stack"><div className="list-row"><span className="status status-success">01</span><div className="list-row-main"><strong>Create the faculty account</strong><p>Register official email, employee ID and department.</p></div><StatusPill tone="success">Ready</StatusPill></div><div className="list-row"><span className="status status-info">02</span><div className="list-row-main"><strong>Assign subjects and classes</strong><p>Connect each teacher to a class subject offering.</p></div><Link href="/admin/academics" className="mini-link">Open <span>→</span></Link></div><div className="list-row"><span className="status status-info">03</span><div className="list-row-main"><strong>Set office hours</strong><p>Publish availability for student meeting requests.</p></div><StatusPill>Upcoming</StatusPill></div></div></Card><Card title="Faculty contact" subtitle="A healthy staff directory keeps communication simple"><div className="notice notice-info"><Mail size={17}/><div><strong>Official email addresses</strong>Use the institutional email as the account identity. Personal contact information should only be collected when required by college policy.</div></div></Card></div>
    {modalOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModalOpen(false)}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="teacher-modal-title"><div className="modal-header"><div><h2 id="teacher-modal-title">Create teacher profile</h2><p>Register a faculty member, then allocate their teaching assignments.</p></div><button className="icon-button" onClick={()=>setModalOpen(false)} aria-label="Close"><X size={19}/></button></div><form className="stack" style={{gap:15}} onSubmit={submit}><div className="field-grid"><div className="field"><label>Full name *</label><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Prof. Aditi Sharma"/></div><div className="field"><label>Employee ID *</label><input required value={form.employeeId} onChange={e=>setForm({...form,employeeId:e.target.value.toUpperCase()})} placeholder="FAC-1102"/></div><div className="field"><label>Institutional email *</label><input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="faculty@college.edu"/></div><div className="field"><label>Department</label><select value={form.department} onChange={e=>setForm({...form,department:e.target.value})}><option>Computer Science and Engineering</option><option>Computer Engineering</option><option>EXTC</option><option>Information Technology</option></select></div><div className="field" style={{gridColumn:"1/-1"}}><label>Designation</label><select value={form.designation} onChange={e=>setForm({...form,designation:e.target.value})}><option>Assistant Professor</option><option>Associate Professor</option><option>Professor</option><option>Lecturer</option><option>Head of Department</option></select></div></div><div className="notice notice-info">Login setup and account status are controlled by the Auth Service; permissions are not inferred from a form field.</div><div className="button-row" style={{justifyContent:"flex-end"}}><Button type="button" variant="secondary" onClick={()=>setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving?"Creating…":"Create teacher"}</Button></div></form></div></div>}
    {deleteTarget&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDeleteTarget(null)}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-teacher-title" style={{maxWidth:480}}><div className="modal-header"><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,borderRadius:10,background:"rgba(239, 68, 68, 0.12)",color:"#ef4444",display:"flex",alignItems:"center",justifyContent:"center"}}><AlertTriangle size={20}/></div><div><h2 id="delete-teacher-title" style={{color:"#ef4444"}}>Remove teacher account</h2><p>This action is irreversible and requires administrator privilege.</p></div></div><button className="icon-button" onClick={()=>setDeleteTarget(null)} aria-label="Close dialog"><X size={19}/></button></div><div className="stack" style={{gap:16,padding:"4px 0"}}><p style={{fontSize:13,lineHeight:1.6,color:"var(--heading)"}}>Are you sure you want to permanently remove the account for <strong>{deleteTarget.name}</strong> ({deleteTarget.employeeId || deleteTarget.email})?</p><div className="notice" style={{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",color:"var(--heading)",fontSize:12}}>This will remove teacher profile records, reallocate or end teaching assignments, cancel scheduled meeting slots, and revoke system access.</div><div className="button-row" style={{justifyContent:"flex-end",marginTop:10}}><Button type="button" variant="secondary" onClick={()=>setDeleteTarget(null)} disabled={deleting}>Cancel</Button><button type="button" onClick={handleDelete} disabled={deleting} style={{background:"#ef4444",color:"#ffffff",border:"none",padding:"9px 18px",borderRadius:"10px",fontWeight:600,fontSize:"13px",cursor:deleting?"not-allowed":"pointer",opacity:deleting?0.7:1,display:"inline-flex",alignItems:"center",gap:8,boxShadow:"0 4px 12px rgba(239, 68, 68, 0.25)"}}><Trash2 size={15}/> {deleting ? "Removing…" : "Permanently remove account"}</button></div></div></div></div>}
    {toast&&<div className="toast"><UserRound size={17}/><span>{toast}</span><button className="icon-button" style={{color:"white",marginLeft:5}} onClick={()=>setToast("")} aria-label="Dismiss"><X size={15}/></button></div>}
  </>;
}
