export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export interface PostMetaPill {
  text: string;
  icon?: string;
  datetime?: string;
}

export interface TopicItem {
  label: string;
  href: string;
}
