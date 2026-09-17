# Agent Coding Guidelines

## 1. Documentation & Comments (CRITICAL)
- **Add Comments Everywhere:** All code (backend, frontend, UI components, and configs) must be very, very well commented and fully explained.
- **Frontend & UI Elements:** Every single React component must have comments explaining its state hooks, user interactions, layout decisions, and conditional rendering (e.g., loading states, error boundaries).
- **Explain the "Why":** Do not just describe *what* the code does; explain *why* the implementation was chosen, especially for complex logic, edge cases, and business rules.
- **Function/Component Level:** Every function, component, Server Action, and API route must have a leading comment block explaining its purpose, arguments, and return types.
- **Inline Comments:** Use frequent inline comments to break down complex operations step-by-step so the code acts as its own documentation.
- **Maintainability:** Assume the reader is a new developer on the project who needs full context on how this file fits into the broader architecture.

*(Add future agent instructions below)*

## 2. Database Configuration & Supabase (CRITICAL)
- **Supabase Connection Pooler Bug:** Supabase's transaction pooler (port 6543 / Supavisor) has a known bug where it sporadically truncates long tenant usernames (e.g., throwing `(ENOTFOUND) tenant/user postgres.jzwyjg not found`). This is NOT a code syntax error. 
- **Resolution Strategy:** To prevent this, always ensure both `DATABASE_URL` and `DIRECT_URL` in `.env` bypass the transaction pooler and point directly to the native session port (5432) for local development environments. Do not assume database errors with code `XX000` are caused by Prisma schema naming mistakes.


