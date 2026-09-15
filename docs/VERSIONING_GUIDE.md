# Versioning Guide

## Single Version Scheme

Ignition Toolbox uses a **single version number** tracked in two places:

| File | Example |
|------|---------|
| `package.json` | `"version": "2.0.0"` |
| `frontend/package.json` | `"version": "2.0.0"` |

These two files must always match. This version is what users see in the app, in GitHub Releases, and in auto-update notifications.

### Backend Version

The backend `pyproject.toml` has its own `version` field, but this is **internal only** and not user-facing. It does not need to match the Electron app version. Do not reference the backend version in user-facing documentation.

## Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

```
MAJOR.MINOR.PATCH    (e.g. 1.5.0)
```

| Increment | When |
|-----------|------|
| **MAJOR** | Breaking changes to playbook syntax, API, or database schema |
| **MINOR** | New features (step types, pages, endpoints) that are backwards compatible |
| **PATCH** | Bug fixes, performance improvements, documentation |

Release mechanics (tagging, GitHub Actions, installers) are in `CLAUDE.md`.

## Version Bump Checklist

- [ ] Update `package.json` version
- [ ] Update `frontend/package.json` version
- [ ] Commit changes
- [ ] Create git tag (`git tag vX.Y.Z`)
- [ ] Push tag (`git push origin vX.Y.Z`)
- [ ] Verify GitHub Actions build succeeds

