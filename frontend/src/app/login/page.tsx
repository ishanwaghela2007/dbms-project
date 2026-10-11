"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, GraduationCap, ShieldCheck, Sparkles, KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/api/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@college.edu");
  const [password, setPassword] = useState("AdminPassword123!");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiRequest<{
        accessToken?: string;
        token?: string;
        user?: {
          id: string;
          email: string;
          fullName: string;
          accountType?: string;
          role?: string;
          roles?: string[];
          is_admin?: boolean;
        };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      const token = response.accessToken || response.token;
      if (!token) throw new Error("The authentication service did not return an access token.");
      window.localStorage.setItem("college_erp_access_token", token);
      if (response.user) {
        window.localStorage.setItem("college_erp_user", JSON.stringify(response.user));
      }

      const accountType = (
        response.user?.accountType ||
        (response.user?.is_admin ? "ADMIN" : "") ||
        response.user?.role ||
        response.user?.roles?.[0] ||
        "STUDENT"
      ).toUpperCase();

      if (accountType === "ADMIN") {
        router.push("/admin");
      } else if (accountType === "TEACHER") {
        router.push("/teacher");
      } else {
        router.push("/student");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed. Check your credentials and try again.");
    } finally {
      setBusy(false);
    }
  }

  function fillCredentials(fillEmail: string, fillPass: string) {
    setEmail(fillEmail);
    setPassword(fillPass);
    setError("");
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
            CONNECTED CAMPUS
          </span>
          <h1>
            Everything academic,
            <br />
            <span>in one secure place.</span>
          </h1>
          <p>
            From student records and teaching assignments to attendance, marks validation and meeting
            requests—built around the people who make campus work.
          </p>
          <div className="login-feature">
            <span>
              <ShieldCheck size={17} />
            </span>
            <div>
              <strong>Production Ready Workspace</strong>
              <small>Full microservices architecture with real-time MySQL, Redis, and gRPC backend.</small>
            </div>
          </div>
          <div className="login-feature">
            <span>
              <Sparkles size={17} />
            </span>
            <div>
              <strong>Unified Edge Gateway</strong>
              <small>Role-aware access control for administrators, teachers, and students.</small>
            </div>
          </div>
        </div>
        <div className="login-story-footer">© 2026 CampusFlow ERP · Academic Workspace</div>
      </section>

      <section className="login-form-side">
        <form className="login-card" onSubmit={submit}>
          <div className="login-mobile-brand">
            <span className="brand-mark">
              <GraduationCap size={22} />
            </span>
            <strong>CampusFlow</strong>
          </div>
          <span className="eyebrow">AUTHENTICATION</span>
          <h2>Sign in to your campus</h2>
          <p className="login-subtitle">Use your official institutional credentials to continue.</p>

          <div className="field" style={{ marginTop: 20 }}>
            <label>Institutional email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@college.edu"
            />
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label>Password</label>
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ textAlign: "right", marginTop: 6 }}>
            <Link href="/forgot-password" style={{ fontSize: 13, color: "#4f46e5", fontWeight: 500 }}>
              Forgot password?
            </Link>
          </div>

          <div style={{ marginTop: 14, padding: "10px 12px", background: "rgba(240, 244, 255, 0.6)", borderRadius: 8, border: "1px solid #dce4f7" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#455073", marginBottom: 6 }}>
              <KeyRound size={13} /> Demo System Accounts
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => fillCredentials("admin@college.edu", "AdminPassword123!")}
              >
                Admin
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => fillCredentials("neha.kulkarni@college.edu", "TeacherPassword123!")}
              >
                Teacher
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11, padding: "3px 8px" }}
                onClick={() => fillCredentials("aarav.shah@college.edu", "StudentPassword123!")}
              >
                Student
              </button>
            </div>
          </div>

          {error && (
            <div className="notice notice-danger" style={{ marginTop: 14 }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary btn-md login-submit" type="submit" disabled={busy}>
            {busy ? "Signing in…" : (
              <>
                Sign in <ArrowRight size={16} />
              </>
            )}
          </button>
          <p className="login-terms">
            By continuing, you agree to follow your institution’s acceptable-use and data-protection policies.
          </p>
        </form>
      </section>
    </main>
  );
}
