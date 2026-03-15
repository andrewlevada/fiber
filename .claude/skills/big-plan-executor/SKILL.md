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

You are orchestrating the execution of a multi-phase implementation plan. Your
job is to manage subagents efficiently, preserve context when possible, and keep
the user informed of progress.

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

Before starting, identify the phases in the existing plan. Plans come in many
formats - adapt to what's there:

- Markdown headers: `## Phase 1`, `### Step 1`, `# Part A`
- Numbered sections: `1. First phase`, `2. Second phase`
- Bullet lists with clear separations
- Custom formats the user has defined

Extract and track in your context (no files needed):

- Phase name/title
- Phase description/tasks
- Current status (pending/in_progress/completed)
- Agent ID and tokens used (after each phase completes)

## Step 2: Display Progress

Before each phase, show a progress bar:

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

Legend: `✓` completed, `→` in progress, `○` pending, `✗` failed

## Step 3: Launch or Resume Subagent

### Deciding: New Agent vs Resume

Check the `total_tokens` from the previous agent's response. Model context limit
is ~180k tokens.

**Rule: If cumulative tokens >60% of context (~108k), spawn a new agent.
Otherwise, resume.**

Resuming preserves context (agent remembers previous work). Fresh agents have
full context but need a summary of what was accomplished.

### Launching a New Agent

```
Agent tool:
- subagent_type: "general-purpose"
- prompt: Phase description + summary of previous phases + success criteria
- Include: "If you need clarification, use AskUserQuestion"
```

### Resuming an Existing Agent

```
Agent tool:
- resume: <agent_id from previous phase>
- prompt: "Continue to the next phase: <phase description>"
```

## Step 4: Handle Results

### If the agent asked a question (AskUserQuestion)

1. **Stop** - Don't proceed to next phase
2. **Forward** - Show user the exact question
3. **Wait** - Let user respond
4. **Update plan** - Modify the plan file to incorporate user's decision
5. **Resume** - Continue with `resume: <agent_id>`

### If the phase failed

Show user: what went wrong, the error, options (retry/skip/abort/modify plan)

### If the phase succeeded

1. Track: mark completed, record agent_id and tokens_used
2. Check token threshold for new agent vs resume
3. Continue to next phase

## Step 5: Completion

Show final summary:

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
  - ...
═══════════════════════════════════════════════════════════════
```

## Important Behaviors

### No Persistent State Files

Track all state in your conversation context - don't create workspace folders or
state files. This keeps the repo clean and avoids gitignore concerns.

### Context Preservation

When spawning a new agent (after hitting token threshold), provide a thorough
but concise summary of what previous phases accomplished so the new agent
understands the current state.

### Plan Modification

When updating the plan after a user answers a question:

- Modify the original plan file directly
- Only change the affected phase(s)
- Preserve overall structure
