# n8n OpenCode Skills Repository

## Overview

This repository contains OpenCode skills generated from Claude's n8n-skills collection. These skills extend OpenCode's capabilities by providing specialized tools for working with n8n workflows and MCP (Model Context Protocol) tools.

The skills in this repository are designed to work with [OpenCode](https://opencode.ai) - the AI-powered terminal coding assistant - enabling AI to leverage domain-specific knowledge for building and managing n8n workflows.

## Repository Structure

- **n8n-skills**: Original collection of n8n skills by Claude (https://github.com/czlonkowski/n8n-skills)
- **n8n-mcp**: MCP server implementation that powers the advanced workflow tools (https://github.com/czlonkowski/n8n-mcp)

A collection of reusable skills for [OpenCode](https://opencode.ai) - the AI-powered terminal coding assistant. Skills extend OpenCode's capabilities by providing domain-specific tools and workflows that the AI can leverage to accomplish tasks.

## 🚨 Important: Container Configuration Fix

**Issue**: The n8n-mcp container configured with MCP_MODE=stdio immediately exits after starting with the message "stdin closed, shutting down...".

**Solution**: This repository now includes a fixed docker-compose.yml file that addresses this issue by:
1. Adding `stdin_open: true` to keep stdin open
2. Adding `tty: true` to allocate a pseudo-TTY

This prevents the container from exiting immediately and allows proper testing of all n8n-mcp skills (n8n-mcp-tools-expert, n8n-validation-expert, n8n-workflow-patterns, and n8n-node-configuration).

**✨ Quick Start**: With this fix, you can now quickly get started with local n8n and MCP development using:
```bash
# Use the updated docker-compose.yml in this repository
docker-compose up
```

This docker-compose setup provides a **fast way to start working with both n8n and the MCP tools locally**, enabling you to test all the skills in this repository without encountering the container exit issue.

## What are n8n Skills?

Skills are modular extensions that teach OpenCode how to interact with external services, APIs, and tools. Each skill contains:

- **SKILL.md** - A markdown file describing the skill's capabilities, commands, and usage patterns
- **Documentation files** - Additional guides and references for using the skill
- **Scripts** - Executable scripts (Python, Bash, etc.) that perform the actual operations
- **Configuration** - Environment variables and settings needed for the skill to function

When you add a skill to your project's `.opencode/skill/` directory, OpenCode automatically learns how to use it based on the SKILL.md documentation.

## Available Skills

| Skill | Description | API Required |
|-------|-------------|--------------|
| [n8n-mcp-tools-expert](./skill/n8n-mcp-tools-expert/) | Expert guide for using n8n-mcp MCP tools effectively | None |
| [n8n-validation-expert](./skill/n8n-validation-expert/) | Interpret validation errors and guide fixing them | None |
| [n8n-expression-syntax](./skill/n8n-expression-syntax/) | Validate n8n expression syntax and fix common errors | None |
| [n8n-code-python](./skill/n8n-code-python/) | Write Python code in n8n Code nodes | None |
| [n8n-workflow-patterns](./skill/n8n-workflow-patterns/) | Proven workflow architectural patterns from real n8n workflows | None |
| [n8n-code-javascript](./skill/n8n-code-javascript/) | Write JavaScript code in n8n Code nodes | None |
| [n8n-node-configuration](./skill/n8n-node-configuration/) | Operation-aware node configuration guidance | None |

## Quick Start

### 1. Install OpenCode

If you haven't already, install OpenCode:

```bash
# Using npm
npm install -g @anthropic-ai/opencode

# Or using Homebrew (macOS)
brew install opencode
```

### 2. Add Skills to Your Project

You can add individual skills or all skills from this repository to your project using several methods:

#### Method A: Clone Repository and Copy Skills

Clone this repository and copy skills to your project:

```bash
# Clone the repository
git clone https://github.com/viliamvolosv/n8n-opencode-skill.git
cd n8n-opencode-skill

# Create the skill directory in your project
mkdir -p your-project/.opencode/skill

# Copy all skills from this repository
cp -r skill/* your-project/.opencode/skill/
```

#### Method B: Add Individual Skills

Copy the desired skill folder into your project's `.opencode/skill/` directory:

```bash
# Create the skill directory in your project
mkdir -p your-project/.opencode/skill

# Copy the skill you want to use
cp -r n8n-opencode-skill/skill/n8n-mcp-tools-expert your-project/.opencode/skill/
```

#### Method C: Install All Skills from This Repository

To install all skills at once, run:

```bash
# Create the skill directory in your project
mkdir -p your-project/.opencode/skill

# Copy all skills from this repository
cp -r n8n-opencode-skill/skill/* your-project/.opencode/skill/
```

### 3. Configure Each Skill

Each skill requires specific configuration. Navigate to the skill's directory and set up the environment:

```bash
cd your-project/.opencode/skill/n8n-mcp-tools-expert
# Copy the example configuration file
cp opencode.json.example opencode.json

# Edit opencode.json with your actual settings
nano opencode.json  # or use your preferred editor
```

### 4. Use the Skills with OpenCode

Start OpenCode in your project directory:

```bash
cd your-project
opencode
```

Now you can ask OpenCode to use the skills naturally:

```
> Show me how to search for n8n nodes
> Validate a workflow using MCP tools
> Explain how to fix expression syntax errors
```

## Repository Structure

```
n8n-opencode-skill/
├── README.md                          # This file
├── LICENSE                            # MIT License
├── skill/
│   ├── n8n-mcp-tools-expert/
│   │   ├── SKILL.md                   # Skill documentation for OpenCode
│   │   ├── SEARCH_GUIDE.md            # Search tools reference
│   │   ├── VALIDATION_GUIDE.md        # Validation reference
│   │   ├── WORKFLOW_GUIDE.md          # Workflow patterns reference
│   │   └── scripts/
│   │       ├── mcp_tools.py           # Main script
│   │       ├── opencode.json.example  # Example configuration
│   │       └── requirements.txt       # Python dependencies
│   ├── n8n-validation-expert/
│   │   ├── SKILL.md                   # Skill documentation for OpenCode
│   │   ├── VALIDATION_GUIDE.md        # Validation reference
│   │   └── scripts/
│   │       ├── validation.py          # Main script
│   │       ├── opencode.json.example  # Example configuration
│   │       └── requirements.txt       # Python dependencies
│   ├── n8n-expression-syntax/
│   │   ├── SKILL.md                   # Skill documentation for OpenCode
│   │   └── scripts/
│   │       ├── expression.py          # Main script
│   │       ├── opencode.json.example  # Example configuration
│   │       └── requirements.txt       # Python dependencies
│   ├── n8n-code-python/
│   │   ├── SKILL.md                   # Skill documentation for OpenCode
│   │   ├── COMMON_PATTERNS.md         # Common Python patterns
│   │   ├── DATA_ACCESS.md             # Data access patterns
│   │   ├── ERROR_PATTERNS.md          # Error handling patterns
│   │   ├── STANDARD_LIBRARY.md        # Standard library usage
│   │   └── scripts/
│   │       ├── python_code.py         # Main script
│   │       ├── opencode.json.example  # Example configuration
│   │       └── requirements.txt       # Python dependencies
│   ├── n8n-workflow-patterns/
│   │   ├── SKILL.md                   # Skill documentation for OpenCode
│   │   ├── ai_agent_workflow.md       # AI agent workflows
│   │   ├── database_operations.md     # Database operations
│   │   ├── webhook_processing.md      # Webhook processing
│   │   ├── http_api_integration.md    # HTTP API integration
│   │   ├── scheduled_tasks.md         # Scheduled tasks
│   │   └── scripts/
│   │       ├── workflow_patterns.py   # Main script
│   │       ├── opencode.json.example  # Example configuration
│   │       └── requirements.txt       # Python dependencies
│   ├── n8n-code-javascript/
│   │   ├── SKILL.md                   # Skill documentation for OpenCode
│   │   ├── COMMON_PATTERNS.md         # Common JavaScript patterns
│   │   ├── DATA_ACCESS.md             # Data access patterns
│   │   ├── ERROR_PATTERNS.md          # Error handling patterns
│   │   ├── BUILTIN_FUNCTIONS.md       # Built-in functions reference
│   │   └── scripts/
│   │       ├── javascript_code.py     # Main script
│   │       ├── opencode.json.example  # Example configuration
│   │       └── requirements.txt       # Python dependencies
│   └── n8n-node-configuration/
│       ├── SKILL.md                   # Skill documentation for OpenCode
│       ├── OPERATION_PATTERNS.md      # Operation patterns reference
│       ├── DEPENDENCIES.md            # Dependency management guide
│       └── scripts/
│           ├── node_config.py         # Main script
│           ├── opencode.json.example  # Example configuration
│           └── requirements.txt       # Python dependencies
└── docs/
    └── creating-skills.md             # Guide for creating your own skills
```

## Skill Documentation

### n8n-mcp-tools-expert

Expert guide for using n8n-mcp MCP tools effectively. Provides tool selection guidance, parameter formats, and common patterns.

#### Features

- Node search capabilities
- Validation guidance
- Workflow management
- Template deployment
- Configuration best practices

#### Setup

1. Configure your MCP tools connection:
   ```bash
   cd skill/n8n-mcp-tools-expert
   cp opencode.json.example opencode.json
   ```

2. Edit `opencode.json` with your settings:
   ```json
   {
     "mcp": {
       "url": "http://localhost:3000",
       "api_key": "your-api-key-here"
     }
   }
   ```

#### Commands Reference

| Command | Arguments | Description |
|---------|-----------|-------------|
| `search_nodes` | `<query>` | Search for n8n nodes by keyword |
| `get_node` | `<node_type>` | Get detailed node information |
| `validate_node` | `<node_type> <config>` | Validate node configuration |
| `validate_workflow` | `<workflow_json>` | Validate complete workflow |
| `create_workflow` | `<workflow_data>` | Create new workflow |
| `deploy_template` | `<template_id>` | Deploy workflow template |

#### Example Workflows

**Searching for nodes:**
```bash
# Search for webhook-related nodes
python3 mcp_tools.py search_nodes "webhook"
```

**Validating a workflow:**
```bash
# Validate workflow configuration
python3 mcp_tools.py validate_workflow workflow.json
```

### n8n-validation-expert

Interpret validation errors and guide fixing them. Handles validation warnings, false positives, operator structure issues, and validation results.

#### Features

- Error interpretation guidance
- Warning resolution strategies
- False positive handling
- Operator structure validation
- Validation profile management

### n8n-expression-syntax

Validate n8n expression syntax and fix common errors. Handles {{}} syntax, $json/$node variables, webhook data, and expression errors.

#### Features

- Expression syntax validation
- Variable access guidance
- Webhook data handling
- Error troubleshooting
- Expression optimization

### n8n-code-python

Write Python code in n8n Code nodes. Provides guidance for Python in n8n, using _input/_json/_node syntax, and standard library usage.

#### Features

- Python code writing in n8n
- _input/_json/_node syntax guidance
- Standard library usage
- Python limitations in n8n Code nodes

### n8n-workflow-patterns

Proven workflow architectural patterns from real n8n workflows. Covers webhook processing, HTTP API integration, database operations, AI agent workflows, and scheduled tasks.

#### Features

- Webhook processing patterns
- HTTP API integration patterns
- Database operation patterns
- AI agent workflow patterns
- Scheduled task patterns

### n8n-code-javascript

Write JavaScript code in n8n Code nodes. Provides guidance for JavaScript in n8n, using $input/$json/$node syntax, HTTP requests with $helpers, and date handling.

#### Features

- JavaScript code writing in n8n
- $input/$json/$node syntax guidance
- HTTP request handling
- Date/time manipulation
- Code node mode selection

### n8n-node-configuration

Operation-aware node configuration guidance. Covers node configuration, property dependencies, required fields, and common configuration patterns.

#### Features

- Node configuration guidance
- Property dependency management
- Required field identification
- Configuration pattern examples

## Creating Your Own Skills

Want to create a skill for a different service? See our [Creating Skills Guide](./docs/creating-skills.md).

### Skill File Structure

Every skill needs at minimum:

1. **SKILL.md** - The skill definition file with frontmatter:
   ```markdown
   ---
   name: skill-name
   description: Brief description of what the skill does and when to use it.
   ---
   
   # Skill Name
   
   Instructions for OpenCode on how to use this skill...
   ```

2. **Documentation files** - Additional guides and references
3. **Scripts** - Executable files that perform operations
4. **opencode.json.example** - Template for required configuration

### Best Practices

- Keep SKILL.md concise - OpenCode reads this for context
- Use clear command names that describe the action
- Always include an `opencode.json.example` (never commit actual credentials!)
- Output minimal, structured data that's easy for AI to parse
- Include example workflows in your documentation

## Security Notes

- **Never commit configuration files** - They contain sensitive API credentials
- Always use `opencode.json.example` files as templates
- Add configuration files to your `.gitignore`
- Rotate API keys if you accidentally expose them

## Requirements

- Python 3.8+ (for Python-based skills)
- OpenCode CLI installed
- API credentials for the services you want to use

### Python Dependencies

Install skill dependencies:

```bash
pip install requests python-dotenv
```

Or for a specific skill:

```bash
cd skill/n8n-mcp-tools-expert/scripts
pip install -r requirements.txt
```

## Contributing

Contributions are welcome! If you've created a useful skill, consider submitting a pull request.

1. Fork the repository
2. Create your skill in the `skill/` directory
3. Include comprehensive documentation
4. Submit a pull request

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Links

- [OpenCode Documentation](https://opencode.ai/docs)
- [n8n Documentation](https://docs.n8n.io/)
- [relearn.ing Project Page](https://relearn.ing/projects/opencode-skills/)

---
Built with cognitive architecture principles from [relearn.ing](https://relearn.ing)