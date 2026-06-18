#!/bin/bash
# OMNINOVATOR Podman CI/CD Automation Script
# Automates Build, Test, and Local Registry simulation

set -e

# Colors for output
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Starting Podman CI/CD Automation...${NC}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# 1. Build Phase
echo -e "${BLUE}🏗️  Building Container Images...${NC}"

# Orchestrator
echo -e "${BLUE}Building beehive-orchestrator...${NC}"
podman build -t beehive-orchestrator:latest -f services/agent-orchestrator/Containerfile .

# Gateway
echo -e "${BLUE}Building beehive-gateway...${NC}"
podman build -t beehive-gateway:latest -f apps/api/Dockerfile .

# 2. Test Phase (Smoke Tests)
echo -e "${BLUE}🧪 Running Smoke Tests...${NC}"

# Test Orchestrator Smoke
echo -e "${BLUE}Running Orchestrator Router Test...${NC}"
podman run --rm beehive-orchestrator:latest python3 tests/test_router_smoke.py

# 3. Integration Check
echo -e "${BLUE}🔗 Verifying Deployment Configs...${NC}"
if [ -f "deployment/local/docker-compose.yaml" ]; then
    echo -e "${GREEN}✅ Local deployment config found.${NC}"
else
    echo -e "${RED}❌ Local deployment config missing!${NC}"
    exit 1
fi

# 4. Success
echo -e "${GREEN}✅ CI/CD Automation Finished Successfully!${NC}"
echo -e "Images ready: beehive-orchestrator:latest, beehive-gateway:latest"
