"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Download, Filter, Plus, Search, SlidersHorizontal, Trash2, UserRoundCheck, Users, X } from "lucide-react";
import { Button, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import type { Student } from "@/types/erp";

export const branches = [
  { id: "CSE", code: "BTECH-CSE", name: "Computer Science and Engineering", program: "B.Tech Computer Science and Engineering", department: "Computer Science and Engineering", short: "CSE" },
  { id: "CE", code: "BTECH-CE", name: "Computer Engineering", program: "B.Tech Computer Engineering", department: "Computer Engineering", short: "COMPS" },
  { id: "EXTC", code: "BTECH-EXTC", name: "Electronics and Telecommunication Engineering", program: "B.Tech Electronics and Telecommunication Engineering", department: "EXTC", short: "EXTC" },
  { id: "IT", code: "BTECH-IT", name: "Information Technology", program: "B.Tech Information Technology", department: "Information Technology", short: "IT" },
] as const;

export const yearLevels = [
  { id: "FY", label: "First Year (FY)", yearNumber: 1, semesters: ["Semester 1", "Semester 2"] },
  { id: "SY", label: "Second Year (SY)", yearNumber: 2, semesters: ["Semester 3", "Semester 4"] },
  { id: "TY", label: "Third Year (TY)", yearNumber: 3, semesters: ["Semester 5", "Semester 6"] },
  { id: "Final Year", label: "Final Year (B.Tech)", yearNumber: 4, semesters: ["Semester 7", "Semester 8"] },
] as const;

export default function StudentsPage() {
  const [rows, setRows] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("All branches");
  const [selectedYear, setSelectedYear] = useState("All years");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await erpApi.deleteStudent(deleteTarget.id);
      setRows(prev => prev.filter(s => s.id !== deleteTarget.id));
      setToast(`Student account for ${deleteTarget.name} removed permanently.`);
      setDeleteTarget(null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to remove student account.");
    } finally {
      setDeleting(false);
    }
  }

  const [form, setForm] = useState({
    name: "",
    rollNo: "",
    email: "",
    branch: "CSE",
    yearLevel: "SY",
    semester: "Semester 3",
    division: "A",
  });

  useEffect(() => {
    let active = true;
    erpApi.listStudents().then(data => { if (active) setRows(data); }).catch(error => { if (active) setToast(error instanceof Error ? error.message : "Could not load students from the API."); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => rows.filter(s => {
    const matchesQuery = `${s.name} ${s.rollNo} ${s.email}`.toLowerCase().includes(query.toLowerCase());
    const branchConf = branches.find(b => b.id === selectedBranch);
    const matchesBranch = selectedBranch === "All branches" || (branchConf != null && (
      Boolean(s.program && s.program.toLowerCase().includes(branchConf.name.toLowerCase())) ||
      Boolean(s.program && s.program.toLowerCase() === branchConf.program.toLowerCase()) ||
      Boolean(s.department && s.department.toLowerCase() === branchConf.department.toLowerCase()) ||
      Boolean(s.department && s.department.toLowerCase().includes(branchConf.name.toLowerCase())) ||
      Boolean(s.department && s.department.toLowerCase().includes(branchConf.short.toLowerCase()))
    ));
    
    let matchesYear = true;
    if (selectedYear !== "All years") {
      const yearConf = yearLevels.find(y => y.id === selectedYear);
      if (yearConf) {
        matchesYear = yearConf.semesters.some(sem => s.semester === sem || s.semester?.includes(sem.replace("Semester ", "Sem ")));
      }
    }
    return matchesQuery && matchesBranch && matchesYear;
  }), [rows, query, selectedBranch, selectedYear]);

  async function submitStudent(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      const branchConfig = branches.find(b => b.id === form.branch) || branches[0];
      const created = await erpApi.createStudent({
        name: form.name,
        rollNo: form.rollNo,
        email: form.email,
        program: branchConfig.program,
        department: branchConfig.department,
        semester: form.semester,
        division: form.division,
        attendance: 100,
      });
      setRows(prev => [created, ...prev]);
      setModalOpen(false);
      setToast("Student profile created successfully.");
      setForm({
        name: "",
        rollNo: "",
        email: "",
        branch: "CSE",
        yearLevel: "SY",
        semester: "Semester 3",
        division: "A",
      });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not create student.");
    } finally {
      setSaving(false);
    }
  }

  const activeYearConfig = useMemo(() => {
    return yearLevels.find(y => y.id === form.yearLevel) || yearLevels[1];
  }, [form.yearLevel]);

  return <>
    <PageHeading
      eyebrow="PEOPLE DIRECTORY"
      title="Students"
      description="Manage student profiles, branch allocations, enrollment details and account status."
      actions={
        <>
          <Button variant="secondary" onClick={() => setToast("Export will be wired to the backend report endpoint.")}>
            <Download size={15}/> Export
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16}/> Add student
          </Button>
        </>
      }
    />
    <div className="stat-grid">
      <div className="stat-card">
        <div className="stat-icon stat-icon-blue"><Users size={20}/></div>
        <div className="stat-value">{rows.length.toLocaleString()}</div>
        <div className="stat-label">Total enrolled students</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon stat-icon-green"><UserRoundCheck size={20}/></div>
        <div className="stat-value">{rows.filter(s=>s.status === "Active").length}</div>
        <div className="stat-label">Active students</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon stat-icon-violet"><Users size={20}/></div>
        <div className="stat-value">{new Set(rows.map(s => s.department).filter(Boolean)).size || branches.length}</div>
        <div className="stat-label">Academic departments</div>
      </div>
      <div className="stat-card">
        <div className="stat-icon stat-icon-amber"><Filter size={20}/></div>
        <div className="stat-value">{rows.filter(s=>s.attendance < 75).length}</div>
        <div className="stat-label">Below 75% attendance</div>
      </div>
    </div>
    <div className="card">
      <div className="card-header">
        <div>
          <h2>All students</h2>
          <p>Search records by branch, year, semester, or enrollment number.</p>
        </div>
        <span className="status status-neutral">{filtered.length} records</span>
      </div>
      <div className="toolbar">
        <label className="input-wrap" style={{flex:"1 1 250px",maxWidth:420}}>
          <Search size={16}/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, roll number or email" />
        </label>
        <label className="input-wrap">
          <SlidersHorizontal size={15}/>
          <select
            value={selectedBranch}
            onChange={e=>setSelectedBranch(e.target.value)}
            style={{border:0,outline:0,background:"transparent",color:"var(--heading)",fontSize:11,minWidth:130}}
          >
            <option>All branches</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.short} · {b.name}</option>
            ))}
          </select>
        </label>
        <label className="input-wrap">
          <select
            value={selectedYear}
            onChange={e=>setSelectedYear(e.target.value)}
            style={{border:0,outline:0,background:"transparent",color:"var(--heading)",fontSize:11,minWidth:110}}
          >
            <option>All years</option>
            {yearLevels.map(y => (
              <option key={y.id} value={y.id}>{y.label}</option>
            ))}
          </select>
        </label>
        <Button variant="secondary" size="sm" onClick={()=>{setQuery("");setSelectedBranch("All branches");setSelectedYear("All years");}}>
          <X size={14}/> Clear filters
        </Button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Enrollment</th>
              <th>Branch / Division</th>
              <th>Semester</th>
              <th>Attendance</th>
              <th>Account</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s,i)=><tr key={s.id}>
              <td>
                <div className="table-name">
                  <div className={`avatar ${["avatar-blue","avatar-green","avatar-violet","avatar-amber","avatar-rose"][i%5]}`}>
                    {s.name.split(" ").map(x=>x[0]).join("")}
                  </div>
                  <div>
                    <strong>{s.name}</strong>
                    <small>{s.email}</small>
                  </div>
                </div>
              </td>
              <td><strong style={{color:"var(--heading)"}}>{s.rollNo}</strong></td>
              <td>{s.program} · {s.division}</td>
              <td>{s.semester}</td>
              <td>
                <div style={{display:"flex",alignItems:"center",gap:8,minWidth:115}}>
                  <div className="progress-track" style={{width:63}}>
                    <div className={`progress-fill ${s.attendance<65?"progress-fill-red":s.attendance<75?"progress-fill-amber":"progress-fill-green"}`} style={{width:`${s.attendance}%`}}/>
                  </div>
                  <span style={{fontSize:10,color:s.attendance<75?"#b77a22":"var(--muted)"}}>{s.attendance}%</span>
                </div>
              </td>
              <td><StatusPill tone={s.status === "Active" ? "success" : "neutral"}>{s.status}</StatusPill></td>
              <td style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="icon-button"
                  style={{ color: "#ef4444", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", padding: "6px 8px", borderRadius: "8px", cursor: "pointer", transition: "all 0.15s ease" }}
                  onClick={() => setDeleteTarget(s)}
                  title={`Remove account of ${s.name}`}
                  aria-label={`Remove account of ${s.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {filtered.length===0 && (
        <div className="empty-state">
          <div className="empty-icon"><Search size={24}/></div>
          <h3>No matching students</h3>
          <p>Try another search term or clear the selected filters.</p>
        </div>
      )}
      <div className="section-title-row">
        <p>Showing {filtered.length} of {rows.length} records</p>
        <span className="helper-text">Live API records</span>
      </div>
    </div>

    {modalOpen && (
      <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setModalOpen(false);}}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-student-title">
          <div className="modal-header">
            <div>
              <h2 id="add-student-title">Create student profile</h2>
              <p>Add the student&apos;s basic details, branch, year and semester.</p>
            </div>
            <button className="icon-button" onClick={()=>setModalOpen(false)} aria-label="Close modal">
              <X size={19}/>
            </button>
          </div>
          <form onSubmit={submitStudent} className="stack" style={{gap:15}}>
            <div className="field-grid">
              <div className="field">
                <label>Full name *</label>
                <input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Riya Sharma"/>
              </div>
              <div className="field">
                <label>Enrollment number *</label>
                <input required value={form.rollNo} onChange={e=>setForm({...form,rollNo:e.target.value.toUpperCase()})} placeholder="e.g. CSE2409"/>
              </div>
              <div className="field" style={{gridColumn:"1/-1"}}>
                <label>College email *</label>
                <input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="student@college.edu"/>
              </div>

              <div className="field">
                <label>Branch / Engineering department *</label>
                <select value={form.branch} onChange={e=>setForm({...form,branch:e.target.value})}>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.short} · {b.name}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Year of study *</label>
                <select
                  value={form.yearLevel}
                  onChange={e => {
                    const yr = e.target.value;
                    const yConf = yearLevels.find(y => y.id === yr) || yearLevels[0];
                    setForm({ ...form, yearLevel: yr, semester: yConf.semesters[0] });
                  }}
                >
                  {yearLevels.map(y => (
                    <option key={y.id} value={y.id}>{y.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Semester (Only {form.yearLevel}) *</label>
                <select value={form.semester} onChange={e=>setForm({...form,semester:e.target.value})}>
                  {activeYearConfig.semesters.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <span className="field-hint">Showing only semesters belonging to {form.yearLevel}</span>
              </div>

              <div className="field">
                <label>Division *</label>
                <select value={form.division} onChange={e=>setForm({...form,division:e.target.value})}>
                  <option>A</option>
                  <option>B</option>
                  <option>C</option>
                </select>
              </div>
            </div>

            <div className="notice notice-info">
              A user account will be provisioned by the Auth Service in backend mode. The admin sets the verified academic branch, year and division.
            </div>

            <div className="button-row" style={{justifyContent:"flex-end"}}>
              <Button type="button" variant="secondary" onClick={()=>setModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving?"Creating…":"Create student"}</Button>
            </div>
          </form>
        </div>
      </div>
    )}

    {deleteTarget && (
      <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDeleteTarget(null);}}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="delete-student-title" style={{maxWidth:480}}>
          <div className="modal-header">
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:10,background:"rgba(239, 68, 68, 0.12)",color:"#ef4444",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <AlertTriangle size={20}/>
              </div>
              <div>
                <h2 id="delete-student-title" style={{color:"#ef4444"}}>Remove student account</h2>
                <p>This action is irreversible and requires administrator privilege.</p>
              </div>
            </div>
            <button className="icon-button" onClick={()=>setDeleteTarget(null)} aria-label="Close dialog">
              <X size={19}/>
            </button>
          </div>
          <div className="stack" style={{gap:16,padding:"4px 0"}}>
            <p style={{fontSize:13,lineHeight:1.6,color:"var(--heading)"}}>
              Are you sure you want to permanently delete the account for <strong>{deleteTarget.name}</strong> ({deleteTarget.rollNo || deleteTarget.email})?
            </p>
            <div className="notice" style={{background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.2)",color:"var(--heading)",fontSize:12}}>
              This will remove all associated student records, course enrollments, attendance history, marks entries, and auth credentials from the database.
            </div>
            <div className="button-row" style={{justifyContent:"flex-end",marginTop:10}}>
              <Button type="button" variant="secondary" onClick={()=>setDeleteTarget(null)} disabled={deleting}>
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  padding: "9px 18px",
                  borderRadius: "10px",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.25)"
                }}
              >
                <Trash2 size={15}/> {deleting ? "Removing…" : "Permanently remove account"}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {toast && (
      <div className="toast">
        <UserRoundCheck size={17}/>
        <span>{toast}</span>
        <button className="icon-button" onClick={()=>setToast("")} aria-label="Dismiss toast" style={{color:"white",marginLeft:5}}>
          <X size={15}/>
        </button>
      </div>
    )}
  </>;
}
