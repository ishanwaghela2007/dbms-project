"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, FileText, Filter, LockKeyhole, Plus, Search, UploadCloud, X } from "lucide-react";
import { Button, Card, PageHeading, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import type { Paper } from "@/types/erp";

export default function PapersLibrary({ scope }: { scope: "admin" | "teacher" | "student" }) {
  const [items, setItems] = useState<Paper[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Data Structures");
  const [paperCategory, setPaperCategory] = useState<Paper["category"]>("Question paper");
  const [access, setAccess] = useState<Paper["access"]>("Published");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    erpApi.listPapers().then(data => { if (active) setItems(data); }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Could not load papers."); });
    return () => { active = false; };
  }, []);
  const filtered = useMemo(() => items.filter(paper => `${paper.title} ${paper.subject} ${paper.fileName}`.toLowerCase().includes(query.toLowerCase()) && (category === "All categories" || paper.category === category)), [items, query, category]);
  const canUpload = scope !== "student";

  async function submitUpload(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (!file) { setMessage("Choose a PDF file first."); return; }
    if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 20 * 1024 * 1024) { setMessage("Choose a PDF file no larger than 20 MB."); return; }
    setBusy(true);
    try {
      const form = new FormData(); form.append("file", file); form.append("title", title || file.name.replace(/\.pdf$/i, "")); form.append("subject", subject); form.append("category", paperCategory); form.append("access", access);
      const response = await erpApi.uploadPaper(form);
      if (response.paper) setItems(current => [response.paper!, ...current]);
      setMessage(response.message); setUploadOpen(false); setFile(null); setTitle("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  async function openPaper(paper: Paper) {
    setMessage("");
    try {
      const result = await fetch(`${(process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api/v1").replace(/\/$/, "")}/papers/${encodeURIComponent(paper.id)}/access`, { credentials: "include", headers: { Authorization: `Bearer ${window.localStorage.getItem("college_erp_access_token") ?? ""}` } });
      if (!result.ok) throw new Error("You do not have permission to access this paper.");
      const body = await result.json() as { url?: string };
      if (!body.url) throw new Error("The file service did not return a delivery URL.");
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to open this paper."); }
  }

  return <>
    <PageHeading eyebrow="ACADEMIC RESOURCES" title="Papers library" description={scope === "student" ? "Browse question papers, answer keys and learning material available to you." : "Upload, organize and distribute course papers using controlled file access."} actions={canUpload ? <Button onClick={() => setUploadOpen(true)}><Plus size={15}/> Upload PDF</Button> : undefined} />
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-icon stat-icon-blue"><FileText size={20}/></div><div className="stat-value">{items.length}</div><div className="stat-label">Available documents</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-green"><Download size={20}/></div><div className="stat-value">{items.filter(p => p.category === "Question paper").length}</div><div className="stat-label">Question papers</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-violet"><LockKeyhole size={20}/></div><div className="stat-value">{items.filter(p => p.access === "Restricted").length}</div><div className="stat-label">Restricted documents</div></div>
      <div className="stat-card"><div className="stat-icon stat-icon-amber"><Filter size={20}/></div><div className="stat-value">{new Set(items.map(p => p.subject)).size}</div><div className="stat-label">Subjects represented</div></div>
    </div>
    <Card title="Document collection" subtitle="Only papers your account is authorized to access should appear here." action={<StatusPill>{filtered.length} documents</StatusPill>}>
      <div className="toolbar"><label className="input-wrap" style={{ flex: "1 1 250px", maxWidth: 440 }}><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, subject or filename"/></label><label className="input-wrap"><Filter size={15}/><select value={category} onChange={event => setCategory(event.target.value)} style={{ border: 0, background: "transparent", minWidth: 120, color: "#737991" }}><option>All categories</option><option>Question paper</option><option>Answer key</option><option>Study material</option></select></label></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Document</th><th>Subject / semester</th><th>Category</th><th>Uploaded by</th><th>Access</th><th></th></tr></thead><tbody>{filtered.map((paper, index) => <tr key={paper.id}><td><div className="table-name"><div className={`stat-icon ${index % 2 ? "stat-icon-violet" : "stat-icon-blue"}`} style={{ width: 36, height: 36, margin: 0 }}><FileText size={17}/></div><div><strong>{paper.title}</strong><small>{paper.fileName} · {paper.uploadedAt}</small></div></div></td><td>{paper.subject}<small style={{ display: "block", color: "#9399aa", marginTop: 4 }}>{paper.semester} · {paper.academicYear}</small></td><td><span className="chip">{paper.category}</span></td><td>{paper.uploadedBy}</td><td><StatusPill tone={paper.access === "Published" ? "success" : paper.access === "Restricted" ? "warning" : "neutral"}>{paper.access}</StatusPill></td><td><Button size="sm" variant="secondary" onClick={() => void openPaper(paper)}><Download size={13}/> Open</Button></td></tr>)}</tbody></table></div>
      {!filtered.length && <div className="empty-state"><div className="empty-icon"><Search size={24}/></div><h3>No papers found</h3><p>Try a different search or category.</p></div>}
    </Card>
    {message && <div className="notice notice-info" style={{ marginTop: 14 }}><FileText size={16}/><div>{message}</div><button className="text-button" onClick={() => setMessage("")}>Dismiss</button></div>}
    {uploadOpen && canUpload && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setUploadOpen(false); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="paper-upload-title"><div className="modal-header"><div><h2 id="paper-upload-title">Upload academic PDF</h2><p>The Paper & Media Service should validate the file and store it privately in Cloudinary.</p></div><button className="icon-button" onClick={() => setUploadOpen(false)} aria-label="Close upload dialog"><X size={18}/></button></div><form className="stack" style={{ gap: 14 }} onSubmit={submitUpload}><div className="field"><label>PDF file *</label><input required type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] ?? null)}/><span className="field-hint">20 MB maximum in this frontend.</span></div><div className="field"><label>Document title</label><input value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Data Structures MSE 2026"/></div><div className="field-grid"><div className="field"><label>Subject</label><select value={subject} onChange={event => setSubject(event.target.value)}>{["Data Structures", "Database Management Systems", "Design & Analysis of Algorithms", "Operating Systems", "Computer Networks", "Engineering Mathematics III"].map(option => <option key={option}>{option}</option>)}</select></div><div className="field"><label>Category</label><select value={paperCategory} onChange={event => setPaperCategory(event.target.value as Paper["category"])}><option>Question paper</option><option>Answer key</option><option>Study material</option></select></div><div className="field"><label>Delivery access</label><select value={access} onChange={event => setAccess(event.target.value as Paper["access"])}><option>Published</option><option>Restricted</option><option>Draft</option></select></div></div><div className="notice notice-warning"><LockKeyhole size={16}/><div><strong>Restricted file access</strong>Do not expose Cloudinary secrets or rely on a public URL for confidential examination documents. Delivery must be authorized by the backend.</div></div><div className="button-row" style={{ justifyContent: "flex-end" }}><Button type="button" variant="secondary" onClick={() => setUploadOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !file}>{busy ? "Uploading…" : <><UploadCloud size={14}/> Upload PDF</>}</Button></div></form></div></div>}
  </>;
}
