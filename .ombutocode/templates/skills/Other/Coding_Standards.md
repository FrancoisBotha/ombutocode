---
system: true
---

# Coding Standards

## Overview

This skill defines the coding standards and conventions for this project. It serves as a reference for both human developers and AI coding agents.

## Naming Conventions

- **Variables and functions**: camelCase
- **Classes and components**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Files**: kebab-case for utilities, PascalCase for components

## Code Style

- Use 2-space indentation
- Maximum line length: 100 characters
- Always use semicolons
- Prefer const over let; avoid var
- Use template literals over string concatenation

## Error Handling

- Always handle async errors with try/catch
- Log errors with contextual information
- Never swallow errors silently

## Documentation

- Add JSDoc comments to exported functions
- Keep comments focused on "why", not "what"
- Update documentation when changing public APIs

## Git Conventions

- Use conventional commit messages (feat:, fix:, chore:, docs:)
- One logical change per commit
- Keep PRs focused and reviewable
