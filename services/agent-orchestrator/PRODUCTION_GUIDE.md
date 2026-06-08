# Beehive Studio Agent Orchestrator - Production Deployment Guide

## 🚀 Quick Start - Production Deployment

### 1. Prerequisites

Ensure you have:
- Docker installed and running
- Docker Compose (optional, for orchestration)
- At least 2GB RAM available
- Port 9876 available

### 2. One-Command Deployment

```bash
# Navigate to the orchestrator directory
cd /home/kilisan/beehive-studio/services/agent-orchestrator

# Run the production deployment script
./deploy.sh
```

### 3. Verify Deployment

```bash
# Check health
./health-check.sh

# View logs
docker logs -f beehive-studio-agent

# Check performance
curl http://localhost:9876/render/performance
```

---

## 📋 Production Deployment Options

### Option 1: Simple Docker Deployment (Recommended)

```bash
# Build and run optimized container
docker build -t beehive-studio-agent:optimized -f Containerfile.optimized .
docker run -d \
  --name beehive-studio-agent-optimized \
  --restart unless-stopped \
  --memory=2g \
  --cpus=2 \
  -p 9876:9876 \
  --env-file .env.production \
  beehive-studio-agent:optimized
```

### Option 2: Docker Compose Deployment

```bash
# Use Docker Compose for orchestration
docker-compose -f docker-compose.production.yml up -d
```

### Option 3: Kubernetes Deployment

```bash
# Apply Kubernetes configuration
kubectl apply -f k8s/production/
```

---

## 🔧 Configuration

### Environment Variables

Key production settings in `.env.production`:

```bash
# Performance Optimization Settings
RENDER_JOB_CACHE_MAX_SIZE=50
AUDIO_FILE_CACHE_MAX_SIZE=20
RENDER_MAX_WORKERS=4
MEMORY_GC_ENABLED=true
PERFORMANCE_METRICS_ENABLED=true
WATCHDOG_ENABLED=true
PROGRESS_THROTTLE_MIN_INTERVAL=0.05
```

### Resource Allocation

- **Memory**: 2GB limit (1GB reserved)
- **CPU**: 2 cores limit (1 core reserved)
- **Storage**: Persistent volumes for logs, cache, and temp files

---

## 📊 Monitoring and Health Checks

### Automated Health Checks

```bash
# Run comprehensive health check
./health-check.sh

# Quick health check
curl http://localhost:9876/health

# Performance metrics
curl http://localhost:9876/render/performance

# Cache status
curl http://localhost:9876/render/cache
curl http://localhost:9876/render/audio-cache

# Watchdog status
curl http://localhost:9876/render/watchdog
```

### Performance Monitoring

#### Expected Performance Improvements:

| Optimization | Expected Improvement |
|--------------|---------------------|
| Parallel Processing | 30-50% |
| Batch Note Processing | 15-25% |
| Render Caching | 20-40% |
| Memory Management | 40-60% memory reduction |
| Stem Generation | 15-20% |
| Progress Throttling | 5-10% |
| **Combined Target** | **86% overall improvement** |

#### Monitoring Endpoints:

- **`/health`** - Basic health check
- **`/render/performance`** - Performance metrics and benchmarks
- **`/render/cache`** - Render job cache statistics
- **`/render/audio-cache`** - Audio file cache statistics
- **`/render/watchdog`** - Watchdog status and configuration

---

## 🛠️ Management Commands

### Container Management

```bash
# View running containers
docker ps

# View logs
docker logs -f beehive-studio-agent

# Stop service
docker stop beehive-studio-agent

# Restart service
docker restart beehive-studio-agent

# Update deployment
./deploy.sh
```

### Performance Management

```bash
# Clear performance metrics
curl -X DELETE http://localhost:9876/render/performance

# Clear render cache
curl -X DELETE http://localhost:9876/render/cache

# Clear audio cache
curl -X DELETE http://localhost:9876/render/audio-cache

# Restart watchdog
curl -X POST http://localhost:9876/render/watchdog/restart
```

---

## 🔍 Troubleshooting

### Common Issues

#### 1. Service Won't Start

```bash
# Check Docker logs
docker logs beehive-studio-agent

# Check port availability
netstat -tlnp | grep 9876

# Check resource usage
docker stats beehive-studio-agent
```

#### 2. Performance Issues

```bash
# Check performance metrics
curl http://localhost:9876/render/performance

# Check cache hit rates
curl http://localhost:9876/render/cache
curl http://localhost:9876/render/audio-cache

# Monitor memory usage
docker stats beehive-studio-agent
```

#### 3. Health Check Failures

```bash
# Test health endpoint directly
curl -v http://localhost:9876/health

# Check container health status
docker inspect beehive-studio-agent --format='{{.State.Health.Status}}'
```

### Debug Mode

For troubleshooting, you can run in debug mode:

```bash
# Run with debug logging
docker run -it --rm \
  --name beehive-studio-agent-debug \
  -p 9876:9876 \
  -e DEBUG=true \
  -e LOG_LEVEL=debug \
  beehive-studio-agent:optimized
```

---

## 📈 Scaling and Optimization

### Horizontal Scaling

For high-load scenarios, use Docker Compose with multiple instances:

```yaml
# docker-compose.scale.yml
version: '3.8'
services:
  beehive-studio-agent:
    deploy:
      replicas: 3
    # ... rest of configuration
```

### Vertical Scaling

Adjust resource limits based on your workload:

```bash
# Increase memory allocation
docker run --memory=4g ... 

# Increase CPU allocation
docker run --cpus=4 ... 
```

### Cache Tuning

Monitor cache performance and adjust sizes:

```bash
# Monitor cache hit rates
watch -n 5 "curl http://localhost:9876/render/cache && echo '---' && curl http://localhost:9876/render/audio-cache"
```

---

## 🔒 Security Considerations

### Production Security Best Practices

1. **Use non-root user**: Container runs as `appuser`
2. **Resource limits**: Memory and CPU restrictions
3. **Environment variables**: Sensitive data in `.env` files
4. **Network isolation**: Use custom networks
5. **Health checks**: Automated monitoring and recovery

### SSL/TLS Configuration

For production with HTTPS:

```bash
# Use reverse proxy (nginx)
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:9876;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 🔄 Backup and Recovery

### Data Backup

```bash
# Backup cache data
tar -czf beehive-cache-backup.tar.gz /tmp/beehive-studio-data/cache/

# Backup logs
tar -czf beehive-logs-backup.tar.gz /tmp/beehive-studio-data/logs/

# Backup configuration
cp .env.production beehive-config-backup.env
```

### Disaster Recovery

```bash
# Restore from backup
tar -xzf beehive-cache-backup.tar.gz -C /
tar -xzf beehive-logs-backup.tar.gz -C /

# Restart service
docker restart beehive-studio-agent
```

---

## 📞 Support

### Health Check Dashboard

Create a simple monitoring dashboard:

```bash
#!/bin/bash
# monitor.sh - Continuous monitoring
while true; do
    echo "$(date): Health check"
    ./health-check.sh
    sleep 300  # 5 minutes
done
```

### Performance Alerts

Set up alerts for critical metrics:

```bash
# Example alert script
if [ $(curl -s http://localhost:9876/health | grep -c '"status":"ok"') -eq 0 ]; then
    echo "ALERT: Service health check failed!"
    # Send notification, restart service, etc.
fi
```

---

## 🎉 Production Checklist

- [ ] Docker installed and running
- [ ] Port 9876 available
- [ ] Environment variables configured (`.env.production`)
- [ ] Storage directories created
- [ ] Service deployed with `./deploy.sh`
- [ ] Health check passes: `./health-check.sh`
- [ ] Performance metrics collected
- [ ] Monitoring and alerts configured
- [ ] Backup and recovery procedures tested

**Ready for Production! 🚀**

---

*Last Updated: 2026-06-20*
*Version: 1.0.0 - Optimized Render Performance*