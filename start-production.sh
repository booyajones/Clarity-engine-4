#!/bin/bash

# Production startup script with memory optimizations
echo "🚀 Starting production server with memory optimizations..."

# Set environment variables
export NODE_ENV=production
export NODE_OPTIONS="--expose-gc --max-old-space-size=512"
export UV_THREADPOOL_SIZE=4

# Clean up old files
echo "🧹 Cleaning temporary files..."
rm -f finexio-batch-*.sql
rm -f batch-*.sql  
rm -f keywords-*.sql

# Start the application
echo "✅ Starting application with garbage collection enabled..."
npm run dev