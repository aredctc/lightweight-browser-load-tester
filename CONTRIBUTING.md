# Contributing to Lightweight Browser Load Tester

Thank you for your interest in contributing to the Lightweight Browser Load Tester! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project adheres to a code of conduct that we expect all contributors to follow. Please be respectful and constructive in all interactions.

### Our Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Git
- Docker (for containerization testing)
- kubectl (for Kubernetes testing)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/lightweight-browser-load-tester.git
   cd lightweight-browser-load-tester
   ```

3. Add the upstream repository:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/lightweight-browser-load-tester.git
   ```

## Development Setup

### Install Dependencies

```bash
# Install project dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

### Build the Project

```bash
# Build TypeScript to JavaScript
npm run build

# Watch for changes during development
npm run dev
```

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint
```

## Contributing Guidelines

### Types of Contributions

We welcome various types of contributions:

- **Bug fixes**: Fix issues in the codebase
- **Feature additions**: Add new functionality
- **Documentation improvements**: Enhance docs, examples, or comments
- **Performance optimizations**: Improve efficiency and resource usage
- **Test coverage**: Add or improve tests
- **Configuration examples**: Add new test scenarios
- **Kubernetes deployments**: Improve cloud provider support

### Coding Standards

#### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow existing code style and formatting
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Prefer async/await over Promises where appropriate

#### Code Organization

- Keep functions small and focused
- Use proper error handling
- Follow SOLID principles
- Maintain separation of concerns

#### Example Code Style

```typescript
/**
 * Manages browser instance lifecycle and resource optimization
 */
export class BrowserPool {
  private instances: Map<string, ManagedBrowserInstance> = new Map();
  private config: BrowserPoolConfig;

  constructor(config: BrowserPoolConfig) {
    this.config = config;
  }

  /**
   * Acquire an available browser instance from the pool
   * @returns Promise resolving to a managed browser instance
   */
  async acquireInstance(): Promise<ManagedBrowserInstance> {
    // Implementation here
  }
}
```

### Commit Messages

Use clear, descriptive commit messages following conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(kubernetes): add Azure AKS deployment support

Add Kustomize overlays and documentation for deploying
to Azure Kubernetes Service with Workload Identity.

Closes #123

fix(drm): handle license acquisition timeout properly

Improve error handling when DRM license requests timeout
to prevent browser session crashes.

docs(api): add examples for programmatic usage

Add comprehensive examples showing how to use the
LoadTesterApp class programmatically.
```

## Pull Request Process

### Before Submitting

1. **Update your fork:**
   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes:**
   - Write code following the style guidelines
   - Add tests for new functionality
   - Update documentation as needed
   - Ensure all tests pass

4. **Test your changes:**
   ```bash
   npm test
   npm run lint
   npm run build
   ```

### Submitting the Pull Request

1. **Push your branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create the pull request:**
   - Go to GitHub and create a pull request
   - Use a clear, descriptive title
   - Fill out the pull request template
   - Link any related issues

3. **Pull request template:**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Documentation update
   - [ ] Performance improvement
   - [ ] Other (please describe)

   ## Testing
   - [ ] Tests pass locally
   - [ ] Added tests for new functionality
   - [ ] Manual testing completed

   ## Checklist
   - [ ] Code follows project style guidelines
   - [ ] Self-review completed
   - [ ] Documentation updated
   - [ ] No breaking changes (or clearly documented)
   ```

### Review Process

1. **Automated checks:** CI/CD pipeline runs tests and linting
2. **Code review:** Maintainers review the code
3. **Feedback:** Address any requested changes
4. **Approval:** Once approved, the PR will be merged

## Issue Reporting

### Bug Reports

When reporting bugs, please include:

- **Environment information:**
  - Operating system and version
  - Node.js version
  - npm version
  - Browser version (if relevant)

- **Steps to reproduce:**
  - Clear, numbered steps
  - Expected vs actual behavior
  - Error messages and stack traces

- **Configuration:**
  - Test configuration used
  - Command-line arguments
  - Environment variables

**Bug report template:**
```markdown
## Bug Description
Clear description of the bug

## Environment
- OS: [e.g., macOS 12.0, Ubuntu 20.04]
- Node.js: [e.g., 18.17.0]
- npm: [e.g., 9.6.7]
- Tool version: [e.g., 1.0.0]

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Error Messages
```
Error message here
```

## Configuration
```yaml
# Your configuration file
```
```

### Feature Requests

For feature requests, please include:

- **Use case:** Why is this feature needed?
- **Proposed solution:** How should it work?
- **Alternatives:** Other solutions considered
- **Additional context:** Screenshots, examples, etc.

## Development Workflow

### Project Structure

```
├── src/                    # Source code
│   ├── aggregators/       # Result aggregation
│   ├── config/           # Configuration management
│   ├── controllers/      # Test orchestration
│   ├── exporters/        # Metrics export
│   ├── interceptors/     # Request interception
│   ├── managers/         # Resource management
│   └── types/           # TypeScript definitions
├── k8s/                  # Kubernetes manifests
├── docs/                 # Documentation
├── test-configs/         # Example configurations
├── scripts/              # Utility scripts
└── tests/               # Test files
```

### Adding New Features

1. **Design:** Discuss the feature in an issue first
2. **Implementation:** Follow existing patterns and conventions
3. **Testing:** Add comprehensive tests
4. **Documentation:** Update relevant documentation
5. **Examples:** Add configuration examples if applicable

### Working with Kubernetes

When contributing Kubernetes-related changes:

1. **Test locally:** Use Minikube or Kind
2. **Multi-cloud:** Consider AWS EKS, GKE, and AKS
3. **Security:** Follow Kubernetes security best practices
4. **Documentation:** Update the Kubernetes deployment guide

## Testing

### Test Categories

1. **Unit tests:** Test individual functions and classes
2. **Integration tests:** Test component interactions
3. **End-to-end tests:** Test complete workflows
4. **Performance tests:** Validate resource usage

### Writing Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BrowserPool } from '../src/managers/browser-pool';

describe('BrowserPool', () => {
  let browserPool: BrowserPool;

  beforeEach(() => {
    browserPool = new BrowserPool({
      maxInstances: 5,
      minInstances: 1,
      resourceLimits: {
        maxMemoryPerInstance: 512,
        maxCpuPercentage: 80,
        maxConcurrentInstances: 10
      }
    });
  });

  afterEach(async () => {
    await browserPool.cleanup();
  });

  it('should acquire browser instance', async () => {
    const instance = await browserPool.acquireInstance();
    expect(instance).toBeDefined();
    expect(instance.id).toBeTruthy();
  });
});
```

### Running Specific Tests

```bash
# Run specific test file
npm test -- browser-pool.test.ts

# Run tests matching pattern
npm test -- --grep "BrowserPool"

# Run tests with coverage
npm test -- --coverage
```

## Documentation

### Types of Documentation

1. **API documentation:** JSDoc comments in code
2. **User guides:** Markdown files in `docs/`
3. **Examples:** Configuration files in `test-configs/`
4. **README:** Main project documentation

### Documentation Standards

- Use clear, concise language
- Include code examples
- Keep examples up-to-date
- Use proper markdown formatting
- Add table of contents for long documents

### Updating Documentation

When making changes that affect:
- **Public APIs:** Update API.md
- **Configuration:** Update CONFIGURATION_GUIDE.md
- **Kubernetes:** Update KUBERNETES_DEPLOYMENT.md
- **Troubleshooting:** Update TROUBLESHOOTING.md

## Community

### Getting Help

- **GitHub Issues:** For bugs and feature requests
- **GitHub Discussions:** For questions and general discussion
- **Documentation:** Check the docs/ directory first

### Communication Guidelines

- Be respectful and professional
- Search existing issues before creating new ones
- Provide clear, detailed information
- Follow up on your issues and pull requests

### Recognition

Contributors are recognized in:
- GitHub contributors list
- Release notes for significant contributions
- Special mentions for major features or fixes

## Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR:** Breaking changes
- **MINOR:** New features (backward compatible)
- **PATCH:** Bug fixes (backward compatible)

### Release Checklist

1. Update version in package.json
2. Update CHANGELOG.md
3. Create release notes
4. Tag the release
5. Publish to npm
6. Update Docker images

## Questions?

If you have questions about contributing, please:

1. Check the documentation
2. Search existing issues
3. Create a new issue with the "question" label
4. Join our community discussions

Thank you for contributing to the Lightweight Browser Load Tester! 🚀