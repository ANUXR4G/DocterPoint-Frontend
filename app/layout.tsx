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
                  var pair = colors[colorKey] || colors.violet;
                  var root = document.documentElement;
                  root.setAttribute('data-theme-color', colorKey);
                  root.style.setProperty('--theme-primary', pair[0]);
                  root.style.setProperty('--theme-primary-hover', pair[1]);
                  root.style.setProperty('--theme-primary-foreground', '#ffffff');
                  root.style.setProperty('--primary-blue', pair[0]);
                  root.style.setProperty('--color-iris-accent', pair[0]);
                  root.style.setProperty('--color-clinical-cyan', pair[0]);
                  root.style.setProperty('--color-cyan-soft', pair[0]);
                  root.style.setProperty('--dashboard-accent', pair[0]);
                  root.style.setProperty('--solune-purple', pair[0]);
                  root.style.setProperty('--solune-purple-soft', 'color-mix(in srgb, ' + pair[0] + ' 14%, #ffffff)');
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
