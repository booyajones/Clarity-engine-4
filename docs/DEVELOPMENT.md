
# Clarity Engine 3 - Development Guide

## Getting Started

### Prerequisites
- Node.js 18+
- OpenAI API key
- PostgreSQL database (or use Replit's built-in database)

### Local Setup
```bash
# Clone the repository
git clone https://github.com/your-username/clarity-engine.git
cd clarity-engine

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your keys

# Initialize database
npm run db:push

# Start development server
npm run dev
```

## Project Structure

```
├── client/src/          # React frontend
│   ├── components/      # Reusable UI components
│   ├── pages/          # Route components
│   ├── hooks/          # Custom React hooks
│   └── lib/            # Utilities and types
├── server/             # Express backend
│   ├── services/       # Business logic
│   ├── middleware/     # Express middleware
│   └── utils/          # Server utilities
├── shared/             # Shared types and schemas
└── docs/              # Documentation
```

## Development Workflow

### Frontend Development
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS + Radix UI
- **State**: TanStack Query for server state
- **Build**: Vite for fast development

### Backend Development  
- **Runtime**: Node.js with Express
- **Database**: Drizzle ORM with PostgreSQL
- **AI**: OpenAI GPT-4o integration
- **Files**: Multer for uploads

### Key Services

#### Classification Service (`server/services/classificationV2.ts`)
Handles AI-powered payee classification:
- OpenAI integration
- Duplicate detection
- Confidence scoring
- Error handling

#### Storage Service (`server/storage.ts`)
Database operations:
- Batch management
- Classification storage
- File metadata

#### Rate Limiter (`server/services/rateLimiter.ts`)
Controls API usage:
- OpenAI rate limiting
- Request queuing
- Backoff strategies

## Testing

### Manual Testing
```bash
# Test single classification
node test-single-classification.js

# Test file processing
node test-classification.js

# Generate test data
node generate-test-data.js
```

### Test Files
- `test-small.csv` - Small dataset for quick testing
- `test-large.csv` - Large dataset for performance testing
- `test-duplicates.csv` - Duplicate detection testing

## Code Standards

### TypeScript
- Strict mode enabled
- Explicit typing preferred
- Interface definitions in `shared/schema.ts`

### React Components
- Functional components with hooks
- TypeScript prop definitions
- Proper error boundaries

### API Routes
- RESTful design
- Proper error handling
- Input validation with Zod

## Debugging

### Common Issues
1. **Database Connection**: Check DATABASE_URL format
2. **OpenAI Errors**: Verify API key and rate limits
3. **File Upload**: Check file size and format
4. **Memory Issues**: Monitor large file processing

### Debug Tools
- Console logging in development
- Error tracking middleware
- Progress monitoring endpoints

## Contributing

### Pull Request Process
1. Create feature branch from `main`
2. Implement changes with tests
3. Update documentation if needed
4. Submit PR with clear description

### Code Review
- Type safety checks
- Performance considerations
- Security review
- Documentation updates

## Deployment

### Development Deploy
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Environment Variables
```bash
NODE_ENV=development|production
OPENAI_API_KEY=your_key
DATABASE_URL=postgresql://...
PORT=3000
```
