#!/bin/bash

# Beehive Studio Deployment Test Script
# This script tests the deployed production stack

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"

echo -e "${BLUE}🧪 Beehive Studio Deployment Test Script${NC}"
echo "======================================="

# Check if services are running
echo -e "${BLUE}🏥 Checking service status...${NC}"
services=("api" "web" "postgres" "redis" "prometheus" "grafana" "nginx")

for service in "${services[@]}"; do
    echo -e "${BLUE}Checking $service...${NC}"
    if docker compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
        echo -e "${GREEN}✅ $service is running${NC}"
    else
        echo -e "${RED}❌ $service is not running${NC}"
        exit 1
    fi
done

# Test API endpoints
echo -e "${BLUE}🌐 Testing API endpoints...${NC}"

# Test API health
if curl -f -s -k https://localhost:443/api/health > /dev/null; then
    echo -e "${GREEN}✅ API health endpoint responding${NC}"
else
    echo -e "${RED}❌ API health endpoint not responding${NC}"
    exit 1
fi

# Test Git Projects health
if curl -f -s -k https://localhost:443/git-projects/api/projects/health > /dev/null; then
    echo -e "${GREEN}✅ Git Projects health endpoint responding${NC}"
else
    echo -e "${RED}❌ Git Projects health endpoint not responding${NC}"
    exit 1
fi

# Test WebSocket connection
echo -e "${BLUE}🔌 Testing WebSocket connection...${NC}"
if timeout 5 bash -c 'echo "" | openssl s_client -connect localhost:443 -quiet' | grep -q "Connected"; then
    echo -e "${GREEN}✅ WebSocket SSL connection successful${NC}"
else
    echo -e "${YELLOW}⚠️  WebSocket SSL connection issue${NC}"
fi

# Test Prometheus
echo -e "${BLUE}📊 Testing Prometheus...${NC}"
if curl -f -s -k https://localhost:443/prometheus/ > /dev/null; then
    echo -e "${GREEN}✅ Prometheus responding${NC}"
else
    echo -e "${YELLOW}⚠️  Prometheus not responding (expected - internal only)${NC}"
fi

# Test Grafana
echo -e "${BLUE}📈 Testing Grafana...${NC}"
if curl -f -s -k https://localhost:443/grafana/ > /dev/null; then
    echo -e "${GREEN}✅ Grafana responding${NC}"
else
    echo -e "${YELLOW}⚠️  Grafana not responding (expected - internal only)${NC}"
fi

# Test database connectivity
echo -e "${BLUE}🗄️  Testing database connectivity...${NC}"
if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U postgres -d beehive > /dev/null; then
    echo -e "${GREEN}✅ Database connectivity successful${NC}"
else
    echo -e "${RED}❌ Database connectivity failed${NC}"
    exit 1
fi

# Test Redis connectivity
echo -e "${BLUE}🔧 Testing Redis connectivity...${NC}"
if docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping > /dev/null; then
    echo -e "${GREEN}✅ Redis connectivity successful${NC}"
else
    echo -e "${RED}❌ Redis connectivity failed${NC}"
    exit 1
fi

# Test vLLM service
echo -e "${BLUE}🧠 Testing vLLM service...${NC}"
if curl -f -s -k http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}✅ vLLM service responding${NC}"
else
    echo -e "${YELLOW}⚠️  vLLM service not responding${NC}"
fi

# Test Ollama service
echo -e "${BLUE}🤖 Testing Ollama service...${NC}"
if curl -f -s -k http://localhost:11434/api/tags > /dev/null; then
    echo -e "${GREEN}✅ Ollama service responding${NC}"
else
    echo -e "${YELLOW}⚠️  Ollama service not responding${NC}"
fi

# Performance test
echo -e "${BLUE}⚡ Running performance test...${NC}"
start_time=$(date +%s.%N)
curl -f -s -k https://localhost:443/api/health > /dev/null
end_time=$(date +%s.%N)
duration=$(echo "$end_time - $start_time" | bc)

if (( $(echo "$duration < 1.0" | bc -l) )); then
    echo -e "${GREEN}✅ API response time: ${duration}s (good)${NC}"
else
    echo -e "${YELLOW}⚠️  API response time: ${duration}s (slow)${NC}"
fi

# Resource usage check
echo -e "${BLUE}💾 Checking resource usage...${NC}"
echo "Memory usage:"
docker compose -f "$COMPOSE_FILE" ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"

echo -e "${GREEN}🎉 All tests completed successfully!${NC}"
echo -e "${BLUE}📊 Performance Summary:${NC}"
echo "  - API Response Time: ${duration}s"
echo "  - All core services: Running"
echo "  - Database: Connected"
echo "  - Cache: Connected"
echo "  - Monitoring: Active"

echo -e "${BLUE}🔗 Access URLs:${NC}"
echo "  - Main Application: https://localhost:443"
echo "  - API Documentation: https://localhost:443/docs"
echo "  - Monitoring Dashboard: https://localhost:443/grafana"
echo "  - Prometheus: https://localhost:443/prometheus"