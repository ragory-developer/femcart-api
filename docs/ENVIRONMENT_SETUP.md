# Femcart API � Environment Setup Guide

> **Last Updated:** 2026-06-11 | **AI-Maintained**

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 18.x | Runtime |
| npm | >= 9.x | Package manager |
| MySQL | >= 8.0 | Database |
| Git | Any | Version control |

Optional:
- AWS account (for S3 media storage)
- MassData SMS account (for SMS gateway)
- SSLCommerz account (for payment gateway)
- Facebook Business Manager (for CAPI events)

---

## Local Development Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd femcart-api
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your local values:

```env
# Server
PORT=5000
NODE_ENV=development

# Database (local MySQL)
DATABASE_URL="mysql://root:password@localhost:3306/femcart_db"

# JWT (any random strings in development)
JWT_ACCESS_SECRET=dev-access-secret-change-in-prod
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-prod
JWT_ACCESS_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# Frontend URL
FRONTEND_URL=http://localhost:3000
# OR to allow all origins in dev:
ALLOW_ALL_ORIGINS=true

# API URL (self-reference)
API_URL=http://localhost:5000

# SMS (mocked in development - not needed)
# SMS_GATEWAY_URL=
# SMS_API_KEY=
```

### 3. Database Setup

Create the database:
```sql
CREATE DATABASE femcart_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Run migrations:
```bash
npx prisma migrate dev
# Enter a migration name when prompted (e.g., "initial")
```

Generate Prisma client (usually done automatically by migrate):
```bash
npx prisma generate
```

### 4. Seed Initial Data

```bash
# Seed Bangladesh locations (States, Cities, Areas)
npx tsx scripts/seed-areas.ts

# Seed navigation
npx tsx scripts/seed-navigation.ts

# Seed main data (categories, settings, etc.)
npm run db:seed
```

### 5. Create First Admin

Using the API (one-time endpoint):
```bash
curl -X POST http://localhost:5000/api/auth/setup-super-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin123!","name":"Super Admin","adminAccessKey":"ADMIN"}'
```

Or use the script:
```bash
npx tsx scripts/seed-admin.ts
```

### 6. Start Development Server

```bash
npm run dev
```

Server runs at: `http://localhost:5000`
API Docs: `http://localhost:5000/api-docs`
Health Check: `http://localhost:5000/api/health`

---

## Docker Setup

> [!NOTE]
> No `Dockerfile` or `docker-compose.yml` exists in the repository. Docker setup needs to be created. This section documents what a Docker setup would look like.

**Recommended `docker-compose.yml` structure:**

```yaml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=mysql://root:password@db:3306/femcart
      - JWT_ACCESS_SECRET=change-this
      - JWT_REFRESH_SECRET=change-this
      - NODE_ENV=production
    depends_on:
      - db

  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: password
      MYSQL_DATABASE: femcart
    volumes:
      - mysql_data:/var/lib/mysql

volumes:
  mysql_data:
```

---

## Production Server Setup

### 1. Server Requirements
- Ubuntu 22.04+ (or similar Linux)
- Node.js 18+
- MySQL 8.0
- Nginx (as reverse proxy)
- PM2 (process manager)

### 2. Install Dependencies

```bash
# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# PM2
npm install -g pm2

# Prisma CLI
npm install -g prisma
```

### 3. Deploy Application

```bash
# Clone and install
git clone <repo>
cd femcart-api
npm install --production

# Configure environment
cp .env.example .env
nano .env    # Fill in production values

# Build TypeScript
npm run build

# Run migrations
npx prisma migrate deploy

# Seed if fresh deployment
npx tsx scripts/seed-areas.ts
npm run db:seed

# Start with PM2
pm2 start dist/server.js --name femcart-api
pm2 save
pm2 startup   # Enable auto-start on reboot
```

### 4. Nginx Configuration

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # Serve uploaded files directly
    location /uploads/ {
        alias /var/www/femcart-api/uploads/;
    }
}
```

### 5. SSL with Certbot

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d api.yourdomain.com
```

### 6. Critical Production Environment Variables

```env
NODE_ENV=production
PORT=5000
DATABASE_URL="mysql://dbuser:strongpassword@localhost:3306/femcart_prod"
JWT_ACCESS_SECRET=<generate-with-openssl-rand-base64-64>
JWT_REFRESH_SECRET=<generate-with-openssl-rand-base64-64>
JWT_ACCESS_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=https://yourfrontenddomain.com
API_URL=https://api.yourdomain.com
SMS_GATEWAY_URL=https://smsmassdata.massdata.xyz/api/sms/send
SMS_API_KEY=your_real_key
SMS_SENDER_ID=YourBrand
SSL_STORE_ID=your_ssl_store_id
SSL_STORE_PASSWORD=your_ssl_store_password
```

---

## Database Setup Details

### Local MySQL Setup

```bash
# Install MySQL
sudo apt install mysql-server

# Secure installation
sudo mysql_secure_installation

# Create database and user
sudo mysql -u root -p
```

```sql
CREATE DATABASE femcart_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'femcart'@'localhost' IDENTIFIED BY 'strongpassword';
GRANT ALL PRIVILEGES ON femcart_db.* TO 'femcart'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## AWS S3 Setup (for Media Storage)

1. Create an S3 bucket (e.g., `femcart-media`)
2. Set bucket policy to allow public read (for image serving)
3. Create IAM user with `AmazonS3FullAccess` policy
4. Generate access keys
5. Configure via environment or `~/.aws/credentials`

The application uses the AWS SDK v3 default credential chain � no hardcoded keys needed if running on EC2 with an IAM role.

---

## Troubleshooting Common Setup Issues

| Problem | Symptom | Fix |
|---------|---------|-----|
| DB connection failed | Server crashes on start | Check `DATABASE_URL` format; verify MySQL is running |
| Migration failed | Schema mismatch error | Run `npx prisma migrate dev` to reset dev DB or `migrate deploy` for production |
| Port already in use | `EADDRINUSE` error | `kill -9 $(lsof -t -i:5000)` then restart |
| Prisma client not generated | Import error on `@prisma/client` | Run `npx prisma generate` |
| JWT invalid errors | 401 on all requests | Ensure `JWT_ACCESS_SECRET` matches between token generation and verification |
| CORS errors | Frontend requests blocked | Verify `FRONTEND_URL` matches frontend origin exactly |
| SMS not sending | OTP not received | Check `NODE_ENV` � SMS mocked in dev; verify API key in production |
| Images not loading | Broken image URLs | Set `API_URL` to the public URL of the backend server |
