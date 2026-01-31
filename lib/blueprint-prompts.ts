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

// Section 2: App Identity Prompt
export function getAppIdentityPrompt(
  project: AppProject,
  paretoStrategy: string
): string {
  const notesSection = project.notes && project.notes.trim()
    ? `\n## Researcher's Notes\n${project.notes}\n`
    : '';

  return `You are a brand strategist specializing in iOS app naming and visual identity. Based on the Pareto Strategy below, create a comprehensive App Identity specification document.

## App Context

**Competitor App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}
**Developer:** ${project.app_developer || 'Unknown'}
${notesSection}
## Pareto Strategy (Section 1)

${paretoStrategy}

---

## Your Task

Create a detailed App Identity document with the following sections:

### 1. App Name Options

Provide 3-5 app name suggestions with rationale for each:

| Name | Rationale | Pros | Cons |
|------|-----------|------|------|
| [Name 1] | Why this name works | Benefits | Drawbacks |
| [Name 2] | ... | ... | ... |

**Top Recommendation:** [Name] because [reason]

### 2. Name Availability Checklist

For your top recommended name, create a checklist:

| Check | Status | Notes |
|-------|--------|-------|
| App Store | 🔍 To verify | Search "[name]" on App Store |
| Domain (.com) | 🔍 To verify | Check [name].com availability |
| Domain (.app) | 🔍 To verify | Check [name].app availability |
| Twitter/X | 🔍 To verify | Check @[name] availability |
| Instagram | 🔍 To verify | Check @[name] availability |
| Trademark | 🔍 To verify | Search USPTO database |

### 3. App Icon Design Direction

**Design Style:**
- Recommended style: [Flat/Gradient/3D/Illustrated/Minimal]
- Reasoning: [Why this style fits the app]

**Color Direction:**
- Primary color: [Color + hex code suggestion]
- Accent color: [Color + hex code suggestion]
- Background: [Solid/Gradient/Transparent]

**Iconography:**
- Main symbol/shape: [Description of the central element]
- Visual metaphor: [What the icon should communicate]
- Style notes: [Rounded corners, sharp edges, etc.]

**Icon Design Guidelines:**

DO:
- [Specific do's for this app's icon]
- Keep it simple and recognizable at 20x20pt
- Use consistent stroke weights
- Test against light and dark backgrounds

DON'T:
- [Specific don'ts for this app's icon]
- Include text in the icon
- Use photos or complex gradients
- Copy competitor icons directly

### 4. Required Icon Sizes

| Size (pt) | Scale | Pixels | Usage |
|-----------|-------|--------|-------|
| 1024 | 1x | 1024×1024 | App Store |
| 180 | 3x | 180×180 | iPhone App Icon |
| 120 | 2x | 120×120 | iPhone App Icon |
| 167 | 2x | 167×167 | iPad Pro App Icon |
| 152 | 2x | 152×152 | iPad App Icon |
| 76 | 1x | 76×76 | iPad App Icon |
| 120 | 3x | 120×120 | iPhone Spotlight |
| 80 | 2x | 80×80 | iPhone Spotlight |
| 80 | 2x | 80×80 | iPad Spotlight |
| 40 | 1x | 40×40 | iPad Spotlight |
| 87 | 3x | 87×87 | iPhone Settings |
| 58 | 2x | 58×58 | iPhone Settings |
| 58 | 2x | 58×58 | iPad Settings |
| 29 | 1x | 29×29 | iPad Settings |
| 60 | 3x | 60×60 | iPhone Notifications |
| 40 | 2x | 40×40 | iPhone/iPad Notifications |
| 20 | 1x | 20×20 | iPad Notifications |

### 5. Icon Mockup Prompt

Provide a detailed prompt that could be used with an AI image generator (DALL-E, Midjourney):

\`\`\`
[Detailed prompt for generating the app icon]
\`\`\`

Format your response in clean Markdown with proper headings and tables.`;
}

// Section 3: Design System Prompt
export function getDesignSystemPrompt(
  project: AppProject,
  paretoStrategy: string,
  appIdentity: string
): string {
  const notesSection = project.notes && project.notes.trim()
    ? `\n## Researcher's Notes\n${project.notes}\n`
    : '';

  return `You are a senior UI/UX designer specializing in native iOS design systems. Based on the Pareto Strategy and App Identity below, create a comprehensive Design System specification.

**IMPORTANT: Native iOS Design**
All design recommendations must follow Apple's Human Interface Guidelines and use native SwiftUI components.

## App Context

**App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}
${notesSection}
## Pareto Strategy (Section 1)

${paretoStrategy}

## App Identity (Section 2)

${appIdentity}

---

## Your Task

Create a comprehensive Design System document:

### 1. Color Palette

#### Primary Colors
| Name | Light Mode | Dark Mode | Usage |
|------|------------|-----------|-------|
| Primary | #XXXXXX | #XXXXXX | Main actions, brand |
| Secondary | #XXXXXX | #XXXXXX | Secondary actions |
| Accent | #XXXXXX | #XXXXXX | Highlights, links |

#### Semantic Colors
| Name | Light Mode | Dark Mode | Usage |
|------|------------|-----------|-------|
| Success | #22C55E | #4ADE80 | Confirmations, complete |
| Warning | #F59E0B | #FBBF24 | Cautions, alerts |
| Error | #EF4444 | #F87171 | Errors, destructive |
| Info | #3B82F6 | #60A5FA | Information, tips |

#### Background Colors
| Name | Light Mode | Dark Mode | Usage |
|------|------------|-----------|-------|
| Background | #FFFFFF | #000000 | Main background |
| Secondary BG | #F9FAFB | #1C1C1E | Cards, sections |
| Tertiary BG | #F3F4F6 | #2C2C2E | Input fields |

#### Text Colors
| Name | Light Mode | Dark Mode | Usage |
|------|------------|-----------|-------|
| Primary Text | #111827 | #FFFFFF | Headings, body |
| Secondary Text | #6B7280 | #9CA3AF | Captions, hints |
| Tertiary Text | #9CA3AF | #6B7280 | Disabled, placeholders |

### 2. Typography Scale

**Font Family:** SF Pro (system default)

| Style | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| Large Title | 34pt | Bold | 41pt | 0.37pt | Main screen titles |
| Title 1 | 28pt | Bold | 34pt | 0.36pt | Section headers |
| Title 2 | 22pt | Bold | 28pt | 0.35pt | Card titles |
| Title 3 | 20pt | Semibold | 25pt | 0.38pt | List headers |
| Headline | 17pt | Semibold | 22pt | -0.43pt | Emphasized text |
| Body | 17pt | Regular | 22pt | -0.43pt | Main content |
| Callout | 16pt | Regular | 21pt | -0.31pt | Secondary content |
| Subheadline | 15pt | Regular | 20pt | -0.23pt | Supporting text |
| Footnote | 13pt | Regular | 18pt | -0.08pt | Fine print |
| Caption 1 | 12pt | Regular | 16pt | 0pt | Labels |
| Caption 2 | 11pt | Regular | 13pt | 0.06pt | Timestamps |

### 3. Spacing System

**Base Unit:** 4pt

| Token | Value | Usage |
|-------|-------|-------|
| spacing-xs | 4pt | Tight spacing, icon gaps |
| spacing-sm | 8pt | Related elements |
| spacing-md | 16pt | Default padding |
| spacing-lg | 24pt | Section separators |
| spacing-xl | 32pt | Major sections |
| spacing-2xl | 48pt | Screen margins |

**Layout Grid:**
- Margins: 16pt (iPhone), 20pt (iPad)
- Gutter: 16pt
- Columns: 4 (iPhone), 12 (iPad)

### 4. Borders & Corners

| Token | Value | Usage |
|-------|-------|-------|
| radius-sm | 4pt | Buttons, tags |
| radius-md | 8pt | Cards, inputs |
| radius-lg | 12pt | Modals, sheets |
| radius-xl | 16pt | Large cards |
| radius-full | 9999pt | Pills, avatars |

**Border Widths:**
| Token | Value | Usage |
|-------|-------|-------|
| border-thin | 0.5pt | Subtle dividers |
| border-default | 1pt | Standard borders |
| border-thick | 2pt | Focus states |

### 5. Shadows & Elevation

| Level | Shadow | Usage |
|-------|--------|-------|
| elevation-0 | None | Flat elements |
| elevation-1 | 0 1pt 2pt rgba(0,0,0,0.05) | Cards, lists |
| elevation-2 | 0 4pt 6pt rgba(0,0,0,0.07) | Dropdowns, popovers |
| elevation-3 | 0 10pt 15pt rgba(0,0,0,0.1) | Modals, sheets |
| elevation-4 | 0 20pt 25pt rgba(0,0,0,0.15) | Dialogs |

### 6. Component Styles

#### Buttons
| Type | Background | Text | Border | Usage |
|------|------------|------|--------|-------|
| Primary | Primary Color | White | None | Main actions |
| Secondary | Secondary BG | Primary Text | 1pt border | Secondary actions |
| Tertiary | Transparent | Accent | None | Text links |
| Destructive | Error Color | White | None | Delete, cancel |

**Button Specs:**
- Height: 44pt minimum (touch target)
- Padding: 16pt horizontal, 12pt vertical
- Corner radius: radius-md (8pt)
- Font: Headline (17pt Semibold)

#### Cards
- Background: Secondary BG
- Corner radius: radius-lg (12pt)
- Padding: spacing-md (16pt)
- Shadow: elevation-1

#### Form Inputs
- Height: 44pt
- Background: Tertiary BG
- Corner radius: radius-md (8pt)
- Border: 1pt Secondary Text (on focus)
- Padding: 12pt horizontal

### 7. Accessibility

**Contrast Ratios:**
- Normal text: Minimum 4.5:1
- Large text (18pt+): Minimum 3:1
- Interactive elements: Minimum 3:1

**Touch Targets:**
- Minimum size: 44×44pt
- Minimum spacing between targets: 8pt

**Motion:**
- Respect "Reduce Motion" setting
- Provide alternatives to animations
- Duration: 200-300ms for micro-interactions

### 8. SwiftUI Implementation

\`\`\`swift
import SwiftUI

// MARK: - Colors
extension Color {
    static let appPrimary = Color("Primary")
    static let appSecondary = Color("Secondary")
    static let appAccent = Color("Accent")
    // Add semantic colors...
}

// MARK: - Typography
extension Font {
    static let appLargeTitle = Font.largeTitle.weight(.bold)
    static let appTitle1 = Font.title.weight(.bold)
    static let appHeadline = Font.headline
    static let appBody = Font.body
    static let appCaption = Font.caption
}

// MARK: - Spacing
enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
}

// MARK: - Corner Radius
enum CornerRadius {
    static let sm: CGFloat = 4
    static let md: CGFloat = 8
    static let lg: CGFloat = 12
    static let xl: CGFloat = 16
}
\`\`\`

Format your response in clean Markdown with proper headings and tables.`;
}

// Section 4: UI Wireframes Prompt
export function getUIWireframesPrompt(
  project: AppProject,
  paretoStrategy: string,
  designSystem: string,
  attachments: BlueprintAttachment[]
): string {
  const attachmentInfo = attachments.length > 0
    ? `\n## Reference Screenshots\nThe user has provided ${attachments.length} inspiration screenshot(s):\n${attachments.map(a => `- ${a.screen_label || a.file_name}`).join('\n')}\n\nConsider these as visual references for the recommended UI style and patterns.`
    : '';

  // Include notes if available for design context
  const notesSection = project.notes && project.notes.trim()
    ? `\n## Researcher's Notes\n${project.notes}\n`
    : '';

  return `You are a senior UI/UX designer specializing in native iOS apps built with SwiftUI. Based on the Pareto Strategy, Design System, and project context below, create a detailed UI Wireframe specification document.

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

## Design System (Section 3)

Use the following design system tokens for all UI specifications:

${designSystem}
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

// Section 6: Xcode Setup Prompt
export function getXcodeSetupPrompt(
  project: AppProject,
  techStack: string,
  appIdentity: string
): string {
  const notesSection = project.notes && project.notes.trim()
    ? `\n## Researcher's Notes\n${project.notes}\n`
    : '';

  return `You are a senior iOS developer creating an Xcode Setup guide for a new native iOS app. Based on the Tech Stack and App Identity below, create a comprehensive setup document.

## App Context

**App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}
${notesSection}
## Tech Stack (Section 5)

${techStack}

## App Identity (Section 2)

${appIdentity}

---

## Your Task

Create a comprehensive Xcode Setup document:

### 1. Bundle ID & Team Configuration

**Recommended Bundle ID Format:**
\`\`\`
com.[yourcompany].[appname]
\`\`\`

**Example:** \`com.acme.myawesomeapp\`

**Team Setup:**
| Setting | Value | Notes |
|---------|-------|-------|
| Team | Your Developer Account | Select from Xcode Signing |
| Bundle Identifier | com.yourcompany.appname | Unique identifier |
| Version | 1.0.0 | Semantic versioning |
| Build | 1 | Increment for each build |

### 2. Project Structure

Create the following folder structure:

\`\`\`
MyApp/
├── MyApp.swift                 # App entry point
├── Info.plist                  # App configuration
├── Assets.xcassets/            # Images, colors, app icon
│   ├── AppIcon.appiconset/
│   ├── AccentColor.colorset/
│   └── Colors/
├── Models/                     # SwiftData models
│   ├── User.swift
│   └── [Other models].swift
├── Views/                      # SwiftUI views
│   ├── ContentView.swift
│   ├── Onboarding/
│   ├── Main/
│   ├── Settings/
│   └── Components/
├── ViewModels/                 # @Observable classes
│   └── [ViewModels].swift
├── Services/                   # Business logic
│   ├── StoreManager.swift      # StoreKit 2
│   ├── CloudKitManager.swift   # CloudKit sync
│   └── AuthManager.swift       # Sign in with Apple
├── Utilities/                  # Helpers, extensions
│   ├── Extensions/
│   └── Helpers/
└── Resources/                  # Localization, fonts
    └── Localizable.xcstrings
\`\`\`

### 3. Info.plist Configuration

**Required Keys:**

| Key | Type | Value | Purpose |
|-----|------|-------|---------|
| CFBundleDisplayName | String | $(PRODUCT_NAME) | App name on home screen |
| CFBundleIdentifier | String | $(PRODUCT_BUNDLE_IDENTIFIER) | Unique app ID |
| CFBundleVersion | String | $(CURRENT_PROJECT_VERSION) | Build number |
| CFBundleShortVersionString | String | $(MARKETING_VERSION) | Version string |
| UILaunchScreen | Dictionary | {} | Uses SwiftUI launch |
| UISupportedInterfaceOrientations | Array | [Portrait] | Supported orientations |
| ITSAppUsesNonExemptEncryption | Boolean | NO | Export compliance |

**Privacy Permission Keys (add as needed):**

| Key | Description Example |
|-----|---------------------|
| NSCameraUsageDescription | "We need camera access to scan QR codes" |
| NSPhotoLibraryUsageDescription | "We need photo access to save images" |
| NSLocationWhenInUseUsageDescription | "We need your location to show nearby places" |
| NSMicrophoneUsageDescription | "We need microphone access to record audio" |
| NSFaceIDUsageDescription | "We use Face ID to secure your data" |
| NSHealthShareUsageDescription | "We read health data to track your progress" |

### 4. Entitlements

**MyApp.entitlements:**

\`\`\`xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- iCloud / CloudKit -->
    <key>com.apple.developer.icloud-container-identifiers</key>
    <array>
        <string>iCloud.com.yourcompany.appname</string>
    </array>
    <key>com.apple.developer.icloud-services</key>
    <array>
        <string>CloudKit</string>
    </array>

    <!-- Sign in with Apple -->
    <key>com.apple.developer.applesignin</key>
    <array>
        <string>Default</string>
    </array>

    <!-- In-App Purchases -->
    <key>com.apple.developer.in-app-payments</key>
    <array>
        <string>merchant.com.yourcompany.appname</string>
    </array>

    <!-- Push Notifications -->
    <key>aps-environment</key>
    <string>development</string>
</dict>
</plist>
\`\`\`

### 5. Code Signing

| Environment | Profile Type | Certificate |
|-------------|--------------|-------------|
| Development | iOS App Development | Apple Development |
| TestFlight | App Store Distribution | Apple Distribution |
| App Store | App Store Distribution | Apple Distribution |

**Automatic Signing Steps:**
1. Open project in Xcode
2. Select target → Signing & Capabilities
3. Check "Automatically manage signing"
4. Select your Team
5. Xcode creates provisioning profiles automatically

### 6. App Store Connect Setup

**Create App Record:**
1. Log into App Store Connect
2. My Apps → "+" → New App
3. Fill in:
   - Platform: iOS
   - Name: [App Name]
   - Primary Language: English (U.S.)
   - Bundle ID: Select from list
   - SKU: [unique identifier, e.g., appname-ios-2024]

**Required Metadata Fields:**

| Field | Limit | Notes |
|-------|-------|-------|
| App Name | 30 chars | Must match or relate to bundle display name |
| Subtitle | 30 chars | Benefit-focused tagline |
| Keywords | 100 chars | Comma-separated, no spaces after commas |
| Description | 4000 chars | Rich description with features |
| Promotional Text | 170 chars | Can be updated without new build |
| Support URL | Required | Link to support page |
| Marketing URL | Optional | Link to marketing site |
| Privacy Policy URL | Required | Link to privacy policy |

### 7. StoreKit Configuration

**Create StoreKit Configuration File:**
1. File → New → File → StoreKit Configuration File
2. Name: \`Configuration.storekit\`
3. Add products:

| Product Type | Product ID | Display Name | Price |
|--------------|------------|--------------|-------|
| Auto-Renewable | com.yourcompany.appname.monthly | Monthly Pro | $X.99/month |
| Auto-Renewable | com.yourcompany.appname.annual | Annual Pro | $XX.99/year |
| Non-Consumable | com.yourcompany.appname.lifetime | Lifetime Pro | $XX.99 |

### 8. Pre-Submission Checklist

**Before Submitting to App Store:**

- [ ] **App Icon:** All sizes provided (1024x1024 for App Store)
- [ ] **Screenshots:** All required device sizes
- [ ] **Privacy Policy:** URL accessible and accurate
- [ ] **Age Rating:** Questionnaire completed
- [ ] **Export Compliance:** ITSAppUsesNonExemptEncryption set
- [ ] **Build Tested:** Full testing on real devices
- [ ] **StoreKit Products:** Created in App Store Connect
- [ ] **In-App Purchase:** Tested with sandbox account
- [ ] **Sign in with Apple:** Tested flow works
- [ ] **CloudKit:** Schema deployed to production
- [ ] **Push Notifications:** APNs key configured
- [ ] **Version/Build Numbers:** Updated appropriately
- [ ] **Review Notes:** Provided for reviewer (demo account if needed)

### 9. Common Xcode Settings

**Build Settings:**

| Setting | Recommended Value |
|---------|-------------------|
| SWIFT_VERSION | 5.9 |
| IPHONEOS_DEPLOYMENT_TARGET | 17.0 |
| SWIFT_OPTIMIZATION_LEVEL | -Owholemodule (Release) |
| ENABLE_BITCODE | NO |
| DEBUG_INFORMATION_FORMAT | dwarf-with-dsym |

Format your response in clean Markdown with proper headings, tables, and code blocks.`;
}

// Section 8: ASO (App Store Optimization) Prompt
export function getASOPrompt(
  project: AppProject,
  prd: string,
  appIdentity: string,
  designSystem: string
): string {
  const notesSection = project.notes && project.notes.trim()
    ? `\n## Researcher's Notes\n${project.notes}\n`
    : '';

  return `You are an App Store Optimization (ASO) specialist. Based on the PRD, App Identity, and Design System below, create a comprehensive ASO document for the App Store listing.

## App Context

**Competitor App Name:** ${project.app_name}
**Category:** ${project.app_primary_genre || 'Unknown'}
**Competitor Rating:** ${project.app_rating?.toFixed(1) || 'N/A'} ⭐ (${project.app_review_count?.toLocaleString() || 0} reviews)
${notesSection}
## PRD (Section 7)

${prd}

## App Identity (Section 2)

${appIdentity}

## Design System (Section 3)

${designSystem}

---

## Your Task

Create a comprehensive ASO document:

### 1. App Title (30 characters max)

| Option | Characters | Rationale |
|--------|------------|-----------|
| Option 1 | XX/30 | [Why this works] |
| Option 2 | XX/30 | [Alternative approach] |

**Recommended:** [Title] because [reason]

### 2. Subtitle (30 characters max)

| Option | Characters | Focus |
|--------|------------|-------|
| Option 1 | XX/30 | Benefit-focused |
| Option 2 | XX/30 | Feature-focused |

**Recommended:** [Subtitle]

### 3. Keywords (100 characters max)

**Keyword Strategy:**
- Primary keywords: [high-volume, relevant]
- Secondary keywords: [medium-volume, specific]
- Long-tail keywords: [low-competition, niche]

**Keyword String:**
\`\`\`
keyword1,keyword2,keyword3,keyword4,keyword5,keyword6,keyword7,keyword8,keyword9,keyword10
\`\`\`

**Character Count:** XX/100

**Keyword Research Notes:**
| Keyword | Relevance | Competition | Notes |
|---------|-----------|-------------|-------|
| keyword1 | High | Medium | [why included] |
| keyword2 | High | Low | [why included] |

### 4. Description (4000 characters max)

\`\`\`
[Opening hook - 1-2 sentences that grab attention]

[Main value proposition - what problem does this solve?]

KEY FEATURES:
• Feature 1 - [benefit explanation]
• Feature 2 - [benefit explanation]
• Feature 3 - [benefit explanation]
• Feature 4 - [benefit explanation]
• Feature 5 - [benefit explanation]

WHY CHOOSE [APP NAME]?
[Unique selling points and differentiators]

WHAT'S INCLUDED:
Free Features:
• [List free features]

Pro Features:
• [List premium features]

SUBSCRIPTION OPTIONS:
• Monthly: $X.99/month
• Annual: $XX.99/year (Save XX%)
• Lifetime: $XX.99 (one-time)

[Social proof or press mentions if any]

Download [APP NAME] today and [call to action]!

---

Questions or feedback? Contact us at support@yourcompany.com

Privacy Policy: [URL]
Terms of Service: [URL]
\`\`\`

**Character Count:** ~XXXX/4000

### 5. Promotional Text (170 characters max)

| Option | Characters | When to Use |
|--------|------------|-------------|
| Default | XX/170 | General promotion |
| Sale | XX/170 | During price drops |
| Feature | XX/170 | New feature launch |
| Seasonal | XX/170 | Holiday promotions |

### 6. Screenshot Strategy

**Required Screenshots:**

| Screen | Device | Content | Headline |
|--------|--------|---------|----------|
| 1 | iPhone 6.7" | [Main feature/hero] | "[Compelling headline]" |
| 2 | iPhone 6.7" | [Key feature 1] | "[Benefit statement]" |
| 3 | iPhone 6.7" | [Key feature 2] | "[Benefit statement]" |
| 4 | iPhone 6.7" | [Key feature 3] | "[Benefit statement]" |
| 5 | iPhone 6.7" | [Social proof/reviews] | "[Trust builder]" |

**Screenshot Design Guidelines:**
- Use design system colors for backgrounds
- Headlines: Large Title typography (34pt equivalent)
- Device frame: Optional but recommended
- Orientation: Portrait for iPhone
- Resolution: 1290 × 2796 px (6.7" display)

### 7. App Preview Video (Optional)

**Recommended Scenes:**

| Timestamp | Scene | Focus |
|-----------|-------|-------|
| 0:00-0:05 | Hook | Problem statement or wow moment |
| 0:05-0:15 | Feature 1 | Core functionality demo |
| 0:15-0:25 | Feature 2 | Key benefit demo |
| 0:25-0:30 | CTA | Download call-to-action |

**Video Specs:**
- Duration: 15-30 seconds
- Resolution: 1080p minimum
- Audio: Optional background music (royalty-free)
- No narration required

### 8. Category Selection

**Primary Category:** [Category]
- Rationale: [Why this is the best fit]
- Competition level: [High/Medium/Low]

**Secondary Category:** [Category]
- Rationale: [Why this secondary helps discovery]

### 9. Age Rating Guidance

**Content Rating Questionnaire:**

| Question | Answer | Impact |
|----------|--------|--------|
| Violence | None/Infrequent/Frequent | Affects rating |
| Sexual Content | None/Mild/Intense | Affects rating |
| Profanity | None/Mild/Strong | Affects rating |
| Gambling | None/Simulated/Real | May restrict distribution |
| Horror/Fear | None/Mild/Intense | Affects rating |
| Medical/Treatment | No/Yes | May require disclaimer |
| User-Generated Content | No/Yes | Requires moderation plan |
| Unrestricted Web Access | No/Yes | May increase rating |

**Expected Rating:** [4+/9+/12+/17+]

### 10. Pricing Strategy

| Tier | Price | Rationale |
|------|-------|-----------|
| Free | $0 | Core features to demonstrate value |
| Monthly | $X.99 | Low commitment entry point |
| Annual | $XX.99 | Best value, highest LTV |
| Lifetime | $XX.99 | One-time for price-sensitive users |

**Launch Pricing Recommendations:**
- Consider introductory pricing for first month
- Use price anchoring (show annual savings)
- Offer free trial period

### 11. Localization Priority

| Language | Market Size | Priority |
|----------|-------------|----------|
| English (US) | Largest | P0 |
| Spanish | Growing | P1 |
| German | High-value | P1 |
| Japanese | App-heavy | P2 |
| French | Significant | P2 |

Format your response in clean Markdown with proper headings and tables.`;
}

// Section 9: Build Manifest Prompt
export function getBuildManifestPrompt(
  appName: string,
  paretoStrategy: string,
  uiWireframes: string,
  techStack: string
): string {
  return `You are a senior iOS developer creating a BUILD MANIFEST - a sequential task list for building an app from scratch. This manifest will be fed to an AI assistant ONE TASK AT A TIME to ensure complete implementation with no skipped steps.

## App: ${appName}

## Source Documents

You have access to three completed planning documents. Parse them carefully to extract EVERY feature, screen, model, and technical requirement.

### 1. Pareto Strategy
${paretoStrategy}

### 2. UI Wireframes
${uiWireframes}

### 3. Tech Stack
${techStack}

---

## Your Task

Generate a BUILD_MANIFEST.md with 50-100 atomic tasks that, when completed in sequence, result in a fully functional app matching the specifications above.

## Rules

1. **Atomic tasks**: Each task produces exactly ONE file or ONE small change
2. **Sequential**: Tasks must be numbered and ordered by dependency
3. **Specific file paths**: Every task specifies the exact file to create/modify
4. **Reference sources**: Each task cites the wireframe #, feature, or tech spec it implements
5. **Acceptance criteria**: Each task has clear "done when" criteria
6. **No skipping**: A developer following this manifest sequentially will build the COMPLETE app
7. **Native-Pure**: All code uses only Apple frameworks (StoreKit 2, SwiftData, CloudKit, etc.)

## Output Format

\`\`\`markdown
# BUILD MANIFEST: ${appName}

> **Instructions for AI Assistant**: Complete these tasks IN ORDER. Do not skip any task.
> Each task should be completed fully before moving to the next.
> When asked to implement a task, produce the complete file contents.

---

## Phase 1: Project Setup (Tasks 1-10)

### Task 1: Create Xcode Project
**Action:** Create new Xcode project
**Settings:**
- Product Name: ${appName}
- Interface: SwiftUI
- Language: Swift
- Storage: SwiftData
- Minimum iOS: 17.0

**Done when:** Fresh Xcode project opens and builds successfully

---

### Task 2: Configure Info.plist Permissions
**File:** \`Info.plist\`
**Reference:** Tech Stack Section 3 (Hardware APIs)
**Add keys:**
- NSCameraUsageDescription: "[reason from tech stack]"
- [other permissions identified in tech stack]

**Done when:** All required permission keys added with user-facing descriptions

---

### Task 3: Create App Entry Point
**File:** \`${appName}App.swift\`
**Reference:** Tech Stack Section 6 (CloudKit Sync)
**Code requirements:**
- Configure SwiftData ModelContainer
- Set up CloudKit sync if specified
- Register all models from Tech Stack

**Done when:** App launches with SwiftData configured

---

## Phase 2: Data Models (Tasks 11-XX)

### Task 11: Create [Model Name] Model
**File:** \`Models/[Name].swift\`
**Reference:** Tech Stack Section 5 (Data Models)
**Properties:**
- [list each property with type]
- [relationships]

**Done when:** Model compiles, can be used with SwiftData

---

## Phase 3: Core Views (Tasks XX-XX)

### Task XX: Create [Screen Name] View
**File:** \`Views/[Name]View.swift\`
**Reference:** Wireframe #[N]
**Elements:**
- [list UI elements from wireframe]
**Navigation:**
- [where does each action go]
**State:**
- [what @State/@Observable needed]

**Done when:** Screen matches wireframe specification, navigation works

---

## Phase 4: Features (Tasks XX-XX)

[Continue for all features from Pareto Strategy]

---

## Phase 5: StoreKit & Paywall (Tasks XX-XX)

### Task XX: Configure StoreKit
**File:** \`Store/StoreManager.swift\`
**Reference:** Pareto Strategy Section 4 (Monetization)
**Requirements:**
- Product IDs for each tier
- SubscriptionStoreView implementation
- Purchase handling

---

## Phase 6: Polish & Launch Prep (Tasks XX-XX)

### Task XX: Add App Icons
**File:** \`Assets.xcassets/AppIcon.appiconset\`
**Sizes needed:** [list all required sizes]

---

# Completion Checklist

At the end, verify ALL of the following from the source documents:

## From Pareto Strategy:
- [ ] Core value proposition implemented
- [ ] All P0 features working
- [ ] All P1 features working
- [ ] Onboarding flow complete
- [ ] Monetization/paywall working

## From Wireframes:
- [ ] Screen #1 implemented
- [ ] Screen #2 implemented
[... list ALL screens]

## From Tech Stack:
- [ ] All required frameworks imported
- [ ] All data models created
- [ ] CloudKit sync working (if specified)
- [ ] All permissions configured
\`\`\`

Generate the complete BUILD_MANIFEST.md following this format. Extract EVERY screen from wireframes, EVERY model from tech stack, EVERY feature from pareto strategy. Miss nothing.`;
}

// Helper to get the appropriate prompt for a section
export function getBlueprintPrompt(
  section: 'pareto' | 'identity' | 'design_system' | 'wireframes' | 'tech_stack' | 'xcode_setup' | 'prd' | 'aso',
  project: AppProject,
  previousSections: {
    paretoStrategy?: string;
    appIdentity?: string;
    designSystem?: string;
    uiWireframes?: string;
    techStack?: string;
    prd?: string;
  },
  attachments: BlueprintAttachment[] = []
): string {
  switch (section) {
    case 'pareto':
      return getParetoStrategyPrompt(project);
    case 'identity':
      if (!previousSections.paretoStrategy) {
        throw new Error('Pareto Strategy is required before generating App Identity');
      }
      return getAppIdentityPrompt(project, previousSections.paretoStrategy);
    case 'design_system':
      if (!previousSections.paretoStrategy || !previousSections.appIdentity) {
        throw new Error('Pareto Strategy and App Identity are required before generating Design System');
      }
      return getDesignSystemPrompt(project, previousSections.paretoStrategy, previousSections.appIdentity);
    case 'wireframes':
      if (!previousSections.paretoStrategy || !previousSections.designSystem) {
        throw new Error('Pareto Strategy and Design System are required before generating UI Wireframes');
      }
      return getUIWireframesPrompt(project, previousSections.paretoStrategy, previousSections.designSystem, attachments);
    case 'tech_stack':
      if (!previousSections.paretoStrategy || !previousSections.uiWireframes) {
        throw new Error('Pareto Strategy and UI Wireframes are required before generating Tech Stack');
      }
      return getTechStackPrompt(project, previousSections.paretoStrategy, previousSections.uiWireframes);
    case 'xcode_setup':
      if (!previousSections.techStack || !previousSections.appIdentity) {
        throw new Error('Tech Stack and App Identity are required before generating Xcode Setup');
      }
      return getXcodeSetupPrompt(project, previousSections.techStack, previousSections.appIdentity);
    case 'prd':
      if (!previousSections.paretoStrategy || !previousSections.uiWireframes || !previousSections.techStack) {
        throw new Error('Strategy, Wireframes, and Tech Stack are required before generating PRD');
      }
      return getPRDPrompt(
        project,
        previousSections.paretoStrategy,
        previousSections.uiWireframes,
        previousSections.techStack
      );
    case 'aso':
      if (!previousSections.prd || !previousSections.appIdentity || !previousSections.designSystem) {
        throw new Error('PRD, App Identity, and Design System are required before generating ASO');
      }
      return getASOPrompt(
        project,
        previousSections.prd,
        previousSections.appIdentity,
        previousSections.designSystem
      );
    default:
      throw new Error(`Unknown section: ${section}`);
  }
}
