#!/bin/bash

# Beehive Studio Production Deployment Script
# This script deploys the complete Beehive Studio production stack

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.production"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.prod.yml"
SSL_DIR="$PROJECT_DIR/nginx/ssl"

echo -e "${BLUE}🚀 Beehive Studio Production Deployment Script${NC}"
echo "============================================"

# Check if we're in the correct directory
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}❌ Error: docker-compose.prod.yml not found in $PROJECT_DIR${NC}"
    exit 1
fi

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env.production not found. Creating template...${NC}"
    cp "$ENV_FILE" "$ENV_FILE.template"
    echo -e "${YELLOW}Please edit $ENV_FILE with your actual values before running this script.${NC}"
    exit 1
fi

# Check if Docker/Podman is running
echo -e "${BLUE}🔍 Checking container runtime...${NC}"
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker/Podman is not running. Please start it first.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Container runtime is running${NC}"

# Generate SSL certificates if they don't exist
echo -e "${BLUE}🔐 Setting up SSL certificates...${NC}"
if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
    echo -e "${YELLOW}Generating SSL certificates...${NC}"
    mkdir -p "$SSL_DIR"
    chmod +x "$SSL_DIR/generate-cert.sh"
    "$SSL_DIR/generate-cert.sh"
    echo -e "${GREEN}✅ SSL certificates generated${NC}"
else
    echo -e "${GREEN}✅ SSL certificates already exist${NC}"
fi

# Build and start the production stack
echo -e "${BLUE}🏗️  Building production stack...${NC}"
cd "$PROJECT_DIR"

# Stop any existing services
echo -e "${BLUE}🛑 Stopping existing services...${NC}"
docker compose -f "$COMPOSE_FILE" down --remove-orphans

# Build images
echo -e "${BLUE}🔨 Building Docker images...${NC}"
docker compose -f "$COMPOSE_FILE" build --no-cache

# Start services
echo -e "${BLUE}🚀 Starting services...${NC}"
docker compose -f "$COMPOSE_FILE" up -d

# Wait for services to be ready
echo -e "${BLUE}⏳ Waiting for services to be ready...${NC}"
sleep 30

# Check service health
echo -e "${BLUE}🏥 Checking service health...${NC}"
services=("api" "web" "postgres" "redis" "prometheus" "grafana" "nginx")

for service in "${services[@]}"; do
    echo -e "${BLUE}Checking $service...${NC}"
    if docker compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
        echo -e "${GREEN}✅ $service is running${NC}"
    else
        echo -e "${RED}❌ $service is not running${NC}"
        # Check logs
        echo -e "${BLUE}📋 Logs for $service:${NC}"
        docker compose -f "$COMPOSE_FILE" logs "$service" --tail=20
    fi
done

# Initialize database
echo -e "${BLUE}🗄️  Initializing database...${NC}"
sleep 10
docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U postgres -d beehive -c "SELECT 'Database initialized successfully';"

# Display status
echo -e "${BLUE}📊 Deployment status:${NC}"
docker compose -f "$COMPOSE_FILE" ps

echo -e "${GREEN}🎉 Beehive Studio production stack deployed successfully!${NC}"
echo -e "${BLUE}🌐 Access points:${NC}"
echo "  - Web Application: https://localhost:443"
echo "  - API Gateway: https://localhost:443/api/"
echo "  - Git Projects: https://localhost:443/git-projects/"
echo "  - Grafana Monitoring: https://localhost:443/grafana/"
echo "  - Prometheus: https://localhost:443/prometheus/"
echo "  - vLLM Inference: https://localhost:443/vllm/"

echo -e "${BLUE}📋 Useful commands:${NC}"
echo "  - View logs: docker compose -f $COMPOSE_FILE logs -f"
echo "  - Stop services: docker compose -f $COMPOSE_FILE down"
echo "  - Restart services: docker compose -f $COMPOSE_FILE restart"
echo "  - Check service status: docker compose -f $COMPOSE_FILE ps"

echo -e "${GREEN}✨ Deployment complete!${NC}"