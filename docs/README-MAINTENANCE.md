# README.md Maintenance Guide

This document outlines how to maintain the README.md file for the rungs CLI project.

## Guidelines

### Content Structure
The README should follow this structure:
1. **Project description** - Clear, concise explanation of what rungs does
2. **Quick start** - Prerequisites, installation, first steps
3. **How it works** - Conceptual explanation of stacked diffs
4. **Commands** - Detailed documentation of each command
5. **Configuration** - All configuration options with examples
6. **Advanced usage** - Complex workflows and integration patterns
7. **Development** - Setup for contributors
8. **Examples** - Real-world scenarios
9. **Troubleshooting** - Common issues and solutions

### Writing Style
- Use **clear, actionable headings** with emojis for visual hierarchy
- Include **code examples** for every feature
- Provide **real-world scenarios** not just toy examples
- Use **imperative mood** for instructions ("Run this command")
- Include **expected output** for commands when helpful

### Code Examples
- Always use realistic commit messages and branch names
- Show complete workflows, not just isolated commands
- Include error scenarios and how to handle them
- Use consistent naming (e.g., always use "john" for userPrefix examples)

### Updates Required

Update the README when:
- **New commands** are added
- **Configuration options** change
- **Workflow patterns** are discovered
- **Common issues** are identified
- **Dependencies** change (Bun version, GitHub CLI requirements)
- **Installation process** changes

### Validation Checklist

Before committing README changes:
- [ ] All code examples are tested and work
- [ ] Installation instructions are current
- [ ] All command options are documented
- [ ] Configuration table is complete
- [ ] Examples use realistic scenarios
- [ ] Troubleshooting covers recent issues
- [ ] Links are valid and current
- [ ] Screenshots/GIFs are up to date (if any)

## Content Sections

### Quick Start
- Must work for someone with zero context
- Include all prerequisites
- Show expected output where helpful
- Link to more detailed sections

### Commands Documentation
- Document all flags and options
- Show example output
- Explain what each command actually does
- Include error scenarios

### Configuration
- Table format for all options
- Show impact of each setting
- Include examples of different strategies
- Document where config is stored

### Examples
- Use realistic, multi-step scenarios
- Show progression over time
- Include different use cases (features, bugs, refactoring)
- Explain benefits of the approach

### Troubleshooting
- Cover issues users actually encounter
- Provide specific commands to run
- Explain why issues happen when possible
- Include preventive measures

## Maintenance Process

1. **Regular review** - Check README accuracy monthly
2. **Issue tracking** - Note documentation gaps in GitHub issues
3. **User feedback** - Update based on user questions and confusion
4. **Version updates** - Update when dependencies change
5. **Example refresh** - Keep examples current and relevant

## Template Sections

When adding new features, use these templates:

### New Command
```markdown
### `rungs newcommand`
Brief description of what the command does.

\`\`\`bash
rungs newcommand [options]     # Basic usage
rungs newcommand --help        # Show help
\`\`\`

**What it does:**
- Bullet point of functionality
- Another key capability
- Result or output

**Example output:**
\`\`\`
Expected output here
\`\`\`
```

### New Configuration Option
Add to the configuration table and show an example:

```markdown
| `newOption` | `defaultValue` | Description of what this controls |
```

### New Troubleshooting Item
```markdown
**"Error message users see"**
\`\`\`bash
# Commands to diagnose
command to run
\`\`\`
Explanation and solution.
```

## Quality Standards

- **Accuracy**: All examples must work as shown
- **Completeness**: Cover all user-facing features
- **Clarity**: Assume no prior knowledge of stacked diffs
- **Currency**: Keep up to date with latest version
- **Practicality**: Focus on real use cases, not contrived examples

## Review Process

1. **Technical review** - Verify all commands work
2. **User experience review** - Check flow and clarity
3. **Copy editing** - Grammar, spelling, consistency
4. **Link validation** - Ensure all links work
5. **Example testing** - Run through all examples

Remember: The README is often the first impression users have of rungs. Make it count!
