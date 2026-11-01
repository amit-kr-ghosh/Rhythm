import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

/**
 * Web shell. Loads Plus Jakarta Sans (the geometric sans used in the design reference) from Google Fonts with a system
 * fallback, so the web build matches the mockup. Native apps use the platform font.
 */
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root { height: 100%; background: #F6EAEA; }
          body, #root *, input, textarea, button { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif !important; }
          @media (prefers-color-scheme: dark) { html, body, #root { background: #16111F; } }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
