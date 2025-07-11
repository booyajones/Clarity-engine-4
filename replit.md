# Clarity - Payee Intelligence Platform

## Overview

Clarity is a sophisticated AI-powered web application designed for finance and accounting professionals to transform messy payee data into structured, actionable insights. The platform features intelligent classification of payees into categories (Individual, Business, Government) with SIC code assignment and confidence scoring.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript and Vite for fast development and building
- **UI Framework**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Charts**: Chart.js for data visualization

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **API Style**: RESTful API endpoints with Express middleware
- **File Processing**: Multer for file uploads with support for CSV and Excel files
- **Session Management**: Connect-pg-simple for PostgreSQL session storage

### Database Architecture
- **Primary Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle ORM with migrations support
- **Connection**: Connection pooling with @neondatabase/serverless

## Key Components

### Database Schema
- **users**: User authentication and role management
- **uploadBatches**: File upload tracking and processing status
- **payeeClassifications**: Core payee data with classification results
- **sicCodes**: Standard Industrial Classification codes for business categorization
- **classificationRules**: AI/ML rules for automated classification

### AI/ML Classification Service
- **OpenAI Integration**: Uses GPT-4o for advanced payee classification with 95%+ accuracy requirement
- **Rule-based Classification**: Pattern matching for business entities (LLC, INC, CORP) as first-tier classification
- **Government Entity Detection**: Prefix and keyword matching for government entities
- **High-Confidence Only**: Only returns results when 95% or higher confidence is achieved
- **SIC Code Assignment**: Automatic industry classification based on business patterns
- **No Review Queue**: System skips low-confidence results instead of manual review

### File Processing Pipeline
- **Upload Handling**: Async file processing with status tracking
- **Format Support**: CSV and Excel file parsing
- **Batch Processing**: Bulk classification with progress tracking
- **Error Handling**: Comprehensive error reporting and recovery

## Data Flow

1. **File Upload**: Users upload CSV/Excel files containing payee data
2. **Batch Creation**: System creates upload batch with tracking metadata
3. **Background Processing**: Async parsing and classification of payee records
4. **AI Classification**: OpenAI GPT-4o processes each payee for type and SIC code with 95%+ accuracy
5. **High-Confidence Results**: Only payees meeting 95% confidence threshold are returned
6. **Export/Integration**: Processed data available for download or API access

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connectivity
- **drizzle-orm**: Type-safe database operations
- **@tanstack/react-query**: Server state management
- **@radix-ui/**: Accessible UI component primitives
- **chart.js**: Data visualization and analytics
- **csv-parser**: CSV file processing
- **xlsx**: Excel file processing

### Development Tools
- **Vite**: Fast development server and building
- **TypeScript**: Type safety across frontend and backend
- **Tailwind CSS**: Utility-first styling
- **ESLint/Prettier**: Code quality and formatting

## Deployment Strategy

### Build Process
- **Frontend**: Vite builds React app to `dist/public`
- **Backend**: ESBuild bundles Express server to `dist/index.js`
- **Database**: Drizzle migrations handle schema changes

### Environment Requirements
- **NODE_ENV**: Development/production environment flag
- **DATABASE_URL**: PostgreSQL connection string (required)
- **File Storage**: Local uploads directory for file processing

### Monorepo Structure
- **client/**: React frontend application
- **server/**: Express backend API
- **shared/**: Common TypeScript schemas and types
- **migrations/**: Database migration files

### Production Considerations
- Session storage configured for PostgreSQL
- WebSocket support for real-time updates
- Comprehensive error handling and logging
- File cleanup after processing
- Connection pooling for database efficiency

## Key Features

### Dashboard Analytics
- Real-time classification statistics
- Accuracy metrics and trends
- Business category insights
- Processing activity feed

### Smart Classification
- Multi-layered AI classification engine
- 95%+ confidence threshold with automatic skipping
- OpenAI GPT-4o integration for accurate classification
- SIC code assignment for business categorization

### User Experience
- Drag-and-drop file uploads
- Real-time processing status with detailed progress tracking
- Responsive design with mobile support
- Accessible UI components

### Data Management
- Bulk data processing with progress tracking
- Export capabilities preserving original data structure
- Original columns first, followed by clarity_* classification columns
- Comprehensive error handling and recovery

## Recent Changes

### July 9, 2025 - Complete System Overhaul
- **Progress Tracking**: Added comprehensive progress tracking stored in database with real-time updates every 2 seconds
- **Export Fix**: Fixed export functionality to preserve original field order with clarity_* columns appended
- **Job Management**: Added Stop/Cancel and Delete functionality for running and completed jobs
- **OpenAI-Only Classification**: Switched to 100% OpenAI GPT-4o classification with reasoning column
- **Financial Batch Names**: Creative financial-themed random names (e.g., "Dynamic Dividend 717", "Bullish Portfolio 342")
- **Best-in-Class Normalization**: Advanced payee name normalization removing punctuation, standardizing business suffixes
- **Duplicate Detection**: Intelligent duplicate flagging based on normalized names and addresses
- **Large Batch Processing**: Optimized for handling massive datasets with chunked processing, memory management, and rate limiting
- **Enhanced Error Handling**: Exponential backoff retry logic, controlled concurrency, and comprehensive failure recovery
- **Performance Monitoring**: Detailed batch performance metrics including throughput, processing time, and success rates
- **Database Updates**: Added reasoning, skippedRecords, currentStep, progressMessage fields
- **Export Format**: [Original Fields] + [clarity_payee_type, clarity_confidence, clarity_sic_code, clarity_sic_description, clarity_reasoning, clarity_status, clarity_cleaned_name]

### Large Data Processing Features
- **Chunked Processing**: Processes data in 100-record chunks to manage memory efficiently
- **Controlled Concurrency**: Limits to 5 concurrent OpenAI API calls to prevent rate limiting
- **Rate Limiting**: Built-in 50 requests/minute limit with automatic backoff
- **Retry Logic**: Exponential backoff (1s, 2s, 4s) for failed classifications
- **Memory Management**: Automatic cleanup and buffer management for large datasets
- **Progress Monitoring**: Real-time tracking of chunk progress, throughput metrics, and detailed status updates
- **Cancellation Support**: Can stop large batch processing mid-stream with proper cleanup

### Classification System Changes
- Removed rule-based and ML classification fallbacks - now uses OpenAI exclusively
- All classifications include detailed reasoning explaining the decision
- 95% confidence threshold maintained with automatic skipping below threshold
- Enhanced error handling with meaningful error messages for failed classifications
- Intelligent duplicate detection prevents processing the same payee multiple times
- Advanced normalization handles periods, commas, case variations, and business entity suffixes

### Advanced Duplicate Detection System
- **Three-Layer Detection**: Basic normalization → Advanced normalization → OpenAI comparison
- **Business Entity Normalization**: Removes LLC, INC, CORP, CO, LTD, LP, LLP, PLLC, ENTERPRISES, etc.
- **Address Normalization**: Handles ST/STREET, AVE/AVENUE, RD/ROAD, BLVD/BOULEVARD variations
- **Fuzzy Matching**: Uses Levenshtein distance with 80% similarity threshold for potential duplicates
- **OpenAI Verification**: Final verification step using GPT-4o for ambiguous cases
- **Caching System**: Prevents re-processing of already determined duplicates
- **Detailed Logging**: Comprehensive reporting of duplicate detection results and reasoning

### July 11, 2025 - UI Consolidation & Job Name Consistency
- **Dashboard Removal**: Eliminated redundant dashboard page - all functionality moved to enhanced upload page
- **Comprehensive Upload Page**: Added statistics overview, job management, and real-time progress tracking
- **Job Name Consistency**: Fixed discrepancy between upload and downloads sections - both now display original filename
- **Enhanced Layout**: Side-by-side upload and job status sections with improved navigation
- **Streamlined UI**: Reduced navigation to Upload, Classifications, and Downloads for cleaner user experience
- **No More Skipping**: Fixed critical issue where payees below 95% confidence were being skipped - now ALL records get classified regardless of confidence level
- **Complete Processing**: Every payee receives OpenAI classification attempt, no records are excluded from processing
- **Realistic Confidence**: Updated OpenAI prompt to provide realistic confidence levels based on available information rather than artificial 95% threshold