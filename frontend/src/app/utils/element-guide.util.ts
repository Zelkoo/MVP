import { ElementCategory, ElementImportance, InspectedElement } from '../models/page-inspector.model';

export type ElementGuideFilter =
  | 'important'
  | 'forms'
  | 'buttons'
  | 'links'
  | 'ecommerce'
  | 'navigation';

export const ELEMENT_GUIDE_FILTERS: Array<{ id: ElementGuideFilter; label: string }> = [
  { id: 'important', label: 'Important' },
  { id: 'forms', label: 'Forms' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'links', label: 'Links' },
  { id: 'ecommerce', label: 'Ecommerce' },
  { id: 'navigation', label: 'Navigation' },
];

const FORM_CATEGORIES = new Set<ElementCategory>([
  'form-input',
  'email-input',
  'name-input',
  'message-input',
  'submit-button',
  'newsletter',
]);

const BUTTON_CATEGORIES = new Set<ElementCategory>([
  'primary-cta',
  'secondary-cta',
  'submit-button',
  'mobile-menu-button',
  'add-to-cart',
  'checkout',
]);

const LINK_CATEGORIES = new Set<ElementCategory>(['navigation-link', 'secondary-cta']);

const ECOMMERCE_CATEGORIES = new Set<ElementCategory>(['add-to-cart', 'checkout']);

const NAVIGATION_CATEGORIES = new Set<ElementCategory>(['navigation-link', 'mobile-menu-button']);

export function matchesElementGuideFilter(element: InspectedElement, filter: ElementGuideFilter): boolean {
  const category = element.category || 'unknown';

  switch (filter) {
    case 'important':
      return element.importance === 'high';
    case 'forms':
      return FORM_CATEGORIES.has(category);
    case 'buttons':
      return BUTTON_CATEGORIES.has(category);
    case 'links':
      return LINK_CATEGORIES.has(category) && element.tagName === 'a';
    case 'ecommerce':
      return ECOMMERCE_CATEGORIES.has(category);
    case 'navigation':
      return NAVIGATION_CATEGORIES.has(category);
    default:
      return true;
  }
}

export function filterGuidedElements(
  elements: InspectedElement[],
  activeFilter: ElementGuideFilter
): InspectedElement[] {
  const filtered = elements.filter((element) => matchesElementGuideFilter(element, activeFilter));
  return sortGuidedElements(filtered);
}

export function formatElementDisplayLabel(element: InspectedElement): string {
  const label = (element.humanLabel || element.label || '').trim();
  if (!label) return 'Element';
  return label.replace(/\s+(link|button|field|input|menu)$/i, '').trim() || label;
}

export function importanceLabel(importance: ElementImportance | undefined): string {
  if (importance === 'high') return 'High';
  if (importance === 'medium') return 'Medium';
  return 'Low';
}

export function sortGuidedElements(elements: InspectedElement[]): InspectedElement[] {
  const rank = (importance?: ElementImportance) => {
    if (importance === 'high') return 3;
    if (importance === 'medium') return 2;
    return 1;
  };

  return [...elements].sort((a, b) => {
    const importanceDiff = rank(b.importance) - rank(a.importance);
    if (importanceDiff !== 0) return importanceDiff;
    return (b.confidence || 0) - (a.confidence || 0);
  });
}

export function categoryLabel(category: ElementCategory | undefined): string {
  switch (category) {
    case 'primary-cta':
      return 'Primary CTA';
    case 'secondary-cta':
      return 'Secondary CTA';
    case 'submit-button':
      return 'Submit button';
    case 'form-input':
      return 'Form field';
    case 'email-input':
      return 'Email field';
    case 'name-input':
      return 'Name field';
    case 'message-input':
      return 'Message field';
    case 'navigation-link':
      return 'Navigation link';
    case 'mobile-menu-button':
      return 'Mobile menu';
    case 'add-to-cart':
      return 'Add to cart';
    case 'checkout':
      return 'Checkout';
    case 'newsletter':
      return 'Newsletter';
    default:
      return 'Interactive element';
  }
}

export function importanceBadgeClass(importance: ElementImportance | undefined): string {
  if (importance === 'high') return 'importance-high';
  if (importance === 'medium') return 'importance-medium';
  return 'importance-low';
}

export function suggestedActionsLabel(actions: string[] | undefined): string {
  if (!actions?.length) return '';
  return actions
    .map((action) => {
      switch (action) {
        case 'click':
          return 'Click';
        case 'fill-input':
          return 'Fill';
        case 'verify-navigation':
          return 'Check navigation';
        case 'verify-success':
          return 'Check success';
        case 'verify-cart':
          return 'Check cart';
        case 'expect-visible':
          return 'Check visible';
        default:
          return action;
      }
    })
    .join(' · ');
}
