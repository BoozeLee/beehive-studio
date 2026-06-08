# Music Generation Integration

## Overview

The Beehive Studio now integrates multiple music generation APIs to provide comprehensive AI-powered music creation capabilities. This integration supports both open-source and commercial music generation services.

## Architecture

### Core Components

1. **Music Generation Service** (`apps/api/services/music_generation.py`)
   - Unified interface for multiple music providers
   - Async support for concurrent generation
   - Error handling and retry logic

2. **Music Orchestrator** (`apps/api/services/music_orchestrator.py`)
   - Task queue management
   - Provider coordination
   - Analytics and monitoring
   - Background task processing

3. **Individual Provider Services**
   - **AudioCraft**: Open-source (Meta)
   - **Mubert**: Commercial royalty-free
   - **Soundraw**: Premium commercial
   - **Suno AI**: Complete songs with vocals
   - **Gemini**: Google AI integration

### Service Dependencies

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Music APIs    │    │  Orchestrator   │    │   Task Queue    │
│                 │    │                 │    │                 │
│ • AudioCraft    │◄──►│ • Task Mgmt     │◄──►│ • Async Queue   │
│ • Mubert        │    │ • Provider Coord │    │ • Retry Logic   │
│ • Soundraw      │    │ • Analytics     │    │ • Priority      │
│ • Suno AI       │    │ • Monitoring    │    │                 │
│ • Gemini        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                 FastAPI Integration                           │
│                (apps/api/main.py)                              │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Music Generation

#### POST /music/orchestrate
Orchestrate music generation using multiple providers.

**Request:**
```json
{
  "prompt": "calm ambient music",
  "duration": 30,
  "genre": "ambient",
  "provider": "audiocraft",
  "quality": "high"
}
```

**Response:**
```json
{
  "task_id": "music_task_1234567890",
  "status": "queued",
  "message": "Music generation task created and queued"
}
```

#### GET /music/tasks/{task_id}
Get task status.

**Response:**
```json
{
  "task_id": "music_task_1234567890",
  "status": "processing",
  "created_at": "2024-01-01T12:00:00Z",
  "updated_at": "2024-01-01T12:00:30Z",
  "retry_count": 0,
  "request": {
    "prompt": "calm ambient music",
    "duration": 30,
    "genre": "ambient",
    "provider": "audiocraft"
  }
}
```

#### GET /music/tasks/{task_id}/result
Get completed task result.

**Response:**
```json
{
  "task_id": "music_task_1234567890",
  "success": true,
  "audio_url": "http://localhost:8000/generated_music.wav",
  "metadata": {
    "prompt": "calm ambient music",
    "duration": 30,
    "genre": "ambient",
    "provider": "audiocraft",
    "timestamp": "2024-01-01T12:01:00Z"
  },
  "provider": "audiocraft"
}
```

### Provider Management

#### GET /music/providers
Get available music providers.

**Response:**
```json
{
  "providers": [
    {
      "name": "audiocraft",
      "description": "AUDIOCRAFT",
      "commercial_use": "Fully allowed (MIT license)",
      "available": true
    },
    {
      "name": "mubert",
      "description": "MUBERT",
      "commercial_use": "Royalty-free for commercial use",
      "available": false
    }
  ]
}
```

#### POST /music/test/{provider_name}
Test a specific provider.

**Response:**
```json
{
  "provider": "audiocraft",
  "test_result": true,
  "message": "Provider test completed",
  "error": null
}
```

### Analytics

#### GET /music/analytics
Get music generation analytics.

**Response:**
```json
{
  "uptime_seconds": 3600,
  "total_generations": 25,
  "successful_generations": 23,
  "failed_generations": 2,
  "success_rate": 0.92,
  "provider_stats": {
    "audiocraft": {
      "total": 15,
      "successful": 14,
      "failed": 1
    },
    "mubert": {
      "total": 10,
      "successful": 9,
      "failed": 1
    }
  },
  "uptime_human": "1:00:00"
}
```

## Docker Configuration

### Services

The music generation services are defined in `docker-compose.prod.yml`:

```yaml
services:
  # AudioCraft (Open-source)
  audiocraft:
    build:
      context: ./services/audiocraft
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - ./services/audiocraft/models:/app/models
      - ./services/audiocraft/outputs:/app/outputs
    environment:
      - AUDIOCRAFT_MODEL=small
      - AUDIOCRAFT_DEVICE=cuda
    restart: unless-stopped

  # Mubert API (Commercial)
  mubert-api:
    image: python:3.11-slim
    ports:
      - "8001:8000"
    environment:
      - MUBERT_API_KEY=${MUBERT_API_KEY}
    command: python -m flask run --host=0.0.0.0 --port=8000

  # Soundraw API (Premium)
  soundraw-api:
    image: python:3.11-slim
    ports:
      - "8002:8000"
    environment:
      - SOUNDRAW_API_KEY=${SOUNDRAW_API_KEY}
    command: python -m flask run --host=0.0.0.0 --port=8000

  # Suno AI (Complete songs)
  suno-api:
    image: python:3.11-slim
    ports:
      - "8003:8000"
    command: python -m flask run --host=0.0.0.0 --port=8000

  # Gemini AI Integration
  gemini:
    image: python:3.11-slim
    ports:
      - "8004:8000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    command: python -m flask run --host=0.0.0.0 --port=8000
```

### Environment Variables

Required environment variables:

```bash
# AudioCraft
AUDIOCRAFT_MODEL=small
AUDIOCRAFT_DEVICE=cuda

# Mubert API
MUBERT_API_KEY=your_mubert_api_key

# Soundraw API
SOUNDRAW_API_KEY=your_soundraw_api_key

# Gemini API
GEMINI_API_KEY=your_gemini_api_key
```

## Commercial Use Policies

### ✅ Fully Commercial Use

1. **AudioCraft (Meta)**
   - License: MIT (code) + CC-BY-NC 4.0 (models)
   - Commercial Use: Allowed for code, restricted for models
   - Cost: Free (self-hosted)

2. **Mubert API**
   - Commercial Use: Fully royalty-free
   - Cost: Contact for pricing
   - Features: Professional AI soundtracks

3. **Soundraw**
   - Commercial Use: Allowed on all plans
   - Cost: Starts at €5.83/month
   - Features: Premium music generation

### ⚠️ Limited Commercial Use

1. **Suno AI**
   - Free Tier: 10 songs/day, no commercial rights
   - Commercial Use: Requires Pro/Premier upgrade
   - Features: Complete songs with vocals

### 🆓 Open Source (Recommended for Commercial)

**AudioCraft** is the best option for commercial applications:
- Full control over the generation process
- No API costs or usage limits
- Self-hosted with privacy guarantees
- Customizable for specific needs

## Deployment

### 1. Build and Start Services

```bash
# Build the services
docker-compose -f docker-compose.prod.yml build

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### 2. Configure API Keys

Set environment variables for commercial services:

```bash
# Mubert API
export MUBERT_API_KEY="your_key_here"

# Soundraw API
export SOUNDRAW_API_KEY="your_key_here"

# Gemini API
export GEMINI_API_KEY="your_key_here"
```

### 3. Test the Integration

```bash
# Test AudioCraft health
curl http://localhost:8000/health

# Test music generation
curl -X POST http://localhost:9876/music/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "calm ambient music", "duration": 30, "provider": "audiocraft"}'
```

## Monitoring and Analytics

### Prometheus Metrics

The orchestrator provides metrics for:
- Task completion rates
- Provider performance
- Error rates
- Response times

### Grafana Dashboard

Access the Grafana dashboard at `http://localhost:3001` to monitor:
- Music generation statistics
- Provider health
- System performance
- Error tracking

### Logging

Logs are available through:
- Docker logs: `docker-compose -f docker-compose.prod.yml logs`
- Application logs in containers
- Prometheus/Grafana integration

## Performance Optimization

### 1. Caching

- Redis caching for frequent generation requests
- Model caching for AudioCraft
- Result caching for similar prompts

### 2. Load Balancing

- Nginx reverse proxy for load distribution
- Multiple provider instances
- Request queuing and prioritization

### 3. Resource Management

- GPU acceleration for AudioCraft
- Memory optimization for large models
- Connection pooling for API clients

## Security Considerations

### 1. API Key Management

- Store API keys in environment variables
- Use Docker secrets for production
- Regular key rotation

### 2. Rate Limiting

- Implement request rate limiting
- Provider-specific limits
- User quota management

### 3. Data Privacy

- Local processing for AudioCraft
- Secure storage of generated audio
- Compliance with data protection regulations

## Troubleshooting

### Common Issues

1. **AudioCraft Model Loading**
   ```
   Error: Model still loading
   Solution: Wait for model download to complete
   ```

2. **Provider API Failures**
   ```
   Error: Provider connection failed
   Solution: Check API key configuration and network connectivity
   ```

3. **Task Timeouts**
   ```
   Error: Task timeout exceeded
   Solution: Increase timeout limits and check provider performance
   ```

### Debug Commands

```bash
# Check service logs
docker-compose -f docker-compose.prod.yml logs -f audiocraft
docker-compose -f docker-compose.prod.yml logs -f mubert-api

# Monitor resource usage
docker stats --no-stream

# Check network connectivity
docker-compose -f docker-compose.prod.yml exec api curl http://audiocraft:8000/health
```

## Future Enhancements

1. **Additional Providers**
   - Add more music generation APIs
   - Support for custom models
   - Multi-language support

2. **Advanced Features**
   - Real-time streaming generation
   - Collaborative music creation
   - Integration with DAW plugins

3. **Performance Improvements**
   - GPU acceleration optimization
   - Distributed processing
   - Edge computing support

## Support

For issues and feature requests:
- Check the troubleshooting section
- Review service logs
- Contact the development team
- Submit issues on the project repository

---

*This integration provides a robust, scalable music generation system for Beehive Studio with both open-source and commercial options.*