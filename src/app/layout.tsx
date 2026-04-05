import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'StudyBuddys - Find Your Study Group',
  description: 'Academic help and structured study groups platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
