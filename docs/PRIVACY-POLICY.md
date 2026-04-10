# Magnum Opus - Privacy Policy

**Last Updated:** February 2026

---

## 1. Introduction

This Privacy Policy describes how Magnum Opus ("we," "us," "our," or "the Software") handles information when you use our AI-powered creative writing assistant. Magnum Opus is self-hosted software that runs on your own infrastructure. We are committed to protecting your privacy and being transparent about our data practices.

---

## 2. Data Controller

Because Magnum Opus is self-hosted software, **you are the data controller** for all data processed by your installation. We (the developers of Magnum Opus) do not host, access, or process your data. You are responsible for compliance with applicable data protection laws in your jurisdiction.

---

## 3. What Data Is Collected

### 3.1 Data You Provide Directly

- **Project content**: novel text, chapter content, and all creative writing you enter into the editor
- **Story Bible data**: character profiles, world-building details, plot structures, premise information, style directives, and chapter outlines
- **Writing samples**: text you upload to the Style Learning feature for voice analysis
- **Style feedback**: your feedback on AI-generated content
- **User preferences**: generation settings, UI preferences, and configuration choices
- **AI provider API keys**: keys you enter for connecting to AI services

### 3.2 Data Generated Automatically

- **Style fingerprint**: numerical and textual analysis of your writing style derived from your uploaded samples
- **Craft patterns**: writing patterns extracted during use
- **Lifetime memory**: insights, writing history (word counts per day), and feedback history
- **Metrics data**: token usage counts, quality scores, request latency, extraction statistics
- **Server logs**: timestamped operation logs including request paths, status codes, and processing durations
- **Version history**: every save of every chapter, with full content and trigger type
- **Transaction logs**: append-only logs of all save operations for crash recovery
- **Session snapshots**: autonomous writing session state for recovery purposes
- **Draft files**: AI-generated content awaiting review

### 3.3 Data NOT Collected

- We do not collect personal identification information (name, email, phone, address) unless you choose to include it in your project content
- We do not use cookies, tracking pixels, or analytics services
- We do not collect device fingerprints or IP addresses
- We do not collect usage telemetry or send data to any remote service operated by us

---

## 4. Where Data Is Stored

All data is stored locally on the machine or server where you run Magnum Opus:

| Data Type | Storage Location | Format |
|-----------|-----------------|--------|
| Projects, chapters, versions | `.novawrite-data/novawrite.db` | SQLite database |
| Transaction logs | `.novawrite-data/txlog/` | JSONL files (daily rotation) |
| Server logs | `.novawrite-data/logs/` | JSON files (daily rotation) |
| Draft content | `.novawrite-data/drafts/` | HTML files |
| Metrics | `.novawrite-data/metrics.json` | JSON file |
| Preferences | `.novawrite-data/preferences.json` | JSON file |
| Craft patterns | `.novawrite-data/craft-patterns.json` | JSON file |
| Lifetime memory | `.novawrite-data/lifetime-memory.json` | JSON file |
| Provider config | `.novawrite-data/provider-config.json` | JSON file |

**No data is transmitted to servers operated by us.** The `.novawrite-data` directory contains all persistent state.

---

## 5. Third-Party Data Sharing

### 5.1 AI Provider Services

When you use Magnum Opus's AI generation features, portions of your data are sent to your chosen AI provider:

| Provider | Data Sent | Provider's Privacy Policy |
|----------|----------|--------------------------|
| Groq | System prompts containing Story Bible context, style fingerprint, and surrounding text; user prompts | https://groq.com/privacy-policy |
| OpenAI | Same as above | https://openai.com/policies/privacy-policy |
| Anthropic | Same as above | https://www.anthropic.com/privacy |
| Google (Gemini) | Same as above | https://policies.google.com/privacy |
| Ollama (Local) | Same as above, but sent to your local machine only | No external transmission |

**What is sent to AI providers:**
- Story Bible content (premise, character descriptions, world details, plot structure, style directives)
- Your style fingerprint data
- Up to 10,000 characters of text surrounding the cursor position
- Your generation prompt
- Chapter content for continuity checking (up to 3,000 characters of recent content)

**What is NOT sent to AI providers:**
- Your API keys for other providers
- Your raw writing samples (only the derived fingerprint)
- Server logs or metrics
- Version history
- Transaction logs

### 5.2 No Other Third Parties

We do not share, sell, or transmit your data to any other third parties. There are no advertising networks, analytics services, or data brokers involved.

---

## 6. Data Retention

Since all data is stored locally on your infrastructure:

- **You control retention.** Delete data at any time by removing files from `.novawrite-data/`.
- **Version history** is retained indefinitely by default. Use the version pruning feature to limit retention (configurable, default: last 1,000 versions per chapter).
- **Transaction logs** are retained indefinitely by default. Delete old log files manually from `.novawrite-data/txlog/`.
- **Server logs** rotate daily. Delete old log files manually from `.novawrite-data/logs/`.
- **Autonomous session data** has a 24-hour TTL and is cleaned up automatically every hour.

### Complete Data Deletion

To completely remove all Magnum Opus data:

```bash
rm -rf .novawrite-data
```

This permanently deletes all projects, chapters, versions, logs, preferences, style data, and drafts.

---

## 7. Data Security

### 7.1 At Rest

- SQLite database uses WAL mode with `synchronous = FULL` for data integrity
- Data files are stored in standard filesystem permissions
- **Recommendation:** Enable filesystem-level encryption (e.g., FileVault on macOS, LUKS on Linux, BitLocker on Windows) to protect data at rest
- **Recommendation:** Restrict filesystem permissions on `.novawrite-data/` to the application user only

### 7.2 In Transit

- Communication between your browser and the Magnum Opus server is over HTTP by default in development mode
- **Recommendation for production:** Deploy behind a reverse proxy (nginx, Caddy) with TLS/SSL to encrypt all traffic
- Communication between Magnum Opus and AI providers uses HTTPS (TLS-encrypted)

### 7.3 API Keys

- API keys are stored in `.novawrite-data/provider-config.json` on your server
- Keys are never exposed to the frontend beyond a `hasApiKey: true/false` flag
- **Recommendation:** Use environment variables (`.env` file) for API keys instead of the UI configuration, and ensure `.env` is not committed to version control

### 7.4 No Authentication

Magnum Opus does not include built-in user authentication. Anyone with network access to your server can access all data.

- **Recommendation for shared environments:** Deploy behind a reverse proxy with authentication (e.g., HTTP Basic Auth, OAuth proxy)
- **Recommendation for local use:** Bind the server to `localhost` only

---

## 8. Children's Privacy

Magnum Opus is not directed at children under the age of 13 (or the applicable age of digital consent in your jurisdiction). We do not knowingly process data from children. If you deploy Magnum Opus in an environment accessible to children, you are responsible for ensuring compliance with applicable children's privacy laws (COPPA, GDPR Article 8, etc.).

---

## 9. International Data Transfers

When you use a cloud-based AI provider, your data may be transferred to servers in jurisdictions different from your own. The specific jurisdictions depend on your chosen provider:

- **Groq**: United States
- **OpenAI**: United States
- **Anthropic**: United States
- **Google**: Various (see Google's data processing terms)
- **Ollama**: No transfer (runs locally)

If you are subject to GDPR or similar regulations, review your chosen provider's data processing agreements and ensure appropriate safeguards are in place. Using Ollama or another locally-hosted model avoids all international data transfers.

---

## 10. Your Rights

Depending on your jurisdiction, you may have rights including:

- **Access**: view all data Magnum Opus stores (browse `.novawrite-data/` directly)
- **Rectification**: edit any data through the application UI or by modifying files directly
- **Erasure**: delete any or all data (see Section 6)
- **Portability**: export your work in multiple formats (DOCX, PDF, TXT, MD, HTML); all data is stored in standard formats (SQLite, JSON)
- **Restriction**: stop using AI generation features to prevent data from being sent to providers

Because Magnum Opus is self-hosted, you exercise these rights directly on your own infrastructure.

---

## 11. Changes to This Policy

We may update this Privacy Policy when new features are added or data handling practices change. Changes will be included in release notes and reflected in the "Last Updated" date above.

---

## 12. Contact

For privacy-related questions about Magnum Opus:

- **GitHub Issues**: Report privacy concerns at the project repository
- **Email**: Contact the project maintainers through the repository

---

## 13. Open Source Transparency

Magnum Opus is open-source software. You can audit every line of code to verify the data handling practices described in this policy. The server source code (`server/index.ts` and `server/db.ts`) contains all data storage and transmission logic.
