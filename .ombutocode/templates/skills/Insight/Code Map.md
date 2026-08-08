---
system: true
---

# Code Map Skill

Analyze the current codebase. Do not modify product code. Only create or update files under `docs/Code Map/`.

Ignore vendor, build, dist, cache, and other generated directories.

Also exclude `.ombutocode/` entirely. It holds the workflow tooling that manages this project, not the product being built, so it must never appear in the map — no nodes, no edges, no flow steps, and no fingerprints. Record it in the excluded directories list in `codemap.lock`.

If `docs/Code Map/` already exists, first compare the existing `codemap.lock` with the current repo and list the modules that changed. Then regenerate these three files together.

---

## 1. `docs/Code Map/codemap.html`

Build a fully self-contained interactive code map that opens in the app. Include:

- major modules, services, databases, queues, and external dependencies
- no more than 20 primary nodes; group low-level files under their parent module
- calls and data flows between modules
- the 3-5 most important end-to-end flows
- a clear dark theme by default
- system boundaries and the most important data flows visible on the first screen
- color-coded module types with a simple legend
- automatic layout that minimizes crossing edges
- clicking any module highlights its upstream callers, downstream dependencies, related tests, and the flows it belongs to
- selecting a flow highlights its complete path
- search, filtering, zoom, and drag controls

At the top, show the repo name, generation time, and the commit it was generated from.

The file must be self-contained: inline all CSS and JavaScript, no external network requests.

---

## 2. `docs/Code Map/codemap.json`

Use this structure:

```json
{
  "generated_at": "",
  "generated_from_commit": "",
  "scope": [],
  "nodes": [],
  "edges": [],
  "flows": []
}
```

Each node must include:

- `id`
- `path`
- `role`
- `entrypoints`
- `tests`
- `constraints`
- `evidence`

Each edge must include:

- `from`
- `to`
- `type`
- `evidence`

`type` may only be:

- `imports`
- `calls`
- `reads`
- `writes`
- `publishes`
- `subscribes`

Each flow must include:

- `trigger`
- `steps`
- `outcome`

Every step must reference an existing node id.

Attach the matching source path and symbol to every node and edge. Mark any relationship without source evidence as `unknown`. Do not guess.

---

## 3. `docs/Code Map/codemap.lock`

Use parseable JSON to record:

- the current commit
- whether the working tree has uncommitted changes
- generation time
- scanned scope
- excluded directories
- the fingerprint algorithm
- a deterministic fingerprint for each top-level module, calculated from its tracked file paths and current file contents

If no existing `codemap.lock` is found, treat every module as new and generate the full map.

---

## Verification

When finished, verify that:

- `codemap.json` parses successfully
- every node path exists and every evidence symbol can be found in the source
- no node, edge, flow step, or fingerprint references a path under `.ombutocode/`
- every edge and flow step references an existing node
- `codemap.html` and `codemap.json` use the same nodes, edges, and flows
- `codemap.lock` matches the current commit, working tree state, and module fingerprints
- every relationship without source evidence is marked `unknown`

These three files must always be generated together from the current repo. Never edit only one of them manually.

---

## Report

Finally, show:

- files created or modified
- stale modules
- remaining unknowns
- validation results
- the complete diff
