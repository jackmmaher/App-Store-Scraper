# Self-Hosting Security Checklist

Security considerations when deploying this application outside of Vercel.

## Reverse Proxy (nginx/traefik/caddy)

- [ ] Strip/overwrite `X-Forwarded-For` header from client requests
- [ ] Set `X-Real-IP` from actual client connection
- [ ] Validate `Host` header matches expected domains
- [ ] Enable HTTPS with valid certificates

Example nginx config:
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    # Strip client-provided forwarded headers
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Host $host;

    location / {
        proxy_pass http://localhost:3000;
    }
}
```

## Python Crawl Service

- [ ] Bind to localhost only (`127.0.0.1:8000`), not `0.0.0.0`
- [ ] Add API key authentication using `CRAWL_SERVICE_API_KEY` environment variable
- [ ] Or use internal Docker network, not exposed ports

Example uvicorn command:
```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

## Python APIs (if self-hosted instead of Vercel)

- [ ] Configure explicit CORS whitelist instead of reflecting Origin
- [ ] Example: `Access-Control-Allow-Origin: https://yourdomain.com`

## Environment Variables

**Required secrets (must be set in production):**

- [ ] `NODE_ENV=production`
- [ ] `APP_PASSWORD` - Password for web UI authentication
- [ ] `SESSION_SECRET` - Secret for signing session tokens (use a random 32+ character string)
- [ ] `CRON_SECRET` - Secret for authenticating cron job requests

**Generate secure secrets:**
```bash
# Generate a secure random secret
openssl rand -hex 32
```

## Docker Deployment

If using Docker Compose:

```yaml
services:
  app:
    environment:
      - NODE_ENV=production
      - APP_PASSWORD=${APP_PASSWORD}
      - SESSION_SECRET=${SESSION_SECRET}
      - CRON_SECRET=${CRON_SECRET}
    # Don't expose ports directly if using reverse proxy
    expose:
      - "3000"

  crawl-service:
    # Bind to internal network only
    command: uvicorn main:app --host 0.0.0.0 --port 8000
    # Don't expose to host
    expose:
      - "8000"
    # Or use explicit network isolation
    networks:
      - internal

networks:
  internal:
    internal: true
```

## Verification

After deployment:

1. Verify environment variables are set:
   ```bash
   echo $NODE_ENV  # Should output: production
   ```

2. Test that HTTPS is working and HTTP redirects

3. Test that crawl service is not accessible from outside

4. Test authentication is required for protected endpoints
