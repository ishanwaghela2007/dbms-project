"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, Filter, Plus, Search, SlidersHorizontal, UserRoundCheck, Users, X } from "lucide-react";
import { Button, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import type { Student } from "@/types/erp";

const departmentByProgram = {
  "B.Tech Computer Engineering": "Computer Engineering",
  "B.Tech Computer Science and Engineering": "Computer Science and Engineering",
  "B.Tech EXTC": "EXTC",
} as const;

export default function StudentsPage() {
  const [rows, setRows] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [program, setProgram] = useState("All programs");
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [form, setForm] = useState({ name: "", rollNo: "", email: "", program: "B.Tech Computer Science and Engineering", semester: "Semester 3", division: "A" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    erpApi.listStudents().then(data => { if (active) setRows(data); }).catch(error => { if (active) setToast(error instanceof Error ? error.message : "Could not load students from the API."); });
    return () => { active = false; };
  }, []);
  const filtered = useMemo(() => rows.filter(s => {
    const matchesQuery = `${s.name} ${s.rollNo} ${s.email}`.toLowerCase().includes(query.toLowerCase());
    const matchesProgram = program === "All programs" || s.program === program;
    return matchesQuery && matchesProgram;
  }), [rows, query, program]);
  async function submitStudent(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const created = await erpApi.createStudent({ ...form, department: departmentByProgram[form.program as keyof typeof departmentByProgram], attendance: 100 });
      setRows(prev => [created, ...prev]); setModalOpen(false); setToast("Student profile created successfully.");
      setForm({ name: "", rollNo: "", email: "", program: "B.Tech Computer Science and Engineering", semester: "Semester 3", division: "A" });
    } catch (error) { setToast(error instanceof Error ? error.message : "Could not create student."); }
    finally { setSaving(false); }
  }
  return <>
    <PageHeading eyebrow="PEOPLE DIRECTORY" title="Students" description="Manage student profiles, enrollment details and account status." actions={<><Button variant="secondary" onClick={() => setToast("Export will be wired to the backend report endpoint.")}><Download size={15}/> Export</Button><Button onClick={() => setModalOpen(true)}><Plus size={16}/> Add student</Button></>} />
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-icon stat-icon-blue"><Users size={20}/></div><div className="stat-value">{rows.length.toLocaleString()}</div><div className="stat-label">Total enrolled students</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-green"><UserRoundCheck size={20}/></div><div className="stat-value">{rows.filter(s=>s.status === "Active").length}</div><div className="stat-label">Active students</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-violet"><Users size={20}/></div><div className="stat-value">{new Set(rows.map(s => s.department).filter(Boolean)).size || 1}</div><div className="stat-label">Academic departments</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-amber"><Filter size={20}/></div><div className="stat-value">{rows.filter(s=>s.attendance < 75).length}</div><div className="stat-label">Below 75% attendance</div></div>
    </div>
    <div className="card">
      <div className="card-header"><div><h2>All students</h2><p>Search records and open a student profile to view academic details.</p></div><span className="status status-neutral">{filtered.length} records</span></div>
      <div className="toolbar">
        <label className="input-wrap" style={{flex:"1 1 250px",maxWidth:420}}><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, roll number or email" /></label>
        <label className="input-wrap"><SlidersHorizontal size={15}/><select value={program} onChange={e=>setProgram(e.target.value)} style={{border:0,outline:0,background:"transparent",color:"#727991",fontSize:11,minWidth:130}}><option>All programs</option><option>B.Tech Computer Engineering</option><option>B.Tech Computer Science and Engineering</option><option>B.Tech EXTC</option></select></label>
        <Button variant="secondary" size="sm" onClick={()=>{setQuery("");setProgram("All programs");}}><X size={14}/> Clear filters</Button>
      </div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Student</th><th>Enrollment</th><th>Program / division</th><th>Semester</th><th>Attendance</th><th>Account</th></tr></thead><tbody>{filtered.map((s,i)=><tr key={s.id}><td><div className="table-name"><div className={`avatar ${["avatar-blue","avatar-green","avatar-violet","avatar-amber","avatar-rose"][i%5]}`}>{s.name.split(" ").map(x=>x[0]).join("")}</div><div><strong>{s.name}</strong><small>{s.email}</small></div></div></td><td><strong style={{color:"#4c536a"}}>{s.rollNo}</strong></td><td>{s.program} · {s.division}</td><td>{s.semester}</td><td><div style={{display:"flex",alignItems:"center",gap:8,minWidth:115}}><div className="progress-track" style={{width:63}}><div className={`progress-fill ${s.attendance<65?"progress-fill-red":s.attendance<75?"progress-fill-amber":"progress-fill-green"}`} style={{width:`${s.attendance}%`}}/></div><span style={{fontSize:10,color:s.attendance<75?"#b77a22":"#656c82"}}>{s.attendance}%</span></div></td><td><StatusPill tone={s.status === "Active" ? "success" : "neutral"}>{s.status}</StatusPill></td></tr>)}</tbody></table></div>
      {filtered.length===0 && <div className="empty-state"><div className="empty-icon"><Search size={24}/></div><h3>No matching students</h3><p>Try another search term or clear the selected filters.</p></div>}
      <div className="section-title-row"><p>Showing {filtered.length} of {rows.length} records</p><span className="helper-text">Live API records</span></div>
    </div>
    {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setModalOpen(false);}}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-student-title"><div className="modal-header"><div><h2 id="add-student-title">Create student profile</h2><p>Add the student&apos;s basic and academic details.</p></div><button className="icon-button" onClick={()=>setModalOpen(false)} aria-label="Close modal"><X size={19}/></button></div><form onSubmit={submitStudent} className="stack" style={{gap:15}}><div className="field-grid"><div className="field"><label>Full name *</label><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Riya Sharma"/></div><div className="field"><label>Enrollment number *</label><input required value={form.rollNo} onChange={e=>setForm({...form,rollNo:e.target.value.toUpperCase()})} placeholder="e.g. CSE2409"/></div><div className="field"><label>College email *</label><input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="student@college.edu"/></div><div className="field"><label>Program *</label><select value={form.program} onChange={e=>setForm({...form,program:e.target.value})}><option>B.Tech Computer Engineering</option><option>B.Tech Computer Science and Engineering</option><option>B.Tech EXTC</option></select></div><div className="field"><label>Semester</label><select value={form.semester} onChange={e=>setForm({...form,semester:e.target.value})}>{[1,2,3,4,5,6,7,8].map(n=><option key={n}>Semester {n}</option>)}</select></div><div className="field"><label>Division</label><select value={form.division} onChange={e=>setForm({...form,division:e.target.value})}><option>A</option><option>B</option><option>C</option></select></div></div><div className="notice notice-info">A user account will be provisioned by the Auth Service in backend mode. The admin should never set a student&apos;s password directly in this form.</div><div className="button-row" style={{justifyContent:"flex-end"}}><Button type="button" variant="secondary" onClick={()=>setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving?"Creating…":"Create student"}</Button></div></form></div></div>}
    {toast && <div className="toast"><UserRoundCheck size={17}/><span>{toast}</span><button className="icon-button" onClick={()=>setToast("")} aria-label="Dismiss toast" style={{color:"white",marginLeft:5}}><X size={15}/></button></div>}
  </>;
}
