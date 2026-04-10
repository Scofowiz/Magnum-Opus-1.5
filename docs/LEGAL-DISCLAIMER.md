# Magnum Opus - Legal Disclaimers

**Last Updated:** February 2026

---

## 1. General Disclaimer

Magnum Opus is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. The entire risk as to the quality and performance of the software is with you.

---

## 2. No Guarantee of Results

Magnum Opus is a tool that assists with creative writing. We make no guarantees regarding:

- The quality, originality, or publishability of AI-generated content
- The accuracy or consistency of AI-generated text with your Story Bible or instructions
- The suitability of generated content for any specific purpose, publication, or audience
- The commercial viability of any work produced with this software
- The achievement of any specific word count, writing speed, or productivity target

AI-generated content should always be reviewed, edited, and refined by a human author before publication.

---

## 3. AI-Generated Content

### 3.1 Ownership

Content generated using Magnum Opus is produced by AI models operated by third-party providers (Groq, OpenAI, Anthropic, Google, or your local Ollama instance). The intellectual property status of AI-generated content varies by jurisdiction and is an evolving area of law.

- You should consult legal counsel in your jurisdiction regarding the copyright status of AI-assisted works
- We make no representations about your ownership rights over AI-generated content
- Some jurisdictions may not recognize copyright in purely AI-generated works
- Works that involve substantial human creative input and editorial judgment are more likely to receive copyright protection

### 3.2 Originality

AI models generate content based on patterns learned from training data. While the output is typically novel:

- We cannot guarantee that AI-generated content will not resemble existing published works
- You are responsible for checking generated content for unintentional similarity to existing works
- We recommend running completed manuscripts through plagiarism detection tools before publication

### 3.3 Content Responsibility

You are solely responsible for:

- All content created, edited, stored, or published using Magnum Opus
- Ensuring generated content does not infringe on third-party intellectual property rights
- Ensuring generated content complies with applicable laws regarding defamation, obscenity, hate speech, and other regulated content
- Any claims, damages, or legal actions arising from content produced with this software

---

## 4. AI Provider Terms

Your use of AI generation features is subject to the terms of service of your chosen AI provider:

| Provider | Terms of Service |
|----------|-----------------|
| Groq | https://groq.com/terms-of-use |
| OpenAI | https://openai.com/policies/terms-of-use |
| Anthropic | https://www.anthropic.com/terms |
| Google (Gemini) | https://ai.google.dev/gemini-api/terms |

**Important considerations:**
- Some providers retain input/output data for model improvement (review their policies)
- Some providers have content policies that may reject or filter certain types of creative content
- Token usage is billed directly by the provider to your account; Magnum Opus does not control pricing
- Provider service availability, performance, and model capabilities may change without notice

You are responsible for reviewing and complying with your chosen provider's terms.

---

## 5. Data Loss Disclaimer

While Magnum Opus implements a triple redundant save system (transaction log, SQLite WAL, version history), we cannot guarantee against all data loss scenarios:

- Hardware failures (disk corruption, drive failure)
- Operating system or filesystem failures
- User error (accidental deletion of `.novawrite-data/`)
- Software bugs
- Incompatible system configurations

**We strongly recommend:**
- Maintaining regular backups of the `.novawrite-data/` directory
- Exporting important work in multiple formats
- Using version control (git) for additional redundancy
- Testing your backup restoration process periodically

---

## 6. Security Disclaimer

Magnum Opus does not include:

- Built-in user authentication or authorization
- Encryption of data at rest
- Rate limiting on API endpoints (beyond what is implemented for AI provider calls)
- Protection against cross-site scripting (XSS) in stored content
- Protection against server-side request forgery (SSRF)

**If you deploy Magnum Opus on a network accessible to others:**
- You are responsible for implementing appropriate security measures
- Deploy behind a reverse proxy with TLS and authentication
- Restrict network access to authorized users
- Keep the software and its dependencies updated
- Monitor server logs for unauthorized access attempts

Magnum Opus is designed primarily for local, single-user use. Multi-user and public-facing deployments require additional security measures that are your responsibility.

---

## 7. Third-Party Dependencies

Magnum Opus relies on third-party open-source software packages. We do not control these packages and make no warranties about their:

- Security (vulnerability-free status)
- Continued availability or maintenance
- Compatibility with future systems
- License compliance in your specific use case

Review the `package.json` file for a complete list of dependencies and their respective licenses.

---

## 8. Limitation of Liability

To the maximum extent permitted by applicable law:

- In no event shall the authors, copyright holders, or contributors of Magnum Opus be liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including but not limited to procurement of substitute goods or services, loss of use, loss of data, loss of profits, or business interruption) arising in any way out of the use of this software, even if advised of the possibility of such damage
- This limitation applies regardless of the theory of liability, whether in contract, strict liability, or tort (including negligence)
- This limitation applies to damages arising from: use or inability to use the software, cost of procurement of substitute services, unauthorized access to or alteration of your data, statements or conduct of any third party, or any other matter relating to the software

---

## 9. Indemnification

You agree to indemnify, defend, and hold harmless the authors, contributors, and maintainers of Magnum Opus from and against any claims, damages, obligations, losses, liabilities, costs, or expenses (including reasonable attorney's fees) arising from:

- Your use of the software
- Content you create, store, or publish using the software
- Your violation of any applicable law or regulation
- Your violation of any third-party rights

---

## 10. Professional Use Disclaimer

Magnum Opus is a creative writing tool, not a substitute for professional services:

- It does not provide legal, financial, medical, or other professional advice
- AI-generated content should not be relied upon for factual accuracy
- If your work involves factual claims, you are responsible for independent verification
- Magnum Opus should not be used for generating content intended to deceive, defraud, or mislead

---

## 11. Export Control

The software may be subject to export control laws. You are responsible for compliance with applicable export regulations in your jurisdiction.

---

## 12. Governing Law

Unless otherwise specified, disputes relating to this software shall be governed by the laws of the jurisdiction where the primary maintainer resides, without regard to conflict of law provisions.

---

## 13. Severability

If any provision of these disclaimers is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary so that the remaining provisions remain in full force and effect.

---

## 14. Changes to These Disclaimers

These disclaimers may be updated with new software releases. Continued use of the software after changes constitutes acceptance of the updated terms. Review the "Last Updated" date to track changes.

---

## 15. Open Source License

Magnum Opus is released under the MIT License. See the `LICENSE` file in the project root for the full license text. The MIT License permits use, modification, and distribution with minimal restrictions, but comes with no warranty.

---

*This document is provided for informational purposes and does not constitute legal advice. Consult a qualified attorney for legal questions specific to your situation and jurisdiction.*
