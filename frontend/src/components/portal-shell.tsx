"use client";
/* eslint-disable @next/next/no-img-element -- Profile photos can be browser object URLs or authenticated remote URLs, which bypass the optimized image loader. */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { erpApi } from "@/lib/api/erp";
import { apiRequest } from "@/lib/api/client";
import { fuzzySearch } from "@/lib/search/fuzzy";
import { getAvatarUrl } from "@/lib/utils/avatar";
import {
  Activity, Bell, BookOpen, CalendarDays, ChevronDown, ChevronRight,
  CircleHelp, ClipboardCheck, FileCheck2, FileText, GraduationCap,
  LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldAlert, ShieldCheck, UserPlus, Users,
  UsersRound, X, GraduationCap as FacultyIcon, type LucideIcon,
} from "lucide-react";

type NavItem = { label: string; href: string; icon: LucideIcon; badge?: string };
type NavGroup = { title: string; items: NavItem[] };
type SearchItem = NavItem & { description: string; keywords: string; roles: Array<"admin" | "teacher" | "student"> };

const adminGroups: NavGroup[] = [
  { title: "OVERVIEW", items: [{ label: "Dashboard", href: "/admin", icon: LayoutDashboard }] },
  { title: "PEOPLE", items: [
    { label: "Students", href: "/admin/students", icon: Users },
    { label: "Teachers", href: "/admin/teachers", icon: FacultyIcon },
    { label: "Register account", href: "/admin/register", icon: UserPlus },
    { label: "Classes & subjects", href: "/admin/academics", icon: BookOpen },
  ] },
  { title: "ACADEMICS", items: [
    { label: "Papers library", href: "/papers", icon: FileText },
    { label: "Attendance alerts", href: "/admin/attendance-alerts", icon: Activity },
  ] },
];
const teacherGroups: NavGroup[] = [
  { title: "TEACHING SPACE", items: [
    { label: "Overview", href: "/teacher", icon: LayoutDashboard },
    { label: "Marks & results", href: "/teacher/marks", icon: FileCheck2 },
    { label: "Attendance register", href: "/teacher/attendance", icon: ClipboardCheck },
    { label: "Student follow-ups", href: "/teacher/followups", icon: UsersRound },
  ] },
  { title: "RESOURCES", items: [
    { label: "Meeting requests", href: "/teacher/meetings", icon: CalendarDays },
    { label: "Papers library", href: "/teacher/papers", icon: FileText },
  ] },
];
const studentGroups: NavGroup[] = [
  { title: "MY CAMPUS", items: [
    { label: "My overview", href: "/student", icon: LayoutDashboard },
    { label: "My results", href: "/student/results", icon: FileCheck2 },
    { label: "Notifications", href: "/student/notifications", icon: Bell },
    { label: "Teacher meetings", href: "/student/meetings", icon: CalendarDays },
    { label: "Papers library", href: "/student/papers", icon: FileText },
  ] },
];

const searchItems: SearchItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard, description: "Institution overview and analytics", keywords: "home overview metrics reports analytics", roles: ["admin"] },
  { label: "Students", href: "/admin/students", icon: Users, description: "Student profiles, enrollment and attendance", keywords: "learners pupils enrollment records student directory", roles: ["admin"] },
  { label: "Teachers", href: "/admin/teachers", icon: FacultyIcon, description: "Faculty profiles and departments", keywords: "faculty staff professor lecturers teachers directory", roles: ["admin"] },
  { label: "Register account", href: "/admin/register", icon: UserPlus, description: "Create an institutional account", keywords: "create user invite account register", roles: ["admin"] },
  { label: "Classes & subjects", href: "/admin/academics", icon: BookOpen, description: "Programs, semesters and subjects", keywords: "courses syllabus subs subjects academics classes offerings curriculum timetable", roles: ["admin"] },
  { label: "Attendance alerts", href: "/admin/attendance-alerts", icon: Activity, description: "Students needing attendance follow-up", keywords: "low attendance shortage alerts warnings defaulter", roles: ["admin"] },
  { label: "Teacher dashboard", href: "/teacher", icon: LayoutDashboard, description: "Teaching workspace overview", keywords: "home faculty overview dashboard", roles: ["teacher"] },
  { label: "Marks & results", href: "/teacher/marks", icon: FileCheck2, description: "Review, validate and publish marks", keywords: "scores grades pdf assessment marks test exam results", roles: ["teacher"] },
  { label: "Attendance register", href: "/teacher/attendance", icon: ClipboardCheck, description: "Record attendance for a class", keywords: "presence absent register class lecture attendance roll call", roles: ["teacher"] },
  { label: "Student follow-ups", href: "/teacher/followups", icon: UsersRound, description: "Manage low-attendance follow-ups", keywords: "meetings alerts students attendance followups", roles: ["teacher"] },
  { label: "Meeting requests", href: "/teacher/meetings", icon: CalendarDays, description: "Review student meeting requests", keywords: "appointments schedule requests meetings slots", roles: ["teacher"] },
  { label: "Student dashboard", href: "/student", icon: LayoutDashboard, description: "Your academic overview", keywords: "home overview student dashboard progress", roles: ["student"] },
  { label: "My results", href: "/student/results", icon: FileCheck2, description: "View assessment marks and grades", keywords: "scores marks grades result grade card report card test exam", roles: ["student"] },
  { label: "Notifications", href: "/student/notifications", icon: Bell, description: "Read campus updates", keywords: "alerts announcements messages notifications inbox", roles: ["student"] },
  { label: "Teacher meetings", href: "/student/meetings", icon: CalendarDays, description: "View and request faculty meetings", keywords: "appointments schedule requests book meeting teacher meet", roles: ["student"] },
  { label: "Papers library", href: "/papers", icon: FileText, description: "Browse academic papers and resources", keywords: "documents pdf uploads study material question papers previous papers notes", roles: ["admin", "teacher", "student"] },
  { label: "Linear Algebra (MA301)", href: "/admin/academics", icon: BookOpen, description: "Mathematics · Semester 3 subject", keywords: "linear algebra math mathematics ma301 subs subjects course syllabus", roles: ["admin"] },
  { label: "Database Management Systems (CECS302)", href: "/admin/academics", icon: BookOpen, description: "DBMS & SQL · Semester 3 subject", keywords: "database management systems dbms sql queries cecs302 subs subjects course syllabus", roles: ["admin"] },
  { label: "Data Structures (CECS304)", href: "/admin/academics", icon: BookOpen, description: "Trees, Graphs & Lists · Semester 3 subject", keywords: "data structures dsa trees graphs lists cecs304 subs subjects course syllabus", roles: ["admin"] },
  { label: "Operating Systems (CECS403)", href: "/admin/academics", icon: BookOpen, description: "Processes, Threads & Memory · Semester 4 subject", keywords: "operating systems os linux processes threads cecs403 subs subjects course syllabus", roles: ["admin"] },
  { label: "Computer Networks (CECS402)", href: "/admin/academics", icon: BookOpen, description: "TCP/IP & Networking · Semester 4 subject", keywords: "computer networks cn networking protocols tcp ip cecs402 subs subjects course syllabus", roles: ["admin"] },
  { label: "Design & Analysis of Algorithms (CECS405)", href: "/admin/academics", icon: BookOpen, description: "Dynamic & Greedy Algorithms · Semester 4 subject", keywords: "design analysis algorithms daa dynamic greedy cecs405 subs subjects course syllabus", roles: ["admin"] },
  { label: "Software Engineering (CECS404)", href: "/admin/academics", icon: BookOpen, description: "Agile & SDLC · Semester 4 subject", keywords: "software engineering se sdlc agile design cecs404 subs subjects course syllabus", roles: ["admin"] },
  { label: "Settings", href: "/settings", icon: Settings, description: "Profile, password and notification preferences", keywords: "account profile security avatar password settings", roles: ["admin"] },
  { label: "Settings", href: "/teacher/settings", icon: Settings, description: "Profile, password and notification preferences", keywords: "account profile security avatar password settings", roles: ["teacher"] },
  { label: "Settings", href: "/student/settings", icon: Settings, description: "Profile, password and notification preferences", keywords: "account profile security avatar password settings", roles: ["student"] },
  { label: "Privacy", href: "/privacy", icon: ShieldCheck, description: "Cookie and privacy information", keywords: "cookies consent data privacy gdpr", roles: ["admin", "teacher", "student"] },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id?: string; email?: string; fullName?: string; accountType?: string; avatar_public_id?: string; avatarUrl?: string } | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"checking" | "authenticated" | "forbidden" | "unauthorized">("checking");
  const [forbiddenMessage, setForbiddenMessage] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  type PopoverNotif = { id: string; title: string; message: string; kind: string; isRead: boolean; createdAt?: string };
  const [popoverNotifs, setPopoverNotifs] = useState<PopoverNotif[]>([]);
  const [popoverLoading, setPopoverLoading] = useState(false);

  useEffect(() => {
    try {
      const token = window.localStorage.getItem("college_erp_access_token");
      if (!token) {
        queueMicrotask(() => setAuthStatus("unauthorized"));
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        return;
      }

      const stored = window.localStorage.getItem("college_erp_user");
      let userRole = "STUDENT";
      let isAdmin = false;
      if (stored) {
        try {
          const u = JSON.parse(stored);
          userRole = (
            u.accountType ||
            (u.is_admin ? "ADMIN" : "") ||
            u.role ||
            u.roles?.[0] ||
            "STUDENT"
          ).toUpperCase();
          isAdmin = Boolean(u.is_admin || userRole === "ADMIN");
        } catch {}
      }

      if (pathname.startsWith("/admin") && !isAdmin) {
        queueMicrotask(() => {
          setAuthStatus("forbidden");
          setForbiddenMessage("This section is restricted to institutional administrators.");
        });
        return;
      }

      if (pathname.startsWith("/teacher") && userRole !== "TEACHER" && !isAdmin) {
        queueMicrotask(() => {
          setAuthStatus("forbidden");
          setForbiddenMessage("This workspace is reserved for faculty members.");
        });
        return;
      }

      if (pathname.startsWith("/student") && userRole !== "STUDENT" && !isAdmin) {
        queueMicrotask(() => {
          setAuthStatus("forbidden");
          setForbiddenMessage("This workspace is reserved for enrolled students.");
        });
        return;
      }

      document.cookie = `college_erp_access_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
      document.cookie = `college_erp_user_role=${encodeURIComponent(userRole)}; path=/; max-age=604800; SameSite=Lax`;

      queueMicrotask(() => setAuthStatus("authenticated"));
    } catch {
      queueMicrotask(() => setAuthStatus("unauthorized"));
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [pathname, router]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("college_erp_sidebar_collapsed");
      if (saved === "true") queueMicrotask(() => setSidebarCollapsed(true));
    } catch {}
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem("college_erp_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    function syncFromStorage() {
      try {
        const stored = window.localStorage.getItem("college_erp_user");
        if (stored) {
          const u = JSON.parse(stored);
          setCurrentUser(u);
          const resolved = getAvatarUrl(u.avatarUrl || u.avatar_public_id);
          if (resolved) setAvatarUrl(resolved);
        }
      } catch {}
    }

    function handleProfileUpdated(e: Event) {
      // Use detail.avatarUrl if available (fired immediately from settings after upload)
      const detail = (e as CustomEvent<{ avatarUrl?: string; avatar_public_id?: string }>).detail;
      if (detail?.avatarUrl) {
        setAvatarUrl(detail.avatarUrl);
      } else if (detail?.avatar_public_id) {
        const resolved = getAvatarUrl(detail.avatar_public_id);
        if (resolved) setAvatarUrl(resolved);
      }
      // Always re-sync name from localStorage (may have been updated)
      syncFromStorage();
    }

    syncFromStorage();
    window.addEventListener("college_erp_profile_updated", handleProfileUpdated);

    erpApi.getMyProfile().then((data) => {
      const d = data as Record<string, unknown>;
      if (d) {
        const fullName = (d.full_name as string) || (d.fullName as string);
        const email = d.email as string;
        const avatarPublicId = d.avatar_public_id as string;
        // Only set from API if we don't already have a local URL
        setAvatarUrl(prev => {
          if (prev) return prev; // keep the locally resolved one
          return getAvatarUrl(avatarPublicId) || prev;
        });
        setCurrentUser((prev) => {
          const updated = {
            ...prev,
            fullName: fullName || prev?.fullName,
            email: email || prev?.email,
            avatar_public_id: avatarPublicId || prev?.avatar_public_id,
            avatarUrl: prev?.avatarUrl,
          };
          try {
            const stored = window.localStorage.getItem("college_erp_user");
            const cur = stored ? JSON.parse(stored) : {};
            window.localStorage.setItem("college_erp_user", JSON.stringify({ ...cur, ...updated }));
          } catch {}
          return updated;
        });
      }
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("jwt") || msg.includes("token")) {
        window.localStorage.removeItem("college_erp_access_token");
        window.localStorage.removeItem("college_erp_user");
        try {
          document.cookie = "college_erp_access_token=; path=/; max-age=0";
          document.cookie = "college_erp_user_role=; path=/; max-age=0";
        } catch {}
        setAuthStatus("unauthorized");
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      }
    });

    return () => {
      window.removeEventListener("college_erp_profile_updated", handleProfileUpdated);
    };
  }, [pathname, router]);

  const groups = role === "admin" ? adminGroups : role === "teacher" ? teacherGroups : studentGroups;
  const searchResults = useMemo(() => fuzzySearch(
    search,
    searchItems
      .filter((item) => item.roles.includes(role))
      .map((item) => ({ item, text: `${item.label} ${item.description} ${item.keywords}` })),
  ), [role, search]);

  useEffect(() => {
    function openShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", openShortcut);
    return () => window.removeEventListener("keydown", openShortcut);
  }, []);

  function chooseSearchResult(item: SearchItem) {
    setSearch("");
    setSearchOpen(false);
    router.push(item.href);
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && searchResults.length) {
      event.preventDefault();
      setActiveSearchIndex((index) => (index + 1) % searchResults.length);
    } else if (event.key === "ArrowUp" && searchResults.length) {
      event.preventDefault();
      setActiveSearchIndex((index) => (index - 1 + searchResults.length) % searchResults.length);
    } else if (event.key === "Enter" && searchResults[activeSearchIndex]) {
      event.preventDefault();
      chooseSearchResult(searchResults[activeSearchIndex].item);
    } else if (event.key === "Escape") {
      setSearch("");
      setSearchOpen(false);
      searchInput.current?.blur();
    }
  }

  const pageTitle = useMemo(() => {
    const all = [...adminGroups, ...teacherGroups, ...studentGroups].flatMap(g => g.items);
    return all.find(item => item.href === pathname)?.label ?? (pathname.endsWith("/settings") ? "Settings" : "Campus workspace");
  }, [pathname]);
  const roleLabels = { admin: "Administrator", teacher: "Faculty workspace", student: "Student workspace" };

  const displayName = currentUser?.fullName || (role === "student" ? "Student" : role === "teacher" ? "Faculty" : "Administrator");
  const initials = displayName.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("").toUpperCase() || (role === "admin" ? "AD" : role === "teacher" ? "FA" : "ST");

  function handleSignOut() {
    window.localStorage.removeItem("college_erp_access_token");
    window.localStorage.removeItem("college_erp_user");
    try {
      document.cookie = "college_erp_access_token=; path=/; max-age=0";
      document.cookie = "college_erp_user_role=; path=/; max-age=0";
    } catch {}
    router.replace("/login");
  }

  if (authStatus === "checking" || authStatus === "unauthorized") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8f9fc" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid #e0e7ff", borderTopColor: "#4f46e5", animation: "spin 0.8s linear infinite" }} />
        <p style={{ marginTop: 16, color: "#64748b", fontSize: "0.875rem", fontWeight: 500 }}>
          {authStatus === "unauthorized" ? "Redirecting to institutional login…" : "Verifying access credentials…"}
        </p>
      </div>
    );
  }

  if (authStatus === "forbidden") {
    const userRole = (
      currentUser?.accountType ||
      ((currentUser as unknown as { is_admin?: boolean })?.is_admin ? "ADMIN" : "STUDENT")
    ).toUpperCase();
    const destination = userRole === "ADMIN" ? "/admin" : userRole === "TEACHER" ? "/teacher" : "/student";
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8f9fc", padding: 24, textAlign: "center" }}>
        <div style={{ width: 68, height: 68, borderRadius: 20, background: "#fef2f2", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, border: "1px solid #fee2e2" }}>
          <ShieldAlert size={34} />
        </div>
        <h1 style={{ fontSize: "1.625rem", fontWeight: 700, color: "#0f172a", marginBottom: 8, letterSpacing: "-0.02em" }}>Access Restricted</h1>
        <p style={{ color: "#64748b", maxWidth: 460, marginBottom: 24, fontSize: "0.9375rem", lineHeight: 1.5 }}>
          {forbiddenMessage || "You do not have the required role or authorization level to access this route."}
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={() => router.push(destination)}
          >
            Return to My Workspace
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={handleSignOut}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-frame ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      {mobileOpen && <button aria-label="Close navigation" className="mobile-scrim" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className="brand-header">
          <Link href={role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/student"} className="brand-lockup" onClick={() => setMobileOpen(false)} title="CampusFlow College ERP">
            <span className="brand-mark"><GraduationCap size={22} strokeWidth={2.2} /></span>
            <span className="brand-copy"><strong>CampusFlow</strong><small>COLLEGE ERP</small></span>
          </Link>
          <button
            type="button"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}
            className="icon-button sidebar-collapse-btn desktop-only"
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button type="button" aria-label="Close navigation" className="icon-button sidebar-close" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>

        <div className="workspace-switcher" title={`Workspace: ${roleLabels[role]}`}>
          <span className="workspace-icon">{role === "admin" ? <ShieldCheck size={17} /> : role === "teacher" ? <BookOpen size={17} /> : <GraduationCap size={17} />}</span>
          <span className="workspace-meta"><small>WORKSPACE</small><strong>{roleLabels[role]}</strong></span>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          {groups.map((group) => (
            <div className="nav-group" key={group.title}>
              <p className="nav-section-label">{group.title}</p>
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/admin" && item.href !== "/teacher" && item.href !== "/student" && pathname.startsWith(`${item.href}/`));
                return <Link key={`${group.title}-${item.label}`} href={item.href} onClick={() => setMobileOpen(false)} className={`nav-item ${active ? "nav-item-active" : ""}`} title={item.label}>
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
        <Link href={role === "student" ? "/student/settings" : role === "teacher" ? "/teacher/settings" : "/settings"} className={`nav-item settings-link ${pathname.endsWith("/settings") ? "nav-item-active" : ""}`} title="Settings"><Settings size={18} /><span>Settings</span></Link>
        <div className="profile-mini">
          <div className="avatar avatar-violet">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                onError={() => setAvatarUrl(null)}
              />
            ) : (
              initials
            )}
          </div>
          <div className="profile-mini-copy"><strong>{displayName}</strong><span>{roleLabels[role]}</span></div>
          <button aria-label="Sign out" className="icon-button" onClick={handleSignOut} title="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button aria-label="Open navigation" className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
            <button
              type="button"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Minimize sidebar"}
              className="icon-button desktop-sidebar-toggle"
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </button>
            <div className="breadcrumb"><span>CampusFlow</span><ChevronRight size={14} /><strong>{pageTitle}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="search-command">
              <label className="global-search">
                <Search size={17} />
                <input
                  ref={searchInput}
                  value={search}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(event) => { setSearch(event.target.value); setActiveSearchIndex(0); }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search anything..."
                  aria-label="Search anything"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls="global-search-results"
                  aria-expanded={searchOpen && Boolean(search.trim())}
                />
                <kbd>⌘ K</kbd>
              </label>
              {searchOpen && search.trim() && (
                <div className="search-results" id="global-search-results" role="listbox" aria-label="Search results">
                  <div className="search-results-heading">Pages and actions</div>
                  {searchResults.length ? searchResults.map(({ item }, index) => {
                    const Icon = item.icon;
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={index === activeSearchIndex}
                        className={`search-result ${index === activeSearchIndex ? "search-result-active" : ""}`}
                        key={item.href}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseSearchResult(item)}
                        onMouseEnter={() => setActiveSearchIndex(index)}
                      >
                        <span className="search-result-icon"><Icon size={16} /></span>
                        <span><strong>{item.label}</strong><small>{item.description}</small></span>
                        <ChevronRight size={15} />
                      </button>
                    );
                  }) : <div className="search-empty">No matching pages or actions.</div>}
                  <div className="search-results-hint"><span>↑ ↓ to navigate</span><span>↵ to open</span><span>Esc to close</span></div>
                </div>
              )}
            </div>
            <div className="notification-wrap">
              <button
                className={`icon-button notification-button ${notificationsOpen ? "button-selected" : ""}`}
                aria-label="Notifications"
                onClick={() => {
                  setNotificationsOpen(v => {
                    const opening = !v;
                    if (opening) {
                      setPopoverLoading(true);
                      const endpoint = role === "student" ? "/student/notifications?limit=5" : role === "teacher" ? "/teacher/dashboard" : "/admin/dashboard";
                      if (role === "student") {
                        apiRequest<PopoverNotif[]>("/student/notifications?limit=5").then(items => {
                          setPopoverNotifs((items || []).slice(0, 5));
                        }).catch(() => {}).finally(() => setPopoverLoading(false));
                      } else {
                        // For admin/teacher: pull low-attendance followups as alerts
                        apiRequest<{ lowAttendanceFlags?: number; attendanceAlerts?: number; assignedSubjects?: number; marksToFinalize?: number }>(endpoint).then(data => {
                          const items: PopoverNotif[] = [];
                          if (data) {
                            const alerts = (data as Record<string, number>).attendanceAlerts ?? (data as Record<string, number>).lowAttendanceFlags ?? 0;
                            const marks = (data as Record<string, number>).marksToFinalize ?? 0;
                            if (alerts > 0) items.push({ id: "alert-attendance", title: "Low attendance follow-ups", message: `${alerts} student${alerts !== 1 ? "s" : ""} need${alerts === 1 ? "s" : ""} a follow-up.`, kind: "attendance", isRead: false });
                            if (marks > 0) items.push({ id: "alert-marks", title: "Marks pending review", message: `${marks} assessment${marks !== 1 ? "s" : ""} need${marks === 1 ? "s" : ""} your confirmation.`, kind: "marks", isRead: false });
                          }
                          setPopoverNotifs(items);
                        }).catch(() => setPopoverNotifs([])).finally(() => setPopoverLoading(false));
                      }
                    }
                    return opening;
                  });
                }}
              >
                <Bell size={19} />
                {popoverNotifs.filter(n => !n.isRead).length > 0 && <i />}
              </button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div className="popover-head">
                    <strong>Notifications</strong>
                    {popoverLoading
                      ? <span className="status status-neutral">Loading…</span>
                      : popoverNotifs.filter(n => !n.isRead).length > 0
                        ? <span className="status status-warning">{popoverNotifs.filter(n => !n.isRead).length} new</span>
                        : <span className="status status-neutral">Up to date</span>
                    }
                  </div>
                  {popoverLoading && <div className="popover-item" style={{ color: "#9198b0", fontSize: 13 }}>Fetching notifications…</div>}
                  {!popoverLoading && popoverNotifs.length === 0 && (
                    <div className="popover-item" style={{ color: "#9198b0", fontSize: 13 }}>No new notifications.</div>
                  )}
                  {!popoverLoading && popoverNotifs.map(n => (
                    <div
                      key={n.id}
                      className="popover-item"
                      style={{ cursor: n.id.startsWith("alert-") ? "default" : "pointer" }}
                      onClick={() => {
                        if (!n.id.startsWith("alert-") && !n.isRead) {
                          erpApi.markNotificationRead(n.id).catch(() => {});
                          setPopoverNotifs(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x));
                        }
                      }}
                    >
                      <span className={`notification-dot ${n.kind === "attendance" ? "dot-amber" : n.kind === "meeting" ? "dot-blue" : n.kind === "marks" ? "dot-violet" : "dot-blue"}`} />
                      <div>
                        <strong>{n.title}</strong>
                        <p>{n.message}</p>
                        {n.createdAt && (
                          <small>{(() => {
                            const diff = Date.now() - new Date(n.createdAt).getTime();
                            if (diff < 60000) return "Just now";
                            if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
                            if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
                            return new Date(n.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                          })()}</small>
                        )}
                      </div>
                    </div>
                  ))}
                  <Link
                    className="popover-footer"
                    href={role === "student" ? "/student/notifications" : role === "admin" ? "/admin/attendance-alerts" : "/teacher/followups"}
                    onClick={() => setNotificationsOpen(false)}
                  >
                    View all notifications <ChevronRight size={14} />
                  </Link>
                </div>
              )}
            </div>
            <div className="topbar-divider" />
            <button className="topbar-user" onClick={() => router.push(role === "student" ? "/student/settings" : role === "teacher" ? "/teacher/settings" : "/settings")}>
              <div className="avatar avatar-violet">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    onError={() => setAvatarUrl(null)}
                  />
                ) : (
                  initials
                )}
              </div>
              <span><strong>{displayName}</strong><small>{role === "admin" ? "Administrator" : role === "teacher" ? "Faculty member" : "Student"}</small></span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>
        <div className="page-content">{children}</div>
        <footer className="app-footer"><span>© 2026 CampusFlow ERP</span><span><span className="footer-dot" style={{ background: "#10b981" }} /> Live Backend Connected</span><span>Made for better campus experiences</span></footer>
      </main>
    </div>
  );
}
