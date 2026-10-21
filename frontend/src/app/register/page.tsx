"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  ArrowRight,
  GraduationCap,
  Lock,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  UserCheck
} from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [authStatus, setAuthStatus] = useState<"checking" | "unauthenticated" | "forbidden" | "admin">("checking");
  const [currentUser, setCurrentUser] = useState<{ fullName?: string; email?: string; accountType?: string; is_admin?: boolean } | null>(null);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
    try {
      const token = window.localStorage.getItem("college_erp_access_token");
      const stored = window.localStorage.getItem("college_erp_user");
      if (!token || !stored) {
        queueMicrotask(() => setAuthStatus("unauthenticated"));
        return;
      }
      const user = JSON.parse(stored);
      queueMicrotask(() => setCurrentUser(user));

      const isAdmin = Boolean(user.is_admin || user.accountType === "ADMIN" || user.role === "ADMIN");
      if (isAdmin) {
        queueMicrotask(() => setAuthStatus("admin"));
        router.replace("/admin/register");
      } else {
        queueMicrotask(() => setAuthStatus("forbidden"));
      }
    } catch {
      queueMicrotask(() => setAuthStatus("unauthenticated"));
    }
  }, [router]);

  if (!mounted || authStatus === "checking") {
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
            INSTITUTIONAL ACCESS POLICY
          </span>
          <h1>
            Centralized account
            <br />
            <span>administration.</span>
          </h1>
          <p>
            CampusFlow ERP enforces strict institutional governance. All student and faculty accounts are
            provisioned exclusively by authenticated campus administrators.
          </p>
          <div className="login-feature">
            <span>
              <ShieldCheck size={17} />
            </span>
            <div>
              <strong>No Public Self-Registration</strong>
              <small>External users cannot manually register accounts or elevate permissions.</small>
            </div>
          </div>
          <div className="login-feature">
            <span>
              <UserCheck size={17} />
            </span>
            <div>
              <strong>Verified Institutional Identities</strong>
              <small>Official roll numbers, employee IDs, and academic affiliations are verified upon creation.</small>
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

          {authStatus === "admin" ? (
            <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "#eff6ff",
                  color: "#2563eb",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 16px",
                  border: "2px solid #bfdbfe",
                }}
              >
                <ShieldCheck size={28} />
              </div>
              <span className="eyebrow">ADMINISTRATOR RECOGNIZED</span>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "8px 0" }}>Redirecting to Console…</h2>
              <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
                You are signed in as an administrator. Loading your secure account provisioning console.
              </p>
              <Link href="/admin/register" className="btn btn-primary btn-md" style={{ width: "100%", justifyContent: "center" }}>
                Open Admin Registration Console <ArrowRight size={16} />
              </Link>
            </div>
          ) : authStatus === "forbidden" ? (
            <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "#fef2f2",
                  color: "#dc2626",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 16px",
                  border: "2px solid #fecaca",
                }}
              >
                <ShieldAlert size={28} />
              </div>
              <span className="eyebrow" style={{ color: "#dc2626" }}>
                INSUFFICIENT PRIVILEGES
              </span>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "8px 0" }}>Administrator Access Only</h2>
              <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
                You are currently signed in as <strong>{currentUser?.fullName || "user"}</strong> ({currentUser?.accountType || "Portal user"}).
                Only campus administrators have permission to register new users.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
                <Link
                  href={currentUser?.accountType === "TEACHER" ? "/teacher" : "/student"}
                  className="btn btn-primary btn-md"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  Return to your portal <ArrowRight size={16} />
                </Link>
                <Link
                  href="/login"
                  className="btn btn-secondary btn-md"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <LogOut size={15} /> Switch to Administrator Account
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "#f8fafc",
                  color: "#475569",
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 16px",
                  border: "2px solid #cbd5e1",
                }}
              >
                <Lock size={26} />
              </div>
              <span className="eyebrow" style={{ color: "#475569" }}>
                RESTRICTED ACCESS
              </span>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "8px 0" }}>Administrator Login Required</h2>
              <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
                Manual self-registration is disabled. Account provisioning is restricted exclusively to authorized
                administrators.
              </p>

              <div
                style={{
                  background: "#f1f5f9",
                  borderRadius: 8,
                  padding: "14px 16px",
                  textAlign: "left",
                  fontSize: 13,
                  color: "#334155",
                  lineHeight: 1.5,
                  margin: "18px 0",
                }}
              >
                <strong>Need account credentials?</strong>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  Students and faculty receive their official credentials directly from their college department or
                  administration office.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                <Link href="/login" className="btn btn-primary btn-md" style={{ width: "100%", justifyContent: "center" }}>
                  Sign in as Administrator <ArrowRight size={16} />
                </Link>
                <Link href="/login" className="btn btn-secondary btn-md" style={{ width: "100%", justifyContent: "center" }}>
                  Back to Sign in
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
