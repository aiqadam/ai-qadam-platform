# AI Qadam - Documentation

Documentation is organized into five layers, from intent down to implementation. Read top to bottom to go from *why* to *how*.

1. **[Layer 1 - Business](01-business/README.md)** - Why AI Qadam exists. Community principles and ideas, vision and strategy, the domain glossary, and governing policies. Read this layer first to understand intent before anything technical.
2. **[Layer 2 - Business processes](02-business-processes/README.md)** - How the organization and community operate day to day. Operator playbooks, marketing and decision processes, and the operational runbooks operators follow to run events, leads, and member flows.
3. **[Layer 3 - Requirements](03-requirements/README.md)** - What the product must do. Feature surfaces and the v1->v2 parity matrix, sprint and adoption plans, and per-feature delivery plans.
4. **[Layer 4 - Development](04-development/README.md)** - How we build and run the platform. Code standards and workflow, architecture, and per-discipline guides: backend, frontend, design-system, testing, infrastructure, and security.
5. **[Layer 5 - Other](05-other/README.md)** - Cross-cutting and meta material that does not belong to a single layer: engineering/product handover, critical reviews, how we collaborate with the AI agent, and agent task prompts.

## Decision log

Architecture Decision Records remain a single chronological, immutable log in [`adr/`](adr/). Each layer index links to the ADRs most relevant to it. See [ADR-0039](adr/0039-five-layer-doc-architecture.md) for the rationale behind this structure.

## Agent operating context

`/.claude/CLAUDE.md` is the entry point the agent runtime auto-loads at session start; its required-reading list points into the layers above.
