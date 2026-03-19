# AI Task Processing Platform

A production-ready AI task processing system with React frontend, Node.js backend, Python workers, Redis queue, and MongoDB — fully containerized with Docker, orchestrated with Kubernetes, and automated with ArgoCD + GitHub Actions.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite), Axios, React Router |
| Backend | Node.js, Express, Mongoose |
| Worker | Python, Redis (BLPOP queue) |
| Queue | Redis |
| Database | MongoDB |
| Auth | bcrypt, JWT, helmet, rate-limit |
| Containers | Docker (multi-stage builds) |
| Orchestration | Kubernetes |
| GitOps | Argo CD |
| CI/CD | GitHub Actions |

## Project Structure

```
root/
├── frontend/               # React + Vite
│   ├── src/
│   │   ├── api/axios.js
│   │   ├── context/AuthContext.jsx
│   │   ├── components/TaskCard.jsx
│   │   ├── pages/Login.jsx
│   │   ├── pages/Register.jsx
│   │   ├── pages/Dashboard.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── Dockerfile
│   └── package.json
├── backend/                # Express API
│   ├── src/
│   │   ├── config/redis.js
│   │   ├── middleware/auth.js
│   │   ├── models/User.js
│   │   ├── models/Task.js
│   │   ├── routes/auth.js
│   │   ├── routes/tasks.js
│   │   └── server.js
│   ├── Dockerfile
│   └── package.json
├── worker/                 # Python worker
│   ├── worker.py
│   ├── requirements.txt
│   └── Dockerfile
├── infra/                  # Kubernetes + ArgoCD
│   ├── k8s/
│   │   ├── namespace.yaml
│   │   ├── frontend-deployment.yaml
│   │   ├── backend-deployment.yaml
│   │   ├── worker-deployment.yaml
│   │   ├── redis-deployment.yaml
│   │   ├── mongo-deployment.yaml
│   │   ├── services.yaml
│   │   ├── ingress.yaml
│   │   ├── configmap.yaml
│   │   └── secrets.yaml
│   └── argocd-app.yaml
├── .github/workflows/ci-cd.yml
├── docker-compose.yml
├── architecture.md
├── .env.example
└── README.md
```

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker & Docker Compose
- MongoDB (local or Docker)
- Redis (local or Docker)

### 1. Local Development (Without Docker)

```bash
# Clone the repo
git clone <your-repo-url>
cd ai-task-platform

# Copy environment variables
cp .env.example .env
# Edit .env with your local values (localhost URLs)

# Backend
cd backend
npm install
npm run dev          # Starts on port 5000

# Worker (new terminal)
cd worker
pip install -r requirements.txt
python worker.py

# Frontend (new terminal)
cd frontend
npm install
npm run dev          # Starts on port 3000 (proxies /api → :5000)
```

### 2. Docker Compose (Recommended)

```bash
# Copy environment variables
cp .env.example .env

# Build and start all services
docker-compose up --build

# Access:
#   Frontend: http://localhost:8080
#   Backend:  http://localhost:5000
#   MongoDB:  localhost:27017
#   Redis:    localhost:6379
```

To scale workers:

```bash
docker-compose up --build --scale worker=4
```

---

## Kubernetes Deployment

### Prerequisites

- kubectl configured to target your cluster
- Nginx Ingress Controller installed
- Container images pushed to Docker Hub

### Steps

```bash
# 1. Create namespace
kubectl apply -f infra/k8s/namespace.yaml

# 2. Apply secrets (⚠️ edit base64 values first!)
kubectl apply -f infra/k8s/secrets.yaml

# 3. Apply configmap
kubectl apply -f infra/k8s/configmap.yaml

# 4. Deploy data stores
kubectl apply -f infra/k8s/redis-deployment.yaml
kubectl apply -f infra/k8s/mongo-deployment.yaml

# 5. Deploy services
kubectl apply -f infra/k8s/services.yaml

# 6. Deploy applications
kubectl apply -f infra/k8s/backend-deployment.yaml
kubectl apply -f infra/k8s/worker-deployment.yaml
kubectl apply -f infra/k8s/frontend-deployment.yaml

# 7. Apply ingress
kubectl apply -f infra/k8s/ingress.yaml

# 8. Verify
kubectl get all -n ai-task-platform
```

### Update Image Tags

In each deployment YAML, replace `YOUR_DOCKERHUB_USER` with your actual Docker Hub username:

```yaml
image: yourusername/ai-task-frontend:latest
image: yourusername/ai-task-backend:latest
image: yourusername/ai-task-worker:latest
```

---

## Argo CD Setup

### Prerequisites

- Argo CD installed in cluster (`argocd` namespace)
- Infra manifests in a separate Git repo

### Steps

```bash
# 1. Edit infra/argocd-app.yaml
#    Update repoURL to your infra repo URL

# 2. Apply the ArgoCD Application
kubectl apply -f infra/argocd-app.yaml

# 3. ArgoCD will auto-sync the k8s/ directory
#    - Auto-prune deleted resources
#    - Self-heal drifted resources
#    - Retry on failures (up to 5 times with backoff)
```

### How It Works

1. Push changes to the infra repo's `k8s/` directory
2. ArgoCD detects the change (polled or webhook)
3. ArgoCD applies the diff to the cluster
4. Status visible in ArgoCD dashboard

---

## CI/CD Pipeline

### GitHub Actions Workflow (`.github/workflows/ci-cd.yml`)

**Trigger:** Push to `main` branch

**Pipeline Steps:**

```
1. Lint
   ├── Backend: ESLint
   └── Worker: flake8

2. Build & Push (matrix: frontend, backend, worker)
   ├── Docker Buildx (multi-platform)
   ├── Push to Docker Hub with SHA tag + latest
   └── Layer caching via GitHub Actions cache

3. Update Infra Repo
   ├── Checkout infra repo
   ├── sed replace image tags with new SHA
   └── Git commit + push → triggers ArgoCD sync
```

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username |
| `DOCKERHUB_TOKEN` | Docker Hub access token |
| `INFRA_REPO` | Infra repo path (e.g., `org/ai-task-platform-infra`) |
| `INFRA_REPO_TOKEN` | GitHub PAT with write access to infra repo |
| `VITE_API_URL` | Production API URL for frontend build |

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login, get JWT |
| POST | `/api/tasks` | Yes | Create task |
| GET | `/api/tasks` | Yes | List user's tasks |
| GET | `/api/tasks/:id` | Yes | Get single task |
| POST | `/api/tasks/:id/run` | Yes | Queue task for processing |
| GET | `/health` | No | Health check |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Backend port |
| `MONGO_URI` | `mongodb://localhost:27017/ai_task_platform` | MongoDB connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | `dev-secret-change-in-production` | JWT signing secret |
| `JWT_EXPIRES_IN` | `7d` | JWT token expiry |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `VITE_API_URL` | `/api` | Frontend API base URL |

---

## License

MIT
