#!/bin/bash

# Start Microservices Development Environment
# This script starts all services locally for development

echo "🚀 Starting Clarity Engine 3 Microservices..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo -e "${RED}❌ Redis is not installed${NC}"
    echo "Please install Redis first:"
    echo "  Ubuntu/Debian: sudo apt-get install redis-server"
    echo "  Mac: brew install redis"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

# Start Redis if not running
if ! pgrep -x "redis-server" > /dev/null; then
    echo -e "${YELLOW}Starting Redis...${NC}"
    redis-server --daemonize yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    sleep 2
    echo -e "${GREEN}✅ Redis started${NC}"
else
    echo -e "${GREEN}✅ Redis already running${NC}"
fi

# Create logs directory
mkdir -p logs

# Function to start a service
start_service() {
    local name=$1
    local script=$2
    local log_file="logs/${name}.log"
    
    echo -e "${YELLOW}Starting ${name}...${NC}"
    
    # Export environment variables
    export NODE_OPTIONS="--expose-gc --max-old-space-size=512"
    export REDIS_HOST=localhost
    export REDIS_PORT=6379
    export ENABLE_MICROSERVICES=true
    
    # Start the service in background
    nohup node ${script} > ${log_file} 2>&1 &
    local pid=$!
    
    # Save PID for later shutdown
    echo $pid > "logs/${name}.pid"
    
    echo -e "${GREEN}✅ ${name} started (PID: ${pid})${NC}"
    echo "   Log: tail -f ${log_file}"
}

# Start workers
echo ""
echo "Starting Worker Services..."
echo "---------------------------"

# Compile TypeScript workers first
echo -e "${YELLOW}Compiling TypeScript workers...${NC}"
npx tsc workers/*.ts --outDir workers --target es2020 --module commonjs --esModuleInterop --skipLibCheck

# Start Finexio Worker
start_service "finexio-worker" "workers/finexioWorker.js"
sleep 1

# Start Classification Worker
start_service "classification-worker" "workers/classificationWorker.js"
sleep 1

# Optional: Start other workers
# start_service "mastercard-worker" "workers/mastercardWorker.js"
# start_service "address-worker" "workers/addressWorker.js"
# start_service "orchestration-worker" "workers/orchestrationWorker.js"

echo ""
echo "================================================"
echo -e "${GREEN}✅ Microservices started successfully!${NC}"
echo ""
echo "Services running:"
echo "  - Redis: localhost:6379"
echo "  - Finexio Worker: Processing queue"
echo "  - Classification Worker: Processing queue"
echo ""
echo "Monitor logs:"
echo "  - Finexio: tail -f logs/finexio-worker.log"
echo "  - Classification: tail -f logs/classification-worker.log"
echo ""
echo "Stop all services: ./scripts/stop-microservices.sh"
echo "================================================"

# Keep script running and show combined logs
echo ""
echo "Showing combined logs (Ctrl+C to exit):"
echo "----------------------------------------"
tail -f logs/*.log