// Cloudflare Workers main handler
// This is the actual entry point for CF (configured in wrangler.toml as main)

interface Env {
  DB: D1Database;
}

// Durable Object class for existing deployments
export class MagnumOpusBackend {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    return new Response('Hello from MagnumOpusBackend Durable Object', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
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

// Generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

// Main handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

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

    // Route health check
    if (path === '/health') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Placeholder for API routes
    if (path.startsWith('/api/')) {
      return jsonResponse({ message: 'API endpoint - configure routes as needed' });
    }

    // 404
    return errorResponse('Not found', 404);
  }
};
