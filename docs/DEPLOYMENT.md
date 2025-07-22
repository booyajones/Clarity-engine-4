
# Deployment Guide

## Replit Deployment (Recommended)

Clarity Engine is optimized for Replit deployment with zero configuration.

### Quick Deploy
1. Fork the repository on GitHub
2. Import to Replit: `https://replit.com/github/your-username/clarity-engine`
3. Configure environment variables in Secrets
4. Click Run

### Environment Setup
Add these secrets in Replit:

```bash
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_URL=postgresql://username:password@host:port/database
```

### Automatic Configuration
The `.replit` file handles:
- Dependency installation
- Database migrations  
- Development server startup
- Production builds

## Manual Deployment

### Prerequisites
- Node.js 18+
- PostgreSQL database
- OpenAI API key

### Build Process
```bash
# Install dependencies
npm install

# Build the application
npm run build

# Run database migrations
npm run db:push

# Start production server
npm start
```

### Production Environment Variables
```bash
NODE_ENV=production
PORT=3000
OPENAI_API_KEY=your_key
DATABASE_URL=your_db_url
```

## Database Setup

### PostgreSQL Schema
The application automatically creates tables:
- `users` - User authentication
- `uploadBatches` - File tracking
- `payeeClassifications` - Classification results
- `sicCodes` - Industry codes

### Migration Commands
```bash
# Push schema changes
npm run db:push

# Generate migrations (if needed)
npx drizzle-kit generate:pg
```

## Performance Considerations

### Production Optimizations
- Connection pooling enabled
- Static file caching
- Gzip compression
- Rate limiting configured

### Monitoring
- Built-in error logging
- Progress tracking
- Performance metrics
- Database connection monitoring

## Scaling

### Horizontal Scaling
- Stateless application design
- Database connection pooling
- File cleanup processes

### Vertical Scaling
- Memory: 512MB minimum, 2GB recommended
- CPU: Handles concurrent processing
- Storage: Temporary file processing only

## Security

### API Security  
- Input validation
- File type restrictions
- Rate limiting
- Error sanitization

### Data Privacy
- No sensitive data storage
- Temporary file cleanup
- Secure database connections
