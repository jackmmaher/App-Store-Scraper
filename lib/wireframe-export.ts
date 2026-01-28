import { WireframeData, WireframeScreen, WireframeComponent, AppProject } from './supabase';
import { getComponentDefinition, ComponentType, getSystemImplications } from './component-library';

interface ExportOptions {
  conceptName: string;
  conceptDescription?: string;
  linkedProjects: AppProject[];
  wireframeData: WireframeData;
}

export function generateExportSpec(options: ExportOptions): string {
  const { conceptName, conceptDescription, linkedProjects, wireframeData } = options;
  const screens = Object.values(wireframeData.screens).sort((a, b) => a.order - b.order);

  const lines: string[] = [];

  // Header
  lines.push(`# App Specification: ${conceptName}`);
  lines.push('');

  // Overview
  lines.push('## Overview');
  if (conceptDescription) {
    lines.push(`- **Concept**: ${conceptDescription}`);
  }
  lines.push('- **Target Platform**: iOS (iPhone) - PWA or React Native');
  lines.push(`- **Screens**: ${screens.length}`);
  lines.push(`- **Demo Goal**: Record engaging demo showcasing core user flow`);
  lines.push('');

  // Competitor Analysis Summary
  if (linkedProjects.length > 0) {
    lines.push('## Competitor Analysis Summary');
    lines.push(`Based on analysis of: ${linkedProjects.map((p) => p.app_name).join(', ')}`);
    lines.push('');

    // Aggregate insights from AI analyses
    const analyses = linkedProjects.filter((p) => p.ai_analysis);
    if (analyses.length > 0) {
      lines.push('**Key Insights from Competitor Analysis:**');
      analyses.forEach((project) => {
        lines.push(`- **${project.app_name}** (${project.app_rating?.toFixed(1) || 'N/A'} rating, ${project.app_review_count?.toLocaleString() || 0} reviews)`);
      });
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  // Screens
  lines.push('## Screens');
  lines.push('');

  screens.forEach((screen, index) => {
    lines.push(generateScreenSpec(screen, index + 1, screens));
    lines.push('---');
    lines.push('');
  });

  // Navigation Flow
  lines.push('## Navigation Flow');
  lines.push('```');
  const flowLines = generateNavigationFlow(screens);
  flowLines.forEach((line) => lines.push(line));
  lines.push('```');
  lines.push('');

  // System Requirements
  const allComponentTypes = screens.flatMap((s) =>
    s.components.map((c) => c.type as ComponentType)
  );
  const implications = getSystemImplications(allComponentTypes);

  if (implications.length > 0) {
    lines.push('## System Requirements');
    lines.push('');
    implications.forEach((imp) => {
      lines.push(`- ${imp}`);
    });
    lines.push('');
  }

  // Key Demo Moments
  lines.push('## Key Demo Moments for Recording');
  lines.push('');
  lines.push('Focus on these flows for maximum impact:');
  lines.push('');

  // Generate demo suggestions based on patterns found
  const hasCamera = allComponentTypes.includes('cameraView');
  const hasResults = allComponentTypes.includes('resultsCard');
  const hasOnboarding = allComponentTypes.includes('onboardingSlide');
  const hasPaywall = allComponentTypes.includes('paywallCard');

  if (hasOnboarding) {
    lines.push('1. **Onboarding Flow**: Show smooth swipe through intro slides');
  }
  if (hasCamera && hasResults) {
    lines.push('2. **Core Feature Demo**: Camera capture → Processing → Results display (the "wow moment")');
  }
  if (hasPaywall) {
    lines.push('3. **Monetization Teaser**: Brief paywall glimpse showing premium features');
  }
  if (!hasCamera && !hasOnboarding) {
    lines.push('1. **Main User Flow**: Walk through the primary use case from start to finish');
  }
  lines.push('');

  // Data Models
  lines.push('## Data Models (for full implementation)');
  lines.push('```typescript');
  lines.push(generateDataModels(screens));
  lines.push('```');
  lines.push('');

  // Footer
  lines.push('---');
  lines.push(`*Generated from ${conceptName} concept on ${new Date().toLocaleDateString()}*`);
  lines.push('');
  lines.push('> This spec is optimized for Claude Code. Paste this document and ask Claude to build a functional demo app.');

  return lines.join('\n');
}

function generateScreenSpec(
  screen: WireframeScreen,
  screenNumber: number,
  allScreens: WireframeScreen[]
): string {
  const lines: string[] = [];

  lines.push(`### Screen ${screenNumber}: ${screen.name}`);

  // Determine purpose based on components
  const componentTypes = screen.components.map((c) => c.type);
  let purpose = 'Display content';
  if (componentTypes.includes('onboardingSlide')) {
    purpose = 'First impression, communicate core value prop';
  } else if (componentTypes.includes('cameraView')) {
    purpose = 'Core feature - capture user input';
  } else if (componentTypes.includes('resultsCard')) {
    purpose = 'Display analysis/results - KEY DEMO MOMENT';
  } else if (componentTypes.includes('paywallCard')) {
    purpose = 'Monetization - prompt subscription';
  }

  lines.push(`**Purpose**: ${purpose}`);
  lines.push('');
  lines.push('<components>');

  // Group and describe components
  screen.components.forEach((component) => {
    lines.push(generateComponentSpec(component));
  });

  lines.push('</components>');
  lines.push('');

  // Behaviors
  const behaviors = screen.components.filter((c) => c.behavior?.onTap);
  if (behaviors.length > 0) {
    lines.push('<behaviors>');
    behaviors.forEach((comp, i) => {
      const behavior = comp.behavior?.onTap;
      const label = (comp.props.label || comp.props.title || comp.type) as string;

      if (behavior?.navigateTo) {
        const targetScreen = allScreens.find((s) => s.id === behavior.navigateTo);
        lines.push(`${i + 1}. "${label}" tap → Navigate to ${targetScreen?.name || 'next screen'}`);
      } else if (behavior?.showModal) {
        lines.push(`${i + 1}. "${label}" tap → Show ${behavior.showModal} modal`);
      } else if (behavior?.action) {
        lines.push(`${i + 1}. "${label}" tap → ${behavior.action}`);
      }
    });
    lines.push('</behaviors>');
    lines.push('');
  }

  // Backend requirements
  const backendReqs = getScreenBackendRequirements(screen.components);
  if (backendReqs.length > 0) {
    lines.push('<backend_requirements>');
    backendReqs.forEach((req) => lines.push(`- ${req}`));
    lines.push('</backend_requirements>');
  } else {
    lines.push('<backend_requirements>');
    lines.push('None - static content only');
    lines.push('</backend_requirements>');
  }
  lines.push('');

  return lines.join('\n');
}

function generateComponentSpec(component: WireframeComponent): string {
  const definition = getComponentDefinition(component.type as ComponentType);
  const name = definition?.name || component.type;
  const label = (component.props.label || component.props.title || '') as string;

  const lines: string[] = [];
  lines.push(`- ${name}${label ? ` "${label}"` : ''}`);
  lines.push(`  - Position: ${component.x}px from left, ${component.y}px from top`);
  lines.push(`  - Size: ${component.width}x${component.height}`);

  // Add relevant props
  const relevantProps = Object.entries(component.props).filter(
    ([key]) => !['label', 'title'].includes(key) && component.props[key]
  );
  if (relevantProps.length > 0) {
    const propsStr = relevantProps
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    lines.push(`  - Props: ${propsStr}`);
  }

  // Add behavior if present
  if (component.behavior?.onTap) {
    const { navigateTo, showModal, action } = component.behavior.onTap;
    if (navigateTo) {
      lines.push(`  - Action: Navigate to screen ${navigateTo}`);
    } else if (showModal) {
      lines.push(`  - Action: Show ${showModal} modal`);
    } else if (action) {
      lines.push(`  - Action: ${action}`);
    }
  }

  return lines.join('\n');
}

function generateNavigationFlow(screens: WireframeScreen[]): string[] {
  const lines: string[] = [];

  screens.forEach((screen) => {
    const navigations = screen.components
      .filter((c) => c.behavior?.onTap?.navigateTo)
      .map((c) => {
        const targetId = c.behavior!.onTap!.navigateTo!;
        const targetScreen = screens.find((s) => s.id === targetId);
        const label = (c.props.label || c.props.title || 'action') as string;
        return { label, target: targetScreen?.name || 'Unknown' };
      });

    if (navigations.length > 0) {
      navigations.forEach((nav) => {
        lines.push(`${screen.name} → ${nav.label} → ${nav.target}`);
      });
    }
  });

  if (lines.length === 0) {
    lines.push('(No navigation defined yet)');
  }

  return lines;
}

function getScreenBackendRequirements(components: WireframeComponent[]): string[] {
  const requirements: string[] = [];

  components.forEach((comp) => {
    const type = comp.type as ComponentType;

    switch (type) {
      case 'cameraView':
        requirements.push('Device camera access (permission prompt on first use)');
        requirements.push('Image capture and compression');
        break;
      case 'resultsCard':
        requirements.push('AI/ML analysis API integration');
        requirements.push('Data processing and parsing');
        break;
      case 'paywallCard':
        requirements.push('Payment/subscription system (StoreKit for iOS, Stripe for web)');
        break;
      case 'textField':
        requirements.push('Form validation and handling');
        break;
      case 'searchBar':
        requirements.push('Search/filter API endpoint');
        break;
      case 'toggle':
        requirements.push('User preferences storage');
        break;
    }
  });

  return [...new Set(requirements)];
}

function generateDataModels(screens: WireframeScreen[]): string {
  const models: string[] = [];

  // Check for common patterns
  const allTypes = screens.flatMap((s) => s.components.map((c) => c.type));

  models.push('// Core models based on wireframe analysis');
  models.push('');

  if (allTypes.includes('cameraView') || allTypes.includes('resultsCard')) {
    models.push('interface ScanResult {');
    models.push('  id: string;');
    models.push('  image_url: string;');
    models.push('  analysis_data: Record<string, unknown>;');
    models.push('  created_at: Date;');
    models.push('}');
    models.push('');
  }

  if (allTypes.includes('paywallCard')) {
    models.push('interface Subscription {');
    models.push('  id: string;');
    models.push('  user_id: string;');
    models.push('  plan: "free" | "premium";');
    models.push('  expires_at: Date | null;');
    models.push('}');
    models.push('');
  }

  if (allTypes.includes('textField') || allTypes.includes('toggle')) {
    models.push('interface UserSettings {');
    models.push('  id: string;');
    models.push('  user_id: string;');
    models.push('  preferences: Record<string, unknown>;');
    models.push('  updated_at: Date;');
    models.push('}');
    models.push('');
  }

  if (allTypes.includes('listItem') || allTypes.includes('card')) {
    models.push('interface Item {');
    models.push('  id: string;');
    models.push('  title: string;');
    models.push('  description?: string;');
    models.push('  image_url?: string;');
    models.push('  created_at: Date;');
    models.push('}');
  }

  if (models.length === 2) {
    // Only header comments
    models.push('// No specific models detected - add based on app requirements');
  }

  return models.join('\n');
}
