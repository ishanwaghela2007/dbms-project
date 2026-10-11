"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isDemoMode } from "@/lib/api/client";
import {
  Activity, Bell, BookOpen, CalendarDays, ChevronDown, ChevronRight,
  CircleHelp, ClipboardCheck, FileCheck2, FileText, GraduationCap,
  LayoutDashboard, LogOut, Menu, Search, Settings, ShieldCheck, Users,
  UsersRound, X, GraduationCap as FacultyIcon, type LucideIcon,
} from "lucide-react";

type NavItem = { label: string; href: string; icon: LucideIcon; badge?: string };
type NavGroup = { title: string; items: NavItem[] };

const adminGroups: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", href: "/admin", icon: LayoutDashboard }] },
  { title: "PEOPLE", items: [
    { label: "Students", href: "/admin/students", icon: Users },
    { label: "Teachers", href: "/admin/teachers", icon: FacultyIcon },
    { label: "Classes & subjects", href: "/admin/academics", icon: BookOpen },
  ] },
  { title: "ACADEMICS", items: [
    { label: "Papers library", href: "/papers", icon: FileText },
    { label: "Attendance alerts", href: "/admin/attendance-alerts", icon: Activity, badge: "3" },
  ] },
];
const teacherGroups: NavGroup[] = [
  { title: "TEACHING SPACE", items: [
    { label: "Overview", href: "/teacher", icon: LayoutDashboard },
    { label: "Marks & results", href: "/teacher/marks", icon: FileCheck2 },
    { label: "Attendance register", href: "/teacher/attendance", icon: ClipboardCheck },
    { label: "Student follow-ups", href: "/teacher/followups", icon: UsersRound, badge: "3" },
  ] },
  { title: "RESOURCES", items: [
    { label: "Meeting requests", href: "/teacher/meetings", icon: CalendarDays, badge: "1" },
    { label: "Papers library", href: "/teacher/papers", icon: FileText },
    { label: "Class schedule", href: "/teacher", icon: CalendarDays },
  ] },
];
const studentGroups: NavGroup[] = [
  { title: "MY CAMPUS", items: [
    { label: "My overview", href: "/student", icon: LayoutDashboard },
    { label: "My results", href: "/student/results", icon: FileCheck2 },
    { label: "Notifications", href: "/student/notifications", icon: Bell, badge: "2" },
    { label: "Teacher meetings", href: "/student/meetings", icon: CalendarDays },
    { label: "Papers library", href: "/student/papers", icon: FileText },
  ] },
];

function roleForPath(path: string): "admin" | "teacher" | "student" {
  if (path.startsWith("/teacher")) return "teacher";
  if (path.startsWith("/student")) return "student";
  return "admin";
}

export default function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = roleForPath(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id?: string; email?: string; fullName?: string; accountType?: string } | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("college_erp_user");
      if (stored) {
        setCurrentUser(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const groups = role === "admin" ? adminGroups : role === "teacher" ? teacherGroups : studentGroups;
  const pageTitle = useMemo(() => {
    const all = [...adminGroups, ...teacherGroups, ...studentGroups].flatMap(g => g.items);
    return all.find(item => item.href === pathname)?.label ?? (pathname.endsWith("/settings") ? "Settings" : "Campus workspace");
  }, [pathname]);
  const roleLabels = { admin: "Administrator", teacher: "Faculty workspace", student: "Student workspace" };

  const displayName = currentUser?.fullName || (role === "student" ? "Aarav Shah" : role === "teacher" ? "Prof. Neha Kulkarni" : "CampusFlow Admin");
  const initials = displayName.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase() || "CF";

  function handleSignOut() {
    window.localStorage.removeItem("college_erp_access_token");
    window.localStorage.removeItem("college_erp_user");
    router.push("/login");
  }

  return (
    <div className="app-frame">
      {mobileOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-header">
          <Link href={role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/student"} className="brand-lockup" onClick={() => setMobileOpen(false)}>
            <span className="brand-mark"><GraduationCap size={22} strokeWidth={2.2} /></span>
            <span className="brand-copy"><strong>CampusFlow</strong><small>COLLEGE ERP</small></span>
          </Link>
          <button type="button" aria-label="Close navigation" className="icon-button sidebar-close" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>

        <div className="workspace-switcher">
          <span className="workspace-icon">{role === "admin" ? <ShieldCheck size={17} /> : role === "teacher" ? <BookOpen size={17} /> : <GraduationCap size={17} />}</span>
          <span className="workspace-meta"><small>WORKSPACE</small><strong>{roleLabels[role]}</strong></span>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          {groups.map((group) => (
            <div className="nav-group" key={group.title}>
              <p className="nav-section-label">{group.title}</p>
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/admin" && item.href !== "/teacher" && item.href !== "/student" && pathname.startsWith(`${item.href}/`));
                return <Link key={`${group.title}-${item.label}`} href={item.href} onClick={() => setMobileOpen(false)} className={`nav-item ${active ? "nav-item-active" : ""}`}>
                  <item.icon size={18} strokeWidth={active ? 2.2 : 1.8} /><span>{item.label}</span>{item.badge && <span className="nav-badge">{item.badge}</span>}
                </Link>;
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-support">
          <div className="support-icon"><CircleHelp size={18} /></div>
          <div><strong>Need a hand?</strong><p>Visit the help centre</p></div>
          <ChevronRight size={15} className="muted-icon" />
        </div>
        <Link href={role === "student" ? "/student/settings" : role === "teacher" ? "/teacher/settings" : "/settings"} className={`nav-item settings-link ${pathname.endsWith("/settings") ? "nav-item-active" : ""}`}><Settings size={18} /><span>Settings</span></Link>
        <div className="profile-mini">
          <div className="avatar avatar-violet">{initials}</div>
          <div className="profile-mini-copy"><strong>{displayName}</strong><span>{roleLabels[role]}</span></div>
          <button aria-label="Sign out" className="icon-button" onClick={handleSignOut} title="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button aria-label="Open navigation" className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
            <div className="breadcrumb"><span>CampusFlow</span><ChevronRight size={14} /><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search anything..." aria-label="Search anything" /><kbd>⌘ K</kbd></label>
            <div className="notification-wrap">
              <button className={`icon-button notification-button ${notificationsOpen ? "button-selected" : ""}`} aria-label="Notifications" onClick={() => setNotificationsOpen(v => !v)}><Bell size={19} /><i /></button>
              {notificationsOpen && <div className="notification-popover"><div className="popover-head"><strong>Notifications</strong><span className="status status-warning">3 new</span></div><div className="popover-item"><span className="notification-dot dot-amber" /><div><strong>Low attendance review</strong><p>3 students are below the configured threshold.</p><small>12 min ago</small></div></div><div className="popover-item"><span className="notification-dot dot-blue" /><div><strong>Marks pending review</strong><p>One PDF validation needs your confirmation.</p><small>1 hour ago</small></div></div><Link className="popover-footer" href={role === "student" ? "/student/notifications" : role === "admin" ? "/admin/attendance-alerts" : "/teacher/followups"} onClick={() => setNotificationsOpen(false)}>View all notifications <ChevronRight size={14} /></Link></div>}
            </div>
            <div className="topbar-divider" />
            <button className="topbar-user" onClick={() => router.push(role === "student" ? "/student/settings" : role === "teacher" ? "/teacher/settings" : "/settings")}><div className="avatar avatar-violet">{initials}</div><span><strong>{displayName}</strong><small>{role === "admin" ? "Administrator" : role === "teacher" ? "Faculty member" : "Student"}</small></span><ChevronDown size={15} /></button>
          </div>
        </header>
        {search.trim().length > 0 && <div className="search-results-banner"><Search size={15} /> Search query: <strong>{search}</strong><button onClick={() => setSearch("")} className="text-button">Clear</button></div>}
        <div className="page-content">{children}</div>
        <footer className="app-footer"><span>© 2026 CampusFlow ERP</span><span><span className="footer-dot" style={{ background: "#10b981" }} /> Live Backend Connected</span><span>Made for better campus experiences</span></footer>
      </main>
    </div>
  );
}
