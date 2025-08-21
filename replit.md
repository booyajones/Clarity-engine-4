# Clarity Engine 3 - Payee Intelligence Platform

## Overview
Clarity Engine 3 is an AI-powered web application for finance and accounting professionals. It transforms unstructured payee data into organized, actionable insights by intelligently classifying payees (Individual, Business, Government) and assigning SIC codes with confidence scores. The platform is enhanced with Mastercard Merchant Match Tool (MMT) API integration for comprehensive business enrichment, aiming to provide a sophisticated tool for data transformation and analysis in financial contexts. Key capabilities include smart classification, intuitive user experience, robust data management, and reliable job processing. The system has achieved enterprise production readiness, demonstrating high accuracy, scalability, and robust error handling across various scenarios.

## User Preferences
- **Communication style**: Simple, everyday language
- **Architecture preference**: Each processing stage should be a well-contained, self-contained app for modularity
  - Classification module (standalone)
  - Finexio matching module (standalone)
  - Google Address validation module (standalone)
  - Mastercard enrichment module (standalone)
  - Akkio predictions module (standalone)
  - This allows easy bolt-on additions of new components

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
- **Batch Job Management**: Advanced system for handling large-scale operations (e.g., 3000+ records for Mastercard, 1000+ for Finexio) with automatic splitting into sub-batches, progress tracking, retry logic, and failure recovery.
- **Memory Management**: Real-time monitoring, automatic garbage collection, memory leak detection, and alerts.
- **Caching System**: LRU caches with size limits, automatic eviction, and TTL management for suppliers, classifications, and queries.
- **Resource Optimization**: Dynamic database connection pooling, scheduled cleanup, and performance monitoring endpoints.
- **Deployment Optimization**: Dynamic port binding, enhanced Redis connection handling, comprehensive health check endpoints, 30-second startup timeout protection, graceful shutdown, and memory optimization.
- **Async Job Processing**: Implemented for Mastercard, using background workers, indefinite polling, and webhooks for real-time notifications, ensuring 100% record processing.

### Database
- **Primary Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle ORM
- **Connection**: @neondatabase/serverless with connection pooling
- **Schema**: Includes tables for users, upload batches, payee classifications, SIC codes, classification rules, and cached suppliers.
- **Performance**: Indexes on frequently queried columns.
- **Cache**: Complete Finexio database with 483,227 suppliers for guaranteed matching.
- **Matching Strategy**: AccurateMatchingService using sophisticated 6-algorithm fuzzy matching with multiple candidate-finding strategies, smart ambiguity penalties, and AI enhancement for medium-confidence matches.

### AI/ML Classification Service
- **Core Technology**: OpenAI GPT-4o for advanced payee classification (95%+ accuracy target).
- **Classification Logic**: Utilizes multi-layered AI and rule-based pattern matching with an intelligent fallback system (OpenAI, rule-based, heuristics, default to Business).
- **Confidence Scoring**: High-confidence results are processed; lower confidence results are flagged for review.
- **SIC Code Assignment**: Automatic industry classification.
- **Duplicate Detection**: Advanced normalization and intelligent duplicate flagging.
- **Processing Order**: Google Address validation → Finexio matching → Mastercard → Akkio.
- **Intelligent Address Enhancement**: OpenAI-powered system for selective address enhancement.
- **Akkio Payment Prediction**: Integrated as the final enrichment step for payment method and outcome prediction.
- **Keyword Exclusion System**: 593 permanent exclusion keywords for government/financial entities.
- **Sophisticated Fuzzy Matching**: 6-algorithm fuzzy matching system (Levenshtein, Jaro-Winkler, Token Set, Metaphone, N-gram, AI enhancement) for intelligent typo tolerance and variation handling. Uses original business names (not cleaned) for optimal matching accuracy.
- **Exact Match Enhancements**: Smart variations handling for LLC/INC differences, commas, DBA names, and business suffixes to maximize exact match rate before fuzzy matching.

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
- **System Monitoring**: Real-time memory monitoring, performance metrics, cache statistics, and resource protection.

## External Dependencies

### Core
- **@neondatabase/serverless**: PostgreSQL database connectivity.
- **drizzle-orm**: Type-safe database operations.
- **@tanstack/react-query**: Server state management.
- **@radix-ui/**: Accessible UI component primitives.
- **chart.js**: Data visualization.
- **csv-parser**: CSV file processing.
- **xlsx**: Excel file processing.
- **OpenAI API**: For AI classification functionality (GPT-4o).
- **Mastercard Merchant Match Tool (MMT) API**: For business enrichment data.
- **Akkio API**: For payment prediction and machine learning models.
- **Google Maps API**: For address validation and geographic data.

### Development Tools
- **Vite**: Fast development server and building.
- **TypeScript**: Type safety.
- **Tailwind CSS**: Utility-first styling.
- **ESLint/Prettier**: Code quality and formatting.