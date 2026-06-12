# Beehive Studio Production Deployment Guide

## Overview

Beehive Studio is a comprehensive AI-powered music production platform built with modern 2026 technologies. This guide covers the complete production deployment process, including infrastructure setup, monitoring, and management.

## Architecture

### Core Components

- **Frontend**: Tauri v2 + React 19 desktop application
- **Backend**: FastAPI with vLLM/ollama inference integration
- **Database**: PostgreSQL with Redis caching
- **Storage**: MinIO S3-compatible object storage
- **Monitoring**: Prometheus + Grafana stack
- **Reverse Proxy**: nginx with SSL termination
- **AI Services**: vLLM inference and Ollama fallback

### Service Ports

| Service | Port | Description |
|---------|------|-------------|
| Web Application | 443 | Main application (HTTPS) |
| API Gateway | 9876 | Backend API |
| Git Projects | 9877 | Version control service |
| vLLM Inference | 8000 | AI model inference |
| Ollama | 11434 | Fallback AI service |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache |
| Prometheus | 9090 | Metrics collection |
| Grafana | 3001 | Monitoring dashboard |
| MinIO | 9000/9001 | File storage |

## Prerequisites

### System Requirements

- **CPU**: 8+ cores recommended
- **RAM**: 16GB+ recommended
- **Storage**: 50GB+ SSD
- **GPU**: NVIDIA GPU with 8GB+ VRAM (for vLLM)
- **Network**: Stable internet connection

### Software Requirements

- Docker/Podman v20.10+
- Docker Compose v2.0+
- OpenSSL (for SSL certificates)
- git

## Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd beehive-studio
cp .env.production .env
# Edit .env with your configuration
```

### 2. Generate SSL Certificates

```bash
./nginx/ssl/generate-cert.sh
```

### 3. Deploy Production Stack

```bash
./scripts/deploy-production.sh
```

### 4. Test Deployment

```bash
./scripts/test-deployment.sh
```

### 5. Monitor Progress

Large image downloads may take significant time. Monitor progress with:
```bash
docker compose -f docker-compose.prod.yml ps
docker stats --no-stream
```

## Detailed Deployment

### Environment Configuration

Edit `.env` file with your specific values:

```bash
# Database Configuration
POSTGRES_PASSWORD=your_secure_postgres_password
POSTGRES_TEST_PASSWORD=your_secure_postgres_test_password

# Redis Configuration
REDIS_PASSWORD=your_secure_redis_password

# Grafana Configuration
GRAFANA_PASSWORD=your_secure_grafana_admin_password

# MinIO Configuration
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123

# AI API Configuration
AI_API_KEY=your_ai_api_key
```

### SSL Certificate Management

The deployment script automatically generates self-signed SSL certificates. For production, use proper certificates:

```bash
# Using Let's Encrypt
sudo certbot certonly --nginx -d your-domain.com

# Place certificates in nginx/ssl/
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/cert.pem
cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/key.pem
```

### Database Initialization

PostgreSQL is automatically initialized with:

- User management tables
- Project structure tables
- Collaboration session tables
- AI interaction tracking
- Performance-optimized indexes

### Monitoring Setup

Prometheus and Grafana are configured with:

- Service health monitoring
- Performance metrics
- Alert rules for critical issues
- Pre-built dashboards

## Service Management

### Basic Commands

```bash
# View service status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart services
docker compose -f docker-compose.prod.yml restart

# Stop services
docker compose -f docker-compose.prod.yml down

# Update services
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Service Health Checks

All services include health checks:

```bash
# Check API health
curl -f https://localhost:443/api/health

# Check database
docker compose -f docker-compose.prod.yml exec postgres pg_isready

# Check Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
```

## Monitoring and Logging

### Access Monitoring

- **Grafana Dashboard**: https://localhost:443/grafana
- **Prometheus**: https://localhost:443/prometheus
- **Application Logs**: `docker compose logs`

### Key Metrics

- API response times
- Database query performance
- Memory and CPU usage
- AI inference latency
- WebSocket connection counts

### Alerting

Critical alerts are configured for:
- Service downtime
- High error rates
- Resource exhaustion
- Database issues

## Performance Optimization

### Resource Limits

The production configuration includes:

- **Memory limits**: 2GB for Redis, optimized PostgreSQL settings
- **CPU limits**: Configurable per service
- **Connection pooling**: Optimized for PostgreSQL and Redis

### Caching Strategy

- **Redis**: Session data, API responses, project metadata
- **nginx**: Static assets, API response caching
- **Application**: AI model responses, frequently accessed data

### Database Optimization

- **Indexing**: Properly indexed for query performance
- **Connection pooling**: Optimized connection limits
- **Query optimization**: Analyzed and tuned queries

## Security Considerations

### Network Security

- **SSL/TLS**: HTTPS encryption for all traffic
- **Firewall**: Configured port restrictions
- **Network segmentation**: Internal service communication

### Access Control

- **Authentication**: JWT-based authentication
- **Authorization**: Role-based access control
- **Session management**: Secure session handling

### Data Protection

- **Encryption**: SSL/TLS for data in transit
- **Database encryption**: Optional at rest encryption
- **Backup encryption**: Encrypted backup storage

## Backup and Recovery

### Database Backups

```bash
# Create backup
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres beehive > backup.sql

# Restore backup
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres beehive < backup.sql
```

### File Storage Backups

```bash
# Backup MinIO data
docker compose -f docker-compose.prod.yml exec minio mc mirror minio/data /backup/minio
```

### Automated Backups

Set up cron jobs for regular backups:

```bash
# Daily backup
0 2 * * * /path/to/backup-script.sh
```

## Troubleshooting

### Common Issues

#### Service Not Starting

```bash
# Check logs
docker compose logs [service-name]

# Check resource usage
docker stats

# Restart service
docker compose restart [service-name]
```

#### Database Connection Issues

```bash
# Check database status
docker compose exec postgres pg_isready

# Check logs
docker compose logs postgres
```

#### SSL Certificate Issues

```bash
# Regenerate certificates
./nginx/ssl/generate-cert.sh

# Check certificate validity
openssl x509 -in nginx/ssl/cert.pem -text -noout
```

### Performance Issues

```bash
# Monitor resource usage
docker stats

# Check database performance
docker compose exec postgres psql -U postgres -c "SELECT * FROM pg_stat_activity;"

# Check Redis memory usage
docker compose exec redis redis-cli info memory
```

## Scaling

### Horizontal Scaling

- **Load balancing**: nginx handles multiple backend instances
- **Database**: Read replicas for scaling read operations
- **Cache**: Redis cluster for large-scale caching

### Vertical Scaling

- **Resource limits**: Adjust memory and CPU limits per service
- **Database tuning**: Optimize PostgreSQL configuration
- **AI inference**: Scale vLLM instances based on load

## Maintenance

### Regular Tasks

1. **Monitor logs**: Check for errors and warnings
2. **Update dependencies**: Regular security updates
3. **Backup data**: Daily automated backups
4. **Performance tuning**: Monitor and optimize performance
5. **Security audit**: Regular security assessments

### Update Process

```bash
# Pull latest images
docker compose pull

# Build new images
docker compose build

# Deploy updates
docker compose up -d

# Verify deployment
./scripts/test-deployment.sh
```

## Support

### Documentation

- API documentation: https://localhost:443/docs
- Grafana dashboards: https://localhost:443/grafana
- Prometheus metrics: https://localhost:443/prometheus

### Issue Reporting

Create issues with:
- System information
- Error logs
- Steps to reproduce
- Expected vs actual behavior

## Actual Deployment Experience

### Deployment Status (Current: June 8, 2026)

**✅ Completed Components:**
- Podman runtime setup and configuration
- Environment preparation and validation
- Docker Compose plugin compatibility
- SSL certificate infrastructure
- Production deployment script execution
- Partial service deployment (API agent service running)
- Resource monitoring and health checks

**🔄 In Progress:**
- Large Docker image downloads (vLLM, Grafana, PostgreSQL, MinIO, Ollama)
- Full 12-service orchestration
- Complete monitoring stack deployment
- Comprehensive validation testing

**⚠️ Current Status:**
- **API Service**: Running on port 9876 with 2% CPU, 43MB RAM usage
- **Background Downloads**: Large images downloading in parallel
- **Resource Usage**: Minimal current footprint
- **Next Steps**: Continue monitoring downloads, complete service startup

### Lessons Learned

1. **Large Image Downloads**: Some images (especially vLLM, Ollama) are 3GB+ and require significant time
2. **Service Dependencies**: Proper health checks and dependency management critical
3. **Resource Management**: Current deployment uses minimal resources when idle
4. **Network Stability**: Stable internet connection required for large image downloads

### Recommendations

1. **Patience**: Allow 30-60 minutes for large image downloads
2. **Monitoring**: Use `docker stats` to track resource usage during downloads
3. **Incremental Deployment**: Start with basic services first, then add AI services
4. **Background Processing**: Use background processes for long-running downloads

*Built for ritual producers. Local-first. Human sovereignty.*