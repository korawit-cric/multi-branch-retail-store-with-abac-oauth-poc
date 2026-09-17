import type { Metadata } from 'next';

import { Providers } from '../providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Branch & Co | Store workspace',
  description: 'External OAuth with revocable PostgreSQL application sessions',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
