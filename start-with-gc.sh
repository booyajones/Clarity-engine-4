#!/bin/bash

# Start the application with optimized Node.js flags for production
# These flags enable better memory management and prevent out-of-memory issues

echo "🚀 Starting application with optimized memory settings..."

# Set Node.js memory limit to 4GB (adjustable based on available system memory)
export NODE_OPTIONS="--max-old-space-size=4096 --max-semi-space-size=64"

# Enable garbage collection exposure for monitoring
export NODE_OPTIONS="$NODE_OPTIONS --expose-gc"

# Optimize garbage collection
export NODE_OPTIONS="$NODE_OPTIONS --optimize-for-size"

# Start the application
npm run dev