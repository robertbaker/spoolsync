export interface SocialCardFonts {
  interWoff2: string;
  spaceGroteskWoff2: string;
}

export function socialCardStyles({ interWoff2, spaceGroteskWoff2 }: SocialCardFonts): string {
  return `
    @font-face {
      font-family: 'Inter';
      src: url('data:font/woff2;base64,${interWoff2}') format('woff2');
      font-weight: 100 900;
      font-style: normal;
    }
    @font-face {
      font-family: 'Space Grotesk';
      src: url('data:font/woff2;base64,${spaceGroteskWoff2}') format('woff2');
      font-weight: 300 700;
      font-style: normal;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      width: 1200px;
      height: 630px;
      overflow: hidden;
      background-color: #080c14;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #f8fafc;
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 56px 64px 48px;
    }

    /* Ambient background styling */
    .bg-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
      background-size: 48px 48px;
      pointer-events: none;
    }

    .bg-glow-orange {
      position: absolute;
      top: -120px;
      right: -100px;
      width: 650px;
      height: 650px;
      background: radial-gradient(circle, rgba(249, 115, 22, 0.22) 0%, rgba(249, 115, 22, 0.05) 50%, transparent 70%);
      pointer-events: none;
    }

    .bg-glow-subtle {
      position: absolute;
      bottom: -150px;
      left: -100px;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(234, 88, 12, 0.12) 0%, transparent 70%);
      pointer-events: none;
    }

    /* Filament rings in background */
    .filament-rings {
      position: absolute;
      right: -60px;
      top: -60px;
      width: 540px;
      height: 540px;
      pointer-events: none;
      opacity: 0.16;
    }

    /* Content styling */
    .header-row {
      position: relative;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .brand-mark {
      width: 54px;
      height: 54px;
      filter: drop-shadow(0 0 16px rgba(249, 115, 22, 0.45));
    }

    .brand-name {
      font-size: 38px;
      font-weight: 800;
      letter-spacing: -0.035em;
      color: #ffffff;
    }

    .brand-name span {
      color: #f97316;
    }

    .browser-badge {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      padding: 8px 18px;
      border-radius: 9999px;
      background: rgba(249, 115, 22, 0.1);
      border: 1px solid rgba(249, 115, 22, 0.3);
      font-size: 14px;
      font-weight: 600;
      color: #fed7aa;
      letter-spacing: -0.01em;
      box-shadow: 0 0 20px rgba(249, 115, 22, 0.15);
    }

    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: #22c55e;
      box-shadow: 0 0 8px #22c55e;
    }

    .hero-section {
      position: relative;
      z-index: 10;
      margin-top: 12px;
    }

    .headline {
      font-size: 54px;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.035em;
      color: #f8fafc;
      max-width: 960px;
    }

    .gradient-text {
      background: linear-gradient(135deg, #fdba74 0%, #f97316 60%, #ea580c 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .description {
      font-size: 20px;
      line-height: 1.48;
      color: #94a3b8;
      max-width: 880px;
      margin-top: 14px;
      font-weight: 450;
    }

    /* Ecosystem grid */
    .ecosystem-row {
      position: relative;
      z-index: 10;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-top: 24px;
    }

    .ecosystem-card {
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    }

    .card-top {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .card-icon {
      width: 24px;
      height: 24px;
      color: #f97316;
      flex-shrink: 0;
    }

    .card-name {
      font-size: 15px;
      font-weight: 700;
      color: #e2e8f0;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-desc {
      font-size: 12px;
      font-weight: 500;
      color: #64748b;
    }

    .card-tag {
      align-self: flex-start;
      margin-top: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      background: rgba(249, 115, 22, 0.12);
      color: #fb923c;
      border: 1px solid rgba(249, 115, 22, 0.2);
    }

    /* Footer row */
    .footer-row {
      position: relative;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 18px;
    }

    .domain {
      font-family: 'Space Grotesk', monospace;
      font-size: 19px;
      font-weight: 700;
      color: #f97316;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pill-features {
      display: flex;
      align-items: center;
      gap: 18px;
      font-size: 13px;
      font-weight: 600;
      color: #64748b;
    }

    .pill-features span {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .pill-features span::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #475569;
    }
`;
}
