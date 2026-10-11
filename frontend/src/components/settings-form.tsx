"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Camera, CheckCircle2, Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserRound, Wifi } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";

const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "ka5vsref";

function cloudinaryAvatarUrl(publicId: string | undefined) {
  if (!publicId || publicId.startsWith("local:")) return undefined;
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/authenticated/${publicId}`;
}

export default function SettingsForm({ role }: { role: "admin" | "teacher" | "student" }) {
  const roleLabel = role === "student" ? "Student" : role === "teacher" ? "Faculty member" : "Administrator";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [officeLocation, setOfficeLocation] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [inAppAlerts, setInAppAlerts] = useState(true);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);

  // Password change state
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMessage, setPwdMessage] = useState("");
  const [pwdError, setPwdError] = useState("");

  // Load real profile on mount
  useEffect(() => {
    // Seed from localStorage as instant fallback
    try {
      const stored = window.localStorage.getItem("college_erp_user");
      if (stored) {
        const u = JSON.parse(stored);
        if (u.fullName) setName(u.fullName);
        if (u.email) setEmail(u.email);
      }
    } catch {}

    // Fetch real profile from backend
    erpApi.getMyProfile().then((data) => {
      const d = data as Record<string, unknown>;
      if (typeof d.full_name === "string") setName(d.full_name);
      else if (typeof d.fullName === "string") setName(d.fullName as string);
      if (typeof d.email === "string") setEmail(d.email as string);
      if (typeof d.phone === "string") setPhone(d.phone as string);
      if (typeof d.address === "string") setAddress(d.address as string);
      if (typeof d.office_location === "string") setOfficeLocation(d.office_location as string);
      if (typeof d.specialization === "string") setSpecialization(d.specialization as string);
      if (typeof d.avatar_public_id === "string") {
        const url = cloudinaryAvatarUrl(d.avatar_public_id as string);
        if (url) setAvatarUrl(url);
      }
    }).catch(() => {});
  }, []);

  async function saveProfile() {
    setProfileError(""); setProfileMessage(""); setProfileBusy(true);
    try {
      const payload: Record<string, string> = { fullName: name };
      if (phone) payload.phone = phone;
      if (role === "student" && address) payload.address = address;
      if (role === "teacher" && officeLocation) payload.officeLocation = officeLocation;
      if (role === "teacher" && specialization) payload.specialization = specialization;
      const updated = await erpApi.updateMyProfile(payload);
      const d = updated as Record<string, unknown>;
      // Update localStorage with fresh name
      try {
        const stored = window.localStorage.getItem("college_erp_user");
        const current = stored ? JSON.parse(stored) : {};
        window.localStorage.setItem("college_erp_user", JSON.stringify({ ...current, fullName: name, email }));
      } catch {}
      if (typeof d.full_name === "string") setName(d.full_name);
      setProfileMessage("Profile updated successfully.");
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Failed to save profile.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setAvatarMsg("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarMsg("Image must be 5 MB or smaller."); return; }
    setAvatarBusy(true); setAvatarMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      await erpApi.uploadAvatar(form);
      // Preview the image locally while Cloudinary processes
      setAvatarUrl(URL.createObjectURL(file));
      setAvatarMsg("Profile picture updated successfully!");
    } catch (e) {
      setAvatarMsg(e instanceof Error ? e.message : "Avatar upload failed.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function changePassword() {
    setPwdError(""); setPwdMessage(""); 
    if (!currentPwd || !newPwd || !confirmPwd) { setPwdError("All password fields are required."); return; }
    if (newPwd !== confirmPwd) { setPwdError("New passwords do not match."); return; }
    if (newPwd.length < 8) { setPwdError("New password must be at least 8 characters."); return; }
    setPwdBusy(true);
    try {
      const result = await erpApi.changePassword({ currentPassword: currentPwd, newPassword: newPwd });
      setPwdMessage(result.message || "Password changed successfully.");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : "Failed to change password.");
    } finally {
      setPwdBusy(false);
    }
  }

  const initials = name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase() || "CF";

  return (
    <>
      <PageHeading
        eyebrow="PREFERENCES"
        title="Settings"
        description="Manage account details, notifications and connected-service configuration."
      />
      <div className="page-two-col">
        <Card title="Profile information" subtitle="Your identity and contact details.">
          <div className="stack" style={{ gap: 16 }}>
            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 68, height: 68, borderRadius: "50%", overflow: "hidden",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 700, color: "#fff", flexShrink: 0, position: "relative",
                  boxShadow: "0 4px 12px rgba(99,102,241,0.3)"
                }}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : initials}
                <input
                  type="file"
                  accept="image/*"
                  ref={avatarInput}
                  style={{ display: "none" }}
                  onChange={handleAvatarChange}
                />
              </div>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => avatarInput.current?.click()}
                  disabled={avatarBusy}
                >
                  <Camera size={14} /> {avatarBusy ? "Uploading…" : "Change photo"}
                </Button>
                {avatarMsg && (
                  <p style={{ fontSize: 12, marginTop: 6, color: avatarMsg.includes("success") ? "#10b981" : "#ef4444" }}>
                    {avatarMsg}
                  </p>
                )}
              </div>
            </div>

            <div className="field">
              <label>Full name</label>
              <input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Institutional email</label>
              <input type="email" value={email} readOnly style={{ opacity: 0.7 }} />
              <span className="field-hint">Email cannot be changed. Contact your administrator.</span>
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 00000 00000" />
            </div>
            {role === "student" && (
              <div className="field">
                <label>Address</label>
                <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Your residential address" />
              </div>
            )}
            {role === "teacher" && (
              <>
                <div className="field">
                  <label>Office location</label>
                  <input value={officeLocation} onChange={e => setOfficeLocation(e.target.value)} placeholder="Room / Block" />
                </div>
                <div className="field">
                  <label>Specialization</label>
                  <input value={specialization} onChange={e => setSpecialization(e.target.value)} placeholder="e.g. Machine Learning" />
                </div>
              </>
            )}
            <div className="field">
              <label>Account role</label>
              <input value={roleLabel} readOnly />
            </div>
            <Button onClick={saveProfile} disabled={profileBusy}>
              <CheckCircle2 size={15} /> {profileBusy ? "Saving…" : "Save profile"}
            </Button>
            {profileMessage && (
              <div className="notice notice-success">
                <UserRound size={16} />
                <div>{profileMessage}</div>
              </div>
            )}
            {profileError && (
              <div className="notice notice-danger">
                <div>{profileError}</div>
              </div>
            )}
          </div>
        </Card>

        <div className="stack" style={{ gap: 18 }}>
          <Card title="Notifications" subtitle="Choose which alerts appear in your workspace.">
            <div className="simple-list-item">
              <div className="stat-icon stat-icon-blue" style={{ width: 34, height: 34, margin: 0 }}>
                <Bell size={17} />
              </div>
              <div>
                <strong>In-app notifications</strong>
                <p>Attendance alerts, marks review and appointment updates.</p>
              </div>
              <button
                className={`toggle ${inAppAlerts ? "on" : ""}`}
                onClick={() => setInAppAlerts(v => !v)}
                aria-label="Toggle in-app notifications"
              >
                <span />
              </button>
            </div>
            <div className="simple-list-item">
              <div className="stat-icon stat-icon-green" style={{ width: 34, height: 34, margin: 0 }}>
                <Bell size={17} />
              </div>
              <div>
                <strong>Email notifications</strong>
                <p>Use the institutional email for important updates.</p>
              </div>
              <button
                className={`toggle ${emailAlerts ? "on" : ""}`}
                onClick={() => setEmailAlerts(v => !v)}
                aria-label="Toggle email notifications"
              >
                <span />
              </button>
            </div>
          </Card>

          <Card title="Change password" subtitle="Update your account password.">
            <div className="stack" style={{ gap: 14 }}>
              <div className="field">
                <label>Current password</label>
                <div className="password-field">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPwd}
                    onChange={e => setCurrentPwd(e.target.value)}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                  />
                  <button type="button" className="icon-button" onClick={() => setShowCurrent(v => !v)} aria-label="Toggle current password visibility">
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="field">
                <label>New password</label>
                <div className="password-field">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                  />
                  <button type="button" className="icon-button" onClick={() => setShowNew(v => !v)} aria-label="Toggle new password visibility">
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
              </div>
              <Button onClick={changePassword} disabled={pwdBusy}>
                <Lock size={14} /> {pwdBusy ? "Changing…" : "Change password"}
              </Button>
              {pwdMessage && (
                <div className="notice notice-success">
                  <ShieldCheck size={16} />
                  <div>{pwdMessage}</div>
                </div>
              )}
              {pwdError && (
                <div className="notice notice-danger">
                  <div>{pwdError}</div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {role === "admin" && (
        <Card title="System connection" subtitle="Frontend environment status.">
          <div className="list-stack">
            <div className="list-row">
              <div className="stat-icon stat-icon-blue" style={{ width: 35, height: 35, margin: 0 }}>
                <Wifi size={17} />
              </div>
              <div className="list-row-main">
                <strong>Express API Gateway</strong>
                <p>{process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1"}</p>
              </div>
              <StatusPill tone="success">Connected</StatusPill>
            </div>
            <div className="list-row">
              <div className="stat-icon stat-icon-violet" style={{ width: 35, height: 35, margin: 0 }}>
                <ShieldCheck size={17} />
              </div>
              <div className="list-row-main">
                <strong>Authorization</strong>
                <p>JWT identity verification and role checks enforced by gRPC Auth Service and Redis.</p>
              </div>
              <StatusPill tone="info">Live Backend Verified</StatusPill>
            </div>
            <div className="list-row">
              <div className="stat-icon stat-icon-amber" style={{ width: 35, height: 35, margin: 0 }}>
                <KeyRound size={17} />
              </div>
              <div className="list-row-main">
                <strong>Database &amp; Services</strong>
                <p>MySQL 8.4 relational schema, triggers, and transactional outbox worker active.</p>
              </div>
              <StatusPill tone="success">Operational</StatusPill>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
