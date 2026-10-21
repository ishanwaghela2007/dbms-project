"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

const consentCookie = "campusflow_cookie_consent";

function hasAcceptedCookies() {
  return document.cookie.split(";").some(cookie => cookie.trim() === `${consentCookie}=accepted`);
}

export function CookieConsentGate({ children }: { children: ReactNode }) {
  const [hasConsent, setHasConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    if (hasAcceptedCookies()) queueMicrotask(() => setHasConsent(true));
  }, []);

  async function recordConsent(decision: "ACCEPTED" | "REJECTED") {
    const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    const baseUrl = (configuredBaseUrl || (process.env.NODE_ENV === "production" ? "" : "http://localhost:4000/api/v1")).replace(/\/$/, "");
    if (!baseUrl) throw new Error("Cookie preference service is not configured.");
    const response = await fetch(`${baseUrl}/cookie-consents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, requestedPath: pathname }),
      credentials: "include",
    });
    if (!response.ok) throw new Error("We could not save your cookie preference. Please try again.");
  }

  async function acceptCookies() {
    setSaving(true);
    setError("");
    try {
      await recordConsent("ACCEPTED");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not save your cookie preference. Please try again.");
      setSaving(false);
      return;
    }
    document.cookie = `${consentCookie}=accepted; path=/; max-age=31536000; SameSite=Lax`;
    setHasConsent(true);
  }

  async function rejectCookies() {
    setSaving(true);
    try {
      await recordConsent("REJECTED");
    } finally {
      window.location.replace("https://www.google.com/");
    }
  }

  return (
    <>
      {children}
      {pathname === "/login" && !hasConsent && (
        <aside className="cookie-consent-lock" role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title" aria-describedby="cookie-consent-description">
          <div className="cookie-consent-banner">
            <span className="cookie-consent-icon" aria-hidden="true">🍪</span>
            <div className="cookie-consent-copy">
              <strong id="cookie-consent-title">Cookie preferences</strong>
              <p id="cookie-consent-description">We use essential cookies to keep CampusFlow secure and remember your session. Your choice, IP address, user agent, and timestamp are recorded. <a href="/privacy" target="_blank" rel="noreferrer">Privacy notice</a></p>
            </div>
            <div className="cookie-consent-actions">
              <button className="cookie-consent-reject" type="button" onClick={() => void rejectCookies()} disabled={saving}>Reject</button>
              <button className="cookie-consent-accept" type="button" onClick={() => void acceptCookies()} disabled={saving} autoFocus>{saving ? "Saving…" : "Accept"}</button>
            </div>
            {error && <p className="cookie-consent-error" role="alert">{error}</p>}
          </div>
        </aside>
      )}
    </>
  );
}
