# Security Policy

## Reporting a Vulnerability

I take security seriously. If you discover a security vulnerability, please report it privately rather than opening a public issue.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### Private Reporting

- **GitHub Security Advisory**: Use the [Private Vulnerability Reporting](https://github.com/BoozeLee/beehive-studio/security/advisories/new) feature.
- **Email**: Send details to [your security email] with `SECURITY` in the subject line.
- **Signal/Encrypted**: Available upon request for highly sensitive findings.

### What to Include

- Description of the vulnerability and potential impact
- Steps to reproduce or proof-of-concept
- Affected versions/commits
- Suggested fix (if available)

### Process

1. You submit a report via one of the channels above
2. I acknowledge within 48 hours
3. I investigate and determine impact
4. A fix is developed and tested
5. A security advisory is published (credit given unless you prefer anonymity)
6. A patch release is issued

### Scope

- Main branch and recent releases
- Configuration files, CI/CD workflows, API endpoints
- Dependency chains and supply chain risks

### Out of Scope

- Issues already reported publicly
- Vulnerabilities in forked or archived repositories
- Social engineering attacks
- DOS attacks

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |
| < 1.0   | :x:                |

## Security Best Practices

- All dependencies are monitored via Dependabot
- CodeQL static analysis runs on every PR and weekly
- Secret scanning with push protection is enabled
- Workflows use least-privilege permissions
- Actions are pinned to commit SHAs where possible
