import { WireframeComponent } from './supabase';

export type ComponentType =
  | 'header'
  | 'tabBar'
  | 'button'
  | 'textBlock'
  | 'image'
  | 'card'
  | 'listItem'
  | 'textField'
  | 'searchBar'
  | 'toggle'
  | 'slider'
  | 'onboardingSlide'
  | 'paywallCard'
  | 'cameraView'
  | 'resultsCard'
  | 'loadingState'
  | 'emptyState';

export interface ComponentDefinition {
  type: ComponentType;
  category: 'navigation' | 'content' | 'input' | 'pattern';
  name: string;
  description: string;
  icon: string; // SVG path
  defaultWidth: number;
  defaultHeight: number;
  defaultProps: Record<string, unknown>;
  propertyFields: PropertyField[];
  systemImplications?: string[];
}

export interface PropertyField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'boolean' | 'color';
  options?: { value: string; label: string }[];
  defaultValue: unknown;
}

const generateComponentId = () =>
  `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const COMPONENT_LIBRARY: ComponentDefinition[] = [
  // Navigation Components
  {
    type: 'header',
    category: 'navigation',
    name: 'Header',
    description: 'Navigation header with title and actions',
    icon: 'M4 6h16M4 12h16M4 18h16',
    defaultWidth: 375,
    defaultHeight: 56,
    defaultProps: {
      title: 'Screen Title',
      leftAction: 'back',
      rightAction: 'none',
      variant: 'default',
    },
    propertyFields: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Screen Title' },
      {
        key: 'leftAction',
        label: 'Left Action',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'back', label: 'Back' },
          { value: 'menu', label: 'Menu' },
          { value: 'close', label: 'Close' },
        ],
        defaultValue: 'back',
      },
      {
        key: 'rightAction',
        label: 'Right Action',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'settings', label: 'Settings' },
          { value: 'search', label: 'Search' },
          { value: 'add', label: 'Add' },
          { value: 'share', label: 'Share' },
        ],
        defaultValue: 'none',
      },
      {
        key: 'variant',
        label: 'Style',
        type: 'select',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'transparent', label: 'Transparent' },
          { value: 'large', label: 'Large Title' },
        ],
        defaultValue: 'default',
      },
    ],
  },
  {
    type: 'tabBar',
    category: 'navigation',
    name: 'Tab Bar',
    description: 'Bottom navigation with tabs',
    icon: 'M3 12h4l3 8 4-16 3 8h4',
    defaultWidth: 375,
    defaultHeight: 83,
    defaultProps: {
      tabs: ['Home', 'Search', 'Profile'],
      activeTab: 0,
      variant: 'default',
    },
    propertyFields: [
      { key: 'tabs', label: 'Tab Labels (comma separated)', type: 'text', defaultValue: 'Home,Search,Profile' },
      { key: 'activeTab', label: 'Active Tab Index', type: 'number', defaultValue: 0 },
      {
        key: 'variant',
        label: 'Style',
        type: 'select',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'minimal', label: 'Minimal' },
        ],
        defaultValue: 'default',
      },
    ],
    systemImplications: ['Multiple main sections/screens needed'],
  },

  // Content Components
  {
    type: 'textBlock',
    category: 'content',
    name: 'Text Block',
    description: 'Static text content',
    icon: 'M4 6h16M4 10h16M4 14h10',
    defaultWidth: 327,
    defaultHeight: 48,
    defaultProps: {
      text: 'Text content here',
      variant: 'body',
      align: 'left',
    },
    propertyFields: [
      { key: 'text', label: 'Text', type: 'text', defaultValue: 'Text content here' },
      {
        key: 'variant',
        label: 'Style',
        type: 'select',
        options: [
          { value: 'h1', label: 'Heading 1' },
          { value: 'h2', label: 'Heading 2' },
          { value: 'h3', label: 'Heading 3' },
          { value: 'body', label: 'Body' },
          { value: 'caption', label: 'Caption' },
        ],
        defaultValue: 'body',
      },
      {
        key: 'align',
        label: 'Alignment',
        type: 'select',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ],
        defaultValue: 'left',
      },
    ],
  },
  {
    type: 'image',
    category: 'content',
    name: 'Image',
    description: 'Image placeholder',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    defaultWidth: 327,
    defaultHeight: 200,
    defaultProps: {
      placeholderType: 'photo',
      aspectRatio: 'auto',
      cornerRadius: 8,
    },
    propertyFields: [
      {
        key: 'placeholderType',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'photo', label: 'Photo' },
          { value: 'illustration', label: 'Illustration' },
          { value: 'icon', label: 'Icon' },
          { value: 'avatar', label: 'Avatar' },
        ],
        defaultValue: 'photo',
      },
      {
        key: 'aspectRatio',
        label: 'Aspect Ratio',
        type: 'select',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: '1:1', label: 'Square (1:1)' },
          { value: '16:9', label: 'Wide (16:9)' },
          { value: '4:3', label: 'Standard (4:3)' },
        ],
        defaultValue: 'auto',
      },
      { key: 'cornerRadius', label: 'Corner Radius', type: 'number', defaultValue: 8 },
    ],
  },
  {
    type: 'card',
    category: 'content',
    name: 'Card',
    description: 'Tappable content card',
    icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    defaultWidth: 327,
    defaultHeight: 120,
    defaultProps: {
      title: 'Card Title',
      subtitle: 'Card subtitle or description',
      hasImage: true,
      hasAction: true,
    },
    propertyFields: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Card Title' },
      { key: 'subtitle', label: 'Subtitle', type: 'text', defaultValue: 'Card subtitle' },
      { key: 'hasImage', label: 'Show Image', type: 'boolean', defaultValue: true },
      { key: 'hasAction', label: 'Show Action', type: 'boolean', defaultValue: true },
    ],
  },
  {
    type: 'listItem',
    category: 'content',
    name: 'List Item',
    description: 'Single list row item',
    icon: 'M4 6h16M4 10h16M4 14h16M4 18h16',
    defaultWidth: 375,
    defaultHeight: 56,
    defaultProps: {
      title: 'List item title',
      subtitle: '',
      hasIcon: true,
      hasChevron: true,
    },
    propertyFields: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'List item' },
      { key: 'subtitle', label: 'Subtitle', type: 'text', defaultValue: '' },
      { key: 'hasIcon', label: 'Show Icon', type: 'boolean', defaultValue: true },
      { key: 'hasChevron', label: 'Show Chevron', type: 'boolean', defaultValue: true },
    ],
  },
  {
    type: 'emptyState',
    category: 'content',
    name: 'Empty State',
    description: 'Placeholder when no content',
    icon: 'M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    defaultWidth: 327,
    defaultHeight: 200,
    defaultProps: {
      message: 'No items yet',
      actionLabel: 'Get Started',
      hasAction: true,
    },
    propertyFields: [
      { key: 'message', label: 'Message', type: 'text', defaultValue: 'No items yet' },
      { key: 'actionLabel', label: 'Button Label', type: 'text', defaultValue: 'Get Started' },
      { key: 'hasAction', label: 'Show Button', type: 'boolean', defaultValue: true },
    ],
  },

  // Input Components
  {
    type: 'button',
    category: 'input',
    name: 'Button',
    description: 'Tappable action button',
    icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122',
    defaultWidth: 327,
    defaultHeight: 50,
    defaultProps: {
      label: 'Button',
      variant: 'primary',
      size: 'large',
      fullWidth: true,
    },
    propertyFields: [
      { key: 'label', label: 'Label', type: 'text', defaultValue: 'Button' },
      {
        key: 'variant',
        label: 'Style',
        type: 'select',
        options: [
          { value: 'primary', label: 'Primary' },
          { value: 'secondary', label: 'Secondary' },
          { value: 'outline', label: 'Outline' },
          { value: 'text', label: 'Text Only' },
        ],
        defaultValue: 'primary',
      },
      {
        key: 'size',
        label: 'Size',
        type: 'select',
        options: [
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
        ],
        defaultValue: 'large',
      },
      { key: 'fullWidth', label: 'Full Width', type: 'boolean', defaultValue: true },
    ],
  },
  {
    type: 'textField',
    category: 'input',
    name: 'Text Field',
    description: 'User text input',
    icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    defaultWidth: 327,
    defaultHeight: 56,
    defaultProps: {
      placeholder: 'Enter text...',
      label: '',
      inputType: 'text',
      hasIcon: false,
    },
    propertyFields: [
      { key: 'placeholder', label: 'Placeholder', type: 'text', defaultValue: 'Enter text...' },
      { key: 'label', label: 'Label', type: 'text', defaultValue: '' },
      {
        key: 'inputType',
        label: 'Input Type',
        type: 'select',
        options: [
          { value: 'text', label: 'Text' },
          { value: 'email', label: 'Email' },
          { value: 'password', label: 'Password' },
          { value: 'number', label: 'Number' },
        ],
        defaultValue: 'text',
      },
      { key: 'hasIcon', label: 'Show Icon', type: 'boolean', defaultValue: false },
    ],
    systemImplications: ['User input validation needed', 'Form handling required'],
  },
  {
    type: 'searchBar',
    category: 'input',
    name: 'Search Bar',
    description: 'Search input field',
    icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    defaultWidth: 327,
    defaultHeight: 48,
    defaultProps: {
      placeholder: 'Search...',
      hasFilter: false,
    },
    propertyFields: [
      { key: 'placeholder', label: 'Placeholder', type: 'text', defaultValue: 'Search...' },
      { key: 'hasFilter', label: 'Show Filter', type: 'boolean', defaultValue: false },
    ],
    systemImplications: ['Search/filter functionality needed', 'May need search API'],
  },
  {
    type: 'toggle',
    category: 'input',
    name: 'Toggle',
    description: 'Boolean on/off switch',
    icon: 'M8 9l4-4 4 4m0 6l-4 4-4-4',
    defaultWidth: 327,
    defaultHeight: 56,
    defaultProps: {
      label: 'Toggle option',
      defaultOn: false,
    },
    propertyFields: [
      { key: 'label', label: 'Label', type: 'text', defaultValue: 'Toggle option' },
      { key: 'defaultOn', label: 'Default On', type: 'boolean', defaultValue: false },
    ],
    systemImplications: ['Setting/preference storage needed'],
  },
  {
    type: 'slider',
    category: 'input',
    name: 'Slider',
    description: 'Range value selector',
    icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
    defaultWidth: 327,
    defaultHeight: 72,
    defaultProps: {
      label: 'Value',
      min: 0,
      max: 100,
      showValue: true,
    },
    propertyFields: [
      { key: 'label', label: 'Label', type: 'text', defaultValue: 'Value' },
      { key: 'min', label: 'Min Value', type: 'number', defaultValue: 0 },
      { key: 'max', label: 'Max Value', type: 'number', defaultValue: 100 },
      { key: 'showValue', label: 'Show Value', type: 'boolean', defaultValue: true },
    ],
  },

  // Pattern Components
  {
    type: 'onboardingSlide',
    category: 'pattern',
    name: 'Onboarding Slide',
    description: 'Full-screen intro slide',
    icon: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
    defaultWidth: 375,
    defaultHeight: 700,
    defaultProps: {
      title: 'Welcome',
      description: 'Description of this feature',
      imageType: 'illustration',
      progress: '1 of 3',
      hasSkip: true,
    },
    propertyFields: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Welcome' },
      { key: 'description', label: 'Description', type: 'text', defaultValue: 'Description of this feature' },
      {
        key: 'imageType',
        label: 'Image Type',
        type: 'select',
        options: [
          { value: 'illustration', label: 'Illustration' },
          { value: 'icon', label: 'Icon' },
          { value: 'screenshot', label: 'Screenshot' },
        ],
        defaultValue: 'illustration',
      },
      { key: 'progress', label: 'Progress Text', type: 'text', defaultValue: '1 of 3' },
      { key: 'hasSkip', label: 'Show Skip', type: 'boolean', defaultValue: true },
    ],
  },
  {
    type: 'paywallCard',
    category: 'pattern',
    name: 'Paywall Card',
    description: 'Subscription prompt',
    icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
    defaultWidth: 343,
    defaultHeight: 400,
    defaultProps: {
      title: 'Unlock Premium',
      price: '$9.99/month',
      features: ['Feature 1', 'Feature 2', 'Feature 3'],
      ctaText: 'Start Free Trial',
      hasClose: true,
    },
    propertyFields: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Unlock Premium' },
      { key: 'price', label: 'Price', type: 'text', defaultValue: '$9.99/month' },
      { key: 'features', label: 'Features (comma separated)', type: 'text', defaultValue: 'Feature 1,Feature 2,Feature 3' },
      { key: 'ctaText', label: 'CTA Text', type: 'text', defaultValue: 'Start Free Trial' },
      { key: 'hasClose', label: 'Show Close', type: 'boolean', defaultValue: true },
    ],
    systemImplications: ['Payment/subscription system needed', 'In-app purchases or Stripe integration'],
  },
  {
    type: 'cameraView',
    category: 'pattern',
    name: 'Camera View',
    description: 'Camera capture interface',
    icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z',
    defaultWidth: 375,
    defaultHeight: 700,
    defaultProps: {
      overlayType: 'none',
      hasFlash: true,
      hasFlip: true,
    },
    propertyFields: [
      {
        key: 'overlayType',
        label: 'Overlay',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'grid', label: 'Grid' },
          { value: 'scan_area', label: 'Scan Area' },
          { value: 'face', label: 'Face Detection' },
        ],
        defaultValue: 'none',
      },
      { key: 'hasFlash', label: 'Show Flash', type: 'boolean', defaultValue: true },
      { key: 'hasFlip', label: 'Show Flip', type: 'boolean', defaultValue: true },
    ],
    systemImplications: ['Device camera access required', 'Camera permission handling'],
  },
  {
    type: 'resultsCard',
    category: 'pattern',
    name: 'Results Card',
    description: 'Display analysis output',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    defaultWidth: 343,
    defaultHeight: 280,
    defaultProps: {
      title: 'Analysis Result',
      primaryValue: '320',
      primaryUnit: 'kcal',
      secondaryFields: ['Protein: 28g', 'Carbs: 12g', 'Fat: 18g'],
      hasShare: true,
    },
    propertyFields: [
      { key: 'title', label: 'Title', type: 'text', defaultValue: 'Analysis Result' },
      { key: 'primaryValue', label: 'Primary Value', type: 'text', defaultValue: '320' },
      { key: 'primaryUnit', label: 'Primary Unit', type: 'text', defaultValue: 'kcal' },
      { key: 'secondaryFields', label: 'Secondary Fields (comma separated)', type: 'text', defaultValue: 'Protein: 28g,Carbs: 12g,Fat: 18g' },
      { key: 'hasShare', label: 'Show Share', type: 'boolean', defaultValue: true },
    ],
    systemImplications: ['AI/ML analysis API needed', 'Data processing backend'],
  },
  {
    type: 'loadingState',
    category: 'pattern',
    name: 'Loading State',
    description: 'Processing feedback',
    icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
    defaultWidth: 200,
    defaultHeight: 120,
    defaultProps: {
      message: 'Processing...',
      animationType: 'spinner',
    },
    propertyFields: [
      { key: 'message', label: 'Message', type: 'text', defaultValue: 'Processing...' },
      {
        key: 'animationType',
        label: 'Animation',
        type: 'select',
        options: [
          { value: 'spinner', label: 'Spinner' },
          { value: 'dots', label: 'Dots' },
          { value: 'progress', label: 'Progress Bar' },
        ],
        defaultValue: 'spinner',
      },
    ],
  },
];

// Helper to get component definition by type
export function getComponentDefinition(type: ComponentType): ComponentDefinition | undefined {
  return COMPONENT_LIBRARY.find((c) => c.type === type);
}

// Helper to get components by category
export function getComponentsByCategory(category: ComponentDefinition['category']): ComponentDefinition[] {
  return COMPONENT_LIBRARY.filter((c) => c.category === category);
}

// Helper to create a new component instance
export function createComponentInstance(
  type: ComponentType,
  x: number,
  y: number
): WireframeComponent | null {
  const definition = getComponentDefinition(type);
  if (!definition) return null;

  return {
    id: generateComponentId(),
    type,
    x,
    y,
    width: definition.defaultWidth,
    height: definition.defaultHeight,
    props: { ...definition.defaultProps },
    behavior: {},
  };
}

// Get all system implications for components in a screen
export function getSystemImplications(componentTypes: ComponentType[]): string[] {
  const implications = new Set<string>();

  componentTypes.forEach((type) => {
    const definition = getComponentDefinition(type);
    if (definition?.systemImplications) {
      definition.systemImplications.forEach((imp) => implications.add(imp));
    }
  });

  return Array.from(implications);
}
