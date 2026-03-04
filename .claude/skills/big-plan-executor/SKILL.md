---
name: big-plan-executor
description: |
  Executes multi-phase implementation plans by orchestrating subagents intelligently across phases.
  Use this skill when you have a plan with distinct phases (like "Phase 1: Set up database",
  "Phase 2: Create API endpoints") and want to execute them with smart context management.
  Triggers on: "execute this plan", "run the plan", "implement these phases", or when you see
  a structured plan with multiple phases that needs implementation. Also use when the user
  says things like "do all of this", "implement everything", or references a plan file.
---

# Big Plan Executor

You are orchestrating the execution of a multi-phase implementation plan. Your job is to manage subagents efficiently, preserve context when possible, and keep the user informed of progress.

## Core Loop

```
For each phase (max 10):
  1. Display progress bar
  2. Launch or resume subagent for current phase
  3. Wait for completion
  4. Check result:
     - Question asked? → Pause, forward to user, update plan, continue
     - Failure? → Show to user, ask how to proceed
     - Success? → Check token usage, decide: new agent or resume
  5. Move to next phase
```

## Step 1: Parse the Plan

Before starting, identify the phases in the existing plan. Plans come in many formats - adapt to what's there:

- Markdown headers: `## Phase 1`, `### Step 1`, `# Part A`
- Numbered sections: `1. First phase`, `2. Second phase`
- Bullet lists with clear separations
- Custom formats the user has defined

Extract:
- Phase name/title
- Phase description/tasks
- Any dependencies between phases

Save your understanding to a tracking file:

```
<workspace>/execution-state.json
{
  "plan_source": "<path or 'inline'>",
  "total_phases": 4,
  "phases": [
    {"id": 1, "name": "Set up database", "status": "pending", "agent_id": null, "tokens_used": 0},
    {"id": 2, "name": "Create API", "status": "pending", "agent_id": null, "tokens_used": 0}
  ],
  "current_phase": 1,
  "last_agent_id": null,
  "last_agent_tokens": 0
}
```

## Step 2: Display Progress

Before each phase, show a progress bar. Use a simple ASCII format:

```
═══════════════════════════════════════════════════════════════
  Phase 2/4: Create API endpoints
  [████████░░░░░░░░░░░░░░░░] 25%

  ✓ Phase 1: Set up database (completed)
  → Phase 2: Create API endpoints (in progress)
  ○ Phase 3: Add authentication
  ○ Phase 4: Write tests
═══════════════════════════════════════════════════════════════
```

Legend:
- `✓` = completed
- `→` = in progress
- `○` = pending
- `✗` = failed

## Step 3: Launch or Resume Subagent

### Deciding: New Agent vs Resume

Check the token usage from the previous agent (from the Agent tool's response):
- `total_tokens` in the result tells you how many tokens were used
- Model context limits (approximate): Sonnet ~180k, Opus ~180k, Haiku ~180k

**Rule: If previous agent used >60% of context (~108k tokens), spawn a new agent. Otherwise, resume.**

Why? Resuming preserves context (the agent remembers what it did), but if context is nearly full, the agent will start forgetting or hitting limits. Fresh agents have full context but no memory of previous work.

### Launching a New Agent

```
Use the Agent tool:
- subagent_type: "general-purpose"
- prompt: Include the phase description and any relevant context from previous phases
- run_in_background: false (we need to wait for results)
```

Your prompt to the subagent should include:
1. The specific phase to implement
2. Summary of what previous phases accomplished (if any)
3. Clear success criteria for this phase
4. Instruction: "If you need clarification, use AskUserQuestion"

### Resuming an Existing Agent

```
Use the Agent tool with:
- resume: <agent_id from previous phase>
- prompt: "Continue to the next phase: <phase description>"
```

## Step 4: Handle Results

When the subagent completes, check the result:

### If the agent asked a question (AskUserQuestion was used)

The agent's response will indicate it paused for user input. You should:

1. **Stop execution** - Don't proceed to the next phase
2. **Forward the question** - Show the user exactly what was asked
3. **Wait for answer** - Let the user respond
4. **Update the plan** - Based on their answer, modify the relevant phase in the plan:
   - Read the current plan
   - Rewrite the affected phase(s) to incorporate the user's decision
   - Save the updated plan
5. **Resume** - Continue from where the agent left off (use `resume` with the agent_id)

Example flow:
```
Agent: "Should I use PostgreSQL or SQLite for the database?"
You: Forward this to user
User: "PostgreSQL, we need concurrent connections"
You: Update plan phase to specify PostgreSQL, then resume agent with the answer
```

### If the phase failed

Show the user:
- What went wrong
- The error or blocker
- Options: retry, skip, abort, or modify plan

### If the phase succeeded

1. Update execution-state.json:
   - Mark phase as "completed"
   - Record agent_id and tokens_used
2. Check if more phases remain
3. Decide new agent vs resume based on token usage
4. Continue to next phase

## Step 5: Completion

When all phases are done (or max 10 reached), show a final summary:

```
═══════════════════════════════════════════════════════════════
  Plan Execution Complete!
  [████████████████████████] 100%

  ✓ Phase 1: Set up database
  ✓ Phase 2: Create API endpoints
  ✓ Phase 3: Add authentication
  ✓ Phase 4: Write tests

  Total phases: 4
  Agents spawned: 2 (resumed 2 times)

  Summary of changes:
  - Created src/db/schema.ts
  - Added 5 API routes in src/api/
  - Implemented JWT auth middleware
  - Added 12 test files
═══════════════════════════════════════════════════════════════
```

## Important Behaviors

### Context Preservation
When resuming an agent, it has full memory of its previous work. When spawning a new agent, you must provide context about what was accomplished. Be thorough but concise - the new agent needs to understand the current state without re-reading everything.

### Plan Modification
When updating the plan after a user answers a question:
- Only modify the affected phase(s)
- Preserve the overall structure
- Add specificity based on the user's decision
- Don't remove phases unless the user explicitly says to

### Error Recovery
If an agent fails mid-phase:
- Capture what was accomplished
- Show the user the state
- Offer to retry with modifications or skip

### Token Tracking
The Agent tool returns `total_tokens` in its result. Store this in execution-state.json after each phase to inform the new-vs-resume decision.

## Workspace Structure

Create a workspace directory for tracking:

```
.claude/plan-execution/
├── execution-state.json    # Current state, progress, agent IDs
├── plan-snapshot.md        # Copy of original plan (for reference)
└── plan-current.md         # Working copy (gets modified)
```
