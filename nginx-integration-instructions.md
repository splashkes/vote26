# Nginx Live Cache Integration Instructions

## Steps to integrate the live cache configuration:

### 1. Copy the configuration file to nginx directory
```bash
sudo cp /root/vote_app/vote26/nginx-live-cache.conf /etc/nginx/conf.d/
```

### 2. Add cache zone to main nginx.conf
Add this line to the `http` block in `/etc/nginx/nginx.conf` (after existing proxy_cache_path lines):

```nginx
# Add to http block around line 15-20 after existing proxy_cache_path lines
proxy_cache_path /var/cache/nginx/live levels=1:2 keys_zone=live_cache:10m max_size=500m inactive=1h use_temp_path=off;
limit_req_zone $binary_remote_addr zone=live_api:10m rate=20r/m;
```

### 3. Add location blocks to artb.art server block
Add these location blocks to the `artb.art` server block (around line 200, after the `/assets/` location block):

```nginx
# Live API endpoints with 5-second caching
location /live/ {
    # Rate limiting protection
    limit_req zone=live_api burst=10 nodelay;
    limit_req_status 429;
    
    # Route to specific Supabase functions based on path
    set $supabase_function "";
    
    if ($uri ~ ^/live/event/(.*)$) {
        set $supabase_function "v2-public-event/$1";
    }
    if ($uri = /live/events) {
        set $supabase_function "v2-public-events";
    }
    if ($uri ~ ^/live/bids/(.*)$) {
        set $supabase_function "v2-public-bids/$1";
    }
    if ($uri ~ ^/live/votes/(.*)$) {
        set $supabase_function "v2-public-votes/$1";
    }
    
    # Proxy to Supabase Edge Functions
    proxy_pass https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/$supabase_function;
    proxy_ssl_server_name on;
    proxy_ssl_verify off;
    
    # 5-second caching
    proxy_cache live_cache;
    proxy_cache_valid 200 5s;
    proxy_cache_key "$request_uri";
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;
    proxy_cache_lock on;
    
    # Headers for Supabase
    proxy_set_header Host xsqdkubgyqwpyvfltnrf.supabase.co;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_Set_header X-Forwarded-Proto $scheme;
    
    # Response headers
    add_header X-Cache-Status $upstream_cache_status always;
    add_header Access-Control-Allow-Origin "https://artb.art" always;
    add_header Cache-Control "public, max-age=5" always;
    
    # Connection settings
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_connect_timeout 30s;
    proxy_send_timeout 30s;
    proxy_read_timeout 30s;
}

# Rate limit error for live endpoints
error_page 429 /live-rate-limit.json;
location = /live-rate-limit.json {
    return 429 '{"error": "Rate limit exceeded. Max 20 requests per minute."}';
    add_header Content-Type application/json always;
    add_header Retry-After 60 always;
}
```

### 4. Create cache directory
```bash
sudo mkdir -p /var/cache/nginx/live
sudo chown www-data:www-data /var/cache/nginx/live
```

### 5. Test and reload nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Testing the endpoints:

Once configured, these URLs will be available:

- `https://artb.art/live/events` - List of events
- `https://artb.art/live/event/AB3028` - Specific event data  
- `https://artb.art/live/bids/AB3028` - Current bids for event
- `https://artb.art/live/votes/AB3028` - Vote summary for event

Each endpoint will be cached for 5 seconds and rate limited to 20 requests per minute per IP.