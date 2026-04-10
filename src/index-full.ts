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
      const projectId = path.split('/')[3];
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
      const projectId = path.split('/')[3];
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
      const projectId = path.split('/')[3];
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
    
    return new Response('Not Found', { status: 404 });
  }
}