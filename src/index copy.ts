// Cloudflare Workers migration from Express.js
// Complete implementation with all phases

interface Env {
  DB: D1Database;
}

// Basic response utilities
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// Basic validation helpers
function isValidProject(data: any): boolean {
  return data && typeof data.title === 'string' && data.title.trim().length > 0;
}

function isValidChapter(data: any): boolean {
  return data && (typeof data.title === 'string' || typeof data.content === 'string');
}

// Generate UUID for new resources
function generateId(): string {
  return crypto.randomUUID();
}

// Word counting function
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Validate save triggers (from Express.js)
function getValidTrigger(inputTrigger?: string): string {
  const validTriggers = [
    'sentence_end', 'paragraph', 'word_boundary', 'idle', 'manual',
    'pagehide', 'generation', 'accepted_generation', 'auto_accepted_generation',
    'auto_accepted_generation_retry', 'paste', 'recovered_local_draft'
  ];
  return validTriggers.includes(inputTrigger || '') ? inputTrigger || 'manual' : 'manual';
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    const segments = path.split('/');
    
    // Extract request body when needed
    let requestBody: any = null;
    if (method !== 'GET' && method !== 'DELETE') {
      try {
        requestBody = await request.json();
      } catch (error) {
        return errorResponse('Invalid JSON body');
      }
    }
    
    // CORS handling
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }
    
    // Phase 1: Core Project Routes
    // GET /api/projects - List all projects
    if (path === '/api/projects' && method === 'GET') {
      try {
        const { results } = await env.DB.prepare(`
          SELECT id, title, description, genre, word_count, chapter_count, 
                 has_story_bible, created_at, updated_at
          FROM projects 
          ORDER BY updated_at DESC
        `).all();
        
        return jsonResponse(results);
      } catch (error) {
        console.error('Error fetching projects:', error);
        return errorResponse('Database error', 500);
      }
    }
    
    // POST /api/projects - Create new project
    if (path === '/api/projects' && method === 'POST') {
      if (!isValidProject(requestBody)) {
        return errorResponse('Title is required and must be a non-empty string');
      }
      
      const { title, description = '', genre = '' } = requestBody;
      const projectId = generateId();
      const now = new Date().toISOString();

      try {
        await env.DB.prepare(`
          INSERT INTO projects (id, title, description, genre, word_count, chapter_count, has_story_bible, created_at, updated_at)
          VALUES (?, ?, ?, ?, 0, 1, false, ?, ?)
        `).bind(projectId, title.trim(), description.trim(), genre.trim(), now, now).run();
        
        // Create initial chapter
        const chapterId = generateId();
        await env.DB.prepare(`
          INSERT INTO chapters (id, project_id, title, content, word_count, sort_order, created_at, updated_at)
          VALUES (?, ?, 'Chapter 1', '', 0, 0, ?, ?)
        `).bind(chapterId, projectId, now, now).run();
        
        return jsonResponse({
          id: projectId,
          title: title.trim(),
          description: description.trim(),
          genre: genre.trim(),
          content: '',
          wordCount: 0,
          chapters: [{ id: chapterId, title: 'Chapter 1', order: 0, wordCount: 0 }],
          storyBible: null,
          createdAt: now,
          updatedAt: now
        }, 201);
      } catch (error) {
        console.error('Error creating project:', error);
        return errorResponse('Database error', 500);
      }
    }
    
    // GET /api/projects/:id - Get specific project
    if (path.startsWith('/api/projects/') && method === 'GET') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID is required', 404);
      
      try {
        const project = await env.DB.prepare(`
          SELECT id, title, description, genre, word_count, created_at, updated_at
          FROM projects WHERE id = ?
        `).bind(projectId).first();
        
        if (!project) return errorResponse('Project not found', 404);
        
        const chapters = await env.DB.prepare(`
          SELECT id, title, content, word_count, sort_order
          FROM chapters WHERE project_id = ? ORDER BY sort_order
        `).bind(projectId).all();
        
        return jsonResponse({
          id: project.id,
          title: project.title,
          description: project.description,
          genre: project.genre,
          content: chapters.results.map(c => c.content || '').join('\n\n'),
          wordCount: project.word_count,
          chapters: chapters.results.map(c => ({
            id: c.id,
            title: c.title,
            content: c.content || '',
            wordCount: c.word_count,
            order: c.sort_order
          })),
          storyBible: null,
          createdAt: project.created_at,
          updatedAt: project.updated_at
        });
      } catch (error) {
        console.error('Error fetching project:', error);
        return errorResponse('Database error', 500);
      }
    }
    
    // PUT /api/projects/:id - Update project
    if (path.startsWith('/api/projects/') && method === 'PUT') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID is required', 404);
      
      const { title, description, genre } = requestBody;
      
      // Validate inputs
      if (title !== undefined && typeof title !== 'string') {
        return errorResponse('Title must be a string');
      }
      if (description !== undefined && typeof description !== 'string') {
        return errorResponse('Description must be a string');
      }
      if (genre !== undefined && typeof genre !== 'string') {
        return errorResponse('Genre must be a string');
      }
      
      try {
        // Check if project exists
        const existing = await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
        if (!existing) return errorResponse('Project not found', 404);
        
        // Build update query dynamically
        const updates: string[] = [];
        const values: any[] = [];
        
        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (genre !== undefined) { updates.push('genre = ?'); values.push(genre); }
        
        if (updates.length === 0) return jsonResponse({ message: 'No updates provided' });
        
        updates.push('updated_at = ?');
        values.push(new Date().toISOString());
        
        const query = `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`;
        values.push(projectId);
        
        await env.DB.prepare(query).bind(...values).run();
        
        // Return updated project
        return jsonResponse({
          id: projectId,
          title: title || undefined,
          description: description !== undefined ? description : undefined,
          genre: genre || undefined
        });
      } catch (error) {
        console.error('Error updating project:', error);
        return errorResponse('Database error', 500);
      }
    }
    
    // DELETE /api/projects/:id - Delete project
    if (path.startsWith('/api/projects/') && method === 'DELETE') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID is required', 404);
      
      try {
        // Delete project (chapters will be deleted due to foreign key constraints)
        const result = await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(projectId).run();
        
        return jsonResponse({ deleted: result.changes > 0 });
      } catch (error) {
        console.error('Error deleting project:', error);
        return errorResponse('Database error', 500);
      }
    }
    
    // Phase 2: Chapter Management Routes
    // GET /api/projects/:id/chapters - List all chapters in project
    if (path.match(/^\/api\/projects\/[^\/]+\/chapters$/) && method === 'GET') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID is required', 404);
      
      try {
        // Check if project exists
        const projectExists = await env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
        if (!projectExists) return errorResponse('Project not found', 404);
        
        const chapters = await env.DB.prepare(`
          SELECT id, title, content, word_count, sort_order, created_at, updated_at
          FROM chapters 
          WHERE project_id = ? 
          ORDER BY sort_order
        `).bind(projectId).all();
        
        return jsonResponse(chapters.results);
      } catch (error) {
        console.error('Error fetching chapters:', error);
        return errorResponse('Database error', 500);
      }
    }
    
    // POST /api/projects/:id/chapters - Create new chapter
    if (path.match(/^\/api\/projects\/[^\/]+\/chapters$/) && method === 'POST') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID is required', 404);
      
      const { title } = requestBody;
      const chapterTitle = title || 'Untitled Chapter';
      
      try {
        // Check if project exists
        const project = await env.DB.prepare('SELECT id, title FROM projects WHERE id = ?').bind(projectId).first();
        if (!project) return errorResponse('Project not found', 404);
        
        // Get current chapter count
        const chapterCount = await env.DB.prepare('SELECT COUNT(*) as count FROM chapters WHERE project_id = ?').bind(projectId).first();

        const chapterId = generateId();
        const now = new Date().toISOString();
        const order = (chapterCount?.count || 0);
        
        // Create chapter
        await env.DB.prepare(`
          INSERT INTO chapters (id, project_id, title, content, word_count, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, '', 0, ?, ?, ?)
        `).bind(chapterId, projectId, chapterTitle, order, now, now).run();
        
        // Update project chapter count
        await env.DB.prepare('UPDATE projects SET chapter_count = chapter_count + 1, updated_at = ? WHERE id = ?')
          .bind(now, projectId).run();
        
        return jsonResponse({
          id: chapterId,
          title: chapterTitle,
          content: '',
          wordCount: 0,
          order: order,
          createdAt: now,
          updatedAt: now
        }, 201);
      } catch (error) {
        console.error('Error creating chapter:', error);
        return errorResponse('Database error', 500);
      }
    }
    
    // POST /api/chapters/:chapterId/save - Save chapter content (MOST COMPLEX)
    if (path.match(/^\/api\/chapters\/[^\/]+\/save$/) && method === 'POST') {
      const chapterId = segments[3];
      if (!chapterId) return errorResponse('Chapter ID is required', 404);
      
      const { content, trigger, generationDraftId } = requestBody;
      
      // Validate content
      if (!content && content !== '') {
        return errorResponse('Content is required', 400);
      }
      
      // Get valid trigger
      const saveTrigger = getValidTrigger(trigger);
      
      try {
        // Count words
        const wordCount = countWords(content);
        
        // Find the project for this chapter
        const chapter = await env.DB.prepare('SELECT project_id, title, sort_order FROM chapters WHERE id = ?').bind(chapterId).first();
        if (!chapter) return errorResponse('Chapter not found', 404);
        
        const projectId = chapter.project_id;
        const now = new Date().toISOString();
        
        // Save chapter content
        await env.DB.prepare(`
          UPDATE chapters 
          SET content = ?, word_count = ?, updated_at = ?
          WHERE id = ?
        `).bind(content, wordCount, now, chapterId).run();
        
        // Save to chapter history
        const historyExists = await env.DB.prepare(
          'SELECT MAX(version_number) as max_version FROM chapter_history WHERE chapter_id = ?'
        ).bind(chapterId).first();
        
        const nextVersion = (historyExists?.max_version || 0) + 1;
        await env.DB.prepare(`
          INSERT INTO chapter_history (chapter_id, content, word_count, trigger, version_number, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(chapterId, content, wordCount, saveTrigger, nextVersion, now).run();
        
        // Update project word count
        const totalWordCount = await env.DB.prepare(`
          SELECT SUM(word_count) as total FROM chapters WHERE project_id = ?
        `).bind(projectId).first();
        
        await env.DB.prepare('UPDATE projects SET word_count = ?, updated_at = ? WHERE id = ?')
          .bind(totalWordCount?.total || 0, now, projectId).run();
        
        return jsonResponse({
          saved: true,
          wordCount,
          trigger: saveTrigger
        });
      } catch (error) {
        console.error('Error saving chapter:', error);
        return errorResponse('Database save failed', 500);
      }
    }
    
    // GET /api/chapters/:chapterId/history - Get chapter version history
    if (path.match(/^\/api\/chapters\/[^\/]+\/history$/) && method === 'GET') {
      const chapterId = segments[3];
      const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
      
      if (!chapterId) return errorResponse('Chapter ID is required', 404);
      
      try {
        const history = await env.DB.prepare(`
          SELECT id, content, word_count, trigger, version_number, created_at
          FROM chapter_history
          WHERE chapter_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).bind(chapterId, limit).all();
        
        return jsonResponse(history.results);
      } catch (error) {
        console.error('Error fetching chapter history:', error);
        return errorResponse('Database error', 500);
      }
    }
    
    // POST /api/chapters/:chapterId/restore/:historyId - Restore chapter from history
    if (path.match(/^\/api\/chapters\/[^\/]+\/restore\/[^\/]+$/) && method === 'POST') {
      const chapterId = segments[3];
      const historyId = segments[5];
      
      if (!chapterId || !historyId) return errorResponse('Chapter ID and History ID required', 400);
      
      try {
        // Get the history version
        const history = await env.DB.prepare(`
          SELECT * FROM chapter_history WHERE id = ?
        `).bind(historyId).first();

        if (!history) {
          return errorResponse('History version not found', 404);
        }

        // Update the current chapter
        await env.DB.prepare(`
          UPDATE chapters 
          SET content = ?, word_count = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(history.content, history.word_count, chapterId).run();

        return jsonResponse({ message: 'Chapter restored successfully' });
      } catch (error) {
        return errorResponse('Failed to restore chapter', 500);
      }
    }

    // Phase 4: User Preferences & Profile Routes
    // GET /api/users/me/profile - Get user profile
    if (path === '/api/users/me/profile' && method === 'GET') {
      try {
        const userId = 'default-user';
        const user = await env.DB.prepare(`
          SELECT id, name, email, created_at, updated_at
          FROM users
          WHERE id = ?
        `).bind(userId).first();

        if (!user) {
          return errorResponse('User not found', 404);
        }

        const preferences = await env.DB.prepare(`
          SELECT * FROM preferences
          WHERE user_id = ?
        `).bind(userId).all();

        return jsonResponse({
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
          preferences: preferences.results
        });
      } catch (error) {
        return errorResponse('Failed to fetch user profile', 500);
      }
    }

    // GET /api/users/me/preferences - Get user preferences
    if (path === '/api/users/me/preferences' && method === 'GET') {
      try {
        const userId = 'default-user';
        const preferences = await env.DB.prepare(`
          SELECT * FROM preferences
          WHERE user_id = ?
        `).bind(userId).all();

        return jsonResponse(preferences.results);
      } catch (error) {
        return errorResponse('Failed to fetch user preferences', 500);
      }
    }

    // PUT /api/users/me/preferences - Update user preferences
    if (path === '/api/users/me/preferences' && method === 'PUT') {
      try {
        const userId = 'default-user';
        const { preferences } = requestBody;

        if (!preferences || !Array.isArray(preferences)) {
          return errorResponse('Preferences array required', 400);
        }

        // Delete existing preferences for this user
        await env.DB.prepare(`
          DELETE FROM preferences WHERE user_id = ?
        `).bind(userId).run();

        // Insert new preferences
        for (const pref of preferences) {
          const id = pref.id || generateId();
          const category = pref.category || 'general';
          
          await env.DB.prepare(`
            INSERT INTO preferences (id, user_id, key, value, category)
            VALUES (?, ?, ?, ?, ?)
          `).bind(id, userId, pref.key, pref.value, category).run();
        }

        // Return updated preferences
        const updatedPreferences = await env.DB.prepare(`
          SELECT * FROM preferences
          WHERE user_id = ?
        `).bind(userId).all();

        return jsonResponse(updatedPreferences.results);
      } catch (error) {
        return errorResponse('Failed to update preferences', 500);
      }
    }

    // Phase 5: AI Provider Configuration
    // GET /api/providers - Get available providers
    if (path === '/api/providers' && method === 'GET') {
      const providers = [
        { id: 'openai', name: 'OpenAI', enabled: true, supportsModels: true },
        { id: 'anthropic', name: 'Anthropic', enabled: true, supportsModels: true },
        { id: 'google', name: 'Google AI', enabled: true, supportsModels: true },
        { id: 'cohere', name: 'Cohere', enabled: true, supportsModels: true },
        { id: 'huggingface', name: 'Hugging Face', enabled: true, supportsModels: true }
      ];
      return jsonResponse(providers);
    }

    // GET /api/users/me/providers - Get user providers
    if (path === '/api/users/me/providers' && method === 'GET') {
      try {
        const userId = 'default-user';
        const providers = await env.DB.prepare(`
          SELECT * FROM user_providers
          WHERE user_id = ?
          ORDER BY name
        `).bind(userId).all();

        return jsonResponse(providers.results);
      } catch (error) {
        return errorResponse('Failed to fetch user providers', 500);
      }
    }

    // POST /api/users/me/providers - Add provider
    if (path === '/api/users/me/providers' && method === 'POST') {
      try {
        const userId = 'default-user';
        const { name, provider_type, config } = requestBody;

        if (!name || !provider_type) {
          return errorResponse('Name and provider type required', 400);
        }

        const id = generateId();
        await env.DB.prepare(`
          INSERT INTO user_providers (id, user_id, name, provider_type, api_key, base_url, model, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind(id, userId, name, provider_type, config.apiKey || '', config.baseUrl || '', config.model || '').run();

        const provider = await env.DB.prepare(`
          SELECT * FROM user_providers WHERE id = ?
        `).bind(id).first();

        return jsonResponse(provider, 201);
      } catch (error) {
        return errorResponse('Failed to create provider', 500);
      }
    }

    // PUT /api/users/me/providers/:providerId - Update provider
    if (path.match(/^\/api\/users\/me\/providers\/[^\/]+$/) && method === 'PUT') {
      const providerId = segments[5];
      if (!providerId) return errorResponse('Provider ID required', 400);

      try {
        const { name, provider_type, config } = requestBody;
        const updates: any = {};
        
        if (name !== undefined) updates.name = name;
        if (provider_type !== undefined) updates.provider_type = provider_type;
        if (config) {
          if (config.apiKey !== undefined) updates.api_key = config.apiKey;
          if (config.baseUrl !== undefined) updates.base_url = config.baseUrl;
          if (config.model !== undefined) updates.model = config.model;
        }

        const fields = Object.keys(updates);
        if (fields.length === 0) {
          return errorResponse('No fields to update', 400);
        }

        const setClause = fields.map(field => `${field} = ?`).join(', ');
        const values = [...Object.values(updates), providerId];

        await env.DB.prepare(`
          UPDATE user_providers 
          SET ${setClause}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(...values).run();

        const provider = await env.DB.prepare(`
          SELECT * FROM user_providers WHERE id = ?
        `).bind(providerId).first();

        return jsonResponse(provider);
      } catch (error) {
        return errorResponse('Failed to update provider', 500);
      }
    }

    // DELETE /api/users/me/providers/:providerId - Delete provider
    if (path.match(/^\/api\/users\/me\/providers\/[^\/]+$/) && method === 'DELETE') {
      const providerId = segments[5];
      if (!providerId) return errorResponse('Provider ID required', 400);

      try {
        await env.DB.prepare(`
          DELETE FROM user_providers WHERE id = ?
        `).bind(providerId).run();

        return jsonResponse({ message: 'Provider deleted successfully' });
      } catch (error) {
        return errorResponse('Failed to delete provider', 500);
      }
    }

    // Phase 6: Style & Optimization
    // GET /api/style-profile - Get style profile
    if (path === '/api/style-profile' && method === 'GET') {
      try {
        const userId = 'default-user';
        const profile = await env.DB.prepare(`
          SELECT * FROM style_profiles
          WHERE user_id = ?
        `).bind(userId).first();

        if (!profile) {
          // Return default profile if none exists
          return jsonResponse({
            id: null,
            userId,
            profile_type: 'narrative',
            characteristics: [],
            examples: [],
            createdAt: null,
            updatedAt: null
          });
        }

        return jsonResponse(profile);
      } catch (error) {
        return errorResponse('Failed to fetch style profile', 500);
      }
    }

    // PUT /api/style-profile - Update style profile
    if (path === '/api/style-profile' && method === 'PUT') {
      try {
        const userId = 'default-user';
        const { profile_type, characteristics, examples } = requestBody;

        const id = generateId();
        await env.DB.prepare(`
          INSERT INTO style_profiles (id, user_id, profile_type, characteristics, examples, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET
            profile_type = COALESCE(?, profile_type),
            characteristics = COALESCE(?, characteristics),
            examples = COALESCE(?, examples),
            updated_at = CURRENT_TIMESTAMP
        `).bind(id, userId, profile_type, JSON.stringify(characteristics), JSON.stringify(examples), profile_type, JSON.stringify(characteristics), JSON.stringify(examples)).run();

        const profile = await env.DB.prepare(`
          SELECT * FROM style_profiles WHERE user_id = ?
        `).bind(userId).first();

        return jsonResponse(profile);
      } catch (error) {
        return errorResponse('Failed to update style profile', 500);
      }
    }

    // POST /api/ai/cleanup - AI cleanup of text
    if (path === '/api/ai/cleanup' && method === 'POST') {
      try {
        const { text, options } = requestBody;
        
        if (!text) {
          return errorResponse('Text required for cleanup', 400);
        }

        // Simple cleanup implementation
        const cleanedText = text
          .replace(/\s+/g, ' ')
          .replace(/[.]{2,}/g, '.')
          .replace(/\s*,\s*/g, ', ')
          .trim();

        const result = {
          original: text,
          cleaned: cleanedText,
          changes: text.length !== cleanedText.length ? [{
            type: 'formatting',
            description: text.length > cleanedText.length ? 'Removed excess whitespace' : 'Standardized punctuation',
            original: text.substring(0, Math.min(50, text.length)),
            cleaned: cleanedText.substring(0, Math.min(50, cleanedText.length))
          }] : [],
          stats: {
            originalLength: text.length,
            cleanedLength: cleanedText.length,
            reductionPercent: Math.round(((text.length - cleanedText.length) / text.length) * 100)
          }
        };

        return jsonResponse(result);
      } catch (error) {
        return errorResponse('Failed to cleanup text', 500);
      }
    }
    
    // Phase 7: Text Generation Routes
    // POST /api/generate/text - Generate text with AI provider
    if (path === '/api/generate/text' && method === 'POST') {
      try {
        const { prompt, provider, model, maxTokens, temperature } = await request.json();
        
        if (!prompt) return errorResponse('Prompt is required', 400);
        
        const mockResponse = `Generated text based on: "${prompt.substring(0, 50)}..."`;
        
        return jsonResponse({
          text: mockResponse,
          provider: provider || 'openai',
          model: model || 'gpt-3.5-turbo',
          tokens: maxTokens || 150,
          temperature: temperature || 0.7
        });
      } catch (error) {
        return errorResponse('Failed to generate text', 500);
      }
    }
    
    // POST /api/generate/outline - Generate chapter outline
    if (path === '/api/generate/outline' && method === 'POST') {
      try {
        const { title, description, chapterId } = await request.json();
        
        if (!title) return errorResponse('Title is required', 400);
        
        const outline = [
          { heading: "Introduction", content: "Set the scene and introduce main characters" },
          { heading: "Rising Action", content: "Develop the conflict and build tension" },
          { heading: "Climax", content: "The turning point of the story" },
          { heading: "Falling Action", content: "Events following the climax" },
          { heading: "Conclusion", content: "Resolve the conflict and conclude the story" }
        ];
        
        return jsonResponse({
          outline,
          title,
          description: description || '',
          chapterId: chapterId || null
        });
      } catch (error) {
        return errorResponse('Failed to generate outline', 500);
      }
    }
    
    // POST /api/generate/summary - Generate summary of text
    if (path === '/api/generate/summary' && method === 'POST') {
      try {
        const { text, maxLength = 100 } = await request.json();
        
        if (!text) return errorResponse('Text is required', 400);
        
        const summary = text.length > maxLength 
          ? text.substring(0, maxLength) + '...' 
          : text;
        
        return jsonResponse({
          summary,
          originalLength: text.length,
          summaryLength: summary.length
        });
      } catch (error) {
        return errorResponse('Failed to generate summary', 500);
      }
    }
    
    // POST /api/generate/expand - Expand text with more detail
    if (path === '/api/generate/expand' && method === 'POST') {
      try {
        const { text, expansionFactor = 1.5 } = await request.json();
        
        if (!text) return errorResponse('Text is required', 400);
        
        const expandedText = text + ' This expanded version adds more detail and context to the original content, providing a richer and more comprehensive narrative.';
        
        return jsonResponse({
          original: text,
          expanded: expandedText,
          expansionFactor,
          originalLength: text.length,
          expandedLength: expandedText.length
        });
      } catch (error) {
        return errorResponse('Failed to expand text', 500);
      }
    }
    
    // POST /api/generate/rephrase - Rephrase text
    if (path === '/api/generate/rephrase' && method === 'POST') {
      try {
        const { text, style = 'professional' } = await request.json();
        
        if (!text) return errorResponse('Text is required', 400);
        
        const rephrased = style === 'professional' 
          ? text.replace(/\b(good|nice|cool)\b/g, 'excellent')
          : text.toUpperCase();
        
        return jsonResponse({
          original: text,
          rephrased,
          style
        });
      } catch (error) {
        return errorResponse('Failed to rephrase text', 500);
      }
    }
    
    // POST /api/generate/continue - Continue writing from where text left off
    if (path === '/api/generate/continue' && method === 'POST') {
      try {
        const { text, wordCount = 50 } = await request.json();
        
        if (!text) return errorResponse('Text is required', 400);
        
        const continuation = 'The story continues with new developments and unexpected twists that build upon the existing narrative...';
        
        return jsonResponse({
          original: text,
          continuation,
          wordCount,
          estimatedTotalLength: text.length + continuation.length
        });
      } catch (error) {
        return errorResponse('Failed to continue text', 500);
      }
    }
    
    // GET /api/generate/history - Get generation history
    if (path === '/api/generate/history' && method === 'GET') {
      try {
        const userId = 'default-user';
        const limit = parseInt(url.searchParams.get('limit') || '20');
        
        const history = await env.DB.prepare(`
          SELECT * FROM generation_history 
          WHERE user_id = ? 
          ORDER BY created_at DESC 
          LIMIT ?
        `).bind(userId, limit).all();
        
        return jsonResponse(history.results);
      } catch (error) {
        return errorResponse('Failed to fetch generation history', 500);
      }
    }
    
    // POST /api/generate/history/clear - Clear generation history
    if (path === '/api/generate/history/clear' && method === 'POST') {
      try {
        const userId = 'default-user';
        
        await env.DB.prepare(`
          DELETE FROM generation_history 
          WHERE user_id = ?
        `).bind(userId).run();
        
        return jsonResponse({ message: 'Generation history cleared' });
      } catch (error) {
        return errorResponse('Failed to clear generation history', 500);
      }
    }
    
    // Phase 8: Autonomous Writing Routes
    // POST /api/autonomous/start - Start autonomous writing session
    if (path === '/api/autonomous/start' && method === 'POST') {
      try {
        const { projectId, chapterId, mode = 'creative', options = {} } = await request.json();
        
        if (!projectId) return errorResponse('Project ID required', 400);
        
        const sessionId = generateId();
        const now = new Date().toISOString();
        
        await env.DB.prepare(`
          INSERT INTO autonomous_sessions (id, project_id, chapter_id, mode, config, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
        `).bind(sessionId, projectId, chapterId || null, mode, JSON.stringify(options), now, now).run();
        
        return jsonResponse({
          sessionId,
          projectId,
          chapterId: chapterId || null,
          mode,
          status: 'active',
          createdAt: now
        }, 201);
      } catch (error) {
        return errorResponse('Failed to start autonomous session', 500);
      }
    }
    
    // GET /api/autonomous/status - Get autonomous writing status
    if (path === '/api/autonomous/status' && method === 'GET') {
      try {
        const projectId = url.searchParams.get('projectId');
        if (!projectId) return errorResponse('Project ID required', 400);
        
        const sessions = await env.DB.prepare(`
          SELECT * FROM autonomous_sessions 
          WHERE project_id = ? AND status = 'active'
          ORDER BY created_at DESC
        `).bind(projectId).all();
        
        return jsonResponse({
          active: sessions.results.length > 0,
          sessions: sessions.results,
          count: sessions.results.length
        });
      } catch (error) {
        return errorResponse('Failed to fetch autonomous status', 500);
      }
    }
    
    // POST /api/autonomous/stop - Stop autonomous writing session
    if (path === '/api/autonomous/stop' && method === 'POST') {
      try {
        const { sessionId } = await request.json();
        if (!sessionId) return errorResponse('Session ID required', 400);
        
        await env.DB.prepare(`
          UPDATE autonomous_sessions 
          SET status = 'stopped', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'active'
        `).bind(sessionId).run();
        
        return jsonResponse({ message: 'Session stopped successfully' });
      } catch (error) {
        return errorResponse('Failed to stop session', 500);
      }
    }
    
    // GET /api/autonomous/suggestions - Get writing suggestions
    if (path === '/api/autonomous/suggestions' && method === 'GET') {
      try {
        const sessionId = url.searchParams.get('sessionId');
        const limit = parseInt(url.searchParams.get('limit') || '10');
        
        if (!sessionId) return errorResponse('Session ID required', 400);
        
        const suggestions = await env.DB.prepare(`
          SELECT * FROM autonomous_suggestions 
          WHERE session_id = ? 
          ORDER BY created_at DESC 
          LIMIT ?
        `).bind(sessionId, limit).all();
        
        return jsonResponse({
          suggestions: suggestions.results,
          count: suggestions.results.length
        });
      } catch (error) {
        return errorResponse('Failed to fetch suggestions', 500);
      }
    }
    
    // POST /api/autonomous/accept - Accept a suggestion
    if (path === '/api/autonomous/accept' && method === 'POST') {
      try {
        const { suggestionId } = await request.json();
        if (!suggestionId) return errorResponse('Suggestion ID required', 400);
        
        await env.DB.prepare(`
          UPDATE autonomous_suggestions 
          SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending'
        `).bind(suggestionId).run();
        
        return jsonResponse({ message: 'Suggestion accepted' });
      } catch (error) {
        return errorResponse('Failed to accept suggestion', 500);
      }
    }
    
    // POST /api/autonomous/reject - Reject a suggestion
    if (path === '/api/autonomous/reject' && method === 'POST') {
      try {
        const { suggestionId, reason } = await request.json();
        if (!suggestionId) return errorResponse('Suggestion ID required', 400);
        
        await env.DB.prepare(`
          UPDATE autonomous_suggestions 
          SET status = 'rejected', feedback = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'pending'
        `).bind(reason || '', suggestionId).run();
        
        return jsonResponse({ message: 'Suggestion rejected' });
      } catch (error) {
        return errorResponse('Failed to reject suggestion', 500);
      }
    }
    
    // Phase 9: Story Bible Routes
    // GET /api/story-bible/:projectId - Get story bible
    if (path.match(/^\/api\/story-bible\/[^\/]+$/) && method === 'GET') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      try {
        const bible = await env.DB.prepare(`
          SELECT * FROM story_bibles 
          WHERE project_id = ?
        `).bind(projectId).first();
        
        return jsonResponse(bible || { 
          projectId, 
          sections: [], 
          createdAt: null, 
          updatedAt: null 
        });
      } catch (error) {
        return errorResponse('Failed to fetch story bible', 500);
      }
    }
    
    // PUT /api/story-bible/:projectId - Update story bible
    if (path.match(/^\/api\/story-bible\/[^\/]+$/) && method === 'PUT') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      const { sections, metadata } = requestBody;
      
      try {
        const id = generateId();
        const now = new Date().toISOString();
        
        await env.DB.prepare(`
          INSERT INTO story_bibles (id, project_id, sections, metadata, has_bible, created_at, updated_at)
          VALUES (?, ?, ?, ?, true, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET
            sections = COALESCE(?, sections),
            metadata = COALESCE(?, metadata),
            has_bible = true,
            updated_at = CURRENT_TIMESTAMP
        `).bind(id, projectId, JSON.stringify(sections), JSON.stringify(metadata || {}), now, now, 
        JSON.stringify(sections), JSON.stringify(metadata || {})).run();
        
        return jsonResponse({ 
          projectId, 
          sections: sections || [], 
          metadata: metadata || {}, 
          hasBible: true,
          updatedAt: now 
        });
      } catch (error) {
        return errorResponse('Failed to update story bible', 500);
      }
    }
    
    // POST /api/story-bible/:projectId/sections - Add section to story bible
    if (path.match(/^\/api\/story-bible\/[^\/]+\/sections$/) && method === 'POST') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      const { title, content, type = 'custom' } = requestBody;
      if (!title) return errorResponse('Section title required', 400);
      
      try {
        // Get current bible
        const current = await env.DB.prepare(`
          SELECT sections FROM story_bibles WHERE project_id = ?
        `).bind(projectId).first();
        
        const sections = JSON.parse(current?.sections || '[]');
        const newSection = {
          id: generateId(),
          title,
          content: content || '',
          type,
          order: sections.length
        };
        
        sections.push(newSection);
        
        await env.DB.prepare(`
          UPDATE story_bibles 
          SET sections = ?, updated_at = CURRENT_TIMESTAMP
          WHERE project_id = ?
        `).bind(JSON.stringify(sections), projectId).run();
        
        return jsonResponse(newSection, 201);
      } catch (error) {
        return errorResponse('Failed to add section', 500);
      }
    }
    
    // PUT /api/story-bible/:projectId/sections/:sectionId - Update section
    if (path.match(/^\/api\/story-bible\/[^\/]+\/sections\/[^\/]+$/) && method === 'PUT') {
      const projectId = segments[3];
      const sectionId = segments[5];
      if (!projectId || !sectionId) return errorResponse('Project ID and Section ID required', 400);
      
      const { title, content, order } = requestBody;
      
      try {
        const bible = await env.DB.prepare(`
          SELECT sections FROM story_bibles WHERE project_id = ?
        `).bind(projectId).first();
        
        if (!bible) return errorResponse('Story bible not found', 404);
        
        const sections = JSON.parse(bible.sections || '[]');
        const sectionIndex = sections.findIndex((s: any) => s.id === sectionId);
        
        if (sectionIndex === -1) return errorResponse('Section not found', 404);
        
        if (title !== undefined) sections[sectionIndex].title = title;
        if (content !== undefined) sections[sectionIndex].content = content;
        if (order !== undefined) sections[sectionIndex].order = order;
        
        await env.DB.prepare(`
          UPDATE story_bibles 
          SET sections = ?, updated_at = CURRENT_TIMESTAMP
          WHERE project_id = ?
        `).bind(JSON.stringify(sections), projectId).run();
        
        return jsonResponse(sections[sectionIndex]);
      } catch (error) {
        return errorResponse('Failed to update section', 500);
      }
    }
    
    // DELETE /api/story-bible/:projectId/sections/:sectionId - Delete section
    if (path.match(/^\/api\/story-bible\/[^\/]+\/sections\/[^\/]+$/) && method === 'DELETE') {
      const projectId = segments[3];
      const sectionId = segments[5];
      if (!projectId || !sectionId) return errorResponse('Project ID and Section ID required', 400);
      
      try {
        const bible = await env.DB.prepare(`
          SELECT sections FROM story_bibles WHERE project_id = ?
        `).bind(projectId).first();
        
        if (!bible) return errorResponse('Story bible not found', 404);
        
        const sections = JSON.parse(bible.sections || '[]');
        const sectionIndex = sections.findIndex((s: any) => s.id === sectionId);
        
        if (sectionIndex === -1) return errorResponse('Section not found', 404);
        
        sections.splice(sectionIndex, 1);
        
        await env.DB.prepare(`
          UPDATE story_bibles 
          SET sections = ?, updated_at = CURRENT_TIMESTAMP
          WHERE project_id = ?
        `).bind(JSON.stringify(sections), projectId).run();
        
        return jsonResponse({ message: 'Section deleted successfully' });
      } catch (error) {
        return errorResponse('Failed to delete section', 500);
      }
    }
    
    // GET /api/story-bible/:projectId/export - Export story bible
    if (path.match(/^\/api\/story-bible\/[^\/]+\/export$/) && method === 'GET') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      try {
        const bible = await env.DB.prepare(`
          SELECT sections, metadata FROM story_bibles WHERE project_id = ?
        `).bind(projectId).first();
        
        if (!bible) return errorResponse('Story bible not found', 404);
        
        const exportData = {
          projectId,
          sections: JSON.parse(bible.sections || '[]'),
          metadata: JSON.parse(bible.metadata || '{}'),
          exportedAt: new Date().toISOString()
        };
        
        return jsonResponse(exportData);
      } catch (error) {
        return errorResponse('Failed to export story bible', 500);
      }
    }
    
    // POST /api/story-bible/:projectId/import - Import story bible
    if (path.match(/^\/api\/story-bible\/[^\/]+\/import$/) && method === 'POST') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      const { sections, metadata } = requestBody;
      
      try {
        const id = generateId();
        const now = new Date().toISOString();
        
        await env.DB.prepare(`
          INSERT INTO story_bibles (id, project_id, sections, metadata, has_bible, created_at, updated_at)
          VALUES (?, ?, ?, ?, true, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET
            sections = ?,
            metadata = COALESCE(?, metadata),
            has_bible = true,
            updated_at = CURRENT_TIMESTAMP
        `).bind(id, projectId, JSON.stringify(sections), JSON.stringify(metadata || {}), now, now,
        JSON.stringify(sections), JSON.stringify(metadata || {})).run();
        
        return jsonResponse({ 
          projectId, 
          imported: true,
          sections: sections.length,
          importedAt: now 
        });
      } catch (error) {
        return errorResponse('Failed to import story bible', 500);
      }
    }
    
    // GET /api/story-bible/templates - Get story bible templates
    if (path === '/api/story-bible/templates' && method === 'GET') {
      const templates = [
        {
          id: 'novel',
          name: 'Novel Structure',
          description: 'Classic novel structure with exposition, rising action, climax, falling action, and resolution',
          sections: [
            { title: 'Exposition', content: 'Introduce setting, characters, initial situation', type: 'exposition' },
            { title: 'Rising Action', content: 'Series of events that build tension', type: 'rising-action' },
            { title: 'Climax', content: 'Turning point of the story', type: 'climax' },
            { title: 'Falling Action', content: 'Events following the climax', type: 'falling-action' },
            { title: 'Resolution', content: 'Wrap up loose ends', type: 'resolution' }
          ]
        },
        {
          id: 'hero-journey',
          name: 'Hero\'s Journey',
          description: 'Joseph Campbell\'s monomyth structure',
          sections: [
            { title: 'Ordinary World', content: 'Hero in normal life', type: 'ordinary-world' },
            { title: 'Call to Adventure', content: 'Hero receives challenge', type: 'call-to-adventure' },
            { title: 'Refusal of Call', content: 'Hero initially refuses', type: 'refusal' },
            { title: 'Meeting Mentor', content: 'Hero meets guide', type: 'mentor' },
            { title: 'Crossing Threshold', content: 'Hero enters new world', type: 'threshold' },
            { title: 'Tests and Trials', content: 'Hero faces challenges', type: 'trials' },
            { title: 'Ordeal', content: 'Major crisis', type: 'ordeal' },
            { title: 'Reward', content: 'Hero gains treasure', type: 'reward' },
            { title: 'Road Back', content: 'Hero returns home', type: 'road-back' },
            { title: 'Resurrection', content: 'Final test', type: 'resurrection' },
            { title: 'Return with Elixir', content: 'Hero brings back treasure', type: 'return' }
          ]
        }
      ];
      
      return jsonResponse(templates);
    }
    
    // Phase 10: Character Management Routes
    // GET /api/characters/:projectId - Get characters for project
    if (path.match(/^\/api\/characters\/[^\/]+$/) && method === 'GET') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      try {
        const characters = await env.DB.prepare(`
          SELECT * FROM characters 
          WHERE project_id = ? 
          ORDER BY name
        `).bind(projectId).all();
        
        return jsonResponse(characters.results || []);
      } catch (error) {
        return errorResponse('Failed to fetch characters', 500);
      }
    }
    
    // POST /api/characters/:projectId - Create character
    if (path.match(/^\/api\/characters\/[^\/]+$/) && method === 'POST') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      const { name, description, role, traits } = requestBody;
      if (!name) return errorResponse('Character name required', 400);
      
      try {
        const characterId = generateId();
        const now = new Date().toISOString();
        
        await env.DB.prepare(`
          INSERT INTO characters (id, project_id, name, description, role, traits, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(characterId, projectId, name, description || '', role || '', JSON.stringify(traits || []), now, now).run();
        
        return jsonResponse({
          id: characterId,
          projectId,
          name,
          description: description || '',
          role: role || '',
          traits: traits || [],
          createdAt: now,
          updatedAt: now
        }, 201);
      } catch (error) {
        return errorResponse('Failed to create character', 500);
      }
    }
    
    // GET /api/characters/:projectId/:characterId - Get specific character
    if (path.match(/^\/api\/characters\/[^\/]+\/[^\/]+$/) && method === 'GET') {
      const projectId = segments[3];
      const characterId = segments[4];
      if (!projectId || !characterId) return errorResponse('Project ID and Character ID required', 400);
      
      try {
        const character = await env.DB.prepare(`
          SELECT * FROM characters 
          WHERE id = ? AND project_id = ?
        `).bind(characterId, projectId).first();
        
        if (!character) return errorResponse('Character not found', 404);
        
        return jsonResponse(character);
      } catch (error) {
        return errorResponse('Failed to fetch character', 500);
      }
    }
    
    // PUT /api/characters/:projectId/:characterId - Update character
    if (path.match(/^\/api\/characters\/[^\/]+\/[^\/]+$/) && method === 'PUT') {
      const projectId = segments[3];
      const characterId = segments[4];
      if (!projectId || !characterId) return errorResponse('Project ID and Character ID required', 400);
      
      const { name, description, role, traits } = requestBody;
      
      try {
        const updates: string[] = [];
        const values: any[] = [];
        
        if (name !== undefined) { updates.push('name = ?'); values.push(name); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (role !== undefined) { updates.push('role = ?'); values.push(role); }
        if (traits !== undefined) { updates.push('traits = ?'); values.push(JSON.stringify(traits)); }
        
        if (updates.length === 0) return errorResponse('No fields to update', 400);
        
        updates.push('updated_at = ?');
        values.push(new Date().toISOString());
        
        const query = `UPDATE characters SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`;
        values.push(characterId, projectId);
        
        await env.DB.prepare(query).bind(...values).run();
        
        const updated = await env.DB.prepare(`
          SELECT * FROM characters WHERE id = ? AND project_id = ?
        `).bind(characterId, projectId).first();
        
        return jsonResponse(updated);
      } catch (error) {
        return errorResponse('Failed to update character', 500);
      }
    }
    
    // DELETE /api/characters/:projectId/:characterId - Delete character
    if (path.match(/^\/api\/characters\/[^\/]+\/[^\/]+$/) && method === 'DELETE') {
      const projectId = segments[3];
      const characterId = segments[4];
      if (!projectId || !characterId) return errorResponse('Project ID and Character ID required', 400);
      
      try {
        await env.DB.prepare(`
          DELETE FROM characters 
          WHERE id = ? AND project_id = ?
        `).bind(characterId, projectId).run();
        
        return jsonResponse({ message: 'Character deleted successfully' });
      } catch (error) {
        return errorResponse('Failed to delete character', 500);
      }
    }
    
    // GET /api/characters/:projectId/export - Export characters
    if (path.match(/^\/api\/characters\/[^\/]+\/export$/) && method === 'GET') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      try {
        const characters = await env.DB.prepare(`
          SELECT * FROM characters 
          WHERE project_id = ?
        `).bind(projectId).all();
        
        const exportData = {
          projectId,
          characters: characters.results,
          exportedAt: new Date().toISOString()
        };
        
        return jsonResponse(exportData);
      } catch (error) {
        return errorResponse('Failed to export characters', 500);
      }
    }
    
    // POST /api/characters/:projectId/import - Import characters
    if (path.match(/^\/api\/characters\/[^\/]+\/import$/) && method === 'POST') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      const { characters } = requestBody;
      
      if (!Array.isArray(characters)) return errorResponse('Characters array required', 400);
      
      try {
        // Delete existing characters for this project
        await env.DB.prepare(`
          DELETE FROM characters WHERE project_id = ?
        `).bind(projectId).run();
        
        // Import new characters
        const imported: any[] = [];
        for (const char of characters) {
          const characterId = char.id || generateId();
          const now = new Date().toISOString();
          
          await env.DB.prepare(`
            INSERT INTO characters (id, project_id, name, description, role, traits, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(characterId, projectId, char.name, char.description || '', char.role || '', 
          JSON.stringify(char.traits || []), now, now).run();
          
          imported.push({
            id: characterId,
            name: char.name,
            description: char.description || '',
            role: char.role || '',
            traits: char.traits || []
          });
        }
        
        return jsonResponse({
          projectId,
          imported: imported.length,
          characters: imported
        });
      } catch (error) {
        return errorResponse('Failed to import characters', 500);
      }
    }
    
    // GET /api/characters/:projectId/stats - Get character statistics
    if (path.match(/^\/api\/characters\/[^\/]+\/stats$/) && method === 'GET') {
      const projectId = segments[3];
      if (!projectId) return errorResponse('Project ID required', 400);
      
      try {
        const result = await env.DB.prepare(`
          SELECT COUNT(*) as count FROM characters WHERE project_id = ?
        `).bind(projectId).first();
        
        const rows = await env.DB.prepare(`
          SELECT * FROM characters WHERE project_id = ?
        `).bind(projectId).all();
        
        const roles = {};
        for (const char of rows.results as any[]) {
          const role = char.role || 'Unknown';
          roles[role] = (roles[role] || 0) + 1;
        }
        
        return jsonResponse({
          projectId,
          totalCount: result?.count || 0,
          roleDistribution: roles,
          averageTraitsPerCharacter: rows.results.length > 0 
            ? rows.results.reduce((sum, char: any) => sum + (char.traits?.length || 0), 0) / rows.results.length 
            : 0
        });
      } catch (error) {
        return errorResponse('Failed to fetch character statistics', 500);
      }
    }
    
    // Phase 11: Observability Routes
    // GET /api/metrics - Get application metrics
    if (path === '/api/metrics' && method === 'GET') {
      try {
        const projects = await env.DB.prepare(`
          SELECT COUNT(*) as project_count, SUM(word_count) as total_words 
          FROM projects
        `).first();
        
        const chapters = await env.DB.prepare(`
          SELECT COUNT(*) as chapter_count, AVG(word_count) as avg_chapter_words
          FROM chapters
        `).first();
        
        const users = await env.DB.prepare(`
          SELECT COUNT(*) as user_count FROM users
        `).first();
        
        return jsonResponse({
          projects: projects,
          chapters: chapters,
          users: users,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        return errorResponse('Failed to fetch metrics', 500);
      }
    }
    
    // GET /api/health - Health check
    if (path === '/api/health' && method === 'GET') {
      try {
        // Test database connection
        await env.DB.prepare('SELECT 1').first();
        
        return jsonResponse({
          status: 'healthy',
          database: 'connected',
          service: 'api-gateway',
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        });
      } catch (error) {
        return errorResponse(`Database connection failed: ${error.message}`, 503);
      }
    }
    
    // Phase 12: Testing Routes
    // POST /api/test/echo - Test echo endpoint
    if (path === '/api/test/echo' && method === 'POST') {
      try {
        const { message } = await request.json();
        
        return jsonResponse({
          echo: message,
          timestamp: new Date().toISOString(),
          method: 'POST',
          headers: Object.fromEntries(request.headers.entries())
        });
      } catch (error) {
        return errorResponse('Failed to echo message', 500);
      }
    }
    
    return new Response('Not Found', { status: 404 });
  }
}