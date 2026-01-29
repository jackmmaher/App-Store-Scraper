import { AppProject, BlueprintAttachment, Review } from './supabase';

// Helper to get diverse sample reviews (mix of ratings)
function getSampleReviews(reviews: Review[], count: number = 10): Review[] {
  if (reviews.length <= count) return reviews;

  const byRating: Record<number, Review[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  reviews.forEach((r) => {
    if (byRating[r.rating]) {
      byRating[r.rating].push(r);
    }
  });

  const sampled: Review[] = [];
  const perRating = Math.ceil(count / 5);

  // Take from each rating category for diversity
  [1, 2, 3, 4, 5].forEach((rating) => {
    const ratingReviews = byRating[rating];
    // Prioritize reviews with more votes (more helpful)
    const sorted = ratingReviews.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
    sampled.push(...sorted.slice(0, perRating));
  });

  return sampled.slice(0, count);
}

// Format reviews for prompt inclusion
function formatReviewsForPrompt(reviews: Review[]): string {
  if (reviews.length === 0) return 'No reviews available.';

  return reviews.map((r, i) =>
    `**Review ${i + 1}** (${r.rating}★)${r.vote_count > 0 ? ` - ${r.vote_count} found helpful` : ''}
> "${r.title}"
> ${r.content.slice(0, 500)}${r.content.length > 500 ? '...' : ''}`
  ).join('\n\n');
}

// Build project context section used across all prompts
function buildProjectContext(project: AppProject): string {
  const sections: string[] = [];

  // Basic app info
  sections.push(`## Competitor App Details

**App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}
**Developer:** ${project.app_developer || 'Unknown'}
**Rating:** ${project.app_rating?.toFixed(1) || 'N/A'} ⭐ (${project.app_review_count?.toLocaleString() || 0} total reviews)
**Price:** ${project.app_price > 0 ? `${project.app_currency} ${project.app_price}` : 'Free'}
**Reviews Analyzed:** ${project.review_count} reviews scraped and analyzed`);

  // AI Analysis (the main insight source)
  if (project.ai_analysis) {
    sections.push(`## AI Analysis of Reviews

This analysis was generated from ${project.review_count} user reviews:

${project.ai_analysis}`);
  }

  // User's personal notes
  if (project.notes && project.notes.trim()) {
    sections.push(`## Researcher's Notes

The following notes were added by the researcher analyzing this competitor:

${project.notes}`);
  }

  // Sample raw reviews for direct user voice
  const sampleReviews = getSampleReviews(project.reviews, 10);
  if (sampleReviews.length > 0) {
    sections.push(`## Sample User Reviews

These are actual user reviews showing diverse perspectives (1-5 stars):

${formatReviewsForPrompt(sampleReviews)}`);
  }

  // Review stats if available
  if (project.review_stats) {
    const dist = project.review_stats.rating_distribution;
    sections.push(`## Rating Distribution

| Rating | Count |
|--------|-------|
| 5★ | ${dist['5'] || 0} |
| 4★ | ${dist['4'] || 0} |
| 3★ | ${dist['3'] || 0} |
| 2★ | ${dist['2'] || 0} |
| 1★ | ${dist['1'] || 0} |

Average: ${project.review_stats.average_rating?.toFixed(2) || 'N/A'}`);
  }

  return sections.join('\n\n---\n\n');
}

// Section 1: Pareto Strategy Prompt
export function getParetoStrategyPrompt(project: AppProject): string {
  const context = buildProjectContext(project);

  return `You are a senior product strategist specializing in native iOS app development. Analyze the following competitor app and create a comprehensive Pareto Strategy document that identifies the 20% of features that deliver 80% of the value.

**IMPORTANT: Native-Pure Approach**
This app will be built using ONLY native Apple frameworks. No third-party dependencies (SPM or CocoaPods) like Firebase, RevenueCat, Mixpanel, or Realm. All recommendations must use native Apple technologies:
- **Payments:** StoreKit 2 with SubscriptionStoreView
- **Data:** SwiftData (local) + CloudKit (sync)
- **Auth:** Sign in with Apple (AuthenticationServices)
- **Analytics:** App Store Connect + MetricKit
- **Crash Reporting:** MetricKit + Xcode Organizer

${context}

---

## Your Task

Based on ALL the information above (app details, AI analysis, researcher notes, and raw user reviews), create a detailed Pareto Strategy document:

### 1. Core Value Proposition
- What is the single most important problem this app solves?
- What makes users choose this app over alternatives? (cite specific review feedback)
- What's the "aha moment" that hooks users?

### 2. Must-Have Features (Pareto 20%)
Create a table of the essential features that deliver 80% of user value. Base this on what users actually praise and complain about:

| Feature | User Value | Evidence from Reviews | Priority | Complexity |
|---------|-----------|----------------------|----------|------------|
| ... | ... | "quote from review" | P0/P1/P2 | Low/Med/High |

### 3. Onboarding Strategy
- Recommended onboarding flow (steps)
- Key screens to include
- Information to collect vs. skip
- Time-to-value target
- Address any onboarding complaints from reviews

### 4. Monetization & Paywall Strategy
- Recommended pricing model (freemium, subscription, one-time, etc.)
- When to show paywall (soft vs. hard)
- Pricing tiers recommendation
- Free tier limitations
- Address any pricing complaints from reviews

### 5. Core Architecture Decisions
- Key data models needed
- Critical user flows
- Offline-first considerations
- Sync strategy if applicable

### 6. Competitive Advantages to Build
Based on the negative reviews and researcher notes, what opportunities exist to differentiate:
- Pain points to solve better
- Missing features users request
- UX improvements needed

Format your response in clean Markdown with proper headings, tables, and bullet points. Cite specific reviews where relevant.`;
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

  // Include notes if available for design context
  const notesSection = project.notes && project.notes.trim()
    ? `\n## Researcher's Notes\n${project.notes}\n`
    : '';

  return `You are a senior UI/UX designer specializing in native iOS apps built with SwiftUI. Based on the Pareto Strategy and project context below, create a detailed UI Wireframe specification document.

**IMPORTANT: Native SwiftUI Design**
All UI recommendations must use native SwiftUI components and Apple's Human Interface Guidelines:
- Use native SwiftUI views: NavigationStack, TabView, List, Form, Sheet, etc.
- Use system materials (.ultraThinMaterial, .regularMaterial) for depth
- Use SF Symbols for icons
- Use native controls: Toggle, Picker, Slider, DatePicker
- For paywall: Use StoreKit 2's SubscriptionStoreView for native purchase UI
- Follow iOS design patterns for navigation, modals, and gestures

## App Context

**App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}
**Original Rating:** ${project.app_rating?.toFixed(1) || 'N/A'} ⭐
${notesSection}
## Pareto Strategy (Section 1)

${paretoStrategy}
${attachmentInfo}

## AI Analysis Reference

Key insights to inform UI decisions:
${project.ai_analysis ? project.ai_analysis.slice(0, 2000) + (project.ai_analysis.length > 2000 ? '\n\n[truncated]' : '') : 'No analysis available.'}

---

## Your Task

Create a comprehensive UI Wireframe specification with numbered screens. Address any UX issues mentioned in the Pareto Strategy.

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
  // Include notes if they contain technical preferences
  const notesSection = project.notes && project.notes.trim()
    ? `\n## Researcher's Notes\n\nConsider any technical preferences or constraints mentioned:\n${project.notes}\n`
    : '';

  return `You are a senior iOS developer and architect specializing in native Apple development. Based on the Pareto Strategy and UI Wireframes below, create a comprehensive Native-Pure Tech Stack document.

**CRITICAL: Native-Pure Development Philosophy**
This app will use ONLY native Apple frameworks. Do NOT recommend any third-party dependencies (SPM or CocoaPods) like Firebase, RevenueCat, Mixpanel, Realm, Alamofire, or any external SDKs. Benefits of Native-Pure:
- Smaller app size
- Simpler privacy policy
- Day-one access to new iOS features
- No dependency management overhead
- Better performance and battery life

## App Context

**App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}
${notesSection}
## Pareto Strategy (Section 1)

${paretoStrategy}

## UI Wireframes (Section 2)

${uiWireframes}

---

## Your Task

Create a detailed Native-Pure Tech Stack document using ONLY Apple frameworks.

### 1. Core iOS Stack

| Component | Recommendation | Rationale |
|-----------|---------------|-----------|
| Language | Swift 5.9+ | Latest language features |
| UI Framework | SwiftUI | Declarative, native, future-proof |
| Min iOS Version | iOS 17.0+ | SwiftData, StoreKit 2 views, Observation |
| Xcode Version | 15.0+ | Latest tooling |
| Architecture | MVVM + Observation | Native @Observable macro, no external deps |
| State Management | Observation framework | @Observable, @State, @Environment |

### 2. Native Service Stack (No 3rd Party!)

| Category | Native Apple Solution | Framework | Notes |
|----------|----------------------|-----------|-------|
| **Payments/Subscriptions** | StoreKit 2 + SubscriptionStoreView | StoreKit | Native paywall UI, no RevenueCat needed |
| **Local Database** | SwiftData | SwiftData | @Model macro, automatic persistence |
| **Cloud Sync** | CloudKit | CloudKit | Uses user's iCloud, free for developers |
| **Authentication** | Sign in with Apple + Passkeys | AuthenticationServices | Privacy-focused, no Auth0/Firebase |
| **Analytics** | App Analytics + MetricKit | App Store Connect API, MetricKit | Built into App Store Connect |
| **Crash Reporting** | MetricKit + Xcode Organizer | MetricKit | Automatic crash logs in Xcode |
| **Push Notifications** | APNs | UserNotifications | Native push, no OneSignal needed |
| **File Storage** | CloudKit Assets | CloudKit | Sync files via iCloud |

### 3. Hardware & Sensor APIs

Based on the features identified, specify which native frameworks are needed:

#### Camera & Media
| Framework | Use Case | Permission Key | Implementation |
|-----------|----------|----------------|----------------|
| AVFoundation | Custom camera, video, QR scanning | NSCameraUsageDescription | AVCaptureSession |
| PhotosUI | Photo picker | None (privacy-safe) | PhotosPicker view |
| AVAudioEngine | Audio recording, effects | NSMicrophoneUsageDescription | Real-time audio |

#### Motion & Sensors
| Framework | Use Case | Permission Key | Implementation |
|-----------|----------|----------------|----------------|
| CoreMotion | Accelerometer, gyroscope, pedometer | NSMotionUsageDescription | CMMotionManager |
| CoreHaptics | Custom vibrations | None | CHHapticEngine |
| SensoryFeedback | Simple haptics in SwiftUI | None | .sensoryFeedback modifier |

#### Location & Maps
| Framework | Use Case | Permission Key | Implementation |
|-----------|----------|----------------|----------------|
| CoreLocation | GPS, geofencing, heading | NSLocationWhenInUseUsageDescription | CLLocationManager |
| MapKit | Native maps | None | Map view in SwiftUI |

#### Intelligence & ML
| Framework | Use Case | Permission Key | Implementation |
|-----------|----------|----------------|----------------|
| CoreML | On-device ML models | None | MLModel |
| Vision | Face detection, text recognition | None | VNRequest |
| NaturalLanguage | Sentiment analysis, NLP | None | NLTagger |
| Speech | Voice transcription | NSSpeechRecognitionUsageDescription | SFSpeechRecognizer |

#### Connectivity
| Framework | Use Case | Permission Key | Implementation |
|-----------|----------|----------------|----------------|
| CoreBluetooth | BLE devices | NSBluetoothAlwaysUsageDescription | CBCentralManager |
| Network | Network status, sockets | None | NWPathMonitor |
| MultipeerConnectivity | Offline P2P | None | MCSession |

### 4. Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Xcode Cloud | CI/CD | Native Apple CI, integrates with App Store |
| Swift Package Manager | Dependencies | Only for Apple packages if needed |
| XCTest | Unit testing | Native testing framework |
| XCUITest | UI testing | Native UI automation |
| Instruments | Performance profiling | Built into Xcode |
| SwiftLint | Code quality | Optional, local only |

### 5. Data Models (SwiftData)

Based on the features, outline the key SwiftData models:

\`\`\`swift
import SwiftData

@Model
class User {
    var id: UUID
    var email: String
    var displayName: String
    var createdAt: Date

    // Relationships
    @Relationship(deleteRule: .cascade)
    var items: [Item] = []

    init(email: String, displayName: String) {
        self.id = UUID()
        self.email = email
        self.displayName = displayName
        self.createdAt = Date()
    }
}

@Model
class Item {
    var id: UUID
    var title: String
    var isCompleted: Bool
    var user: User?

    init(title: String) {
        self.id = UUID()
        self.title = title
        self.isCompleted = false
    }
}
\`\`\`

### 6. CloudKit Sync Strategy

\`\`\`swift
// SwiftData + CloudKit integration
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [User.self, Item.self],
                        inMemory: false,
                        isAutosaveEnabled: true,
                        isUndoEnabled: true,
                        cloudKitDatabase: .private("iCloud.com.yourapp"))
    }
}
\`\`\`

Format your response in clean Markdown with proper tables and code blocks. Remember: NO third-party dependencies!`;
}

// Section 4: PRD Prompt
export function getPRDPrompt(
  project: AppProject,
  paretoStrategy: string,
  uiWireframes: string,
  techStack: string
): string {
  // Include full notes in PRD for comprehensive context
  const notesSection = project.notes && project.notes.trim()
    ? `\n## Researcher's Notes & Insights\n\n${project.notes}\n`
    : '';

  return `You are a senior product manager creating a Product Requirements Document (PRD) for a new native iOS app. Synthesize all the previous sections into a comprehensive PRD.

**IMPORTANT: Native-Pure Development**
This app uses ONLY native Apple frameworks - no third-party dependencies. All technical references should reflect:
- StoreKit 2 for payments (not RevenueCat)
- SwiftData + CloudKit for data (not Firebase/Supabase)
- MetricKit for crash reporting (not Sentry/Crashlytics)
- App Store Connect for analytics (not Mixpanel/Amplitude)
- Sign in with Apple for auth (not Auth0/Firebase Auth)

## App Context

**App Name:** ${project.app_name} Clone
**Category:** ${project.app_primary_genre || 'Unknown'}
**Original App Rating:** ${project.app_rating?.toFixed(1) || 'N/A'} ⭐ (${project.app_review_count?.toLocaleString() || 0} reviews)
**Reviews Analyzed:** ${project.review_count}
${notesSection}
## Original AI Analysis

Key findings from competitor review analysis:
${project.ai_analysis ? project.ai_analysis.slice(0, 1500) + (project.ai_analysis.length > 1500 ? '\n\n[truncated]' : '') : 'No analysis available.'}

---

## Previous Blueprint Sections

### Pareto Strategy (Section 1)

${paretoStrategy}

### UI Wireframes (Section 2)

${uiWireframes}

### Tech Stack (Section 3)

${techStack}

---

## Your Task

Create a comprehensive PRD that synthesizes ALL the above information:

### 1. Executive Summary
- Product vision (2-3 sentences)
- Target market
- Key differentiators from original app (based on weaknesses found in reviews)
- Success criteria

### 2. Problem Statement
- What problem does this app solve?
- Who experiences this problem?
- Current solutions and their limitations (cite competitor weaknesses)
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
| DAU/MAU | ... | App Store Connect Analytics |
| Retention (D1/D7/D30) | ... | App Store Connect Analytics |
| Conversion Rate | ... | App Store Connect + StoreKit 2 |
| App Store Rating | ... | App Store Connect |
| Crash-free Rate | ... | MetricKit + Xcode Organizer |

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
