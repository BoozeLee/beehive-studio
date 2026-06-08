-- Beehive Studio Redis Initialization Script
-- Production Redis setup with proper memory management and persistence

-- Configure Redis for production usage
-- Memory management
maxmemory 2gb
maxmemory-policy allkeys-lru

-- Persistence settings
save 900 1      -- Save if at least 1 key changed in 900 seconds
save 300 10     -- Save if at least 10 keys changed in 300 seconds
save 60 10000   -- Save if at least 10000 keys changed in 60 seconds

-- Append-only file settings
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

-- Slow log configuration
slowlog-log-slower-than 10000  -- 10ms
slowlog-max-len 128

-- Client timeout settings
timeout 300
tcp-keepalive 60

-- Network settings
tcp-backlog 511
bind 0.0.0.0

-- General configuration
daemonize no
pidfile /var/run/redis_6379.pid
port 6379
databases 16
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes

-- Logging configuration
loglevel notice
logfile ""

-- Security - set password (will be overridden by environment variable)
# requirepass your_secure_redis_password

-- Beehive Studio specific Redis keys and structures

-- Key patterns for Beehive Studio
-- User sessions: beehive:sessions:{user_id}
-- Project data: beehive:projects:{project_id}
-- Cache keys: beehive:cache:{type}:{id}
-- Rate limiting: beehive:ratelimit:{user_id}:{endpoint}
-- WebSocket connections: beehive:ws:{session_id}

-- Create Redis functions for Beehive Studio operations

-- Function to rate limit API requests
-- Returns 1 if request is allowed, 0 if rate limited
local function rate_limit(key, limit, window)
    local current = redis.call('INCR', key)
    if current == 1 then
        redis.call('EXPIRE', key, window)
    end
    return current <= limit and 1 or 0
end

-- Function to cache AI model responses
local function cache_ai_response(cache_key, response, ttl)
    redis.call('SETEX', cache_key, ttl, response)
    return 1
end

-- Function to get cached AI response
local function get_cached_response(cache_key)
    return redis.call('GET', cache_key)
end

-- Function to track WebSocket connections
local function track_websocket(session_id, user_id, ttl)
    redis.call('SETEX', 'beehive:ws:' .. session_id, ttl, user_id)
    return 1
end

-- Function to cleanup expired sessions
local function cleanup_expired_sessions()
    local keys = redis.call('KEYS', 'beehive:sessions:*')
    for i, key in ipairs(keys) do
        local ttl = redis.call('TTL', key)
        if ttl == -1 then  -- Key exists but has no expiration
            redis.call('DEL', key)
        end
    end
    return #keys
end

-- Function to get user session info
local function get_user_session(session_token)
    return redis.call('GET', 'beehive:sessions:' .. session_token)
end

-- Function to create user session
local function create_user_session(user_id, session_token, ttl)
    redis.call('SETEX', 'beehive:sessions:' .. session_token, ttl, user_id)
    return 1
end

-- Function to invalidate user session
local function invalidate_user_session(session_token)
    return redis.call('DEL', 'beehive:sessions:' .. session_token)
end

-- Function to get project cache
local function get_project_cache(project_id)
    return redis.call('GET', 'beehive:projects:' .. project_id)
end

-- Function to set project cache
local function set_project_cache(project_id, data, ttl)
    redis.call('SETEX', 'beehive:projects:' .. project_id, ttl, data)
    return 1
end

-- Function to invalidate project cache
local function invalidate_project_cache(project_id)
    return redis.call('DEL', 'beehive:projects:' .. project_id)
end

-- Register Redis functions
redis.register_function('rate_limit', rate_limit)
redis.register_function('cache_ai_response', cache_ai_response)
redis.register_function('get_cached_response', get_cached_response)
redis.register_function('track_websocket', track_websocket)
redis.register_function('cleanup_expired_sessions', cleanup_expired_sessions)
redis.register_function('get_user_session', get_user_session)
redis.register_function('create_user_session', create_user_session)
redis.register_function('invalidate_user_session', invalidate_user_session)
redis.register_function('get_project_cache', get_project_cache)
redis.register_function('set_project_cache', set_project_cache)
redis.register_function('invalidate_project_cache', invalidate_project_cache)

-- Create monitoring keys
redis.call('SET', 'beehive:initialized', 'true')
redis.call('EXPIRE', 'beehive:initialized', 86400)  -- Expire after 24 hours

-- Log initialization
redis.call('SET', 'beehive:initialization_timestamp', os.time())
redis.call('EXPIRE', 'beehive:initialization_timestamp', 86400)

print('Beehive Studio Redis initialization completed')