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
        <meta name="theme-color" content="#1F1D26" />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root { height: 100%; background: #F6EAEA; }
          html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }
          body { overflow: hidden; overscroll-behavior: none; text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; -webkit-tap-highlight-color: transparent; }
          /* Real viewport height on mobile browsers (the URL bar made 100% taller than the visible area). */
          @supports (height: 100dvh) { html, body, #root { height: 100dvh; } }
          body, #root *, input, textarea, button { font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif !important; }
          ::selection { background: rgba(106, 75, 224, 0.22); }

          /* Slim, rounded scrollbars that stay out of the way (desktop browsers). */
          * { scrollbar-width: thin; scrollbar-color: rgba(60, 50, 90, 0.28) transparent; }
          ::-webkit-scrollbar { width: 10px; height: 10px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(60, 50, 90, 0.26); border-radius: 999px; border: 3px solid transparent; background-clip: content-box; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(60, 50, 90, 0.45); background-clip: content-box; border: 3px solid transparent; }

          /* Hover / press feedback on anything clickable, with short eased transitions (touch devices skip hover). */
          [role="button"], [role="tab"], [role="link"], [role="switch"], [role="radio"], [role="checkbox"] { transition: filter .16s ease, background-color .16s ease, opacity .16s ease, box-shadow .2s ease; }
          @media (hover: hover) and (pointer: fine) {
            [role="button"]:hover, [role="tab"]:hover, [role="link"]:hover { filter: brightness(0.97); }
            [role="button"]:active, [role="tab"]:active { filter: brightness(0.93); }
          }
          /* Keyboard focus only: a clear ring for keyboard users, none for mouse clicks. */
          :focus { outline: none; }
          :focus-visible { outline: 3px solid rgba(106, 75, 224, 0.55); outline-offset: 2px; border-radius: 12px; }
          input:focus-visible, textarea:focus-visible { outline: none; }

          @media (prefers-color-scheme: dark) {
            html, body, #root { background: #16111F; }
            * { scrollbar-color: rgba(220, 210, 255, 0.3) transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(220, 210, 255, 0.28); background-clip: content-box; }
            ::selection { background: rgba(160, 140, 255, 0.35); }
            @media (hover: hover) and (pointer: fine) { [role="button"]:hover, [role="tab"]:hover, [role="link"]:hover { filter: brightness(1.12); } [role="button"]:active, [role="tab"]:active { filter: brightness(1.2); } }
          }
          @media (prefers-reduced-motion: reduce) {
            html { scroll-behavior: auto; }
            *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
          }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
