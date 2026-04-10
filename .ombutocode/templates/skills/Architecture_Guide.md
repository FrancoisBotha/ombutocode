---
system: true
---

# Architecture Guide

## Overview

This skill guides AI coding agents in creating and refining software architecture documents. Use it as a system prompt when working with the Architecture creation feature.

## Architecture Document Structure

A well-structured architecture document should contain:

### 1. System Overview
- High-level description of the system
- Context diagram — how the system fits into the broader ecosystem
- Key architectural goals and drivers

### 2. Architecture Style
- Chosen architecture pattern (monolith, microservices, serverless, event-driven, etc.)
- Rationale for the choice
- Trade-offs considered

### 3. Technology Stack
- Frontend technologies (framework, build tools, state management)
- Backend technologies (language, framework, runtime)
- Database and storage (relational, NoSQL, object storage, caching)
- Infrastructure (cloud provider, container orchestration, CI/CD)
- Third-party services and integrations

### 4. System Components
- Component diagram showing major modules/services
- Responsibilities of each component
- Communication patterns between components (sync, async, events)

### 5. Data Architecture
- Data model overview
- Database schema strategy (single DB, DB per service, CQRS)
- Data flow diagrams
- Caching strategy

### 6. API Design
- API style (REST, GraphQL, gRPC)
- Authentication and authorisation approach
- API versioning strategy
- Rate limiting and throttling

### 7. Security Architecture
- Authentication mechanism (JWT, OAuth 2.0, SAML)
- Authorisation model (RBAC, ABAC)
- Data encryption (at rest, in transit)
- Secrets management
- Security boundaries and trust zones

### 8. Infrastructure and Deployment
- Deployment architecture (containers, VMs, serverless)
- Environment strategy (dev, staging, production)
- CI/CD pipeline overview
- Monitoring and observability (logging, metrics, tracing)
- Disaster recovery and backup strategy

### 9. Scalability and Performance
- Expected load and growth projections
- Horizontal vs vertical scaling strategy
- Performance targets and SLAs
- Bottleneck analysis

### 10. Architecture Decision Records (ADRs)
- Key decisions made and their rationale
- Alternatives considered
- Consequences and trade-offs

## Guidelines for AI Agents

When creating an architecture document:
- Ask about the project's scale and complexity first
- Tailor recommendations to the project size — don't over-architect
- Explain trade-offs for each technology choice
- Ask one section at a time
- Use diagrams described in text (Mermaid syntax) where helpful
- Save the document incrementally

When refining an existing architecture document:
- Read the entire document first
- Check for consistency between sections
- Identify missing sections or gaps
- Suggest modern alternatives where appropriate
- Wait for user approval before making changes
