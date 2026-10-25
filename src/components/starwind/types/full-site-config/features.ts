/**
 * Feature configuration types for full sites. Covers booking, contact pages, homepage, about,
 * pricing, services, blog, and more.
 */

import type { FullSiteAccountConfig } from "./account";

/** Features section of the full site config. */
export type FullSiteFeaturesConfig = Readonly<{
  booking: Readonly<{
    enabled: boolean;
    storageKey: string;
    calendar: Readonly<{
      defaultCalendarId: string;
      timeZone: string;
      defaultDurationHours: number;
    }>;
    manageTokenTtlSeconds: number;
    alert: Readonly<{
      enabled: boolean;
      dismissedSessionKey: string;
      windowKey: string;
    }>;
    customerTypeOptions: Readonly<{
      primary: Readonly<{ value: string; label: string }>;
      secondary: Readonly<{ value: string; label: string }>;
    }>;
    page: Readonly<{
      title: string;
      subtitle: string;
      metaDescription: string;
      contactPrompt: string;
      contactLinkText: string;
    }>;
  }>;
  contact: Readonly<{
    page: Readonly<{
      metaDescription: string;
      hero: Readonly<{
        badge: string;
        badgeLocation: string;
        title: string;
        subtitle: string;
        stats: readonly Readonly<{
          label: string;
          value: string;
          description: string;
        }>[];
      }>;
      form: Readonly<{
        title: string;
        subtitle: string;
        privacyText: string;
        privacyLinkText: string;
        privacyTextSuffix: string;
      }>;
      whyChoose: Readonly<{
        title: string;
        subtitle: string;
      }>;
      faq: Readonly<{
        title: string;
        subtitle: string;
      }>;
      newsletter: Readonly<{
        title: string;
        subtitle: string;
      }>;
      cta: Readonly<{
        title: string;
        description: string;
        primaryButtonText: string;
        primaryButtonIcon: string;
        secondaryButtonText: string;
        secondaryButtonIcon: string;
      }>;
    }>;
  }>;
  homepage: Readonly<{
    meta: Readonly<{
      title: string;
      description: string;
    }>;
    hero: Readonly<{
      badge: Readonly<{ text: string; icon: string }>;
      title: string;
      subtitle: string;
      highlights: ReadonlyArray<
        Readonly<{
          label: string;
          value: string;
          description: string;
          icon: string;
          color?: string;
          href?: string;
        }>
      >;
      action: Readonly<{
        href: string;
        label: string;
        helper: string;
        icon: string;
      }>;
    }>;
    audienceCards: Readonly<{
      residential: Readonly<{
        title: string;
        description: string;
        buttonText: string;
        href: string;
        icon: string;
      }>;
      business: Readonly<{
        title: string;
        description: string;
        buttonText: string;
        href: string;
        icon: string;
      }>;
    }>;
    services: Readonly<{
      viewAllButtonText: string;
      viewAllHref: string;
      limit: number;
    }>;
    testimonials: Readonly<{
      sectionId: string;
      title: string;
      highlight: string;
      description: string;
      ctaLabel: string;
    }>;
    cta: Readonly<{
      title: string;
      description: string;
      primaryButtonText: string;
      primaryButtonIcon: string;
      secondaryButtonText: string;
      secondaryButtonHref: string;
      secondaryButtonIcon: string;
    }>;
  }>;
  about: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    hero: Readonly<{
      title: string;
      subtitle: string;
      primaryButton: Readonly<{ text: string; href: string; icon: string }>;
      secondaryButton: Readonly<{ text: string; href: string }>;
    }>;
    trustIndicators: ReadonlyArray<Readonly<{ icon: string; text: string }>>;
    mission: Readonly<{
      badge: string;
      icon: string;
      title: string;
      subtitle: string;
      cards: ReadonlyArray<
        Readonly<{ icon: string; title: string; description: string; color: string }>
      >;
    }>;
    values: Readonly<{
      badge: string;
      icon: string;
      title: string;
      subtitle: string;
      items: ReadonlyArray<
        Readonly<{ icon: string; title: string; description: string; color: string }>
      >;
    }>;
    team: Readonly<{
      badge: string;
      icon: string;
      title: string;
      subtitle: string;
      members: ReadonlyArray<Readonly<{ name: string; role: string; avatar: string; bio: string }>>;
    }>;
    timeline: Readonly<{
      badge: string;
      icon: string;
      title: string;
      subtitle: string;
      items: ReadonlyArray<Readonly<{ year: string; title: string; description: string }>>;
    }>;
    cta: Readonly<{
      title: string;
      description: string;
      primaryButton: Readonly<{ text: string; href: string; icon: string }>;
      secondaryButton: Readonly<{ text: string; href: string; icon: string }>;
    }>;
  }>;
  pricing: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    hero: Readonly<{
      badge: Readonly<{ text: string; icon: string }>;
      actions: ReadonlyArray<
        Readonly<{ text: string; href: string; variant: string; icon: string }>
      >;
    }>;
    sections: ReadonlyArray<
      Readonly<{ service: string; title: string; sectionId: string; className?: string }>
    >;
    cta: Readonly<{
      title: string;
      description: string;
      primaryButton: Readonly<{ text: string; href: string }>;
      secondaryButton: Readonly<{ text: string; href: string }>;
    }>;
  }>;
  services: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    categories: ReadonlyArray<Readonly<{ id: string; label: string }>>;
    card: Readonly<{ learnMoreText: string }>;
    noResults: Readonly<{ emoji: string; title: string; description: string }>;
  }>;
  success: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    content: Readonly<{ greeting: string; message: string; emailPrompt: string }>;
    manage: Readonly<{
      referenceLabel: string;
      emailLabel: string;
      emailPlaceholder: string;
      submitText: string;
      privacyNote: string;
    }>;
    nextSteps: Readonly<{ title: string; items: ReadonlyArray<string> }>;
    cta: Readonly<{ text: string; href: string }>;
  }>;
  notFound: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    content: Readonly<{
      heading: string;
      message: string;
      searchPlaceholder: string;
      searchLabel: string;
    }>;
    navigationCards: ReadonlyArray<
      Readonly<{ href: string; icon: string; title: string; description: string }>
    >;
    contactPrompt: Readonly<{ text: string; linkText: string; linkHref: string }>;
  }>;
  signIn: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    form: Readonly<{
      icon: string;
      heading: string;
      subtitle: string;
      emailLabel: string;
      emailPlaceholder: string;
      submitText: string;
    }>;
    success: Readonly<{
      icon: string;
      heading: string;
      message: string;
      expiryNote: string;
      resendText: string;
    }>;
    error: Readonly<{ icon: string; defaultMessage: string }>;
    helpText: string;
  }>;
  search: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    ui: Readonly<{ heading: string; subtitle: string; placeholder: string }>;
  }>;
  blog: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    hero: Readonly<{
      title: string;
      subtitle: string;
      primaryButton: Readonly<{ text: string; href: string; icon: string }>;
      secondaryButton: Readonly<{ text: string; href: string; icon: string }>;
    }>;
    highlightCards: ReadonlyArray<
      Readonly<{
        icon: string;
        label: string;
        value: string;
        href: string;
        ariaLabel: string;
      }>
    >;
    featured: Readonly<{ badge: string; title: string }>;
    articles: Readonly<{ badge: string; title: string; subtitle: string }>;
    emptyState: Readonly<{
      title: string;
      description: string;
      ctaText: string;
      ctaHref: string;
    }>;
    cta: Readonly<{
      title: string;
      description: string;
      primaryButton: Readonly<{ text: string; href: string; icon: string }>;
      secondaryButton: Readonly<{ text: string; href: string; icon: string }>;
    }>;
  }>;
  apiDocs: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    header: Readonly<{
      title: string;
      subtitle: string;
      badges: ReadonlyArray<Readonly<{ text: string; variant: string }>>;
    }>;
    machBadges: ReadonlyArray<Readonly<{ letter: string; label: string }>>;
    infoCards: ReadonlyArray<
      Readonly<{
        title: string;
        description: string;
        code?: string;
        codeContext?: string;
        linkText?: string;
        linkHref?: string;
      }>
    >;
    swagger: Readonly<{ specUrl: string; containerId: string }>;
  }>;
  legal: Readonly<{
    cookiePolicy: Readonly<{
      meta: Readonly<{ title: string; description: string }>;
      lastUpdated: string;
    }>;
    privacyPolicy: Readonly<{
      meta: Readonly<{ title: string; description: string }>;
      lastUpdated: string;
    }>;
    termsOfService: Readonly<{
      meta: Readonly<{ title: string; description: string }>;
      lastUpdated: string;
    }>;
  }>;
  account: FullSiteAccountConfig;
  checkout: Readonly<{
    success: Readonly<{
      meta: Readonly<{ title: string; description: string }>;
      icon: string;
      heading: string;
      loadingText: string;
      confirmationPrefix: string;
      orderDetails: Readonly<{
        title: string;
        orderId: string;
        status: string;
        total: string;
      }>;
      whatsNext: Readonly<{ title: string; items: ReadonlyArray<string> }>;
      errorMessage: string;
      errorHint: string;
      actions: Readonly<{
        viewAccount: Readonly<{ text: string; href: string }>;
        returnHome: Readonly<{ text: string; href: string }>;
      }>;
    }>;
    cancel: Readonly<{
      meta: Readonly<{ title: string; description: string }>;
      icon: string;
      heading: string;
      message: string;
      submessage: string;
      help: Readonly<{
        title: string;
        items: ReadonlyArray<
          Readonly<{ text: string; linkText: string; linkHref?: string; action?: string }>
        >;
      }>;
      actions: Readonly<{
        browseServices: Readonly<{ text: string; href: string }>;
        returnHome: Readonly<{ text: string; href: string }>;
      }>;
    }>;
  }>;
  serviceLayout: Readonly<{
    heroSecondaryButton: Readonly<{ text: string; href: string; icon: string }>;
    features: Readonly<{ title: string; description: string }>;
    testimonials: Readonly<{ title: string; description: string }>;
    faq: Readonly<{ title: string; subtitle: string }>;
    cta: Readonly<{
      title: string;
      descriptionTemplate: string;
      badge: Readonly<{ text: string; icon: string }>;
      primaryButton: Readonly<{ text: string; icon: string }>;
      secondaryButton: Readonly<{ text: string; href: string; icon: string }>;
    }>;
  }>;
  postLayout: Readonly<{
    hero: Readonly<{
      authorLabel: string;
      publishedLabel: string;
      readTimeLabel: string;
      resilienceBadge: string;
    }>;
    article: Readonly<{ topicsCoveredLabel: string; shareBriefingLabel: string }>;
    backupCta: Readonly<{
      badge: string;
      heading: string;
      description: string;
      buttonText: string;
      buttonHref: string;
    }>;
    sidebar: Readonly<{
      postEssentials: Readonly<{
        title: string;
        publishedTemplate: string;
        readTimeTemplate: string;
        validatedTemplate: string;
      }>;
      authorSection: Readonly<{
        label: string;
        bioTemplate: string;
        browseMoreLink: Readonly<{ text: string; href: string }>;
      }>;
      shareSection: Readonly<{
        title: string;
        description: string;
        emailLinkText: string;
      }>;
    }>;
    relatedPosts: Readonly<{ badge: string; heading: string; description: string }>;
    newsletter: Readonly<{
      badge: string;
      heading: string;
      description: string;
      primaryButton: Readonly<{ text: string; href: string; icon: string }>;
      secondaryButton: Readonly<{ text: string; href: string; icon: string }>;
    }>;
  }>;
  pay: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    loading: Readonly<{ ariaLabel: string; message: string }>;
    error: Readonly<{ heading: string; message: string; homeLink: string }>;
    paid: Readonly<{ heading: string; message: string; homeLink: string }>;
    content: Readonly<{
      heading: string;
      subheading: string;
      invoiceLabel: string;
      dateLabel: string;
      billedToLabel: string;
    }>;
    table: Readonly<{
      descriptionHeader: string;
      qtyHeader: string;
      priceHeader: string;
      amountHeader: string;
    }>;
    totals: Readonly<{ subtotalLabel: string; taxLabel: string; amountDueLabel: string }>;
    payButton: Readonly<{ text: string; icon: string }>;
    securityNote: string;
  }>;
  cta: Readonly<{
    defaultTitle: string;
    defaultDescription: string;
    defaultBadge: Readonly<{ text: string; icon: string }>;
    defaultTrustIndicators: ReadonlyArray<Readonly<{ icon: string; text: string }>>;
    defaultPrimaryButton: Readonly<{
      text: string;
      variant: string;
      color: string;
    }>;
    defaultSecondaryButton: Readonly<{
      text: string;
      href: string;
      variant: string;
      color: string;
    }>;
    defaultBackgroundClass: string;
    defaultPaddingClass: string;
  }>;
  residentialSupport: Readonly<{
    commonIssues: ReadonlyArray<
      Readonly<{ icon: string; title: string; description: string; details: string }>
    >;
    services: ReadonlyArray<Readonly<{ icon: string; title: string; description: string }>>;
    reasons: ReadonlyArray<Readonly<{ icon: string; title: string; description: string }>>;
    whyChooseTitle: string;
  }>;
  managedIt: Readonly<{
    coreServices: ReadonlyArray<
      Readonly<{ icon: string; title: string; description: string; color: string }>
    >;
    securityItems: ReadonlyArray<Readonly<{ icon: string; title: string; description: string }>>;
    vendorItems: ReadonlyArray<Readonly<{ icon: string; text: string }>>;
    cloudItems: ReadonlyArray<Readonly<{ icon: string; text: string }>>;
  }>;
  businessManagedItSummary: Readonly<{
    hero: Readonly<{
      badge: string;
      title: string;
      description: string;
    }>;
    challenges: Readonly<{
      title: string;
      subtitle: string;
      items: ReadonlyArray<Readonly<{ icon: string; title: string; description: string }>>;
    }>;
    benefits: Readonly<{
      badge: string;
      title: string;
      items: ReadonlyArray<Readonly<{ icon: string; title: string; description: string }>>;
    }>;
    pricing: Readonly<{
      title: string;
      subtitle: string;
      plans: ReadonlyArray<
        Readonly<{
          name: string;
          price: string;
          period: string;
          features: ReadonlyArray<string>;
          cta: string;
          popular: boolean;
        }>
      >;
    }>;
  }>;
}>;
