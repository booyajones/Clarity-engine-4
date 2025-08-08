#!/bin/bash
echo "🚀 Starting with optimized memory settings..."
NODE_ENV=development node --expose-gc --max-old-space-size=512 -r tsx/cjs server/index.ts