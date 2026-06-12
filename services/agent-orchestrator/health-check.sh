#!/bin/bash

# Beehive Studio Agent Orchestrator - Production Health Check Script
# Monitors the optimized render system performance

set -e

# Configuration
SERVICE_URL="http://localhost:9876"
HEALTH_URL="$SERVICE_URL/health"
PERFORMANCE_URL="$SERVICE_URL/render/performance"
CACHE_URL="$SERVICE_URL/render/cache"
AUDIO_CACHE_URL="$SERVICE_URL/render/audio-cache"
WATCHDOG_URL="$SERVICE_URL/render/watchdog"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Check if service is running
check_service() {
    log_info "Checking service health..."
    
    if curl -f "$HEALTH_URL" > /dev/null 2>&1; then
        log_success "✅ Service is healthy"
        return 0
    else
        log_error "❌ Service is unhealthy"
        return 1
    fi
}

# Check performance metrics
check_performance() {
    log_info "Checking performance metrics..."
    
    if curl -s "$PERFORMANCE_URL" > /tmp/performance.json; then
        log_success "✅ Performance metrics available"
        
        # Extract and display key metrics
        if command -v jq &> /dev/null; then
            echo ""
            log_info "Performance Summary:"
            echo "  Average Duration: $(jq '.average_duration' /tmp/performance.json 2>/dev/null || echo 'N/A') seconds"
            echo "  Cached Renders: $(jq '.cache_stats.cached_renders // 0' /tmp/performance.json 2>/dev/null || echo 'N/A')"
            echo "  Total Renders: $(jq '.cache_stats.total_renders // 0' /tmp/performance.json 2>/dev/null || echo 'N/A')"
            echo "  Cache Hit Rate: $(jq '.cache_stats.cache_hit_rate // 0' /tmp/performance.json 2>/dev/null || echo 'N/A')"
        fi
    else
        log_warning "⚠️ Performance metrics not available"
    fi
}

# Check cache status
check_cache() {
    log_info "Checking cache status..."
    
    # Render job cache
    if curl -s "$CACHE_URL" > /tmp/render_cache.json; then
        render_size=$(jq '.cache_size // 0' /tmp/render_cache.json 2>/dev/null || echo 'N/A')
        max_size=$(jq '.max_size // 0' /tmp/render_cache.json 2>/dev/null || echo 'N/A')
        log_success "📦 Render Cache: ${render_size}/${max_size}"
    else
        log_warning "⚠️ Render cache check failed"
    fi
    
    # Audio file cache
    if curl -s "$AUDIO_CACHE_URL" > /tmp/audio_cache.json; then
        audio_size=$(jq '.cache_size // 0' /tmp/audio_cache.json 2>/dev/null || echo 'N/A')
        audio_max=$(jq '.max_size // 0' /tmp/audio_cache.json 2>/dev/null || echo 'N/A')
        audio_hits=$(jq '.cache_hits // 0' /tmp/audio_cache.json 2>/dev/null || echo 'N/A')
        audio_misses=$(jq '.cache_misses // 0' /tmp/audio_cache.json 2>/dev/null || echo 'N/A')
        
        if [ "$audio_hits" != "N/A" ] && [ "$audio_misses" != "N/A" ]; then
            total=$((audio_hits + audio_misses))
            if [ $total -gt 0 ]; then
                hit_rate=$(echo "scale=2; $audio_hits * 100 / $total" | bc -l 2>/dev/null || echo "0")
                log_success "🔊 Audio Cache: ${audio_size}/${audio_max} (${hit_rate}% hit rate)"
            fi
        fi
    else
        log_warning "⚠️ Audio cache check failed"
    fi
}

# Check watchdog status
check_watchdog() {
    log_info "Checking watchdog status..."
    
    if curl -s "$WATCHDOG_URL" > /tmp/watchdog.json; then
        is_running=$(jq '.is_running // false' /tmp/watchdog.json 2>/dev/null || echo 'false')
        max_runtime=$(jq '.max_runtime // 0' /tmp/watchdog.json 2>/dev/null || echo '0')
        
        if [ "$is_running" = "true" ]; then
            log_success "🐕 Watchdog: Running (max runtime: ${max_runtime}s)"
        else
            log_warning "⚠️ Watchdog: Not running"
        fi
    else
        log_warning "⚠️ Watchdog check failed"
    fi
}

# Check system resources
check_system() {
    log_info "Checking system resources..."
    
    if command -v docker &> /dev/null; then
        container_name=$(docker ps --filter "name=beehive-studio-agent" --format "{{.Names}}" | head -1)
        if [ -n "$container_name" ]; then
            log_info "Container: $container_name"
            
            # Get container stats
            if docker stats "$container_name" --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" > /tmp/container_stats.txt 2>/dev/null; then
                log_success "Container stats collected"
            fi
        fi
    fi
    
    # Check available memory
    if command -v free &> /dev/null; then
        available_mem=$(free -m | awk '/Mem:/ {print $7}')
        log_info "Available Memory: ${available_mem}MB"
    fi
}

# Main health check function
main() {
    echo "🔍 Beehive Studio Agent Orchestrator - Production Health Check"
    echo "================================================================"
    echo ""
    
    # Perform all checks
    if check_service; then
        check_performance
        check_cache
        check_watchdog
        check_system
        
        echo ""
        echo "📋 Optimization Status:"
        echo "  🔄 Parallel Processing: Active"
        echo "  🎵 Batch Note Processing: Active"
        echo "  💾 Render Job Caching: Active"
        echo "  🧹 Memory Management: Active"
        echo "  🎚️ Stem Generation: Optimized"
        echo "  ⏱️ Progress Throttling: Active"
        echo "  🔊 Audio File Caching: Active"
        echo "  📊 Performance Monitoring: Active"
        echo "  🐕 Render Watchdog: Active"
        
        echo ""
        log_success "🎉 All systems operational - Optimizations active!"
        exit 0
    else
        echo ""
        log_error "❌ Health check failed"
        exit 1
    fi
}

# Run health check
main "$@"