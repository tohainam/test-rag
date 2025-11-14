import { Link } from 'react-router-dom';
import { Anchor, Breadcrumbs as MantineBreadcrumbs } from '@mantine/core';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageBreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function PageBreadcrumbs({ items }: PageBreadcrumbsProps) {
  return (
    <MantineBreadcrumbs mb="lg">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (isLast || !item.href) {
          return (
            <span key={index} style={{ color: 'var(--mantine-color-dimmed)' }}>
              {item.label}
            </span>
          );
        }

        return (
          <Anchor key={index} component={Link} to={item.href}>
            {item.label}
          </Anchor>
        );
      })}
    </MantineBreadcrumbs>
  );
}
