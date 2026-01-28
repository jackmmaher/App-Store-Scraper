# App Store Scraper

Fetch and sort iOS App Store apps by review count, rating, or name. Discover high-engagement apps across any category and country.

Available as both a **CLI tool** and a **Progressive Web App (PWA)**.

---

## PWA Version (Web Interface)

### Features
- Web UI for configuring searches (country, category, filters)
- Dashboard for viewing and managing saved searches
- Export functionality (CSV/JSON)
- PWA support for mobile installation

### Setup

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Set Up Supabase
1. Create a new project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor and run the schema from `supabase-schema.sql`
3. Copy your project URL and anon key from Settings > API

#### 3. Configure Environment Variables
Create a `.env.local` file:
```env
APP_PASSWORD=your-secret-password
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

#### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### Deploy to Vercel
1. Push to GitHub
2. Import your repository at [vercel.com](https://vercel.com)
3. Add environment variables in Project Settings
4. Deploy

---

## CLI Version

## Quick Start

### Windows
```batch
appstore.bat us health-fitness 100
appstore.bat gb productivity 200 --include-paid
```

### Mac/Linux
```bash
./appstore.sh us health-fitness 100
./appstore.sh gb productivity 200 --include-paid
```

### Python Direct
```bash
python appstore_scraper.py --country us --category health-fitness --limit 100
```

## Installation

1. Ensure Python 3.7+ is installed
2. Install dependencies:
   ```bash
   pip install requests
   ```

## Usage Examples

### Basic usage - top 100 free apps in US Health & Fitness
```bash
appstore.bat us health-fitness
```

### Get 200 apps from UK Productivity, including paid
```bash
appstore.bat gb productivity 200 --include-paid
```

### Deep search to find more apps (slower, uses search API)
```bash
appstore.bat us games 150 --deep-search
```

### Filter by minimum reviews (200K+) and high ratings (4.5+)
```bash
python appstore_scraper.py -c us -g health-fitness --min-reviews 200000 --min-rating 4.5
```

### Sort by rating instead of review count
```bash
python appstore_scraper.py -c us -g health-fitness --sort rating
```

### Export to CSV
```bash
python appstore_scraper.py -c us -g health-fitness -o csv -f apps.csv
```

### Export to JSON
```bash
python appstore_scraper.py -c us -g health-fitness -o json -f apps.json
```

### List all categories
```bash
appstore.bat --list-categories
```

### List all country codes
```bash
appstore.bat --list-countries
```

## Output Example

```
====================================================================================================
App Store: US | Category: health-fitness | Found: 87 apps
Sorted by: reviews | Min reviews: 0 | Min rating: 0
====================================================================================================

#    App Name                                      Reviews  Rating Developer
----------------------------------------------------------------------------------------------------
1    MyFitnessPal: Calorie Counter                   4.8M     4.6 MyFitnessPal, Inc.
2    Fitbit: Health & Fitness                        2.1M     4.3 Google LLC
3    Nike Training Club: Fitness                     892.4K   4.8 Nike, Inc
4    Headspace: Mindful Meditation                   743.2K   4.9 Headspace Inc.
5    Calm: Sleep & Meditation                        641.8K   4.8 Calm.com, Inc.
...
```

## Categories

Main categories:
- `health-fitness` (6013)
- `productivity` (6007)
- `social-networking` (6005)
- `photo-video` (6008)
- `games` (6014)
- `finance` (6015)
- `entertainment` (6016)
- `education` (6017)
- `shopping` (6024)
- `food-drink` (6023)
- `travel` (6003)
- `utilities` (6002)
- `news` (6009)
- `music` (6011)
- `sports` (6004)
- `weather` (6001)
- `lifestyle` (6012)
- `business` (6000)
- `medical` (6020)
- `reference` (6006)
- `navigation` (6010)
- `books` (6018)

Game subcategories:
- `action-games`, `adventure-games`, `arcade-games`, `puzzle-games`, `strategy-games`, etc.

## Country Codes

Common codes:
- `us` - United States
- `gb` - United Kingdom
- `ca` - Canada
- `au` - Australia
- `de` - Germany
- `fr` - France
- `jp` - Japan
- `in` - India
- `br` - Brazil

Run `--list-countries` for the full list.

## API Notes

This tool uses Apple's public APIs:
1. **RSS Feeds** - Fetches top charts (up to 200 apps per feed)
2. **iTunes Search API** - Gets detailed app info including review counts

Rate limits:
- RSS feeds: No strict limit
- Search API: ~20 calls per minute

For heavy usage, the tool includes automatic rate limiting.

## Finding Apps with 200K+ Reviews

```bash
python appstore_scraper.py -c us -g health-fitness --min-reviews 200000 -o table
```

This will show only apps that have crossed the 200,000 review threshold, sorted by total review count.

---

## Tech Stack (PWA)

- **Frontend**: Next.js 14, React, Tailwind CSS, TanStack Table
- **Backend**: Next.js API Routes, Python (Vercel Serverless)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Simple password with HTTP-only cookies
- **Hosting**: Vercel

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── login/             # Login page
│   └── search/            # Search interface
├── api/                    # Vercel serverless functions (Python)
├── components/             # React components
├── lib/                    # Utilities and types
├── public/                 # Static files and PWA manifest
├── appstore_scraper.py    # CLI version
└── vercel.json            # Vercel configuration
```
