import { spawn } from 'node:child_process';
import * as readline from 'node:readline';

export interface CodexAuthStatus {
  available: boolean;
  loggedIn: boolean;
  mode?: string;
  message: string;
}

interface CodexCompletionArgs {
  systemPrompt: string;
  userMessage: string;
  model: string;
  signal?: AbortSignal;
}

interface CodexEvent {
  type?: string;
  item?: {
    type?: string;
    text?: string;
    message?: string;
  };
  error?: {
    message?: string;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cached_input_tokens?: number;
  };
  message?: string;
}

function buildPrompt(systemPrompt: string, userMessage: string): string {
  return [
    'Follow the system instructions and answer the user request directly.',
    'Return only the assistant response text.',
    '',
    'SYSTEM INSTRUCTIONS:',
    systemPrompt,
    '',
    'USER REQUEST:',
    userMessage,
  ].join('\n');
}

export function getCodexAuthStatus(signal?: AbortSignal): Promise<CodexAuthStatus> {
  return new Promise((resolve) => {
    const child = spawn('codex', ['login', 'status'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const cleanup = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };

    const finish = (status: CodexAuthStatus): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(status);
    };

    const onAbort = (): void => {
      child.kill('SIGTERM');
      finish({
        available: false,
        loggedIn: false,
        message: 'Codex auth status check aborted.',
      });
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      finish({
        available: false,
        loggedIn: false,
        message: error.message,
      });
    });

    child.on('close', (code) => {
      const output = `${stdout}\n${stderr}`.trim();
      const loginMatch = output.match(/Logged in using\s+(.+)/i);
      if (loginMatch) {
        finish({
          available: true,
          loggedIn: true,
          mode: loginMatch[1].trim(),
          message: output,
        });
        return;
      }

      const lower = output.toLowerCase();
      if (
        code === 1 ||
        lower.includes('not logged in') ||
        lower.includes('no stored credentials') ||
        lower.includes('login required')
      ) {
        finish({
          available: true,
          loggedIn: false,
          message: output || 'Codex is not logged in.',
        });
        return;
      }

      finish({
        available: code === 0,
        loggedIn: false,
        message: output || `Unable to determine Codex login status (exit ${code ?? 'unknown'}).`,
      });
    });
  });
}

export async function chatCompletionViaCodex({
  systemPrompt,
  userMessage,
  model,
  signal,
}: CodexCompletionArgs): Promise<{ text: string; tokens: number }> {
  const status = await getCodexAuthStatus(signal);
  if (!status.available) {
    throw new Error(`Codex CLI unavailable: ${status.message}`);
  }
  if (!status.loggedIn) {
    throw new Error('Codex is not logged in. Run `codex login` in a terminal, then retry.');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      'codex',
      [
        'exec',
        '--json',
        '--color',
        'never',
        '--sandbox',
        'read-only',
        '--skip-git-repo-check',
        '-c',
        'model_reasoning_effort="medium"',
        '--model',
        model,
        buildPrompt(systemPrompt, userMessage),
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NO_COLOR: '1',
        },
      }
    );

    const rl = readline.createInterface({ input: child.stdout });
    let stderr = '';
    let finalText = '';
    let finalError = '';
    let completed = false;
    let tokens = 0;
    let aborted = false;

    const cleanup = (): void => {
      rl.close();
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      aborted = true;
      child.kill('SIGTERM');
      cleanup();
      reject(new Error('Aborted'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) return;

      let event: CodexEvent;
      try {
        event = JSON.parse(trimmed) as CodexEvent;
      } catch {
        return;
      }

      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        finalText = event.item.text || finalText;
        return;
      }

      if (event.type === 'turn.completed') {
        completed = true;
        tokens = (event.usage?.input_tokens || 0) + (event.usage?.output_tokens || 0);
        return;
      }

      if (event.type === 'turn.failed') {
        finalError = event.error?.message || 'Codex generation failed';
        return;
      }

      if (event.type === 'error' && event.message) {
        finalError = event.message;
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      cleanup();
      reject(error);
    });

    child.on('close', (code) => {
      if (aborted) return;
      cleanup();

      if (code === 0 && completed) {
        resolve({ text: finalText, tokens });
        return;
      }

      reject(new Error(finalError || stderr || `Codex exited with code ${code}`));
    });
  });
}
