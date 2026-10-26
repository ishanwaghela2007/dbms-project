"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, CalendarDays, Check, CirclePlus, GraduationCap, Layers, Plus, Search, UsersRound } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { apiRequest } from "@/lib/api/client";
import type { Teacher } from "@/types/erp";

type Assignment = {
  id: string;
  teacher: string;
  subject: string;
  className: string;
  semester: string;
  year: string;
  status: "Active" | "Needs review";
};

type Subject = {
  code: string;
  name: string;
};

// 1. Branches / Academic Programs at SPIT
export const branches = [
  { id: "CSE", code: "BTECH-CSE", name: "Computer Science and Engineering", short: "CSE" },
  { id: "CE", code: "BTECH-CE", name: "Computer Engineering", short: "COMPS" },
  { id: "EXTC", code: "BTECH-EXTC", name: "Electronics and Telecommunication Engineering", short: "EXTC" },
  { id: "IT", code: "BTECH-IT", name: "Information Technology", short: "IT" },
] as const;

export type BranchId = (typeof branches)[number]["id"];

// 2. Academic Years of Study and corresponding Semesters
export const yearLevels = [
  { id: "FY", label: "First Year (FY)", yearNumber: 1, semesters: ["Semester 1", "Semester 2"] },
  { id: "SY", label: "Second Year (SY)", yearNumber: 2, semesters: ["Semester 3", "Semester 4"] },
  { id: "TY", label: "Third Year (TY)", yearNumber: 3, semesters: ["Semester 5", "Semester 6"] },
  { id: "Final Year", label: "Final Year (B.Tech)", yearNumber: 4, semesters: ["Semester 7", "Semester 8"] },
] as const;

export type YearId = (typeof yearLevels)[number]["id"];

// 3. Official SPIT Mumbai Curriculum for all 8 Semesters
export const curriculumByBranch: Record<BranchId, Record<string, Subject[]>> = {
  CSE: {
    "Semester 1": [
      { code: "MA101", name: "Engineering Calculus" },
      { code: "EC103", name: "Basic Electrical & Electronics Engineering" },
      { code: "AS101", name: "Engineering Physics" },
      { code: "AS102", name: "Industrial Chemistry" },
      { code: "AS103", name: "Engineering Mechanics" },
      { code: "AS104", name: "Computer Aided Engineering Drawing" },
      { code: "OE101", name: "Introduction of Microeconomics" },
      { code: "OE102", name: "Foundations of Law for Engineers" },
      { code: "AS113", name: "Design Thinking / Engineering Exploration" },
      { code: "CECS101", name: "Imperative Programming Lab" },
      { code: "AS115", name: "Professional Communication" },
      { code: "LLC101", name: "Art of Living / Leadership for Youth" },
    ],
    "Semester 2": [
      { code: "MA201", name: "Differential Equations and Complex Analysis" },
      { code: "EC203", name: "Digital Systems and Microprocessors" },
      { code: "AS208", name: "Signals & Systems (for CSE/CE)" },
      { code: "OE201", name: "Open Elective HSSM-II" },
      { code: "AS213", name: "Engineering Exploration" },
      { code: "CECS201", name: "Object Oriented Programming Lab" },
      { code: "AS215", name: "Corporate Communication" },
      { code: "LLC201", name: "Leadership for Youth / Harmony with Nature" },
    ],
    "Semester 3": [
      { code: "MA301", name: "Linear Algebra" },
      { code: "MA302", name: "Foundation of Mathematics-I (Lateral Entry)" },
      { code: "CECS301", name: "Discrete Structures and Graph Theory" },
      { code: "CECS302", name: "Database Management Systems" },
      { code: "CECS303", name: "Computer Architecture and Organization" },
      { code: "CECS304", name: "Data Structures" },
      { code: "CECS306", name: "Data Science Lab" },
      { code: "OE311", name: "Fundamental of Internet of Things" },
      { code: "OE312", name: "Digital Signal Processing" },
      { code: "OE315", name: "Fundamentals of NNFL" },
    ],
    "Semester 4": [
      { code: "MA402", name: "Probability and Statistics" },
      { code: "CECS402", name: "Computer Communications and Networks" },
      { code: "CECS403", name: "Operating Systems" },
      { code: "CECS404", name: "Software Engineering" },
      { code: "CECS405", name: "Design and Analysis of Algorithms" },
      { code: "CECS407", name: "Real-life Problem Solving in AI (Capstone Project)" },
      { code: "AS401", name: "Constitution of India" },
      { code: "OE411", name: "Embedded C and Micro Python for IoT" },
      { code: "OE415", name: "Machine Learning" },
    ],
    "Semester 5": [
      { code: "CECS501", name: "Theory of Computation" },
      { code: "CS502", name: "Distributed and Cloud Computing" },
      { code: "CS503", name: "Soft Computing" },
      { code: "CS504", name: "Information and Network Security" },
      { code: "OE515", name: "Deep Learning" },
      { code: "OE513", name: "Cloud Computing" },
      { code: "CS5PRI", name: "Mini Project I" },
    ],
    "Semester 6": [
      { code: "CS601", name: "Advanced System Design" },
      { code: "CS602", name: "Human Machine Interaction" },
      { code: "CS604", name: "Applied Machine Learning and Deep Learning" },
      { code: "CS611", name: "Digital Forensics (PE-I)" },
      { code: "CS621", name: "Natural Language Processing (PE-I)" },
      { code: "CS631", name: "Big Data Analytics (PE-I)" },
      { code: "CS641", name: "Digital Signal and Image Processing (PE-I)" },
      { code: "CS612", name: "Cyber Threat Intelligence (PE-II)" },
      { code: "CS622", name: "Generative AI (PE-II)" },
      { code: "CS632", name: "AI for Healthcare Analytics (PE-II)" },
      { code: "CS642", name: "Augmented Reality and Virtual Reality (PE-II)" },
      { code: "OE615", name: "Generative AI and Application" },
      { code: "CS6PRII", name: "Mini Project II" },
    ],
    "Semester 7": [
      { code: "CS713", name: "Blockchain Technology (PE-III)" },
      { code: "CS723", name: "Agentic AI (PE-III)" },
      { code: "CS733", name: "Data Warehousing and Mining & BI (PE-III)" },
      { code: "CS743", name: "Speech and Audio Processing (PE-III)" },
      { code: "CS753", name: "AI-Driven User Experience Engineering (PE-III)" },
      { code: "CS714", name: "Quantum Computing (PE-IV)" },
      { code: "CS724", name: "Explainable AI (PE-IV)" },
      { code: "CS734", name: "MLOps Analytics (PE-IV)" },
      { code: "CS744", name: "Autonomous Vision System (PE-IV)" },
      { code: "OE701", name: "Quantum Materials" },
      { code: "OE708", name: "Drone Technology" },
      { code: "CS7PR", name: "Main Project Stage I" },
    ],
    "Semester 8": [
      { code: "CS813", name: "Advanced Blockchain Systems (PE-III)" },
      { code: "CS823", name: "Advanced Agentic AI (PE-III)" },
      { code: "CS833", name: "Advanced Business Intelligence (PE-III)" },
      { code: "CS814", name: "Advanced Quantum Computing (PE-IV)" },
      { code: "CS824", name: "Advanced Explainable AI (PE-IV)" },
      { code: "CS834", name: "MLOps Analytics Stage II (PE-IV)" },
      { code: "OE811", name: "Quantum Computing" },
      { code: "OE815", name: "Finance Management" },
      { code: "OE818", name: "Entrepreneurship and IPR" },
      { code: "INT8R", name: "Research / Industry Internship" },
      { code: "CS8PR", name: "Main Project Stage II" },
    ],
  },

  CE: {
    "Semester 1": [
      { code: "MA101", name: "Engineering Calculus" },
      { code: "EC103", name: "Basic Electrical & Electronics Engineering" },
      { code: "AS101", name: "Engineering Physics" },
      { code: "AS102", name: "Industrial Chemistry" },
      { code: "AS104", name: "Computer Aided Engineering Drawing" },
      { code: "AS113", name: "Design Thinking / Engineering Exploration" },
      { code: "CECS101", name: "Problem Solving Using Imperative Programming Lab" },
      { code: "AS115", name: "Soft Skill I" },
    ],
    "Semester 2": [
      { code: "MA201", name: "Differential Equations and Complex Analysis" },
      { code: "EC203", name: "Digital Systems and Microprocessors" },
      { code: "AS208", name: "Signals & Systems" },
      { code: "CECS201", name: "Problem Solving Using Object Oriented Programming Lab" },
      { code: "AS215", name: "Corporate Communication" },
    ],
    "Semester 3": [
      { code: "MA301", name: "Discrete Structures and Graph Theory" },
      { code: "MA302", name: "Foundation of Mathematics-I (Lateral Entry)" },
      { code: "CECS302", name: "Database Management Systems" },
      { code: "CECS303", name: "Computer Organization and Architecture" },
      { code: "CECS304", name: "Data Structures" },
      { code: "CECS306", name: "Python Programming for Data Science" },
    ],
    "Semester 4": [
      { code: "MA402", name: "Statistical Methods in Computer Science" },
      { code: "CECS402", name: "Computer Communications and Networks" },
      { code: "CECS403", name: "Operating Systems" },
      { code: "CECS404", name: "Software Engineering" },
      { code: "CECS405", name: "Design and Analysis of Algorithms" },
      { code: "AS401", name: "Constitution of India" },
    ],
    "Semester 5": [
      { code: "CECS501", name: "Theory of Computation" },
      { code: "CS502", name: "Distributed Computing" },
      { code: "CS503", name: "Artificial Intelligence and Soft Computing" },
      { code: "CS504", name: "Cryptography and Network Security" },
      { code: "CS5PRI", name: "Mini Project I" },
    ],
    "Semester 6": [
      { code: "CS601", name: "System Programming and Compiler Construction" },
      { code: "CS602", name: "Machine Learning" },
      { code: "CS604", name: "Web Technology, Cloud and DevOps Lab" },
      { code: "CS621", name: "Natural Language Processing (PE-I)" },
      { code: "CS622", name: "Generative AI (PE-II)" },
      { code: "CS6PRII", name: "Main Project Stage I" },
    ],
    "Semester 7": [
      { code: "CS713", name: "Blockchain Technology" },
      { code: "CS723", name: "Deep Learning" },
      { code: "CS734", name: "Multidisciplinary Minor IV" },
      { code: "CS7PR", name: "Main Project Stage II" },
    ],
    "Semester 8": [
      { code: "CS813", name: "Advanced Computing Systems" },
      { code: "OE811", name: "Open Elective II" },
      { code: "INT8R", name: "Research / Industry Internship" },
    ],
  },

  EXTC: {
    "Semester 1": [
      { code: "MA101", name: "Engineering Calculus" },
      { code: "EC102", name: "Basic Electrical Engineering" },
      { code: "AS101", name: "Engineering Physics" },
      { code: "OE101", name: "Open Elective HSSM-I" },
      { code: "AS113", name: "Design Thinking / Engineering Exploration" },
      { code: "EC105", name: "Imperative Programming Lab" },
      { code: "AS115", name: "Professional Communication" },
      { code: "LLC101", name: "Art of Living / Leadership for Youth" },
    ],
    "Semester 2": [
      { code: "MA201", name: "Differential Equations and Complex Analysis" },
      { code: "EC201", name: "Digital Systems and Microprocessors" },
      { code: "AS202", name: "Industrial Chemistry" },
      { code: "OE201", name: "Open Elective HSSM-II" },
      { code: "AS213", name: "Engineering Exploration" },
      { code: "EC202", name: "Data Structure Lab" },
      { code: "AS215", name: "Corporate Communication" },
    ],
    "Semester 3": [
      { code: "MA301", name: "Linear Algebra" },
      { code: "MA302", name: "Foundation of Mathematics-I (Lateral Entry)" },
      { code: "EC301", name: "Electromagnetic Wave Engineering" },
      { code: "EC302", name: "Signal, Network and System" },
      { code: "EC303", name: "Electronic Devices and Circuits" },
      { code: "EC304", name: "Computer Organization & Architecture" },
      { code: "EC305", name: "Hardware Description Language Programming" },
      { code: "OE313", name: "Database Management Systems (Open Elective)" },
    ],
    "Semester 4": [
      { code: "MA401", name: "Probability and Stochastic Process" },
      { code: "EC401", name: "Digital Communication" },
      { code: "EC402", name: "Mixed Signal Integrated Circuit" },
      { code: "EC403", name: "Microcontroller" },
      { code: "EC404", name: "Control Systems" },
      { code: "EC405", name: "Real Life Problem Solving Using AI" },
      { code: "AS401", name: "Constitution of India" },
    ],
    "Semester 5": [
      { code: "EC501", name: "Digital Signal Processing" },
      { code: "EC502", name: "Mobile Wireless Communication" },
      { code: "EC503", name: "Computer Communication Networks" },
      { code: "EC504", name: "Power Electronics" },
      { code: "OE513", name: "Cloud Computing" },
      { code: "EC5PRI", name: "Mini Project I" },
    ],
    "Semester 6": [
      { code: "EC601", name: "Radiating Systems" },
      { code: "EC602", name: "Basics of VLSI" },
      { code: "EC603", name: "Optical Fiber Communication" },
      { code: "EC604", name: "Microwave Communication" },
      { code: "EC605", name: "Lab Related to Embedded Domain" },
      { code: "EC606", name: "Error Coding and Cryptography" },
      { code: "EC6PRII", name: "Mini Project II" },
    ],
    "Semester 7": [
      { code: "EC701", name: "Space Communication Technologies" },
      { code: "EC702", name: "Cyber Security and Digital Forensics" },
      { code: "EC703", name: "Wireless Networks" },
      { code: "EC704", name: "Remote Sensing and GIS" },
      { code: "EC705", name: "Telecom Network Management" },
      { code: "EC706", name: "Embedded Systems" },
      { code: "EC7PR", name: "Main Project Stage I" },
    ],
    "Semester 8": [
      { code: "EC801", name: "IoT Protocols & Applications" },
      { code: "EC802", name: "Advanced Signal Processing" },
      { code: "EC803", name: "Image and Video Processing" },
      { code: "EC807", name: "Analog CMOS VLSI Design" },
      { code: "EC808", name: "Mixed Signal VLSI Design" },
      { code: "INT8R", name: "Research / Industry Internship" },
      { code: "EC8PR", name: "Final Year Project Stage II" },
    ],
  },

  IT: {
    "Semester 1": [
      { code: "MA101", name: "Engineering Calculus" },
      { code: "EC103", name: "Basic Electrical & Electronics Engineering" },
      { code: "AS101", name: "Engineering Physics" },
      { code: "AS113", name: "Design Thinking / Engineering Exploration" },
      { code: "CECS101", name: "Imperative Programming Lab" },
      { code: "AS115", name: "Professional Communication" },
    ],
    "Semester 2": [
      { code: "MA201", name: "Differential Equations and Complex Analysis" },
      { code: "EC203", name: "Digital Systems and Microprocessors" },
      { code: "AS208", name: "Signals & Systems" },
      { code: "CECS201", name: "Object Oriented Programming Lab" },
      { code: "AS215", name: "Corporate Communication" },
    ],
    "Semester 3": [
      { code: "IT301", name: "Linear Algebra" },
      { code: "IT302", name: "Discrete Structures" },
      { code: "IT303", name: "Database Management Systems" },
      { code: "IT304", name: "Data Structures & Algorithms" },
      { code: "IT305", name: "Computer Architecture" },
    ],
    "Semester 4": [
      { code: "IT401", name: "Operating Systems" },
      { code: "IT402", name: "Computer Networks" },
      { code: "IT403", name: "Probability & Statistics" },
      { code: "IT404", name: "Software Engineering" },
      { code: "AS401", name: "Constitution of India" },
    ],
    "Semester 5": [
      { code: "IT501", name: "Web Technology & Full Stack" },
      { code: "IT502", name: "Cloud Computing & DevOps" },
      { code: "IT503", name: "Information Security" },
      { code: "IT5PRI", name: "Mini Project I" },
    ],
    "Semester 6": [
      { code: "IT601", name: "Machine Learning" },
      { code: "IT602", name: "Big Data Analytics" },
      { code: "IT603", name: "Artificial Intelligence" },
      { code: "IT6PRII", name: "Mini Project II" },
    ],
    "Semester 7": [
      { code: "IT701", name: "Cyber Security & Forensics" },
      { code: "IT702", name: "Deep Learning" },
      { code: "IT7PR", name: "Main Project Stage I" },
    ],
    "Semester 8": [
      { code: "IT801", name: "Distributed Systems" },
      { code: "INT8R", name: "Research / Industry Internship" },
      { code: "IT8PR", name: "Final Year Project Stage II" },
    ],
  },
};

export default function AcademicsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teachersList, setTeachersList] = useState<Teacher[]>([]);
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState("All branches");
  const [filterYear, setFilterYear] = useState("All years");

  // Form State
  const [teacher, setTeacher] = useState("");
  const [branch, setBranch] = useState<BranchId>("CSE");
  const [yearLevel, setYearLevel] = useState<YearId>("SY");
  const [semester, setSemester] = useState<string>("Semester 3");
  const [division, setDivision] = useState<string>("A");
  const [subject, setSubject] = useState<string>("Linear Algebra");
  const [academicYear, setAcademicYear] = useState<string>("2026–27");

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch live assignments and faculty members
  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<Assignment[]>("/admin/teaching-assignments"),
      apiRequest<Teacher[]>("/admin/teachers"),
    ])
      .then(([liveAssignments, liveTeachers]) => {
        if (!active) return;
        if (liveAssignments) {
          setAssignments(liveAssignments);
        }
        if (liveTeachers && liveTeachers.length > 0) {
          setTeachersList(liveTeachers);
          setTeacher(liveTeachers[0].name);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // 1. Available Semesters: STRICTLY filtered to the selected Year of Study
  const currentYearConfig = useMemo(() => {
    return yearLevels.find((y) => y.id === yearLevel) || yearLevels[1];
  }, [yearLevel]);

  const availableSemesters = currentYearConfig.semesters;

  // 2. Available Subjects: STRICTLY filtered to selected Branch AND selected Semester
  const availableSubjects = useMemo(() => {
    const branchCurriculum = curriculumByBranch[branch] || curriculumByBranch.CSE;
    return branchCurriculum[semester] || branchCurriculum["Semester 3"] || [];
  }, [branch, semester]);

  // 3. Computed Class Name string for the backend (e.g. "SY B.Tech Computer Science and Engineering · A")
  const selectedBranchConfig = useMemo(() => {
    return branches.find((b) => b.id === branch) || branches[0];
  }, [branch]);

  const computedClassName = useMemo(() => {
    return `${yearLevel} B.Tech ${selectedBranchConfig.name} · ${division}`;
  }, [yearLevel, selectedBranchConfig, division]);

  // Handlers for dynamic synchronized cascade
  function handleBranchChange(newBranch: BranchId) {
    setBranch(newBranch);
    const branchCurriculum = curriculumByBranch[newBranch] || curriculumByBranch.CSE;
    const subs = branchCurriculum[semester] || [];
    if (subs.length > 0) {
      setSubject(subs[0].name);
    }
  }

  function handleYearChange(newYear: YearId) {
    setYearLevel(newYear);
    const yearConfig = yearLevels.find((y) => y.id === newYear) || yearLevels[0];
    const newSem = yearConfig.semesters[0];
    setSemester(newSem);

    const branchCurriculum = curriculumByBranch[branch] || curriculumByBranch.CSE;
    const subs = branchCurriculum[newSem] || [];
    if (subs.length > 0) {
      setSubject(subs[0].name);
    }
  }

  function handleSemesterChange(newSem: string) {
    setSemester(newSem);
    // Auto-match corresponding year level if user picks from global list
    const parentYear = yearLevels.find((y) => (y.semesters as readonly string[]).includes(newSem));
    if (parentYear && parentYear.id !== yearLevel) {
      setYearLevel(parentYear.id);
    }

    const branchCurriculum = curriculumByBranch[branch] || curriculumByBranch.CSE;
    const subs = branchCurriculum[newSem] || [];
    if (subs.length > 0) {
      setSubject(subs[0].name);
    }
  }

  const filtered = assignments.filter((a) => {
    const matchesSearch = `${a.teacher} ${a.subject} ${a.className} ${a.semester}`.toLowerCase().includes(search.toLowerCase());
    
    let matchesBranch = true;
    if (filterBranch !== "All branches") {
      const bObj = branches.find((b) => b.id === filterBranch);
      matchesBranch =
        a.className.toLowerCase().includes(filterBranch.toLowerCase()) ||
        (bObj ? a.className.toLowerCase().includes(bObj.name.toLowerCase()) : false);
    }

    let matchesYear = true;
    if (filterYear !== "All years") {
      const yObj = yearLevels.find((y) => y.id === filterYear);
      matchesYear =
        a.className.startsWith(filterYear) ||
        (yObj ? (yObj.semesters as readonly string[]).includes(a.semester) : false);
    }

    return matchesSearch && matchesBranch && matchesYear;
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      teacher,
      subject,
      className: computedClassName,
      semester,
      year: academicYear,
    };

    try {
      const result = await apiRequest<Assignment>("/admin/teaching-assignments", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const newAssignment: Assignment = {
        id: result?.id || `a-${Date.now()}`,
        teacher,
        subject,
        className: computedClassName,
        semester,
        year: academicYear,
        status: "Active",
      };

      setAssignments([newAssignment, ...assignments]);
      setMessage(`Teaching assignment successfully saved for ${computedClassName} (${subject}).`);
    } catch (err) {
      // Fallback local update
      const newAssignment: Assignment = {
        id: `a-${Date.now()}`,
        teacher,
        subject,
        className: computedClassName,
        semester,
        year: academicYear,
        status: "Active",
      };
      setAssignments([newAssignment, ...assignments]);
      setMessage(err instanceof Error ? err.message : "Assignment recorded.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading
        eyebrow="ACADEMIC CONFIGURATION · SPIT MUMBAI"
        title="Classes & subjects"
        description="Filter by branch, year of study, and semester to allocate faculty to exact course offerings."
        actions={
          <Button variant="secondary" onClick={() => setMessage("Academic year 2026–27 active.")}>
            <CalendarDays size={15} /> Academic year: 2026–27
          </Button>
        }
      />

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon-blue"><BookOpen size={20} /></div>
          <div className="stat-value">{availableSubjects.length}</div>
          <div className="stat-label">Subjects in {semester} ({branch})</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-green"><UsersRound size={20} /></div>
          <div className="stat-value">{assignments.filter((a) => a.status === "Active").length}</div>
          <div className="stat-label">Active teaching assignments</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-amber"><Layers size={20} /></div>
          <div className="stat-value">8</div>
          <div className="stat-label">Semesters configured</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-violet"><GraduationCap size={20} /></div>
          <div className="stat-value">{branches.length}</div>
          <div className="stat-label">Engineering branches</div>
        </div>
      </div>

      <div className="page-two-col">
        <Card
          title="Assign a subject"
          subtitle="Select branch, year, semester and subject to assign an authorized faculty member."
        >
          <form onSubmit={submit} className="stack" style={{ gap: 15 }}>
            <div className="field">
              <label>Teacher *</label>
              {teachersList.length > 0 ? (
                <select required value={teacher} onChange={(e) => setTeacher(e.target.value)}>
                  {teachersList.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} · {t.department}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  value={teacher}
                  onChange={(e) => setTeacher(e.target.value)}
                  placeholder="Enter teacher name (e.g. Prof. Faculty Name)"
                />
              )}
            </div>

            <div className="field-grid">
              <div className="field">
                <label>Branch / Engineering department *</label>
                <select value={branch} onChange={(e) => handleBranchChange(e.target.value as BranchId)}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.short} · {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Year of study *</label>
                <select value={yearLevel} onChange={(e) => handleYearChange(e.target.value as YearId)}>
                  {yearLevels.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field-grid">
              <div className="field">
                <label>Semester (Only {yearLevel}) *</label>
                <select value={semester} onChange={(e) => handleSemesterChange(e.target.value)}>
                  {availableSemesters.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <span className="field-hint">Showing only semesters belonging to {yearLevel}</span>
              </div>

              <div className="field">
                <label>Class division *</label>
                <select value={division} onChange={(e) => setDivision(e.target.value)}>
                  <option value="A">Division A</option>
                  <option value="B">Division B</option>
                  <option value="C">Division C</option>
                </select>
                <span className="field-hint">Generates: {computedClassName}</span>
              </div>
            </div>

            <div className="field">
              <label>Subject offering ({branch} · {semester}) *</label>
              <select required value={subject} onChange={(e) => setSubject(e.target.value)}>
                {availableSubjects.map(({ code, name }) => (
                  <option key={code} value={name}>
                    {code} · {name}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                {availableSubjects.length} subjects found for {selectedBranchConfig.name} in {semester}.
              </span>
            </div>

            <div className="field-grid">
              <div className="field">
                <label>Target class offering preview</label>
                <input value={computedClassName} readOnly style={{ fontWeight: 600, color: "var(--heading)" }} />
              </div>
              <div className="field">
                <label>Academic year</label>
                <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                  <option>2026–27</option>
                  <option>2025–26</option>
                  <option>2027–28</option>
                </select>
              </div>
            </div>

            <div className="notice notice-info">
              <Check size={16} />
              <div>
                <strong>Curriculum &amp; Attendance Guard</strong>
                Assigning this subject links the teacher directly to the attendance register and marks portal for this class.
              </div>
            </div>

            <Button type="submit" disabled={saving}>
              <Plus size={15} /> {saving ? "Assigning…" : "Assign subject"}
            </Button>
          </form>

          {message && <div className="notice notice-success" style={{ marginTop: 14 }}>{message}</div>}
        </Card>

        <div className="stack">
          <Card title="Curriculum & Section Rules" subtitle="SPIT Mumbai Academic Structure">
            <div className="list-stack">
              <div className="simple-list-item">
                <div className="stat-icon stat-icon-blue" style={{ width: 32, height: 32, margin: 0 }}>
                  <UsersRound size={16} />
                </div>
                <div>
                  <strong>Branch &amp; Year Hierarchy</strong>
                  <p>Each branch has a tailored curriculum. Changing year filters the exact two active semesters.</p>
                </div>
              </div>
              <div className="simple-list-item">
                <div className="stat-icon stat-icon-violet" style={{ width: 32, height: 32, margin: 0 }}>
                  <BookOpen size={16} />
                </div>
                <div>
                  <strong>Exact Subject Alignment</strong>
                  <p>Only courses belonging to the selected branch and semester appear in the subject list.</p>
                </div>
              </div>
              <div className="simple-list-item">
                <div className="stat-icon stat-icon-green" style={{ width: 32, height: 32, margin: 0 }}>
                  <Check size={16} />
                </div>
                <div>
                  <strong>Academic Continuity</strong>
                  <p>Unique database constraints prevent duplicate active allocations for the same class and subject.</p>
                </div>
              </div>
            </div>
          </Card>

          <div className="callout">
            <div className="callout-icon">
              <CalendarDays size={18} />
            </div>
            <div>
              <h3>Semester-to-Year Mapping</h3>
              <p>
                • <strong>FY</strong>: Semesters 1 &amp; 2<br />
                • <strong>SY</strong>: Semesters 3 &amp; 4<br />
                • <strong>TY</strong>: Semesters 5 &amp; 6<br />
                • <strong>Final Year</strong>: Semesters 7 &amp; 8
              </p>
            </div>
          </div>
        </div>
      </div>

      <Card
        title="Current teaching assignments"
        subtitle="Filter by teacher, class, semester or subject."
        action={<span className="status status-neutral">{filtered.length} rows</span>}
      >
        <div className="toolbar">
          <label className="input-wrap" style={{ maxWidth: 360, flex: "1 1 220px" }}>
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assignments..." />
          </label>
          <label className="input-wrap">
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              style={{ border: 0, outline: 0, background: "transparent", color: "var(--heading)", fontSize: 11, minWidth: 120 }}
            >
              <option>All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.short} · {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="input-wrap">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              style={{ border: 0, outline: 0, background: "transparent", color: "var(--heading)", fontSize: 11, minWidth: 100 }}
            >
              <option>All years</option>
              {yearLevels.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch("");
              setFilterBranch("All branches");
              setFilterYear("All years");
            }}
          >
            Clear filters
          </Button>
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
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong style={{ color: "var(--heading)" }}>{a.subject}</strong>
                  </td>
                  <td>{a.teacher}</td>
                  <td>{a.className}</td>
                  <td>{a.semester}</td>
                  <td>{a.year}</td>
                  <td>
                    <StatusPill tone={a.status === "Active" ? "success" : "warning"}>{a.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
