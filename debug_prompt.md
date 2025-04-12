
# 🧠 Copilot Custom Debugging & Validation Prompt — SpaceWH AI Platform

Welcome to the debugging and QA workflow for the SpaceWH project. This file combines:
- Copilot instructions
- Validation objectives
- Debugging phases
- Rules checklist
- Error tagging system

---

## ✅ TASK: Debug, Validate, and Finalize SpaceWH Code

### Project Type: `boomerang`
> Copilot will guide you through a structured review and approval-based debugging of this codebase.

---

## 🔍 PHASED DEBUGGING WORKFLOW

### **PHASE 1: STRUCTURE & CONFIG VALIDATION**
- Scan all folders, configs, `.env`, manifests, Docker, etc.
- Detect outdated, missing, or misconfigured elements.
- Validate against architecture plans (FastAPI, Supabase, OpenWebUI, MCP, Ollama, etc.)

### **PHASE 2: PROJECT GOALS ALIGNMENT**
- Match actual implementation with platform goals:
  - Secure onboarding
  - Membership gating
  - Agentic backend
  - Shared component reuse
  - CI/CD readiness

### **PHASE 3: ERROR DEBUGGING (Approval-Based)**
For each issue:
- Explain it in simple terms.
- Why it matters.
- What it breaks.
- How to fix it.
- Assign one of the following tags:

```
[RED - Critical] → Blocks launch, breaks major flows.
[ORANGE - Major] → Functional bug, breaks part of the app.
[YELLOW - Moderate] → Output bug, minor feature issue.
[GRAY - Low] → Styling, optimization, or cleanup.
[GREEN - Info] → Best practice or recommendation.
```

---

## 📌 PROJECT RULES (MANDATORY)

These apply to all Copilot-generated code or fixes.

📁 **[Click here to view full rules → Copilot_Boomerang_Rules.json](Copilot_Boomerang_Rules.json)**

Highlights:

### Objectives
- No placeholder code
- Full A-to-Z implementation
- 300–500 lines per file
- Prevent logic duplication
- Validate auth, onboarding, chat flows
- CI-ready + production-safe

### Required Checks
- ✅ Replace all `...`, `TODO`, and non-functional stubs
- ✅ Reuse logic from `@shared/*`
- ✅ Add rate limit, JWT, error boundary tests
- ✅ Docker Compose boot must trigger full system
- ✅ Membership Key → AI Chat Flow tested E2E

---

## 🧪 Final Notes
- Use `Vitest`, `Jest`, `Pytest` for tests
- Add `.env.example` for onboarding
- Setup Husky for pre-commit validation
- Update README with debugging status

---

> Start with PHASE 1. Present issues **one-by-one**. Wait for user approval before fixing.
