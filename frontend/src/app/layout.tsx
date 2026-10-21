import type { Metadata } from "next";
import { CookieConsentGate } from "@/components/cookie-consent-gate";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusFlow ERP | College Management",
  description: "A connected academic workspace for college administrators, faculty and students.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.addEventListener('unhandledrejection', function(event) {
                  var str = (event && event.reason && (event.reason.stack || event.reason.message || String(event.reason))) || '';
                  if (str.indexOf('chrome-extension://') !== -1 || str.indexOf('moz-extension://') !== -1) {
                    event.preventDefault();
                  }
                });
              }
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning><CookieConsentGate>{children}</CookieConsentGate></body>
    </html>
  );
}
