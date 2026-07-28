# Femcart API � Deployment Playbook

> **Last Updated:** 2026-06-11 | **AI-Maintained**

---

## Fresh Deployment (New Server)

### Step 1: Prepare Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
node --version  # Should show v18.x.x

# Install PM2 globally
npm install -g pm2

# Install MySQL
sudo apt install mysql-server
sudo mysql_secure_installation
```

### Step 2: Database Setup

```sql
-- Connect as root
CREATE DATABASE femcart_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'femcart'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT ALL PRIVILEGES ON femcart_prod.* TO 'femcart'@'localhost';
FLUSH PRIVILEGES;
```

### Step 3: Deploy Code

```bash
# Clone the repository
cd /var/www
git clone <repository-url> femcart-api
cd femcart-api

# Install production dependencies
npm install

# Configure environment
cp .env.example .env
nano .env  # Fill in all production values
```

### Step 4: Run Migrations and Seed

```bash
# Build TypeScript
npm run build

# Run database migrations
npx prisma migrate deploy

# Seed Bangladesh locations (one-time)
npx tsx scripts/seed-areas.ts
npx tsx scripts/seed-navigation.ts

# Seed initial data
npm run db:seed
```

### Step 5: Create Super Admin

```bash
curl -X POST http://localhost:5000/api/auth/setup-super-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourstore.com",
    "password": "YourStrongPassword123!",
    "name": "Store Admin",
    "adminAccessKey": "ADMIN"
  }'
```

### Step 6: Start Application

```bash
# Start with PM2
pm2 start dist/server.js --name femcart-api

# Save PM2 configuration
pm2 save

# Enable PM2 startup on reboot
pm2 startup
# Run the command that PM2 outputs
```

### Step 7: Configure Nginx

```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/femcart-api
```

Paste the Nginx config (see `ENVIRONMENT_SETUP.md`) then:

```bash
sudo ln -s /etc/nginx/sites-available/femcart-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 8: SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

### Step 9: Verify Deployment

```bash
curl https://api.yourdomain.com/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

## Update Deployment (Existing Server)

```bash
# 1. Navigate to project
cd /var/www/femcart-api

# 2. Pull latest changes
git pull origin main

# 3. Install any new dependencies
npm install

# 4. Build TypeScript
npm run build

# 5. Run new migrations (if any)
npx prisma migrate deploy

# 6. Regenerate Prisma client (if schema changed)
npx prisma generate

# 7. Restart application
pm2 restart femcart-api

# 8. Verify
pm2 status
curl https://api.yourdomain.com/api/health
```

---

## Rollback Procedure

```bash
# 1. Find the last working commit
git log --oneline -10

# 2. Checkout previous commit
git checkout <commit-hash>

# 3. Rebuild
npm install
npm run build

# 4. If migration rollback needed (CAUTION)
# Prisma does not natively support rollback � you must manually revert SQL
# or restore from database backup
# DO NOT use prisma migrate dev in production

# 5. Restart
pm2 restart femcart-api
```

> [!CAUTION]
> Database migrations cannot be automatically rolled back. Always take a MySQL dump BEFORE running migrations in production.

---

## Database Migration Steps (Production)

```bash
# 1. BACKUP FIRST (critical)
mysqldump -u femcart -p femcart_prod > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Check what migrations will run
npx prisma migrate status

# 3. Apply migrations
npx prisma migrate deploy

# 4. Verify application still starts
pm2 restart femcart-api
sleep 5
curl https://api.yourdomain.com/api/health
```

---

## Cache Clearing

The application does not use a dedicated cache layer (Redis/Memcached). To clear any Node.js module cache, restart the process:

```bash
pm2 restart femcart-api
```

---

## Service Restart Commands

```bash
# Application
pm2 restart femcart-api
pm2 reload femcart-api    # Zero-downtime reload

# Nginx
sudo systemctl restart nginx
sudo systemctl reload nginx  # Graceful reload

# MySQL
sudo systemctl restart mysql
```

---

## Health Monitoring

```bash
# Application status
pm2 status
pm2 logs femcart-api --lines 100

# System resources
pm2 monit

# Check health endpoint
curl https://api.yourdomain.com/api/health

# MySQL status
sudo systemctl status mysql
```

---

## PM2 Configuration Reference

```bash
# View all processes
pm2 list

# View logs
pm2 logs femcart-api

# View last 200 lines
pm2 logs femcart-api --lines 200

# Clear logs
pm2 flush femcart-api

# Show process details
pm2 show femcart-api

# Restart with zero downtime (reload)
pm2 reload femcart-api

# Stop application
pm2 stop femcart-api

# Delete from PM2
pm2 delete femcart-api
```

---

## Builder Deployment Process

The Builder System stores page layouts in the database, so no additional deployment steps are needed for builder content changes. The builder data is:
- **Stored in:** `BuilderPage` and `BuilderPageVersion` tables
- **Served from:** `GET /api/builder/public/:key` endpoint
- **Updated via:** Admin panel ? Builder ? Save Draft ? Publish

No file deployments required for builder content changes.

---

## WooCommerce Import in Production

1. Go to Admin Panel ? WordPress/Import
2. Add WooCommerce connection settings (URL, consumer key/secret)
3. Click "Start Import"
4. Monitor progress via task list
5. Tasks can be paused/resumed individually

The import runs **in-process** (no separate workers) � do not run large imports during peak hours.
