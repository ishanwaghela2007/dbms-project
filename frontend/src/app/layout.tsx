import type { Metadata } from "next";
import { CookieConsentGate } from "@/components/cookie-consent-gate";
import { ThemeProvider } from "@/lib/theme/theme-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusFlow ERP | College Management",
  description: "A connected academic workspace for college administrators, faculty and students.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('college_erp_theme');
                  var isDark = false;
                  if (stored === 'dark') {
                    isDark = true;
                  } else if (stored === 'light') {
                    isDark = false;
                  } else {
                    isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  }
                  var root = document.documentElement;
                  root.setAttribute('data-theme', isDark ? 'dark' : 'light');
                  if (isDark) {
                    root.classList.add('dark');
                    root.classList.remove('light');
                  } else {
                    root.classList.add('light');
                    root.classList.remove('dark');
                  }
                  var meta = document.querySelector('meta[name="color-scheme"]');
                  if (meta) {
                    meta.content = stored ? (isDark ? 'dark' : 'light') : 'light dark';
                  }
                } catch (e) {}

                if (typeof window !== 'undefined') {
                  window.addEventListener('unhandledrejection', function(event) {
                    var str = (event && event.reason && (event.reason.stack || event.reason.message || String(event.reason))) || '';
                    if (str.indexOf('chrome-extension://') !== -1 || str.indexOf('moz-extension://') !== -1) {
                      event.preventDefault();
                    }
                  });
                }
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <CookieConsentGate>{children}</CookieConsentGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
