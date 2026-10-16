import "./globals.css"
import type { Metadata } from "next"
import { Providers } from "./providers"
import { Plus_Jakarta_Sans } from "next/font/google"

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "GlucoGuide — Find doctors & book clinic visits",
  description:
    "Search doctors and clinics, book appointments, and manage diabetes care in one place.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} scheme-light dark:scheme-dark`}
      suppressHydrationWarning
    >
      <head>
        {/* Must run before hydration: Next throws this when a refresh arrives before the router mounts (dev restarts, stale chunks). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var KEY = 'gg-router-init-reload';
                function recover(err) {
                  var msg = String((err && err.message) || err || '');
                  if (msg.indexOf('Router action dispatched before initialization') === -1) return;
                  try {
                    var last = Number(sessionStorage.getItem(KEY) || 0);
                    if (Date.now() - last < 15000) return;
                    sessionStorage.setItem(KEY, String(Date.now()));
                  } catch (e) {}
                  location.reload();
                }
                addEventListener('error', function(e) { recover(e.error || e.message); });
                addEventListener('unhandledrejection', function(e) { recover(e.reason); });
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const userTheme = localStorage.getItem('theme');
                  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  const theme = userTheme || 'system';
                  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark);
                  document.documentElement.classList.toggle('dark', isDark);
                  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

                  var colors = {
                    violet: ['#b794f6', '#9b7fe8'],
                    blue: ['#7cb8ff', '#5aa3f0'],
                    cyan: ['#7dd3fc', '#38bdf8'],
                    green: ['#7bc4a3', '#5aad88'],
                    orange: ['#ff9a76', '#f07f58'],
                    rose: ['#f7a8c4', '#f08a8a'],
                    yellow: ['#f2c94c', '#d4a82a'],
                    zinc: ['#8a8580', '#6b6560']
                  };
                  var colorKey = localStorage.getItem('theme-color') || 'violet';
                  var pair = colors[colorKey];
                  var primary;
                  var hover;
                  var attr = colorKey;
                  if (pair) {
                    primary = pair[0];
                    hover = pair[1];
                  } else if (/^#[0-9a-fA-F]{6}$/.test(colorKey)) {
                    primary = colorKey;
                    hover = 'color-mix(in srgb, ' + colorKey + ' 82%, #000000)';
                    attr = 'custom';
                  } else {
                    primary = colors.violet[0];
                    hover = colors.violet[1];
                    attr = 'violet';
                  }
                  var root = document.documentElement;
                  root.setAttribute('data-theme-color', attr);
                  root.style.setProperty('--theme-primary', primary);
                  root.style.setProperty('--theme-primary-hover', hover);
                  root.style.setProperty('--theme-primary-foreground', '#ffffff');
                  root.style.setProperty('--primary-blue', primary);
                  root.style.setProperty('--color-iris-accent', primary);
                  root.style.setProperty('--color-clinical-cyan', primary);
                  root.style.setProperty('--color-cyan-soft', primary);
                  root.style.setProperty('--dashboard-accent', primary);
                  root.style.setProperty('--solune-purple', primary);
                  root.style.setProperty('--solune-purple-soft', 'color-mix(in srgb, ' + primary + ' 14%, #ffffff)');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="font-sans bg-[var(--solune-canvas)] text-[var(--solune-ink)] antialiased dark:bg-[#1a1816] dark:text-[#f5f2ee]"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
