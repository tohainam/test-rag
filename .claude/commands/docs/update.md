---
description: Analyze the codebase and update documentation
---

# Critical rules

Always update documentation as write new documents (not use updated, new way or something like that...)

Use `docs/` directory as the source of truth for documentation.
Use `docs-manager` agent to analyze the codebase and update documentation:

- `README.md`: Update README
- `docs/project-overview-pdr.md`: Update project overview and PDR (Product Development Requirements)
- `docs/codebase-summary.md`: Update codebase summary
- `docs/code-standards.md`: Update codebase structure and code standards
- `docs/system-architecture.md`: Update system architecture
- `docs/diagrams.md`: Update all diagrams for system using mermaid
- `docs/project-roadmap.md`: Update project roadmap
- `docs/deployment-guide.md` [optional]: Update deployment guide
- `docs/design-guidelines.md` [optional]: Update design guidelines

## Additional requests

<additional_requests>
$ARGUMENTS
</additional_requests>

**IMPORTANT**: **Do not** start implementing.
