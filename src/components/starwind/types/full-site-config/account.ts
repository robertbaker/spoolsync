/**
 * Account-related configuration types for full sites. Covers account layout, profile, invoices,
 * orders, quotes, and subscriptions.
 */

/** Account section of the full site features config. */
export type FullSiteAccountConfig = Readonly<{
  layout: Readonly<{
    sidebarLabel: string;
    loadingText: string;
    errorText: string;
    signOutButton: Readonly<{ text: string; icon: string }>;
    navItems: ReadonlyArray<Readonly<{ id: string; label: string; href: string; icon: string }>>;
  }>;
  overview: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    heading: string;
    subtitle: string;
    stats: Readonly<{
      unpaidInvoices: Readonly<{ label: string; icon: string }>;
      activeSubscriptions: Readonly<{ label: string; icon: string }>;
      amountDue: Readonly<{ label: string; icon: string }>;
    }>;
    sections: Readonly<{
      recentInvoices: Readonly<{
        title: string;
        viewAllText: string;
        viewAllHref: string;
        loadingText: string;
        emptyText: string;
        emptyIcon: string;
      }>;
      recentOrders: Readonly<{
        title: string;
        viewAllText: string;
        viewAllHref: string;
        loadingText: string;
        emptyText: string;
        emptyIcon: string;
      }>;
      recentQuotes: Readonly<{
        title: string;
        viewAllText: string;
        viewAllHref: string;
        loadingText: string;
        emptyText: string;
        emptyIcon: string;
      }>;
      activeSubscriptions: Readonly<{
        title: string;
        viewAllText: string;
        viewAllHref: string;
        loadingText: string;
        emptyText: string;
        emptyIcon: string;
      }>;
    }>;
    quickActions: Readonly<{
      title: string;
      items: ReadonlyArray<
        Readonly<{ href: string; icon: string; title: string; description: string }>
      >;
    }>;
  }>;
  profile: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    heading: string;
    subtitle: string;
    loadingText: string;
    sections: Readonly<{
      personalInfo: Readonly<{
        title: string;
        fields: Readonly<{
          fullName: Readonly<{ label: string; placeholder: string }>;
          email: Readonly<{ label: string; disabledNote: string }>;
          company: Readonly<{ label: string; placeholder: string }>;
          phone: Readonly<{ label: string; placeholder: string }>;
        }>;
      }>;
      billingAddress: Readonly<{
        title: string;
        fields: Readonly<{
          line1: Readonly<{ label: string; placeholder: string }>;
          line2: Readonly<{ label: string; placeholder: string }>;
          city: Readonly<{ label: string; placeholder: string }>;
          state: Readonly<{ label: string; placeholder: string }>;
          postalCode: Readonly<{ label: string; placeholder: string }>;
          country: Readonly<{ label: string; placeholder: string; hint: string }>;
        }>;
      }>;
      taxInfo: Readonly<{
        title: string;
        fields: Readonly<{
          taxId: Readonly<{ label: string; placeholder: string }>;
        }>;
      }>;
    }>;
    actions: Readonly<{
      saveButton: Readonly<{ text: string; icon: string }>;
      successMessage: string;
      errorMessage: string;
    }>;
  }>;
  invoices: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    heading: string;
    subtitle: string;
    loadingText: string;
    emptyText: string;
    emptyHint: string;
    emptyIcon: string;
    columns: Readonly<{
      invoiceNumber: string;
      date: string;
      dueDate: string;
      status: string;
      amount: string;
      actions: string;
    }>;
    statusFilters: ReadonlyArray<Readonly<{ value: string; label: string }>>;
    exportButton: Readonly<{ text: string; icon: string }>;
    pagination: Readonly<{ previous: string; next: string; pagePrefix: string }>;
  }>;
  orders: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    heading: string;
    subtitle: string;
    loadingText: string;
    emptyText: string;
    emptyHint: string;
    emptyIcon: string;
    emptyAction: Readonly<{ text: string; href: string }>;
    columns: Readonly<{
      orderId: string;
      date: string;
      type: string;
      status: string;
      total: string;
      actions: string;
    }>;
    kindFilters: ReadonlyArray<Readonly<{ value: string; label: string }>>;
    statusFilters: ReadonlyArray<Readonly<{ value: string; label: string }>>;
    pagination: Readonly<{ previous: string; next: string; pagePrefix: string }>;
  }>;
  quotes: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    heading: string;
    subtitle: string;
    loadingText: string;
    emptyText: string;
    emptyHint: string;
    emptyIcon: string;
    emptyAction: Readonly<{ text: string; href: string }>;
    columns: Readonly<{
      quoteId: string;
      date: string;
      validUntil: string;
      status: string;
      amount: string;
      actions: string;
    }>;
    statusFilters: ReadonlyArray<Readonly<{ value: string; label: string }>>;
    exportButton: Readonly<{ text: string; icon: string }>;
  }>;
  subscriptions: Readonly<{
    meta: Readonly<{ title: string; description: string }>;
    heading: string;
    subtitle: string;
    loadingText: string;
    emptyText: string;
    emptyHint: string;
    emptyIcon: string;
    emptyAction: Readonly<{ text: string; href: string }>;
    manageBillingButton: Readonly<{ text: string; icon: string }>;
  }>;
}>;
