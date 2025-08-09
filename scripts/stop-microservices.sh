#!/bin/bash

# Stop Microservices
echo "🛑 Stopping Clarity Engine 3 Microservices..."
echo "============================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Function to stop a service
stop_service() {
    local name=$1
    local pid_file="logs/${name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            echo -e "${YELLOW}Stopping ${name} (PID: ${pid})...${NC}"
            kill -TERM $pid
            sleep 1
            if kill -0 $pid 2>/dev/null; then
                kill -KILL $pid
            fi
            rm "$pid_file"
            echo -e "${GREEN}✅ ${name} stopped${NC}"
        else
            echo -e "${YELLOW}${name} not running${NC}"
            rm "$pid_file"
        fi
    else
        echo -e "${YELLOW}No PID file for ${name}${NC}"
    fi
}

# Stop all workers
stop_service "finexio-worker"
stop_service "classification-worker"
stop_service "mastercard-worker"
stop_service "address-worker"
stop_service "orchestration-worker"

# Optionally stop Redis
read -p "Stop Redis server? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Stopping Redis...${NC}"
    redis-cli shutdown
    echo -e "${GREEN}✅ Redis stopped${NC}"
fi

echo ""
echo "============================================="
echo -e "${GREEN}✅ All services stopped${NC}"
echo "============================================="