"use client";

import { useEffect, useState } from "react";
import { Download, FileCheck2, TrendingUp } from "lucide-react";
import { Button, Card, PageHeading, StatCard, StatusPill } from "@/components/ui";
import { erpApi } from "@/lib/api/erp";
import { isDemoMode } from "@/lib/api/client";
import { demoStudentResults } from "@/lib/data/demo";
import type { StudentAssessmentResult } from "@/types/erp";



export default function StudentResultsPage() {
  const [results, setResults] = useState<StudentAssessmentResult[]>(isDemoMode ? demoStudentResults : []);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (isDemoMode) return;
    let active = true;
    erpApi.listStudentResults().then(data => { if (active) setResults(data); }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "Could not load results."); });
    return () => { active = false; };
  }, []);
  const published = results.filter(result => result.status === "Published" && result.obtained !== null);
  const average = Math.round(published.reduce((sum, result) => sum + (result.obtained ?? 0) / result.max * 100, 0) / Math.max(published.length, 1));
  return <>
    {loadError && <div className="notice notice-danger" style={{ marginBottom: 14 }}><FileCheck2 size={16}/><div><strong>Results unavailable</strong>{loadError}</div></div>}
    <PageHeading eyebrow="ACADEMIC RECORD" title="My results" description="Review your published assessment marks and track your academic progress." actions={<Button variant="secondary" onClick={() => window.print()}><Download size={15}/> Print results</Button>} />
    <div className="stat-grid"><StatCard label="Published assessments" value={String(published.length)} hint="Current semester" icon={FileCheck2} color="blue"/><StatCard label="Average score" value={`${average}%`} hint="Published results only" icon={TrendingUp} color="green"/><StatCard label="Awaiting publication" value={String(results.length - published.length)} hint="Not included in average" icon={FileCheck2} color="amber"/><StatCard label="Semester" value="3" hint="B.Tech CSE" icon={FileCheck2} color="violet"/></div>
    <Card title="Assessment results" subtitle="Unpublished marks are not displayed as final results.">
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Subject</th><th>Assessment</th><th>Marks obtained</th><th>Percentage</th><th>Publication</th></tr></thead><tbody>{results.map(row=><tr key={row.code+row.assessment}><td><strong>{row.subject}</strong><small style={{ display: "block", color: "#9298aa", marginTop: 4 }}>{row.code}</small></td><td>{row.assessment}</td><td>{row.status === "Published" && row.obtained !== null ? <strong>{row.obtained}/{row.max}</strong> : "—"}</td><td>{row.status === "Published" && row.obtained !== null ? `${Math.round(row.obtained / row.max * 100)}%` : "—"}</td><td><StatusPill tone={row.status === "Published" ? "success" : "warning"}>{row.status}</StatusPill></td></tr>)}</tbody></table></div>
      <p className="helper-text" style={{ marginTop: 16 }}>{isDemoMode ? "Sample results for UI demonstration. Production results must be filtered to the authenticated student." : "These results are returned for the authenticated student by the Marks Service."}</p>
    </Card>
  </>;
}
