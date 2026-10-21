"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
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

export default function AdminRegisterPage() {
  const [accountType, setAccountType] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [autoActivate, setAutoActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [registeredUser, setRegisteredUser] = useState<{
    fullName: string;
    email: string;
    accountType: string;
    identifier: string;
    isActive: boolean;
    message?: string;
  } | null>(null);

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
      } = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        accountType,
        autoActivate,
      };

      if (accountType === "STUDENT" && identifier.trim()) {
        payload.enrollmentNo = identifier.trim().toUpperCase();
      } else if (accountType === "TEACHER" && identifier.trim()) {
        payload.employeeId = identifier.trim().toUpperCase();
      }

      const res = await erpApi.register(payload);

      setRegisteredUser({
        fullName: fullName.trim(),
        email: res.email || email.trim().toLowerCase(),
        accountType,
        identifier: identifier.trim(),
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
    const text = `CampusFlow Credentials:\nName: ${registeredUser.fullName}\nEmail: ${registeredUser.email}\nRole: ${registeredUser.accountType}\n${registeredUser.identifier ? `ID: ${registeredUser.identifier}\n` : ""}Status: ${registeredUser.isActive ? "Active (Can log in immediately)" : "Pending Email Verification"}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      <PageHeading
        eyebrow="CAMPUS ADMINISTRATION"
        title="Register user account"
        description="Provision official institutional credentials for students or faculty members. Only logged-in administrators can create accounts."
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
                <CheckCircle2 size={28} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>
                  {registeredUser.fullName}
                </h3>
                <p style={{ color: "#4b5563", fontSize: 14, margin: "0 0 16px" }}>
                  {registeredUser.message || "The user account is now active and ready for immediate login."}
                </p>

                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: 16,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                      Institutional Email
                    </span>
                    <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 14, marginTop: 2 }}>
                      {registeredUser.email}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                      Account Role
                    </span>
                    <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 14, marginTop: 2 }}>
                      {registeredUser.accountType === "TEACHER" ? "Teacher / Faculty" : "Student"}
                    </div>
                  </div>
                  {registeredUser.identifier && (
                    <div>
                      <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
                        {registeredUser.accountType === "TEACHER" ? "Employee ID" : "Enrollment No."}
                      </span>
                      <div style={{ fontWeight: 600, color: "#0f172a", fontSize: 14, marginTop: 2 }}>
                        {registeredUser.identifier}
                      </div>
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
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
              subtitle="Register a student or faculty account with institutional permissions."
              action={<StatusPill tone="info">Admin only</StatusPill>}
            >
              <form onSubmit={submit} className="stack" style={{ gap: 20 }}>
                <div className="notice notice-info">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Administrator-controlled registration:</strong> Public self-registration is disabled.
                    Students and teachers receive their login credentials directly from the administration.
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

                  <div className="field">
                    <label>Account status & activation</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#374151" }}>
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
                    {busy ? "Registering user…" : (
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
