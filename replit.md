# Clarity Engine 3 - Payee Intelligence Platform

## Overview
Clarity Engine 3 is an AI-powered web application for finance and accounting professionals. It transforms unstructured payee data into organized, actionable insights by intelligently classifying payees (Individual, Business, Government) and assigning SIC codes with confidence scores. The platform is enhanced with Mastercard Track Search API integration for comprehensive business enrichment, aiming to provide a sophisticated tool for data transformation and analysis in financial contexts.

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

### Database
- **Primary Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle ORM
- **Connection**: @neondatabase/serverless with connection pooling
- **Schema**: Includes tables for users, upload batches, payee classifications, SIC codes, and classification rules, with enhanced fields for Mastercard enrichment data.

### AI/ML Classification Service
- **Core Technology**: OpenAI GPT-4o for advanced payee classification (95%+ accuracy requirement).
- **Classification Logic**: Utilizes multi-layered AI, rule-based pattern matching (e.g., for business entities and government entities).
- **Confidence Scoring**: Only high-confidence (95% or higher) results are processed; lower confidence results are flagged for review rather than skipped.
- **SIC Code Assignment**: Automatic industry classification.
- **Duplicate Detection**: Advanced normalization and intelligent duplicate flagging within batches.

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
- **Mastercard Track Search API**: For business enrichment data.

### Development Tools
- **Vite**: Fast development server and building.
- **TypeScript**: Type safety.
- **Tailwind CSS**: Utility-first styling.
- **ESLint/Prettier**: Code quality and formatting.