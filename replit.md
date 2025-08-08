# Clarity Engine 3 - Payee Intelligence Platform

## Overview
Clarity Engine 3 is an AI-powered web application for finance and accounting professionals. It transforms unstructured payee data into organized, actionable insights by intelligently classifying payees (Individual, Business, Government) and assigning SIC codes with confidence scores. The platform is enhanced with Mastercard Merchant Match Tool (MMT) API integration for comprehensive business enrichment, aiming to provide a sophisticated tool for data transformation and analysis in financial contexts. Key capabilities include smart classification, intuitive user experience, robust data management, and reliable job processing.

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
- **Scheduler Service**: Automatic nightly cache refresh
- **Batch Processing**: Scalable infrastructure handling thousands of concurrent requests with rate limiting

### Database
- **Primary Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle ORM
- **Connection**: @neondatabase/serverless with connection pooling
- **Schema**: Includes tables for users, upload batches, payee classifications, SIC codes, classification rules, and cached suppliers.
- **Performance**: Indexes on frequently queried columns.
- **Cache**: Local table with 387,283 distinct Finexio suppliers for ultra-fast matching.

### AI/ML Classification Service
- **Core Technology**: OpenAI GPT-4o for advanced payee classification (95%+ accuracy requirement).
- **Classification Logic**: Utilizes multi-layered AI and rule-based pattern matching.
- **Confidence Scoring**: Only high-confidence (95% or higher) results are processed; lower confidence results are flagged for review.
- **SIC Code Assignment**: Automatic industry classification.
- **Duplicate Detection**: Advanced normalization and intelligent duplicate flagging.
- **Speed Optimizations**: Local supplier cache, smart AI thresholds, database indexes.
- **Processing Order**: Address validation/cleaning happens before Mastercard enrichment for improved matching accuracy. Processing sequence: Finexio → OpenAI → Address Validation → Mastercard → Akkio.
- **Intelligent Address Enhancement**: OpenAI-powered system selectively enhances addresses when it can meaningfully improve results, with a validation loop.
- **Akkio Payment Prediction**: Integrated as the final enrichment step for payment method and outcome prediction using machine learning.

### File Processing Pipeline
- **Handling**: Asynchronous processing with status tracking.
- **Support**: CSV and Excel file parsing.
- **Batch Processing**: Bulk classification with progress tracking.
- **Error Handling**: Comprehensive reporting and recovery including exponential backoff and retry logic.
- **Scalability**: Optimized for large datasets with chunked processing, controlled concurrency, and memory management.

### Key Features
- **Smart Classification**: Multi-layered AI, 95%+ confidence target, OpenAI GPT-4o integration, SIC code assignment.
- **User Experience**: Drag-and-drop file uploads, real-time processing status, responsive design, accessible UI.
- **Data Management**: Bulk data processing, export capabilities, comprehensive error handling.
- **Job Reliability**: Automatic job failure detection, sub-job processing, adaptive batch sizing.
- **Results Viewing**: Detailed interface for examining classification results, including summary cards, search, filtering, and column sorting.
- **Tool Toggle Controls**: User-configurable settings to enable/disable Finexio matching and Mastercard enrichment.

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
- **Mastercard Merchant Match Tool (MMT) API**: For business enrichment data. Important: Searches typically take 5-20 minutes to complete, with many taking the full 20 minutes. System tracks average completion times for performance monitoring.
- **Akkio API**: For payment prediction and machine learning models.
- **Google Maps API**: For address validation and geographic data.

### Development Tools
- **Vite**: Fast development server and building.
- **TypeScript**: Type safety.
- **Tailwind CSS**: Utility-first styling.
- **ESLint/Prettier**: Code quality and formatting.