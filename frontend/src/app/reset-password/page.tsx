"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, type FormEvent, Suspense } from "react";
import { ArrowRight, Eye, EyeOff, GraduationCap, ShieldCheck } from "lucide-react";
import { erpApi } from "@/lib/api/erp";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (!token) { setError("Invalid or missing reset token. Request a new link."); return; }
    setBusy(true);
    try {
      const result = await erpApi.resetPassword(token, password);
      setMessage(result.message || "Password reset successfully. You can now sign in.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed. The link may be expired or already used.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) {
    return <main className="login-page" suppressHydrationWarning />;
  }

  return (
    <main className="login-page" suppressHydrationWarning>
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
            ACCOUNT SECURITY
          </span>
          <h1>
            Set your new
            <br />
            <span>password.</span>
          </h1>
          <p>
            Choose a strong password for your institutional account. It must be at least 8 characters long.
          </p>
          <div className="login-feature">
            <span>
              <ShieldCheck size={17} />
            </span>
            <div>
              <strong>Secure Reset</strong>
              <small>Your reset token is one-time-use and expires after 1 hour for security.</small>
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
          <span className="eyebrow">SET NEW PASSWORD</span>
          <h2>Create a new password</h2>
          <p className="login-subtitle">
            Enter and confirm your new institutional password.
          </p>

          {done ? (
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
                <ShieldCheck size={32} style={{ color: "#10b981", marginBottom: 10 }} />
                <p style={{ color: "#065f46", fontWeight: 600, marginBottom: 8 }}>Password updated!</p>
                <p style={{ color: "#334155", fontSize: 14 }}>{message}</p>
              </div>
              <Link
                href="/login"
                className="btn btn-primary btn-md login-submit"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20, textDecoration: "none" }}
              >
                Sign in now <ArrowRight size={16} />
              </Link>
            </div>
          ) : !token ? (
            <div className="notice notice-danger" style={{ marginTop: 20 }}>
              Invalid or missing reset token. Please{" "}
              <Link href="/forgot-password" style={{ color: "#4f46e5" }}>request a new link</Link>.
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="field" style={{ marginTop: 20 }}>
                <label>New password</label>
                <div className="password-field">
                  <input
                    type={showPwd ? "text" : "password"}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoFocus
                    autoComplete="new-password"
                  />
                  <button type="button" className="icon-button" onClick={() => setShowPwd(v => !v)} aria-label="Toggle password visibility">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>Confirm new password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
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
                {busy ? "Saving…" : (
                  <>
                    Set password <ArrowRight size={16} />
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
