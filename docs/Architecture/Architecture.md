# Architecture Overview

## System Architecture

The application follows a layered architecture:

- **Presentation Layer** - Vue.js SPA
- **API Layer** - RESTful services
- **Business Logic Layer** - Domain services
- **Data Layer** - PostgreSQL + Redis

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue.js 3, Vite |
| Backend | Node.js, Express |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Auth | JWT + OAuth 2.0 |
| Deployment | Docker, Kubernetes |
