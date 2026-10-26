"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  GraduationCap,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users
} from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";

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

export default function AdminRegisterPage() {
  const [accountType, setAccountType] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [autoActivate, setAutoActivate] = useState(true);

  // Student specific academic state
  const [branch, setBranch] = useState("CSE");
  const [yearLevel, setYearLevel] = useState("SY");
  const [semester, setSemester] = useState("Semester 3");
  const [division, setDivision] = useState("A");

  // Faculty specific state
  const [teacherDepartment, setTeacherDepartment] = useState("Computer Science and Engineering");
  const [designation, setDesignation] = useState("Assistant Professor");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [registeredUser, setRegisteredUser] = useState<{
    fullName: string;
    email: string;
    accountType: string;
    identifier: string;
    academicInfo?: string;
    isActive: boolean;
    message?: string;
  } | null>(null);

  const activeYearConfig = useMemo(() => {
    return yearLevels.find((y) => y.id === yearLevel) || yearLevels[1];
  }, [yearLevel]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const payload: {
        fullName: string;
        email: string;
        password: string;
        accountType: "STUDENT" | "TEACHER";
        enrollmentNo?: string;
        employeeId?: string;
        autoActivate: boolean;
        departmentId?: string;
        programId?: string;
        currentYear?: number;
        currentSemester?: string;
        division?: string;
        designation?: string;
      } = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        accountType,
        autoActivate,
      };

      let academicSummary = "";

      if (accountType === "STUDENT") {
        if (identifier.trim()) {
          payload.enrollmentNo = identifier.trim().toUpperCase();
        }
        const bConf = branches.find((b) => b.id === branch) || branches[0];
        const yConf = yearLevels.find((y) => y.id === yearLevel) || yearLevels[1];
        payload.departmentId = bConf.department;
        payload.programId = bConf.program;
        payload.currentYear = yConf.yearNumber;
        payload.currentSemester = semester;
        payload.division = division;
        academicSummary = `${bConf.short} · ${yearLevel} (${semester}) · Div ${division}`;
      } else if (accountType === "TEACHER") {
        if (identifier.trim()) {
          payload.employeeId = identifier.trim().toUpperCase();
        }
        payload.departmentId = teacherDepartment;
        payload.designation = designation;
        academicSummary = `${teacherDepartment} · ${designation}`;
      }

      const res = await erpApi.register(payload);

      setRegisteredUser({
        fullName: fullName.trim(),
        email: res.email || email.trim().toLowerCase(),
        accountType,
        identifier: identifier.trim(),
        academicInfo: academicSummary,
        isActive: res.isActive !== false,
        message: res.message,
      });

      // Clear fields for next entry
      setFullName("");
      setEmail("");
      setIdentifier("");
      setPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account registration failed. Please check the provided information.");
    } finally {
      setBusy(false);
    }
  }

  function copyCredentials() {
    if (!registeredUser) return;
    const text = `CampusFlow Credentials:\nName: ${registeredUser.fullName}\nEmail: ${registeredUser.email}\nRole: ${registeredUser.accountType}\n${registeredUser.identifier ? `ID: ${registeredUser.identifier}\n` : ""}${registeredUser.academicInfo ? `Academic: ${registeredUser.academicInfo}\n` : ""}Status: ${registeredUser.isActive ? "Active (Can log in immediately)" : "Pending Email Verification"}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      <PageHeading
        eyebrow="CAMPUS ADMINISTRATION"
        title="Register user account"
        description="Provision official institutional credentials with verified branch, year and academic role. Only authenticated administrators can create accounts."
        actions={
          <div style={{ display: "flex", gap: 10 }}>
            <Link className="btn btn-secondary btn-md" href="/admin/students">
              <Users size={15} /> Student directory
            </Link>
            <Link className="btn btn-secondary btn-md" href="/admin/teachers">
              <GraduationCap size={15} /> Faculty directory
            </Link>
          </div>
        }
      />

      <div style={{ maxWidth: 840, margin: "0 auto" }}>
        {registeredUser ? (
          <Card
            title="Account registered successfully"
            subtitle="The institutional profile and credentials have been created."
            action={<StatusPill tone="success">Account Created</StatusPill>}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "8px 0" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "#ecfdf5",
                  color: "#059669",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  border: "2px solid #a7f3d0",
                }}
              >
                <CheckCircle2 size={26} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "var(--heading)" }}>
                  {registeredUser.fullName}
                </h3>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)" }}>
                  {registeredUser.message || "Account is provisioned and ready for use."}
                </p>

                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "12px 16px",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                    gap: 12,
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      Email
                    </span>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--heading)", marginTop: 2 }}>
                      {registeredUser.email}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      Role
                    </span>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--heading)", marginTop: 2 }}>
                      {registeredUser.accountType}
                    </div>
                  </div>
                  {registeredUser.identifier && (
                    <div>
                      <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>
                        {registeredUser.accountType === "TEACHER" ? "Employee ID" : "Enrollment No"}
                      </span>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--heading)", marginTop: 2 }}>
                        {registeredUser.identifier}
                      </div>
                    </div>
                  )}
                  {registeredUser.academicInfo && (
                    <div>
                      <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>
                        Branch / Department
                      </span>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--heading)", marginTop: 2 }}>
                        {registeredUser.academicInfo}
                      </div>
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>
                      Status
                    </span>
                    <div style={{ marginTop: 2 }}>
                      {registeredUser.isActive ? (
                        <StatusPill tone="success">Active · Immediate login</StatusPill>
                      ) : (
                        <StatusPill tone="warning">Pending verification</StatusPill>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <Button variant="secondary" onClick={copyCredentials}>
                    <Copy size={15} /> {copied ? "Copied to clipboard!" : "Copy details"}
                  </Button>
                  <Button onClick={() => setRegisteredUser(null)}>
                    <UserPlus size={15} /> Register another account
                  </Button>
                  <Link
                    href={registeredUser.accountType === "TEACHER" ? "/admin/teachers" : "/admin/students"}
                    className="btn btn-secondary btn-md"
                  >
                    View in directory <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <div className="content-grid" style={{ gridTemplateColumns: "1fr" }}>
            <Card
              title="Admin account provisioning"
              subtitle="Register a student or faculty account with verified branch and semester."
              action={<StatusPill tone="info">Admin only</StatusPill>}
            >
              <form onSubmit={submit} className="stack" style={{ gap: 20 }}>
                <div className="notice notice-info">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Administrator-controlled registration:</strong> Select whether you are creating a Student or Faculty account, along with their academic branch and semester.
                  </div>
                </div>

                <div className="field">
                  <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>
                    Select account type *
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <button
                      type="button"
                      className={`btn ${accountType === "STUDENT" ? "btn-primary" : "btn-secondary"} btn-md`}
                      style={{ justifyContent: "center", padding: "12px 16px" }}
                      onClick={() => setAccountType("STUDENT")}
                    >
                      <Users size={16} /> Student Account
                    </button>
                    <button
                      type="button"
                      className={`btn ${accountType === "TEACHER" ? "btn-primary" : "btn-secondary"} btn-md`}
                      style={{ justifyContent: "center", padding: "12px 16px" }}
                      onClick={() => setAccountType("TEACHER")}
                    >
                      <GraduationCap size={16} /> Teacher / Faculty Account
                    </button>
                  </div>
                </div>

                <div className="field-grid">
                  <div className="field">
                    <label>Full name *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={accountType === "TEACHER" ? "Prof. Aditi Sharma" : "Aarav Sharma"}
                    />
                  </div>

                  <div className="field">
                    <label>Institutional email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={accountType === "TEACHER" ? "faculty@college.edu" : "student@college.edu"}
                    />
                  </div>

                  <div className="field">
                    <label>
                      {accountType === "STUDENT" ? "Enrollment / Roll number" : "Employee ID"} (Optional)
                    </label>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={accountType === "STUDENT" ? "CSE2401" : "FAC-1024"}
                    />
                  </div>

                  {accountType === "STUDENT" ? (
                    <>
                      <div className="field">
                        <label>Branch / Engineering department *</label>
                        <select value={branch} onChange={(e) => setBranch(e.target.value)}>
                          {branches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.short} · {b.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label>Year of study *</label>
                        <select
                          value={yearLevel}
                          onChange={(e) => {
                            const yr = e.target.value;
                            const yConf = yearLevels.find((y) => y.id === yr) || yearLevels[0];
                            setYearLevel(yr);
                            setSemester(yConf.semesters[0]);
                          }}
                        >
                          {yearLevels.map((y) => (
                            <option key={y.id} value={y.id}>
                              {y.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label>Semester (Only {yearLevel}) *</label>
                        <select value={semester} onChange={(e) => setSemester(e.target.value)}>
                          {activeYearConfig.semesters.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <span className="field-hint">Showing only semesters belonging to {yearLevel}</span>
                      </div>

                      <div className="field">
                        <label>Division *</label>
                        <select value={division} onChange={(e) => setDivision(e.target.value)}>
                          <option value="A">Division A</option>
                          <option value="B">Division B</option>
                          <option value="C">Division C</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="field">
                        <label>Department / Engineering branch *</label>
                        <select
                          value={teacherDepartment}
                          onChange={(e) => setTeacherDepartment(e.target.value)}
                        >
                          <option value="Computer Science and Engineering">Computer Science and Engineering (CSE)</option>
                          <option value="Computer Engineering">Computer Engineering (COMPS)</option>
                          <option value="Electronics and Telecommunication Engineering">Electronics and Telecommunication (EXTC)</option>
                          <option value="Information Technology">Information Technology (IT)</option>
                        </select>
                      </div>

                      <div className="field">
                        <label>Designation *</label>
                        <select value={designation} onChange={(e) => setDesignation(e.target.value)}>
                          <option value="Assistant Professor">Assistant Professor</option>
                          <option value="Associate Professor">Associate Professor</option>
                          <option value="Professor">Professor</option>
                          <option value="Lecturer">Lecturer</option>
                          <option value="Head of Department">Head of Department</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div className="field" style={{ gridColumn: "1/-1" }}>
                    <label>Account status &amp; activation</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "var(--heading)" }}>
                        <input
                          type="checkbox"
                          checked={autoActivate}
                          onChange={(e) => setAutoActivate(e.target.checked)}
                          style={{ width: 17, height: 17, accentColor: "#4f46e5" }}
                        />
                        Activate account immediately (allows user to sign in right away)
                      </label>
                    </div>
                  </div>

                  <div className="field">
                    <label>Initial password (min. 8 characters) *</label>
                    <div className="password-field">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Set user password"
                      />
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="field">
                    <label>Confirm initial password *</label>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>

                {error && (
                  <div className="notice notice-danger">
                    <ShieldAlert size={17} />
                    <div>{error}</div>
                  </div>
                )}

                <div className="button-row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                  <Button type="submit" disabled={busy} size="md">
                    {busy ? (
                      "Registering user…"
                    ) : (
                      <>
                        <UserCheck size={16} /> Register {accountType === "TEACHER" ? "Teacher" : "Student"} Account
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
