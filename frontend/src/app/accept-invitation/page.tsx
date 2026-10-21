"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, GraduationCap, ShieldCheck } from "lucide-react";
import { erpApi } from "@/lib/api/erp";

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invitation token is missing. Please click the exact link in your invitation email.");
      return;
    }
    if (password.length < 12) {
      setError("For security, your password must be at least 12 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await erpApi.acceptInvitation({ token, password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invitation. Link may be expired or already used.");
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
            ACCOUNT ONBOARDING
          </span>
          <h1>
            Welcome to
            <br />
            <span>CampusFlow ERP.</span>
          </h1>
          <p>
            Your institutional account has been provisioned by the administration. Set your official password
            to activate your access to the portal.
          </p>
          <div className="login-feature">
            <span>
              <ShieldCheck size={17} />
            </span>
            <div>
              <strong>Protected Credentials</strong>
              <small>Your password is cryptographically salted and hashed with bcrypt. Never share your password.</small>
            </div>
          </div>
        </div>
        <div className="login-story-footer">© 2026 CampusFlow ERP · Academic Workspace</div>
      </section>

      <section className="login-form-side">
        <div className="login-card" style={{ maxWidth: 460 }}>
          <div className="login-mobile-brand">
            <span className="brand-mark">
              <GraduationCap size={22} />
            </span>
            <strong>CampusFlow</strong>
          </div>

          {success ? (
            <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "#ecfdf5",
                  color: "#059669",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 16px",
                  border: "2px solid #a7f3d0",
                }}
              >
                <CheckCircle2 size={32} />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
                Password Set Successfully!
              </h2>
              <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
                Your institutional account is now active and ready. You can log in with your email and new password.
              </p>
              <Link
                href="/login"
                className="btn btn-primary btn-md"
                style={{ width: "100%", justifyContent: "center", textDecoration: "none" }}
              >
                Sign In to Your Account <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
              <span className="eyebrow">FIRST-TIME SETUP</span>
              <h2>Set your password</h2>
              <p className="login-subtitle">Choose a secure password of at least 12 characters to activate your account.</p>

              {!token && (
                <div className="notice notice-danger" style={{ marginTop: 6 }}>
                  No invitation token found in the URL. Please ensure you clicked the full link sent to your email.
                </div>
              )}

              <div className="field" style={{ marginTop: 10 }}>
                <label>New password *</label>
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter at least 12 characters"
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
                <label>Confirm new password *</label>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                />
              </div>

              {error && (
                <div className="notice notice-danger" style={{ marginTop: 6 }}>
                  {error}
                </div>
              )}

              <button
                className="btn btn-primary btn-md login-submit"
                type="submit"
                disabled={busy || !token}
                style={{ marginTop: 10 }}
              >
                {busy ? "Activating account…" : (
                  <>
                    Activate Account & Continue <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div style={{ textAlign: "center", marginTop: 10, fontSize: 13 }}>
                <Link href="/login" style={{ color: "#4f46e5", fontWeight: 500 }}>
                  Already have an active password? Sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<main className="login-page" suppressHydrationWarning />}>
      <AcceptInvitationContent />
    </Suspense>
  );
}
