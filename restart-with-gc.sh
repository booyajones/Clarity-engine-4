#!/bin/bash
# Restart application with garbage collection enabled for memory optimization

echo "🔄 Restarting application with memory optimizations..."
echo "================================"

# Kill existing node processes
pkill -f "tsx server/index.ts" 2>/dev/null
sleep 2

# Start with garbage collection enabled and memory limits
export NODE_OPTIONS="--expose-gc --max-old-space-size=512"
export DB_POOL_SIZE=5
export CACHE_SIZE=1000
export MEMORY_OPTIMIZATION=true

echo "Starting with optimized settings:"
echo "  --expose-gc: Enabled"
echo "  --max-old-space-size: 512MB"
echo "  DB_POOL_SIZE: 5"
echo "  CACHE_SIZE: 1000"

# Start the application
npm run dev &

echo ""
echo "✅ Application restarted with memory optimizations"
echo "Monitor memory at: http://localhost:5000/api/monitoring/memory"