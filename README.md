
# Clarity Engine 3 - AI-Powered Payee Intelligence Platform

[![Run on Replit](https://replit.com/badge/github/your-username/clarity-engine)](https://replit.com/new/github/your-username/clarity-engine)

## Overview

Clarity Engine transforms messy, unstructured payee data from financial records into clean, categorized, and actionable insights using advanced AI classification. Built for finance and accounting professionals who need to process large volumes of vendor payments, tax reporting, and financial data analysis.

## 🚀 Key Features

### AI-Powered Classification
- **Advanced AI Processing**: Uses OpenAI GPT-4o for 95%+ accuracy classification
- **Smart Categories**: Automatically classifies payees as Individual, Business, Government, Insurance, Banking, or Internal Transfer
- **Industry Codes**: Assigns SIC (Standard Industrial Classification) codes to business entities
- **Confidence Scoring**: Only processes results with 95%+ confidence threshold

### File Processing
- **Multiple Formats**: Supports CSV and Excel files up to 50MB
- **Intelligent Detection**: Auto-detects payee columns in uploaded files
- **Batch Processing**: Handles large datasets efficiently with real-time progress tracking
- **Memory Optimized**: Streams large files without memory overflow

### Duplicate Detection
- **Multi-Layer Detection**: Advanced normalization and fuzzy matching
- **Business Entity Handling**: Recognizes variations like "LLC", "Inc.", "Corp"
- **AI-Enhanced**: Uses machine learning for complex duplicate scenarios

### Real-Time Dashboard
- **Live Analytics**: Processing statistics and accuracy metrics
- **Progress Tracking**: Detailed status updates for large file processing  
- **Export Ready**: Download enhanced CSV with classification results

## 🛠 Technology Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Radix UI** components for accessibility
- **TanStack Query** for state management
- **Chart.js** for data visualization

### Backend
- **Node.js** + Express server
- **PostgreSQL** with Drizzle ORM
- **OpenAI GPT-4o** integration
- **Advanced rate limiting** and error handling

### Development
- **Vite** for fast development
- **ESBuild** for production builds
- **TypeScript** throughout the stack

## 📋 Quick Start

### Running on Replit (Recommended)
1. Click the "Run on Replit" badge above
2. The environment will auto-configure
3. Add your OpenAI API key to Replit Secrets as `OPENAI_API_KEY`
4. Click the Run button

### Local Development
```bash
# Clone the repository
git clone https://github.com/your-username/clarity-engine.git
cd clarity-engine

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your OPENAI_API_KEY and database URL

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

## 🔧 Configuration

### Environment Variables
```bash
# Required
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=your_postgresql_connection_string

# Optional
NODE_ENV=development
PORT=3000
```

### Database Setup
The application uses PostgreSQL with the following key tables:
- `uploadBatches` - File upload tracking
- `payeeClassifications` - Classified payee data
- `sicCodes` - Industry classification codes

## 📖 API Documentation

### Core Endpoints

#### Upload File
```http
POST /api/upload
Content-Type: multipart/form-data

# Body: file (CSV/Excel)
# Query: payeeColumn (optional column name)
```

#### Get Classifications
```http
GET /api/classifications/:batchId
```

#### Single Classification
```http
POST /api/classify-single
Content-Type: application/json

{
  "payeeName": "Microsoft Corporation"
}
```

#### Download Results
```http
GET /api/download/:batchId
```

## 🎯 Use Cases

- **Vendor Management**: Categorize and organize vendor payments
- **Tax Preparation**: Separate business vs. individual payments for reporting
- **Compliance**: Identify government payments and regulatory entities
- **Data Cleanup**: Standardize and deduplicate payee records
- **Financial Analysis**: Understand payment patterns by entity type

## 📊 Classification System

### Payee Types
- **Individual**: Personal names, employees, contractors
- **Business**: Companies, corporations, commercial entities
- **Government**: Agencies, municipalities, tax authorities
- **Insurance**: Insurance companies, carriers, brokers
- **Banking**: Banks, credit unions, financial institutions
- **Internal Transfer**: Company internal transfers

### Confidence Levels
- **High Confidence**: 95%+ (automatically processed)
- **Medium Confidence**: 80-94% (flagged for review)
- **Low Confidence**: <80% (skipped, requires manual review)

## 🔄 Processing Pipeline

1. **File Upload**: User uploads CSV/Excel containing payee data
2. **Batch Creation**: System creates tracking metadata
3. **Parsing**: Intelligent column detection and data extraction
4. **AI Classification**: GPT-4o processes each payee with context
5. **Duplicate Detection**: Multi-layer deduplication
6. **Quality Assurance**: Confidence scoring and validation
7. **Export**: Enhanced data ready for download

## 🚀 Deployment

### Production Build
```bash
npm run build
npm start
```

### Replit Deployment
The application is optimized for Replit deployment with:
- Automatic dependency installation
- Environment variable management
- Database connection handling
- Static file serving

## 📈 Performance Features

- **Chunked Processing**: 100-record batches for memory efficiency
- **Controlled Concurrency**: 5 concurrent API calls to prevent rate limiting
- **Rate Limiting**: 50 requests/minute with exponential backoff
- **Memory Management**: Streaming file processing
- **Progress Monitoring**: Real-time throughput metrics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/clarity-engine/issues)
- **Documentation**: See `/docs` folder for detailed guides
- **API Reference**: Built-in Swagger documentation at `/api/docs`

## 🏗 Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React Client  │───▶│  Express Server  │───▶│   PostgreSQL    │
│   (TypeScript)  │    │   (Node.js)      │    │   Database      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   OpenAI GPT-4o  │
                       │  Classification  │
                       └──────────────────┘
```

## 📋 Recent Updates

- **v2.0**: Enhanced AI classification with web search fallback
- **v1.9**: Advanced duplicate detection and normalization
- **v1.8**: Real-time progress tracking and cancellation support
- **v1.7**: Optimized batch processing for large datasets

---

**Built with ❤️ for finance professionals who deserve better data tools.**
