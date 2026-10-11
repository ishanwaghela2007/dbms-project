"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, GraduationCap, KeyRound, Mail } from "lucide-react";
import { erpApi } from "@/lib/api/erp";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await erpApi.forgotPassword(email);
      setMessage(result.message || "If that email is registered, a password reset link has been sent.");
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/login" className="brand-lockup">
          <span className="brand-mark">
            <GraduationCap size={23} />
          </span>
          <span className="brand-copy">
            <strong>CampusFlow</strong>
            <small>COLLEGE ERP</small>
          </span>
        </Link>
        <div className="login-story-content">
          <span className="eyebrow" style={{ color: "#aabaff" }}>
            ACCOUNT RECOVERY
          </span>
          <h1>
            Forgot your
            <br />
            <span>password?</span>
          </h1>
          <p>
            Enter the institutional email address associated with your account and we will send you a secure
            link to reset your password.
          </p>
          <div className="login-feature">
            <span>
              <Mail size={17} />
            </span>
            <div>
              <strong>Secure Email Reset</strong>
              <small>A time-limited reset link will be delivered to your institutional email within moments.</small>
            </div>
          </div>
        </div>
        <div className="login-story-footer">© 2026 CampusFlow ERP · Academic Workspace</div>
      </section>

      <section className="login-form-side">
        <div className="login-card">
          <div className="login-mobile-brand">
            <span className="brand-mark">
              <GraduationCap size={22} />
            </span>
            <strong>CampusFlow</strong>
          </div>
          <span className="eyebrow">PASSWORD RECOVERY</span>
          <h2>Reset your password</h2>
          <p className="login-subtitle">
            Enter your institutional email and we&apos;ll send a reset link.
          </p>

          {sent ? (
            <div>
              <div
                style={{
                  padding: "20px 16px",
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.25)",
                  borderRadius: 10,
                  marginTop: 20,
                  textAlign: "center",
                }}
              >
                <Mail size={32} style={{ color: "#10b981", marginBottom: 10 }} />
                <p style={{ color: "#065f46", fontWeight: 600, marginBottom: 8 }}>Email sent!</p>
                <p style={{ color: "#334155", fontSize: 14 }}>{message}</p>
                <p style={{ color: "#64748b", fontSize: 13, marginTop: 10 }}>
                  Check your inbox and spam folder. The link expires in <strong>1 hour</strong>.
                </p>
              </div>
              <Link
                href="/login"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  marginTop: 20,
                  fontSize: 14,
                  color: "#4f46e5",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Back to sign in <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="field" style={{ marginTop: 20 }}>
                <label>Institutional email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@college.edu"
                  autoFocus
                />
              </div>

              {error && (
                <div className="notice notice-danger" style={{ marginTop: 14 }}>
                  {error}
                </div>
              )}

              <button
                className="btn btn-primary btn-md login-submit"
                type="submit"
                disabled={busy}
                style={{ marginTop: 18 }}
              >
                {busy ? "Sending…" : (
                  <>
                    <KeyRound size={16} /> Send reset link <ArrowRight size={16} />
                  </>
                )}
              </button>
              <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#64748b" }}>
                Remembered it?{" "}
                <Link href="/login" style={{ color: "#4f46e5", fontWeight: 600 }}>
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
