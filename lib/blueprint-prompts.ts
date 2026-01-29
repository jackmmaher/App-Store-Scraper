import { AppProject, BlueprintAttachment } from './supabase';

// Section 1: Pareto Strategy Prompt
export function getParetoStrategyPrompt(project: AppProject): string {
  return `You are a senior product strategist specializing in mobile app development. Analyze the following competitor app and create a comprehensive Pareto Strategy document that identifies the 20% of features that deliver 80% of the value.

## Competitor App Details

**App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}
**Developer:** ${project.app_developer || 'Unknown'}
**Rating:** ${project.app_rating?.toFixed(1) || 'N/A'} ⭐ (${project.app_review_count?.toLocaleString() || 0} reviews)
**Price:** ${project.app_price > 0 ? `${project.app_currency} ${project.app_price}` : 'Free'}

## AI Analysis of Reviews
${project.ai_analysis || 'No AI analysis available.'}

## Your Task

Create a detailed Pareto Strategy document with the following sections:

### 1. Core Value Proposition
- What is the single most important problem this app solves?
- What makes users choose this app over alternatives?
- What's the "aha moment" that hooks users?

### 2. Must-Have Features (Pareto 20%)
Create a table of the essential features that deliver 80% of user value:

| Feature | User Value | Implementation Priority | Complexity |
|---------|-----------|------------------------|------------|
| ... | ... | P0/P1/P2 | Low/Medium/High |

### 3. Onboarding Strategy
- Recommended onboarding flow (steps)
- Key screens to include
- Information to collect vs. skip
- Time-to-value target

### 4. Monetization & Paywall Strategy
- Recommended pricing model (freemium, subscription, one-time, etc.)
- When to show paywall (soft vs. hard)
- Pricing tiers recommendation
- Free tier limitations

### 5. Core Architecture Decisions
- Key data models needed
- Critical user flows
- Offline-first considerations
- Sync strategy if applicable

Format your response in clean Markdown with proper headings, tables, and bullet points.`;
}

// Section 2: UI Wireframes Prompt
export function getUIWireframesPrompt(
  project: AppProject,
  paretoStrategy: string,
  attachments: BlueprintAttachment[]
): string {
  const attachmentInfo = attachments.length > 0
    ? `\n## Reference Screenshots\nThe user has provided ${attachments.length} inspiration screenshot(s):\n${attachments.map(a => `- ${a.screen_label || a.file_name}`).join('\n')}\n\nConsider these as visual references for the recommended UI style and patterns.`
    : '';

  return `You are a senior UI/UX designer specializing in iOS mobile apps. Based on the Pareto Strategy below, create a detailed UI Wireframe specification document.

## App Context

**App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}

## Pareto Strategy (Section 1)
${paretoStrategy}
${attachmentInfo}

## Your Task

Create a comprehensive UI Wireframe specification with numbered screens. For each screen, provide:

### Screen List Format

For each screen (#1 through #N), document:

**#[Number] - [Screen Name]**
- **Type:** [Onboarding | Auth | Main Feature | Settings | Paywall | Profile | Other]
- **Purpose:** Brief description of what this screen accomplishes
- **Key Elements:**
  - List of UI components (buttons, inputs, cards, etc.)
  - Navigation elements
  - Data displayed
- **User Actions:**
  - What can the user do on this screen?
  - Where does each action lead?
- **Design Notes:**
  - Layout suggestions
  - Important visual hierarchy notes
  - Accessibility considerations

### Required Screens to Cover

1. **Onboarding Flow** (#1-4)
   - Welcome/value prop screens
   - Permission requests if needed
   - Initial setup

2. **Authentication** (if applicable)
   - Sign up
   - Sign in
   - Password recovery

3. **Main Feature Screens**
   - Primary functionality (based on Pareto features)
   - Secondary features

4. **Paywall Screen**
   - Subscription options
   - Feature comparison
   - Purchase flow

5. **Settings & Profile**
   - User preferences
   - Account management
   - App settings

6. **Supporting Screens**
   - Empty states
   - Error states
   - Loading states

Format your response in clean Markdown. Number all screens sequentially (#1, #2, etc.) for easy reference.`;
}

// Section 3: Tech Stack Prompt
export function getTechStackPrompt(
  project: AppProject,
  paretoStrategy: string,
  uiWireframes: string
): string {
  return `You are a senior iOS developer and architect. Based on the Pareto Strategy and UI Wireframes below, create a comprehensive Tech Stack recommendation document.

## App Context

**App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}

## Pareto Strategy (Section 1)
${paretoStrategy}

## UI Wireframes (Section 2)
${uiWireframes}

## Your Task

Create a detailed Tech Stack document with the following sections:

### 1. Native iOS Stack

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| Language | Swift 5.9+ | ... |
| UI Framework | SwiftUI | ... |
| Min iOS Version | iOS 17.0 | ... |
| Xcode Version | 15.0+ | ... |
| Architecture | MVVM / TCA / etc. | ... |

### 2. iPhone APIs & Capabilities

Based on the features identified, which native iOS APIs will be needed:

| API/Capability | Use Case | Required Permission | Implementation Notes |
|---------------|----------|---------------------|---------------------|
| Camera | ... | NSCameraUsageDescription | ... |
| Microphone | ... | NSMicrophoneUsageDescription | ... |
| Location | ... | NSLocationWhenInUseUsageDescription | ... |
| Push Notifications | ... | UNUserNotificationCenter | ... |
| HealthKit | ... | NSHealthShareUsageDescription | ... |
| Core ML | ... | On-device | ... |
| ARKit | ... | NSCameraUsageDescription | ... |
| etc. | ... | ... | ... |

### 3. Backend Services

| Service | Provider Options | Recommendation | Rationale |
|---------|-----------------|----------------|-----------|
| Authentication | Firebase Auth, Supabase, Auth0 | ... | ... |
| Database | Supabase, Firebase, CloudKit | ... | ... |
| Storage | S3, Supabase Storage, CloudKit | ... | ... |
| Analytics | Mixpanel, Amplitude, PostHog | ... | ... |
| Crash Reporting | Sentry, Firebase Crashlytics | ... | ... |

### 4. Third-Party SDKs

| SDK | Purpose | Integration Complexity | Cost |
|-----|---------|----------------------|------|
| RevenueCat | Subscriptions | Low | Free tier available |
| Mixpanel | Analytics | Low | Free tier available |
| Sentry | Crash reporting | Low | Free tier available |
| OpenAI | AI features | Medium | Pay per use |
| etc. | ... | ... | ... |

### 5. Development Tools

- Package Manager: Swift Package Manager
- CI/CD: GitHub Actions / Xcode Cloud
- Code Quality: SwiftLint, SwiftFormat
- Testing: XCTest, XCUITest

### 6. Data Models

Based on the features, outline the key data models:

\`\`\`swift
// Example structure
struct User {
    let id: UUID
    var email: String
    var displayName: String
    // ...
}
\`\`\`

Format your response in clean Markdown with proper tables and code blocks.`;
}

// Section 4: PRD Prompt
export function getPRDPrompt(
  project: AppProject,
  paretoStrategy: string,
  uiWireframes: string,
  techStack: string
): string {
  return `You are a senior product manager creating a Product Requirements Document (PRD) for a new iOS app. Synthesize all the previous sections into a comprehensive PRD.

## App Context

**App Name:** ${project.app_name} Clone
**Category:** ${project.app_primary_genre || 'Unknown'}
**Original App Rating:** ${project.app_rating?.toFixed(1) || 'N/A'} ⭐

## Previous Sections

### Pareto Strategy (Section 1)
${paretoStrategy}

### UI Wireframes (Section 2)
${uiWireframes}

### Tech Stack (Section 3)
${techStack}

## Your Task

Create a comprehensive PRD with the following sections:

### 1. Executive Summary
- Product vision (2-3 sentences)
- Target market
- Key differentiators from original app
- Success criteria

### 2. Problem Statement
- What problem does this app solve?
- Who experiences this problem?
- Current solutions and their limitations
- Our approach

### 3. Target Users

| User Persona | Description | Primary Need | Secondary Needs |
|-------------|-------------|--------------|-----------------|
| Persona 1 | ... | ... | ... |
| Persona 2 | ... | ... | ... |

### 4. Feature Requirements

#### MVP (Phase 1)
| Feature | Priority | User Story | Acceptance Criteria |
|---------|----------|------------|---------------------|
| Feature 1 | P0 | As a user, I want to... | Given/When/Then |
| Feature 2 | P0 | ... | ... |

#### Phase 2 (Post-Launch)
| Feature | Priority | User Story | Acceptance Criteria |
|---------|----------|------------|---------------------|
| Feature 3 | P1 | ... | ... |

#### Future Considerations (Phase 3+)
- List of features for future consideration

### 5. Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| DAU/MAU | ... | Analytics |
| Retention (D1/D7/D30) | ... | Analytics |
| Conversion Rate | ... | RevenueCat |
| App Store Rating | ... | App Store Connect |
| Crash-free Rate | ... | Sentry |

### 6. Launch Timeline

| Milestone | Target | Key Deliverables |
|-----------|--------|-----------------|
| Alpha | Week N | ... |
| Beta | Week N | ... |
| Launch | Week N | ... |

### 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Risk 1 | High/Med/Low | High/Med/Low | ... |

### 8. Open Questions
- List any decisions that still need to be made
- Dependencies on external factors

### 9. Appendix
- Links to design files
- Technical specifications
- Research data

Format your response in clean Markdown with proper headings, tables, and bullet points.`;
}

// Helper to get the appropriate prompt for a section
export function getBlueprintPrompt(
  section: 'pareto' | 'wireframes' | 'tech_stack' | 'prd',
  project: AppProject,
  previousSections: {
    paretoStrategy?: string;
    uiWireframes?: string;
    techStack?: string;
  },
  attachments: BlueprintAttachment[] = []
): string {
  switch (section) {
    case 'pareto':
      return getParetoStrategyPrompt(project);
    case 'wireframes':
      if (!previousSections.paretoStrategy) {
        throw new Error('Pareto Strategy is required before generating UI Wireframes');
      }
      return getUIWireframesPrompt(project, previousSections.paretoStrategy, attachments);
    case 'tech_stack':
      if (!previousSections.paretoStrategy || !previousSections.uiWireframes) {
        throw new Error('Pareto Strategy and UI Wireframes are required before generating Tech Stack');
      }
      return getTechStackPrompt(project, previousSections.paretoStrategy, previousSections.uiWireframes);
    case 'prd':
      if (!previousSections.paretoStrategy || !previousSections.uiWireframes || !previousSections.techStack) {
        throw new Error('All previous sections are required before generating PRD');
      }
      return getPRDPrompt(
        project,
        previousSections.paretoStrategy,
        previousSections.uiWireframes,
        previousSections.techStack
      );
    default:
      throw new Error(`Unknown section: ${section}`);
  }
}
