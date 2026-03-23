# AcadLink LMS

AcadLink is a full-stack Learning Management System built for institutional classroom workflows.
It supports role-based access for admin, teacher, and student users, with modules for subjects,
assignments, submissions, MCQ tests, chat, notifications, and calendar planning.

## What This Project Solves

AcadLink centralizes day-to-day academic activities in one platform:

- teacher-to-student content sharing
- assignment distribution and submission handling
- objective assessment through MCQ tests
- class-level communication through chat
- task and event planning through calendar features
- role-scoped dashboards so each user type sees relevant actions only

## Tech Stack

### Frontend

- React 19
- Vite 7
- React Router
- Axios
- React Hot Toast

### Backend

- FastAPI
- MongoDB (Motor async driver)
- Pydantic models
- JWT authentication
- Google OAuth integration support

## High-Level Architecture

```text
React (Vite) SPA
   |
   | HTTP (JWT Bearer token)
   v
FastAPI app (routes + auth + validation)
   |
   v
MongoDB collections
```

### Request Flow (Typical)

1. User signs in (standard or Google-based flow).
2. Backend issues JWT token.
3. Frontend stores token in local storage.
4. Axios interceptor attaches token on every API request.
5. FastAPI dependencies validate token + role authorization.
6. Route handler performs MongoDB read/write operations.
7. Response updates dashboard/widgets in frontend.

## Repository Structure

```text
backend/
  main.py              # FastAPI app bootstrap and router registration
  config.py            # Environment loading + Mongo collections
  seed.py              # Optional seed/bootstrapping script
  models/              # Pydantic schemas
  routes/              # Feature route modules
  uploads/             # Runtime file uploads (ignored in git)

frontend/
  src/
    api/               # Axios client and API configuration
    context/           # Auth/theme context state
    components/        # Shared UI and routing guards
    pages/             # Role dashboards and feature pages
```

## Functional Areas

### Authentication and Authorization

- JWT-based auth for API access
- role-guarded frontend routes through protected route wrapper
- backend-enforced role checks for route access

### Subjects and Learning Content

- subject-level organization
- teacher-controlled content posting
- student-level subject detail views

### Assignments and Submissions

- assignment creation and management
- file submission support
- uploaded assets stored under configured uploads directory

### MCQ Tests

- test creation and configuration
- attempt handling and score tracking

### Chat and Notifications

- subject-based communication threads
- user notifications for activity updates

### Calendar and Events

- student and teacher task calendars
- holiday/event management for academic planning

## API Documentation Access

The backend secures OpenAPI docs and disables public default docs URLs.

- `/docs`
- `/redoc`
- `/openapi.json`

These endpoints require credentials from environment variables:

- `SWAGGER_USER`
- `SWAGGER_PASSWORD`

## Prerequisites

- Node.js 18+
- Python 3.10+
- MongoDB 6+

## Local Development Setup

### 1) Clone project

```bash
git clone <your-repo-url>
cd test1
```

### 2) Setup backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Update values in `backend/.env`, then run:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3) Setup frontend

In another terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Default development URL: `http://localhost:5173`

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string |
| `DATABASE_NAME` | Yes | Database name |
| `MONGO_SERVER_SELECTION_TIMEOUT_MS` | No | Mongo timeout in milliseconds |
| `DEV_MODE` | Yes | Enable development-only behavior (`true` for local only, `false` in production) |
| `JWT_SECRET` | Yes | JWT signing secret |
| `JWT_ALGORITHM` | Yes | JWT algorithm (default `HS256`) |
| `JWT_EXPIRY_HOURS` | Yes | JWT expiration in hours |
| `COLLEGE_EMAIL_DOMAIN` | Yes | Allowed institutional domain |
| `GOOGLE_CLIENT_ID` | Recommended | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | OAuth secret if required by flow |
| `UPLOAD_DIR` | Yes | Runtime file storage location |
| `ADMIN_EMAIL` | Recommended | Admin identity/bootstrap value |
| `CORS_ALLOW_ORIGINS` | Yes | Comma-separated frontend origins |
| `SWAGGER_USER` | Recommended | API docs basic-auth user |
| `SWAGGER_PASSWORD` | Recommended | API docs basic-auth password |
| `GEMINI_API_KEY` | Optional | AI integration key |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Optional | Explicit API base URL override |

If `VITE_API_BASE_URL` is not set, the frontend computes a default based on host.

## Developer Commands

### Frontend

- `npm run dev` — start Vite dev server
- `npm run build` — build production bundle
- `npm run lint` — run ESLint
- `npm run preview` — preview production build

### Backend

- `uvicorn main:app --reload --host 0.0.0.0 --port 8000` — run API locally

## Data and Runtime Storage

- Runtime uploads are stored in `backend/uploads` (ignored in git).
- MongoDB stores users, subjects, materials, assignments, tests, chat, notifications, and calendar data.
- Temporary caches and virtual environments must never be committed.

## Public Repository Safety Checklist

This project had local sensitive/runtime files during development. Complete this checklist before public release.

### 1) Rotate any exposed secrets

- Google OAuth credentials
- API keys (including AI provider keys)
- JWT secret
- any key that was ever present in committed `.env` files

### 2) Ensure ignore rules exist

Root `.gitignore` already includes env files, uploads, cache directories, `node_modules`, and virtual env folders.

### 3) Untrack sensitive/local files already in git index

```bash
git rm --cached backend/.env || true
git rm --cached frontend/.env || true
git rm -r --cached backend/uploads || true
git rm -r --cached backend/venv || true
find backend -type d -name '__pycache__' -prune -exec git rm -r --cached {} + 2>/dev/null || true
```

### 4) Commit and push cleanup

```bash
git add .
git commit -m "chore: prepare repository for public release"
git push origin main
```

### 5) Rewrite history if secrets were committed before

Recommended tools:

- `git filter-repo`
- BFG Repo-Cleaner

Purge at least:

- `backend/.env`
- `backend/uploads/**`
- `backend/venv/**`

Then force push safely:

```bash
git push --force-with-lease origin main
```

## Troubleshooting

### Frontend cannot reach API

- verify backend is running on port `8000`
- verify `VITE_API_BASE_URL` if using custom host/port
- verify CORS origins in `CORS_ALLOW_ORIGINS`

### Unauthorized responses after login

- ensure token exists in local storage
- ensure backend JWT settings are consistent
- clear local storage and login again

### File uploads failing

- verify `UPLOAD_DIR` exists and is writable
- check backend logs for request validation errors

## Contributing

1. Create a feature branch.
2. Keep changes scoped and test locally.
3. Do not commit `.env`, runtime uploads, caches, or local virtualenv folders.
4. Open a pull request with clear context and screenshots (if UI changes).

## License

Add a `LICENSE` file before publishing (MIT is a common default for open-source projects).
