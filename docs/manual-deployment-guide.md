# Step-by-Step Guide to Setting Up Services Manually

![Draw.io Diagram](./Services.jpg)

## Pre-requisites

1. Node.js 24
2. MySQL/MariaDB (used by both Acquirer and Registry Oracle)
3. Minio (object storage for Documents/Logos/QRImages)
4. Git (for source code management)
5. Optional: SendGrid API key for email notifications and emailed password recovery

## Service Overview

### Components:

1. **acquirer-frontend**: Portal UI for Managing Merchants Informations.
2. **acquirer-backend**: Backend Service for handling Merchants Informations.
3. **registry-oracle**: Will Serve as Oracle for Mojaloop ALS.
4. **MySQL**: The merchant database.
5. **Internal HTTP API**: Authenticated, idempotent communication from the Acquirer Backend to the Registry Oracle.

### Configuration

The `.env` file contains environment variables used for configuration.

## Instructions

### Step 1: Clone the Repository

```bash
git clone https://github.com/mojaloop/merchant-registry-svc.git
cd merchant-registry-svc
```

### Step 2: Install Global Dependencies

1. **Node.js**: Install it using the NVM (Node Version Manager)
```bash
# For Ubuntu
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 24.18.0
nvm use 24.18.0

```
2. **pnpm**: Install pnpm globally for FrontEnd React Client.

```bash
npm install -g pnpm
```

### Step 3: Install Project Dependencies Inside Cloned Repository Directory

```bash
npm install
```

### Step 4: Set Up MySQL Database

1. Install MySQL Server and start it. (For Ubuntu)
```bash
sudo apt install -y mysql-server mysql-client
sudo systemctl start mysql
```

2. Log in as the root user and create databases and users.

```bash
sudo mysql -u root
```

```sql
CREATE DATABASE IF NOT EXISTS acquirer_db;
CREATE DATABASE IF NOT EXISTS registry_db;
CREATE USER 'newuser'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON acquirer_db.* TO 'newuser'@'localhost';
GRANT ALL PRIVILEGES ON registry_db.* TO 'newuser'@'localhost';
FLUSH PRIVILEGES;
```

### Step 5: Set Up Minio (Skip if you are using AWS S3 or any other S3 compatible storage)

1. Download Minio from the [official site](https://min.io/download#/linux).
```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin
```

2. Run Minio server with the following command
```bash
minio server /mnt/minio-storage-data
```

### Step 6: Set Up Environment Variables

1. Open a `.env` file in `<root-project>/packages/acquirer-frontend` and change in the environment variables.
(Note: `VITE_API_URL` should be set the external reachable IP Address from browser frontend client)
```
VITE_API_URL=http://localhost:5555/api/v1
```

1. Open the `.env` file in `<root-project>/packages/acquirer-backend` and change the environment variables.

```
JWT_SECRET=secret

# For MySQL
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=newuser
DB_PASSWORD=password
DB_DATABASE=acquirer_db 

# For Minio (Change if you are using AWS S3 or any other S3 compatible storage)
S3_ENDPOINT=localhost
S3_PORT=9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# Email is optional. This is the default and requires no third-party service.
EMAIL_PROVIDER=none

# To enable SendGrid instead:
# EMAIL_PROVIDER=sendgrid
# EMAIL_FROM=sender@example.com
# SENDGRID_API_KEY=replace-with-your-api-key

# For the Registry Oracle internal API
REGISTRY_ORACLE_URL=http://localhost:8888
REGISTRY_INTERNAL_API_KEY=replace-with-a-strong-shared-secret
REGISTRY_HTTP_TIMEOUT_MS=5000
REGISTRY_HTTP_RETRIES=2
```

2. Open the `.env` file in `<root-project>/packages/registry-oracle` and change in the environment variables.

```
JWT_SECRET=secret

DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=newuser
DB_PASSWORD=password
DB_DATABASE=registry_db

# Must match the Acquirer Backend value
REGISTRY_INTERNAL_API_KEY=replace-with-a-strong-shared-secret
```

### Step 7: Start Services

```bash
# For acquirer-backend
npm run acquirer-backend:start

# For acquirer-frontend
npm run dev -w acquirer-frontend -- --host

# For registry-oracle
npm run registry-oracle:start
```

### Step 8: Add Oracle Endpoint to Mojaloop ALS
Replace the `127.0.0.1:4001` with the ALS IP Address and Port.
`registry-oracle:8888` should be reachable from ALS. (Trying pinging `registry-oracle` from ALS container)

```bash
curl -H "Content-Type: application/json" \
  -H "Date: $(date -u +%a,\ %d\ %b\ %Y\ %H:%M:%S\ GMT)" \
  -X POST http://127.0.0.1:4001/oracles \
  -d '{
  "oracleIdType": "ALIAS",
  "endpoint": {
    "value": "http://registry-oracle:8888",
    "endpointType": "URL"
  },
  "currency": "USD",
  "isDefault": true
}'
```

Confirm that the oracle was added successfully by running the following command:
(again, replace `127.0.0.1:4001` with the ALS IP Address and Port)

```bash
curl -H "Content-Type: application/json" -H "Date: $(date -u +%a,\ %d\ %b\ %Y\ %H:%M:%S\ GMT)" http://127.0.0.1:4001/oracles
```

## Security Best Practices

1. **MySQL**: Don't use `root` for application access. Create a specific user with restricted permissions.
2. **Internal API Secret**: Use a strong secret and store it securely in both services.
3. **Environment Variables**: Store them securely, especially in production.
4. **JWT Secret**: Use a strong, unique secret
5. **Temporary Passwords**: Copy them once and share them through a secure
   channel. Email notifications intentionally do not include passwords.
