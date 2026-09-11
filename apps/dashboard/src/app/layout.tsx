import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Toaster } from '@/components/layout/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Nexora — Powerful Automation. Smarter Communities.',
    template: '%s · Nexora',
  },
  description:
    'Nexora is the all-in-one Discord bot platform for moderation, automation, analytics and engagement — with a premium dashboard your whole team can use.',
  applicationName: 'Nexora',
};

export const viewport: Viewport = {
  themeColor: '#09090f',
  width: 'device-width',
  initialScale: 1,
};

/** Applies the persisted theme before first paint to avoid a flash. */
const themeInitScript = `try{var t=localStorage.getItem('nexora-theme');if(t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
