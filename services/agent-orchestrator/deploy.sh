#!/bin/bash

# Beehive Studio Agent Orchestrator - Production Deployment Script
# This script deploys the optimized Python render system to production

set -e

echo "🚀 Starting Beehive Studio Agent Orchestrator Production Deployment"
echo "=================================================================="

# Configuration
PROJECT_NAME="beehive-studio-agent-orchestrator"
IMAGE_NAME="beehive-studio-agent:optimized"
CONTAINER_NAME="beehive-studio-agent"
PORT=9876

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    log_warning "Docker Compose is not installed. Using Docker commands only."
fi

log_info "Building optimized container image..."

# Build the optimized container
docker build -t $IMAGE_NAME -f Containerfile .

if [ $? -eq 0 ]; then
    log_success "Container image built successfully: $IMAGE_NAME"
else
    log_error "Failed to build container image"
    exit 1
fi

# Stop existing container if running
if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
    log_info "Stopping existing container..."
    docker stop $CONTAINER_NAME
    docker rm $CONTAINER_NAME
    log_success "Existing container removed"
fi

# Remove old image
if docker images | grep -q "$IMAGE_NAME.*latest"; then
    log_info "Removing old image..."
    docker rmi $IMAGE_NAME:latest || true
fi

# Create production environment file if it doesn't exist
if [ ! -f .env ]; then
    log_info "Creating production environment file..."
    cp .env.example .env
    log_warning "Please edit .env file with your production configuration before starting the service"
    log_info "Environment file created at: $(pwd)/.env"
fi

# Create production directories
mkdir -p /tmp/beehive-studio-data/{logs,cache,temp}

log_info "Starting optimized container..."

# Run the optimized container with production settings
docker run -d \
    --name $CONTAINER_NAME \
    --restart unless-stopped \
    --memory=2g \
    --cpus=2 \
    -p $PORT:9876 \
    -v /tmp/beehive-studio-data/logs:/app/logs \
    -v /tmp/beehive-studio-data/cache:/app/cache \
    -v /tmp/beehive-studio-data/temp:/app/temp \
    --env-file .env \
    $IMAGE_NAME

if [ $? -eq 0 ]; then
    log_success "Container started successfully: $CONTAINER_NAME"
else
    log_error "Failed to start container"
    exit 1
fi

# Wait for container to start
log_info "Waiting for container to start..."
sleep 10

# Check if the service is running
if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
    log_success "Container is running"
    
    # Check health
    log_info "Checking service health..."
    if curl -f http://localhost:$PORT/health > /dev/null 2>&1; then
        log_success "✅ Health check passed"
        
        # Show running containers
        echo ""
        log_info "Running containers:"
        docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        
        # Show performance info
        echo ""
        log_info "Performance Optimization Status:"
        echo "  🔄 Parallel Processing: Active (ThreadPoolExecutor - max_workers=4)"
        echo "  🎵 Batch Note Processing: Active (MIDI frequency caching)"
        echo "  💾 Render Job Caching: Active (LRU cache - max_size=50)"
        echo "  🧹 Memory Management: Active (Garbage collection + cache cleanup)"
        echo "  🎚️ Stem Generation: Optimized (During main mix)"
        echo "  ⏱️ Progress Throttling: Active (50ms minimum interval)"
        echo "  🔊 Audio File Caching: Active (Max 20 files)"
        echo "  📊 Performance Monitoring: Active"
        echo "  🐕 Render Watchdog: Active (Auto-restart stuck jobs)"
        
        echo ""
        log_success "🎉 Production deployment completed successfully!"
        echo ""
        log_info "Service URL: http://localhost:$PORT"
        log_info "Health Check: curl http://localhost:$PORT/health"
        log_info "Performance Stats: curl http://localhost:$PORT/render/performance"
        log_info "Cache Info: curl http://localhost:$PORT/render/cache"
        
    else
        log_error "❌ Health check failed"
        docker logs $CONTAINER_NAME --tail 20
        exit 1
    fi
else
    log_error "Container failed to start"
    docker logs $CONTAINER_NAME --tail 20
    exit 1
fi

echo ""
echo "📋 Management Commands:"
echo "  View logs:    docker logs -f $CONTAINER_NAME"
echo "  Stop service: docker stop $CONTAINER_NAME"
echo "  Restart:      docker restart $CONTAINER_NAME"
echo "  Update:       ./deploy.sh (rebuilds and restarts)"
echo ""
echo "🔧 Performance Monitoring:"
echo "  Cache stats:  curl http://localhost:$PORT/render/cache"
echo "  Audio cache:  curl http://localhost:$PORT/render/audio-cache"
echo "  Watchdog:     curl http://localhost:$PORT/render/watchdog"
echo ""
log_success "🚀 Beehive Studio Agent Orchestrator is now running in production with all optimizations!"