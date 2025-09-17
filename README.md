# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/d72f994b-a5ea-4576-9ca4-d402ed584553

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/d72f994b-a5ea-4576-9ca4-d402ed584553) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/d72f994b-a5ea-4576-9ca4-d402ed584553) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

---

## Full‑stack setup (API + MySQL)

This project now includes a lightweight Node/Express API server with a MySQL connection. During development, the Vite dev server proxies all `/api/*` requests to the API server to avoid 404s and CORS issues.

### 1) Prerequisites

- Node.js 18+
- MySQL Server 5.7+/8+

### 2) Environment variables

Copy `.env.sample` to `.env` and adjust values:

```bash
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=clinicare
DB_CONNECTION_LIMIT=10
```

### 3) Install dependencies

```sh
npm install
```

This installs both frontend and backend deps (Express, mysql2, etc.).

### 4) Start development (frontend + backend)

In one terminal, run both servers concurrently:

```sh
npm run dev:full
```

- Frontend (Vite) runs at http://localhost:8080
- API (Express) runs at http://localhost:5000
- API routes are available under `/api/*` and proxied by Vite, so frontend code can call `/api/...` without hardcoding ports.

Available API examples:

- `GET /api/health` – checks DB connectivity
- `GET /api/ping` – simple ping
- `GET /api/users` – sample query (requires a `users` table with `id, name, email` columns)

### 5) Building for production

```sh
npm run build
```

This builds the React app into `dist/`. If you want the Express server to serve the built SPA, uncomment the static‑serve lines inside `server/index.cjs` and run:

```sh
npm run server
```

Alternatively, deploy the `dist/` folder to a static host and deploy the API (the `server/` directory) to a Node host. Ensure your production host proxies `/api/*` to the API server or configure CORS accordingly.

### 6) Reducing 404 errors

- Development: `vite.config.ts` proxies `/api` to `http://localhost:5000` which prevents 404s for API calls.
- SPA routing: the app defines routes in `src/App.tsx`. When deploying to a static host, enable SPA fallback (serve `index.html` for unknown paths) so deep links don’t 404.
- API: unknown API routes return JSON 404 from Express to help debugging.

### 7) Registration API and DB schema

Endpoint: `POST /api/register`

Payload:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123",
  "role": "patient" // one of: patient | doctor | admin (defaults to patient)
}
```

The server hashes passwords with bcrypt and stores them in `users.password_hash`.

Required table columns:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('patient','doctor','admin') NOT NULL DEFAULT 'patient',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Testing registration:

- From the UI: navigate to `/register` and create an account.
- From API: `curl -X POST http://localhost:5000/api/register -H "Content-Type: application/json" -d '{"name":"John","email":"john@example.com","password":"secret","role":"patient"}'`
