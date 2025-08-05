# Clarity Engine 3 - Payee Intelligence Platform

## Overview
Clarity Engine 3 is an AI-powered web application for finance and accounting professionals. It transforms unstructured payee data into organized, actionable insights by intelligently classifying payees (Individual, Business, Government) and assigning SIC codes with confidence scores. The platform is enhanced with Mastercard Track Search API integration for comprehensive business enrichment, aiming to provide a sophisticated tool for data transformation and analysis in financial contexts.

## Recent Changes (8/5/2025)
- **Batch Processing Infrastructure**: Implemented scalable system handling thousands of concurrent requests
- **Async Mastercard Integration**: Submit searches immediately, process results in background
- **Rate Limiting System**: Token bucket algorithm preventing API throttling (Mastercard: 5/sec, OpenAI: 500/min, Google Maps: 50/sec)
- **Memory-Efficient Processing**: Streaming CSV processing with chunked batches for large datasets
- **Production-Ready Scalability**: Concurrent processing with progress tracking, error recovery, and database optimizations
- **Mastercard API Fix**: Resolved "RESULTS_NOT_FOUND" issue by adding required query parameters (?search_request_id=&offset=0&limit=25) to polling endpoints
- **Mastercard Authentication**: Technical authentication working correctly; awaiting production data access approval from Mastercard
- **Chris Finexio Credentials**: API key in PENDING status, awaiting Mastercard activation (consumer key format validated)

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React with TypeScript and Vite
- **UI Framework**: Shadcn/ui (on Radix UI)
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Charts**: Chart.js

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Style**: RESTful API
- **File Processing**: Multer for CSV/Excel uploads
- **Session Management**: Connect-pg-simple for PostgreSQL
- **Performance**: Optimized with local caching and database indexes
- **Scheduler Service**: Automatic nightly cache refresh at 2 AM EST using node-cron
- **Batch Processing**: Scalable infrastructure handling thousands of concurrent requests with rate limiting

### Database
- **Primary Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle ORM
- **Connection**: @neondatabase/serverless with connection pooling
- **Schema**: Includes tables for users, upload batches, payee classifications, SIC codes, classification rules, and cached suppliers table
- **Performance**: Indexes on frequently queried columns (name, category, payment_type, city, state)
- **Cache**: Local table with 387,283 distinct Finexio suppliers for ultra-fast matching (100% coverage)

### AI/ML Classification Service
- **Core Technology**: OpenAI GPT-4o for advanced payee classification (95%+ accuracy requirement).
- **Classification Logic**: Utilizes multi-layered AI, rule-based pattern matching (e.g., for business entities and government entities).
- **Confidence Scoring**: Only high-confidence (95% or higher) results are processed; lower confidence results are flagged for review rather than skipped.
- **SIC Code Assignment**: Automatic industry classification.
- **Duplicate Detection**: Advanced normalization and intelligent duplicate flagging within batches.
- **Speed Optimizations**: 
  - Local cache of 387,283 distinct suppliers eliminates BigQuery API calls
  - Response times improved from 30-45s to 1-2s (20-30x faster)
  - Smart AI thresholds: skip AI for low confidence (<70%) and single-word surnames
  - Database indexes on key columns for rapid lookups
- **Processing Order**: Address validation/cleaning happens BEFORE Mastercard enrichment for better enrichment scores (implemented 8/1/2025)
- **Intelligent Address Enhancement**: Sophisticated OpenAI-powered address improvement system that intelligently decides when AI adds value:
  - **Smart Decision Strategies**: Google failure recovery, incomplete components, low precision, missing data, business context matching, international formats, typo correction
  - **Selective Enhancement**: Only uses OpenAI when it can meaningfully improve results (e.g., finding real HQ instead of generic PO Box)
  - **Validation Loop**: Ensures OpenAI improvements actually enhance address quality before using them
  - **Context-Aware**: Uses payee name, type, and industry to make intelligent address corrections
- **Akkio Payment Prediction** (Added 8/2/2025): Integrated as the final enrichment step
  - **Purpose**: Predicts payment methods and outcomes using machine learning
  - **Integration**: Runs after all other enrichments complete
  - **Model Management**: Automatically selects the most recent ready model
  - **API Version**: Uses Akkio v2 API with async training pattern
  - **Batch Processing**: Processes classifications in batches for efficient predictions

### File Processing Pipeline
- **Handling**: Asynchronous processing with status tracking.
- **Support**: CSV and Excel file parsing (Excel converted to CSV internally).
- **Batch Processing**: Bulk classification with progress tracking.
- **Error Handling**: Comprehensive reporting and recovery including exponential backoff and retry logic.
- **Scalability**: Optimized for large datasets with chunked processing, controlled concurrency, and memory management.

### Key Features
- **Smart Classification**: Multi-layered AI, 95%+ confidence target, OpenAI GPT-4o integration, SIC code assignment.
- **User Experience**: Drag-and-drop file uploads, real-time processing status, responsive design, accessible UI.
- **Data Management**: Bulk data processing, export capabilities with original and classified columns, comprehensive error handling.
- **Job Reliability**: Automatic job failure detection for stalled jobs, sub-job processing for large datasets, adaptive batch sizing.
- **Results Viewing**: Detailed interface for examining classification results, including summary cards, search, filtering, and column sorting.
- **Tool Toggle Controls**: User-configurable settings to enable/disable Finexio matching and Mastercard enrichment for both single and batch classification operations.

## External Dependencies

### Core
- **@neondatabase/serverless**: PostgreSQL database connectivity.
- **drizzle-orm**: Type-safe database operations.
- **@tanstack/react-query**: Server state management.
- **@radix-ui/**: Accessible UI component primitives.
- **chart.js**: Data visualization.
- **csv-parser**: CSV file processing.
- **xlsx**: Excel file processing.
- **OpenAI API**: For AI classification functionality.
- **Mastercard Merchant Match Tool (MMT) API**: For business enrichment data (updated 8/4/2025 from Track Search API to MMT).

### Development Tools
- **Vite**: Fast development server and building.
- **TypeScript**: Type safety.
- **Tailwind CSS**: Utility-first styling.
- **ESLint/Prettier**: Code quality and formatting.