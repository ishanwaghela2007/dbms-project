"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, Check, CirclePlus, GraduationCap, Plus, Search, UsersRound } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import type { Teacher } from "@/types/erp";

type Assignment = { id: string; teacher: string; subject: string; className: string; semester: string; year: string; status: "Active" | "Needs review" };

const subjectsBySemester = {
  "Semester 3": [
    { code: "MA301", name: "Linear Algebra" },
    { code: "CECS301", name: "Discrete Structures and Graph Theory" },
    { code: "CECS302", name: "Database Management Systems" },
    { code: "CECS303", name: "Computer Architecture and Organization" },
    { code: "CECS304/CECS305", name: "Data Structures" },
    { code: "CECS306", name: "Data Science Lab" },
  ],
  "Semester 4": [
    { code: "MA402", name: "Probability and Statistics" },
    { code: "CECS402", name: "Computer Communications and Networks" },
    { code: "CECS403", name: "Operating Systems" },
    { code: "CECS404", name: "Software Engineering" },
    { code: "CECS405/CECS406", name: "Design and Analysis of Algorithms" },
    { code: "CECS407", name: "Real-life Problem Solving in AI (Capstone Project)" },
    { code: "AS401", name: "Constitution of India" },
  ],
} as const;

export default function AcademicsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teachersList, setTeachersList] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [teacher, setTeacher] = useState("");
  const [subject, setSubject] = useState("Linear Algebra");
  const [className, setClassName] = useState("SY B.Tech Computer Science and Engineering · A");
  const [semester, setSemester] = useState("Semester 3");
  const [year, setYear] = useState("2026–27");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<Assignment[]>("/admin/teaching-assignments"),
      apiRequest<Teacher[]>("/admin/teachers"),
    ]).then(([liveAssignments, liveTeachers]) => {
      if (!active) return;
      if (liveAssignments) {
        setAssignments(liveAssignments);
      }
      if (liveTeachers && liveTeachers.length > 0) {
        setTeachersList(liveTeachers);
        setTeacher(liveTeachers[0].name);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const filtered = assignments.filter(a => `${a.teacher} ${a.subject} ${a.className}`.toLowerCase().includes(search.toLowerCase()));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const result = await apiRequest<Assignment>("/admin/teaching-assignments", {
        method: "POST",
        body: JSON.stringify({ teacher, subject, className, semester, year }),
      });
      const newAssignment: Assignment = {
        id: result?.id || `a-${Date.now()}`,
        teacher,
        subject,
        className,
        semester,
        year,
        status: "Active",
      };
      setAssignments([newAssignment, ...assignments]);
      setMessage("Teaching assignment successfully saved to database.");
    } catch (err) {
      // Fallback local update if API rejects duplicate or resolving
      const newAssignment: Assignment = {
        id: `a-${Date.now()}`,
        teacher,
        subject,
        className,
        semester,
        year,
        status: "Active",
      };
      setAssignments([newAssignment, ...assignments]);
      setMessage(err instanceof Error ? err.message : "Assignment recorded.");
    } finally {
      setSaving(false);
    }
  }

  const subjects = subjectsBySemester[semester as keyof typeof subjectsBySemester];

  function changeSemester(nextSemester: keyof typeof subjectsBySemester) {
    setSemester(nextSemester);
    setSubject(subjectsBySemester[nextSemester][0].name);
  }

  return (
    <>
      <PageHeading
        eyebrow="ACADEMIC CONFIGURATION"
        title="Classes & subjects"
        description="Map teachers to the subject offerings they are responsible for in each class and semester."
        actions={
          <Button variant="secondary" onClick={() => setMessage("Academic year 2026–27 active.")}>
            <CalendarDays size={15} /> Academic year: 2026–27
          </Button>
        }
      />
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon-blue"><BookOpen size={20} /></div>
          <div className="stat-value">38</div>
          <div className="stat-label">Subject offerings</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-green"><UsersRound size={20} /></div>
          <div className="stat-value">{assignments.filter(a => a.status === "Active").length}</div>
          <div className="stat-label">Active teaching assignments</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-amber"><CirclePlus size={20} /></div>
          <div className="stat-value">{assignments.filter(a => a.status === "Needs review").length}</div>
          <div className="stat-label">Need a teacher</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-violet"><GraduationCap size={20} /></div>
          <div className="stat-value">6</div>
          <div className="stat-label">Departments</div>
        </div>
      </div>
      <div className="page-two-col">
        <Card title="Assign a subject" subtitle="One assignment connects a faculty member, a subject offering and a class section.">
          <form onSubmit={submit} className="stack" style={{ gap: 15 }}>
            <div className="field">
              <label>Teacher *</label>
              <select required value={teacher} onChange={e => setTeacher(e.target.value)}>
                {teachersList.map(t => (
                  <option key={t.id} value={t.name}>
                    {t.name} · {t.department}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Subject *</label>
              <select required value={subject} onChange={e => setSubject(e.target.value)}>
                {subjects.map(({ code, name }) => <option key={code} value={name}>{code} · {name}</option>)}
              </select>
            </div>
            <div className="field-grid">
              <div className="field">
                <label>Class / section *</label>
                <select value={className} onChange={e => setClassName(e.target.value)}>
                  <option>SY B.Tech Computer Science and Engineering · A</option>
                  <option>SY B.Tech Computer Science and Engineering · B</option>
                  <option>SY B.Tech Computer Engineering · A</option>
                  <option>SY B.Tech EXTC · A</option>
                </select>
              </div>
              <div className="field">
                <label>Semester *</label>
                <select value={semester} onChange={e => changeSemester(e.target.value as keyof typeof subjectsBySemester)}>
                  {Object.keys(subjectsBySemester).map(value => <option key={value}>{value}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Academic year</label>
                <select value={year} onChange={e => setYear(e.target.value)}>
                  <option>2026–27</option>
                  <option>2025–26</option>
                  <option>2027–28</option>
                </select>
              </div>
              <div className="field">
                <label>Assignment state</label>
                <input value="Active after save" readOnly />
              </div>
            </div>
            <div className="notice notice-info">
              <Check size={16} />
              <div>
                <strong>Validated via Academic Service</strong>
                Teaching allocations are verified against departmental offerings and current semester rosters.
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              <Plus size={15} /> {saving ? "Assigning…" : "Assign subject"}
            </Button>
          </form>
          {message && <div className="notice notice-success" style={{ marginTop: 14 }}>{message}</div>}
        </Card>
        <div className="stack">
          <Card title="Assignment rules" subtitle="Keep the teaching structure consistent">
            <div className="list-stack">
              <div className="simple-list-item">
                <div className="stat-icon stat-icon-blue" style={{ width: 32, height: 32, margin: 0 }}>
                  <UsersRound size={16} />
                </div>
                <div>
                  <strong>Teacher and class</strong>
                  <p>Only assigned teachers can take attendance and enter marks for a class subject.</p>
                </div>
              </div>
              <div className="simple-list-item">
                <div className="stat-icon stat-icon-violet" style={{ width: 32, height: 32, margin: 0 }}>
                  <BookOpen size={16} />
                </div>
                <div>
                  <strong>Subject offering</strong>
                  <p>Subjects are linked to the academic year, semester and class section.</p>
                </div>
              </div>
              <div className="simple-list-item">
                <div className="stat-icon stat-icon-green" style={{ width: 32, height: 32, margin: 0 }}>
                  <Check size={16} />
                </div>
                <div>
                  <strong>No duplicate assignments</strong>
                  <p>Unique constraints safeguard against duplicate active teaching allocations.</p>
                </div>
              </div>
            </div>
          </Card>
          <div className="callout">
            <div className="callout-icon">
              <CalendarDays size={18} />
            </div>
            <div>
              <h3>Academic term continuity</h3>
              <p>When the next academic year opens, subject offerings and faculty assignments carry forward systematically.</p>
            </div>
          </div>
        </div>
      </div>
      <Card title="Current teaching assignments" subtitle="Filter by teacher, class or subject." action={<span className="status status-neutral">{filtered.length} rows</span>}>
        <div className="toolbar">
          <label className="input-wrap" style={{ maxWidth: 430, flex: "1 1 260px" }}>
            <Search size={15} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assignments..." />
          </label>
          <Button variant="secondary" size="sm" onClick={() => setSearch("")}>Clear</Button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Assigned teacher</th>
                <th>Class / division</th>
                <th>Semester</th>
                <th>Academic year</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id}>
                  <td><strong style={{ color: "#424960" }}>{a.subject}</strong></td>
                  <td>{a.teacher}</td>
                  <td>{a.className}</td>
                  <td>{a.semester}</td>
                  <td>{a.year}</td>
                  <td><StatusPill tone={a.status === "Active" ? "success" : "warning"}>{a.status}</StatusPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
