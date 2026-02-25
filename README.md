# CareBridge – Clinical AI Chatbot

RSICareBridge is a clinical AI assistant that integrates **OpenAI GPT** with **FHIR R4 APIs** to give healthcare staff instant access to patient records via natural conversation.

## Architecture

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│  React + Vite   │ ──SSE──▶│  Spring Boot Backend  │──OkHttp▶│  OpenAI API     │
│  (Frontend)     │◀────────│  (Java 17 / Maven)    │         └─────────────────┘
└─────────────────┘         │                       │──Bearer▶┌─────────────────┐
                            │  • Agent loop          │         │  FHIR R4 Server │
                            │  • FHIR cache (5 min) │◀────────│  (rsystems.com) │
                            │  • Parallel tool calls│         └─────────────────┘
                            └──────────────────────┘
```

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React 18, Vite, react-markdown      |
| Backend  | Spring Boot 3.2, Java 17, Maven     |
| HTTP     | OkHttp 4 (connection pooling)       |
| AI       | OpenAI gpt-4o-mini (streaming SSE)  |
| FHIR     | R4 – rsystems FHIR server           |

## Quick Start

### Prerequisites
- Java 17+
- Node.js 18+
- Maven 3.8+
- OpenAI API key

### Backend

```bash
cd backend

# Set your OpenAI API key as an environment variable
export OPENAI_API_KEY=sk-...

mvn spring-boot:run
# Starts on http://localhost:8080
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Opens http://localhost:5173
# API calls are proxied to backend at :8080
```

### Production Build

```bash
# Build frontend
cd frontend && npm run build
# Output in frontend/dist/

# Build backend (fat JAR)
cd backend && mvn package
# Output: backend/target/carebridge-backend-1.0.0.jar

# Run everything
java -jar backend/target/carebridge-backend-1.0.0.jar
```

> In production, serve the `frontend/dist/` directory from a CDN (Vercel, Netlify, etc.)
> and point `carebridge.cors.allowed-origins` to your frontend domain in `application.properties`.

## Environment Variables

| Variable             | Where        | Description                         |
|----------------------|--------------|-------------------------------------|
| `OPENAI_API_KEY`     | Backend env  | OpenAI secret key (never in repo)   |
| `openai.model`       | app.properties | Model name (default: gpt-4o-mini) |
| `carebridge.cors.allowed-origins` | app.properties | Frontend URL for CORS |

## Features

- 🔍 **Patient Search** – by name, email, phone, DOB, or ID
- 🩺 **Conditions** – ICD-9 coded diagnoses
- 💊 **Medications** – active filter, drug code lookup
- ⚕ **Procedures** – CPT code ranges
- 🏥 **Encounters** – admissions, discharges, date-range queries
- 🔬 **Observations** – LOINC coded labs + vitals, 8 key observations in parallel
- 📊 **Deterioration patterns** – checks FHIR interpretation/status field
- ⚡ **Streaming** – word-by-word SSE response from OpenAI
- 🗄 **FHIR Cache** – 5-minute in-memory cache reduces redundant API calls
- 🔄 **Parallel tool calls** – CompletableFuture executes multiple FHIR calls simultaneously
