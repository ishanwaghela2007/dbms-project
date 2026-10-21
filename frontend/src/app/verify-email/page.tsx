"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, type FormEvent } from "react";
import { CheckCircle2, GraduationCap, Mail, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { erpApi } from "@/lib/api/erp";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [mounted, setMounted] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [emailForResend, setEmailForResend] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    if (!mounted || !token) return;

    let isSubscribed = true;
    queueMicrotask(() => {
      setVerifying(true);
      setError("");
    });

    erpApi.verifyEmail(token)
      .then((res) => {
        if (!isSubscribed) return;
        setSuccess(true);
        setMessage(res.message || "Your email has been verified successfully!");
      })
      .catch((err) => {
        if (!isSubscribed) return;
        setSuccess(false);
        setError(err instanceof Error ? err.message : "Verification link is invalid or expired.");
      })
      .finally(() => {
        if (isSubscribed) setVerifying(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [mounted, token]);

  async function handleResend(e: FormEvent) {
    e.preventDefault();
    if (!emailForResend) return;
    setResendBusy(true);
    setResendMessage("");
    setError("");
    try {
      const res = await erpApi.resendVerification(emailForResend);
      setResendMessage(res.message || "A new verification email has been sent. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend email. Try again shortly.");
    } finally {
      setResendBusy(false);
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
            SECURITY & IDENTITY
          </span>
          <h1>
            Email verification,
            <br />
            <span>confirming you.</span>
          </h1>
          <p>
            Verifying your official email ensures only authorized students and faculty can access institutional
            records, grades, attendance, and exam papers.
          </p>
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

          {verifying ? (
            <div style={{ textAlign: "center", padding: "30px 10px" }}>
              <Loader2 className="animate-spin" size={40} style={{ color: "#4f46e5", margin: "0 auto 16px" }} />
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>Verifying your email…</h2>
              <p style={{ color: "#6b7280", fontSize: 14, marginTop: 6 }}>
                Please wait while we confirm your activation token.
              </p>
            </div>
          ) : success ? (
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
                Email Verified!
              </h2>
              <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
                {message || "Your email has been confirmed and your account is now active."}
              </p>
              <Link
                href="/login"
                className="btn btn-primary btn-md"
                style={{ width: "100%", justifyContent: "center", textDecoration: "none" }}
              >
                Sign In to Your Workspace <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <div>
              <div style={{ textAlign: "center", padding: "10px 0 16px" }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: error ? "#fef2f2" : "#eff6ff",
                    color: error ? "#dc2626" : "#2563eb",
                    display: "grid",
                    placeItems: "center",
                    margin: "0 auto 14px",
                    border: `2px solid ${error ? "#fecaca" : "#bfdbfe"}`,
                  }}
                >
                  {error ? <AlertTriangle size={28} /> : <Mail size={28} />}
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>
                  {error ? "Verification Issue" : "Verify Your Email"}
                </h2>
                <p style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
                  {error || "Enter your email below to request a new verification link."}
                </p>
              </div>

              {resendMessage && (
                <div className="notice notice-info" style={{ marginBottom: 16 }}>
                  {resendMessage}
                </div>
              )}

              <form onSubmit={handleResend} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="field">
                  <label>Your email address</label>
                  <input
                    type="email"
                    required
                    value={emailForResend}
                    onChange={(e) => setEmailForResend(e.target.value)}
                    placeholder="you@college.edu"
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-md"
                  disabled={resendBusy}
                  style={{ justifyContent: "center" }}
                >
                  {resendBusy ? "Sending…" : "Resend Verification Email"}
                </button>
              </form>

              <div style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
                <Link href="/login" style={{ color: "#4f46e5", fontWeight: 500 }}>
                  ← Back to Sign In
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="login-page" suppressHydrationWarning />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
