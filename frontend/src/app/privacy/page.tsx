import Link from "next/link";

export const metadata = {
  title: "Privacy Notice | CampusFlow ERP",
  description: "How CampusFlow handles cookie-consent records.",
};

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <article className="privacy-card">
        <p className="eyebrow">CAMPUSFLOW ERP</p>
        <h1>Privacy notice</h1>
        <p>CampusFlow records your cookie-consent decision, IP address, browser user agent, the page where you made the choice, and the time of the decision. This information is used to secure the service and demonstrate consent.</p>
        <h2>Retention and access</h2>
        <p>Consent records are retained for the period configured by the institution, which is 90 days by default. Access is restricted to authorized administrators and service operators.</p>
        <h2>Your choices</h2>
        <p>You may reject non-essential cookies and leave the website. Essential cookies are required for secure sign-in and session management.</p>
        <p className="privacy-back"><Link href="/login">Return to sign in</Link></p>
      </article>
    </main>
  );
}
