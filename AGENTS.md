# Repository Guidelines

## Project Structure & Module Organization
Each microservice lives in its own folder (`api-gateway`, `ltv-assistant-auth`, `-datasource`, `-indexing`, `-retrieval`, `-mcp`) with the React CMS in `ltv-assistant-cms`. Nest services follow the standard layout (`src/` for application logic, `test/` for Jest suites), and the CMS keeps feature modules inside `src/modules/*`. Reference architecture notes sit in `docs/`, while root-level `docker-compose.yml` and `scripts/` provide local orchestration.

## Build, Test, and Development Commands
- `npm run install:all` prepares every service (preferred over installing one-by-one).
- `npm run docker:up` / `npm run docker:down` bootstraps MySQL, Redis, MinIO, and tooling via Compose.
- `cd <service> && npm run start:dev` starts an individual Nest service with live reload; `cd ltv-assistant-cms && npm run dev` launches the admin UI on port 30000.
- `npm run build:all` produces production bundles; `npm run check:all` chains format, lint, and build for every package.

## Coding Style & Naming Conventions
TypeScript is used repo-wide with strict typing. Format with Prettier (2-space indentation, single quotes, semicolons) via `npm run format`, and keep ESLint clean (`npm run lint`). Prefer CamelCase for classes/services, camelCase for variables, and SCREAMING_SNAKE_CASE for environment variables. React components live under `src/modules/<Feature>/<Component>.tsx` and use PascalCase filenames.

## Testing Guidelines
Nest services rely on Jest; place unit specs beside sources as `<name>.spec.ts`, and e2e specs inside `test/` called by `npm run test:e2e`. Run `npm run test` for fast suites, `npm run test:cov` before merging, and add regression cases for each new handler or resolver. CMS code uses Vitest (`cd ltv-assistant-cms && npm test`) for hooks and complex UI logic.

## Commit & Pull Request Guidelines
Adopt short, present-tense subjects similar to the existing history (`add tracing`, `update documents`). Keep commits scoped to one concern and describe the user-facing effect or subsystem touched. Pull requests should include a problem statement, summary of service-level changes, test evidence (`npm run test`, `npm run lint`), and screenshots for CMS work, plus links to issues or task IDs.

## Security & Configuration Tips
Duplicate the relevant `.env.example` inside every service directory and never commit real secrets. Use the Compose stack so MySQL, Redis, Qdrant, and MinIO credentials match the defaults in `README.md`. When exposing services, store JWT secrets and OAuth keys in a password manager and rotate them ahead of production cutovers.
