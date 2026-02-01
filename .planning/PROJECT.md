# App Store Scraper - Reddit Deep Dive Feature

## Vision

Enhance the competitor analysis pipeline with Reddit semantic analysis to surface **problem-domain insights** that app store reviews miss.

**The insight:** App store reviews capture post-download frustrations (UX, pricing, bugs). Reddit captures pre-download problem exploration (the actual human struggle people are trying to solve). Combining both creates a holistic picture for blueprint strategy.

## Current State

- Working competitor analysis pipeline: scrape reviews → AI analysis → blueprint generation
- Existing Reddit crawler in `crawl-service/crawlers/reddit.py` (surface-level, used for opportunity scoring)
- Existing review analyzer in `lib/opportunity/review-analyzer.ts`
- Blueprint pipeline with Pareto/Strategy section

## Goal

Add a "Reddit Deep Dive" feature that:
1. Auto-generates search terms from app metadata + reviews
2. Deep scrapes Reddit posts/comments across relevant subreddits
3. Runs AI semantic analysis to extract unmet needs with severity + evidence
4. Lets users annotate each need with their solution approach
5. Combines Reddit insights with review analysis
6. Feeds enhanced intelligence into blueprint strategy

## Tech Stack

- Frontend: Next.js 16 (App Router), React 18, Tailwind CSS
- Backend: Next.js API Routes, FastAPI (crawl-service on port 8000)
- Database: Supabase (PostgreSQL)
- AI: Claude API (Anthropic)
- Existing patterns: Zustand stores, service layer in `/lib`, crawl orchestrator

## Design Document

See `docs/plans/2026-02-01-reddit-deep-dive-design.md` for full specification.
