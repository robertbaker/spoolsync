import { socialCardStyles, type SocialCardFonts } from "./styles";

export function socialCardHtml(fonts: SocialCardFonts): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>${socialCardStyles(fonts)}  </style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="bg-glow-orange"></div>
  <div class="bg-glow-subtle"></div>

  <!-- Decorative Spool Wire / Rings -->
  <svg class="filament-rings" viewBox="0 0 400 400" fill="none">
    <circle cx="200" cy="200" r="180" stroke="#f97316" stroke-width="2" stroke-dasharray="8 6"/>
    <circle cx="200" cy="200" r="140" stroke="#f97316" stroke-width="3"/>
    <circle cx="200" cy="200" r="100" stroke="#f97316" stroke-width="2" stroke-dasharray="12 8"/>
    <circle cx="200" cy="200" r="60" stroke="#f97316" stroke-width="4"/>
  </svg>

  <!-- Top bar -->
  <div class="header-row">
    <div class="brand">
      <svg class="brand-mark" viewBox="4 4 92 92" fill="none">
        <path d="M21.8 39.7A30 30 0 0 1 78.2 39.7" stroke="#f97316" stroke-width="8" stroke-linecap="round"/>
        <path d="M81.3 48.2 86.7 36.6 69.7 42.8Z" fill="#f97316" stroke="#f97316" stroke-width="4" stroke-linejoin="round"/>
        <path d="M78.2 60.3A30 30 0 0 1 21.8 60.3" stroke="#f97316" stroke-width="8" stroke-linecap="round"/>
        <path d="M18.7 51.8 13.3 63.4 30.3 57.2Z" fill="#f97316" stroke="#f97316" stroke-width="4" stroke-linejoin="round"/>
        <path fill="#f97316" fill-rule="evenodd" d="M50 36a14 14 0 1 0 0 28 14 14 0 0 0 0-28Zm0 9a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"/>
      </svg>
      <div class="brand-name">Spool<span>Sync</span></div>
    </div>
    <div class="browser-badge">
      <div class="live-dot"></div>
      Runs in your browser
    </div>
  </div>

  <!-- Hero Content -->
  <div class="hero-section">
    <h1 class="headline">Compare every spool list.</h1>
    <p class="description">
      Compare 3D printer filament inventories across Spoolman, Spoolstock, Spoolio, TigerTag, 3DFilamentProfiles, Bambuddy, and FilaMeter — then sync changes right in your browser.
    </p>
  </div>

  <!-- Ecosystem Integrations -->
  <div class="ecosystem-row">
    <div class="ecosystem-card">
      <div class="card-top">
        <svg class="card-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
        <span class="card-name">Spoolman</span>
      </div>
      <span class="card-desc">Home LAN server</span>
      <span class="card-tag">Direct REST API</span>
    </div>

    <div class="ecosystem-card">
      <div class="card-top">
        <svg class="card-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <span class="card-name">Spoolstock</span>
      </div>
      <span class="card-desc">Inventory export</span>
      <span class="card-tag">CSV Export · Read-only</span>
    </div>

    <div class="ecosystem-card">
      <div class="card-top">
        <svg class="card-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span class="card-name">Spoolio</span>
      </div>
      <span class="card-desc">spoolio.net settings</span>
      <span class="card-tag">JSON Import / Export</span>
    </div>

    <div class="ecosystem-card">
      <div class="card-top">
        <svg class="card-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span class="card-name">TigerTag</span>
      </div>
      <span class="card-desc">Studio NFC / Cloud</span>
      <span class="card-tag">Cloud & .ttag file</span>
    </div>
  </div>

  <!-- Bottom Bar -->
  <div class="footer-row">
    <div class="domain">www.spoolsync.com</div>
    <div class="pill-features">
      <span>Browser-only</span>
      <span>No account required</span>
      <span>Conflict resolution</span>
      <span>Open source (AGPL-3.0)</span>
    </div>
  </div>
</body>
</html>`;
}
