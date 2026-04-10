# Novawrite API Routes - Express to Cloudflare Workers Conversion Guide

This document contains all the API routes from your Express.js server that need to be converted to Cloudflare Workers.

## **PROJECT ROUTES** (`/api/projects/*`)

### **Project Management**
```
GET     /api/projects                          - List all projects
POST    /api/projects                          - Create new project
GET     /api/projects/:id                      - Get specific project
PUT     /api/projects/:id                      - Update project
DELETE  /api/projects/:id                      - Delete project
```

### **Chapter Operations**
```
GET     /api/projects/:id/chapters             - List all chapters in project
POST    /api/projects/:id/chapters             - Create new chapter
PUT     /api/projects/:projectId/chapters/:chapterId  - Update chapter
DELETE  /api/projects/:projectId/chapters/:chapterId - Delete chapter
```

### **Project Utilities**
```
POST    /api/projects/:id/cleanup-chapters     - Remove short chapters
POST    /api/projects/:id/prepare-book-mode      - Generate chapters for book mode
```

### **Core Content Management**
```
POST    /api/chapters/:chapterId/save            - Save chapter content (CRITICAL)
GET     /api/chapters/:chapterId/history        - Get chapter version history
POST    /api/chapters/:chapterId/restore/:versionId - Restore chapter version
GET     /api/db/health                          - Database health check
```

## **STORY BIBLE ROUTES** (`/api/projects/:id/story-bible`)

```
GET     /api/projects/:id/story-bible           - Get story bible
PUT     /api/projects/:id/story-bible           - Update story bible
POST    /api/projects/:id/story-bible/extract     - Extract from text
POST    /api/projects/:id/story-bible/extract-iterative - Iterative extraction
```

## **CHARACTER ROUTES**

```
POST    /api/projects/:id/characters            - Create character
PUT     /api/projects/:projectId/characters/:characterId - Update character
DELETE  /api/projects/:projectId/characters/:characterId - Delete character

POST    /api/projects/:id/expand-synopsis      - Generate chapters from synopsis
```

## **PROVIDER ROUTES** (`/api/provider/*`)

```
GET     /api/provider                          - Get current provider config
PUT     /api/provider                          - Update provider config
POST    /api/provider/test                       - Test provider connection
GET     /api/provider/codex/status             - Check Codex auth status

// Model-specific endpoints
GET     /api/provider/groq/models               - List Groq models
POST    /api/provider/groq/models               - List Groq models (with API key)
GET     /api/provider/google/models             - List Google models  
POST    /api/provider/google/models             - List Google models (with API key)
GET     /api/provider/ollama/models               - List Ollama models
```

## **GENERATION ROUTES** (`/api/generate/*`)

```
POST    /api/generate                          - Main generation endpoint
POST    /api/generate/retry                     - Retry generation with feedback
GET     /api/generate/recovery/latest           - Get latest recovery draft
GET     /api/generate/recovery/:draftId         - Get specific recovery draft
POST    /api/generate/recovery/:draftId/resolve - Resolve recovery draft
```

## **PROMPT PLANNER ROUTES**

```
POST    /api/prompt-planner/scene-pack          - Generate scene plan
GET     /api/prompt-planner/history              - Get prompt plan history
```

## **AUTONOMOUS WRITING ROUTES** (`/api/autonomous/*`)

```
GET     /api/autonomous                        - List autonomous sessions
GET     /api/autonomous/:sessionId              - Get session
POST    /api/autonomous/start                   - Start autonomous session
PUT     /api/autonomous/:sessionId/settings   - Update session settings
POST    /api/autonomous/:sessionId/preview      - Preview next iteration
POST    /api/autonomous/:sessionId/accept         - Accept generated content
POST    /api/autonomous/:sessionId/reject         - Reject generated content
POST    /api/autonomous/:sessionId/pause          - Pause session
POST    /api/autonomous/:sessionId/resume        - Resume session
POST    /api/autonomous/:sessionId/stop           - Stop session
```

## **STYLE & OPTIMIZATION ROUTES**

```
GET     /api/style                             - Get style fingerprint
POST    /api/style/samples                      - Upload style samples
DELETE  /api/style                             - Clear style fingerprint
```

## **PREFERENCES & USER DATA**

```
GET     /api/preferences                       - Get user preferences
PUT     /api/preferences                       - Update user preferences
```

## **CRAFT PATTERNS**

```
DELETE  /api/craft-patterns                     - Clear craft patterns
```

## **LIFETIME MEMORY**

```
DELETE  /api/lifetime-memory                    - Clear lifetime memory
```

## **METRICS & OBSERVABILITY**

```
GET     /api/metrics                           - Get metrics data
GET     /api/logs                              - Get recent logs
GET     /api/logs/file/:date                    - Get logs for specific date
```

## **AUTHOR PROFILE**

```
GET     /api/author-profile                     - Get author profile
PUT     /api/author-profile                     - Update author profile
```

## **EXPORT CONFIGURATIONS**

```
GET     /api/export-configs                     - List export configurations
POST    /api/export-configs                     - Create export configuration
PUT     /api/export-configs/:id                 - Update export configuration
DELETE  /api/export-configs/:id                 - Delete export configuration
POST    /api/export-configs/:id/default         - Set default export config
```

---

## **CLOUDFLARE WORKERS CONVERSION PATTERN**

For converting these Express routes to Cloudflare Workers, use this pattern:

```javascript
// Express Pattern
app.get('/api/projects', (req, res) => {
  const projects = Array.from(projects.values());
  res.json(projects);
});

// Cloudflare Workers Pattern  
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Route matching
    if (url.pathname === '/api/projects' && request.method === 'GET') {
      const projects = Array.from(projects.values());
      return new Response(JSON.stringify(projects), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Add other routes here...
    
    return new Response('Not Found', { status: 404 });
  }
}
```

## **KEY DEPENDENCIES TO REPLICATE**

1. **In-memory project store** - Map object for projects
2. **Configuration management** - Environment variables  
3. **AI model completion** - Call to Hugging Face/Anthropic/etc
4. **Rate limiting** - Cloudflare's built-in rate limiting
5. **Logging** - Use Cloudflare's logging or external service
6. **File persistence** - Use Durable Objects or KV storage instead of filesystem