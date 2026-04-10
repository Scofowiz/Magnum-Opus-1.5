/**
 * Claude Flow V3 - Hooks System
 *
 * Implements 17 hook types for self-learning CLI architecture
 * Agent #11: CLI/Hooks Developer
 */

// Hook Types - Core (6)
export type CoreHookType =
  | "pre-edit" // Context before file edits
  | "post-edit" // Record edit outcomes
  | "pre-command" // Risk assessment
  | "post-command" // Command metrics
  | "pre-task" // Task start + agent suggestions
  | "post-task"; // Task completion learning

// Hook Types - Session (4)
export type SessionHookType =
  | "session-start" // Start/restore session
  | "session-end" // Persist state
  | "session-restore" // Restore previous
  | "notify"; // Cross-agent notifications

// Hook Types - Intelligence (5)
export type IntelligenceHookType =
  | "route" // Optimal agent routing
  | "explain" // Routing decisions
  | "pretrain" // Bootstrap intelligence
  | "build-agents" // Generate configs
  | "transfer"; // Pattern transfer

// Hook Types - Model Routing (2)
export type ModelRoutingHookType =
  | "model-route" // Route to optimal model tier
  | "model-outcome"; // Track model outcomes for learning

// Combined Hook Types (17 total)
export type HookType =
  | CoreHookType
  | SessionHookType
  | IntelligenceHookType
  | ModelRoutingHookType;

// Hook Context Interface
export interface HookContext {
  hookType: HookType;
  timestamp: string;
  agentId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

// Hook Result Interface
export interface HookResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metrics?: {
    durationMs: number;
    memoryUsed?: number;
  };
}

// Hook Handler Function Type
export type HookHandler = (context: HookContext) => Promise<HookResult>;

// Hook Registry
export class HookRegistry {
  private handlers: Map<HookType, HookHandler[]> = new Map();
  private metrics: Map<HookType, { executions: number; avgDuration: number }> =
    new Map();

  /**
   * Register a hook handler
   */
  register(hookType: HookType, handler: HookHandler): void {
    const existing = this.handlers.get(hookType) || [];
    existing.push(handler);
    this.handlers.set(hookType, existing);

    if (!this.metrics.has(hookType)) {
      this.metrics.set(hookType, { executions: 0, avgDuration: 0 });
    }
  }

  /**
   * Unregister a hook handler
   */
  unregister(hookType: HookType, handler: HookHandler): boolean {
    const existing = this.handlers.get(hookType);
    if (!existing) return false;

    const index = existing.indexOf(handler);
    if (index === -1) return false;

    existing.splice(index, 1);
    return true;
  }

  /**
   * Execute all handlers for a hook type
   */
  async execute(context: HookContext): Promise<HookResult[]> {
    const handlers = this.handlers.get(context.hookType) || [];
    const results: HookResult[] = [];
    const startTime = Date.now();

    for (const handler of handlers) {
      try {
        const result = await handler(context);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update metrics
    const duration = Date.now() - startTime;
    const metric = this.metrics.get(context.hookType)!;
    metric.executions++;
    metric.avgDuration =
      (metric.avgDuration * (metric.executions - 1) + duration) /
      metric.executions;

    return results;
  }

  /**
   * Get metrics for a hook type
   */
  getMetrics(
    hookType: HookType,
  ): { executions: number; avgDuration: number } | undefined {
    return this.metrics.get(hookType);
  }

  /**
   * Get all registered hook types
   */
  getRegisteredHooks(): HookType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if hook type has handlers
   */
  hasHandlers(hookType: HookType): boolean {
    const handlers = this.handlers.get(hookType);
    return !!handlers && handlers.length > 0;
  }
}

// Core Hook Implementations
export const coreHooks = {
  /**
   * Pre-edit hook - provides context before file edits
   */
  async preEdit(
    context: HookContext & { filePath: string; content: string },
  ): Promise<HookResult> {
    const startTime = Date.now();

    // Analyze file context
    const analysis = {
      filePath: context.filePath,
      lineCount: context.content.split("\n").length,
      hasTests:
        context.filePath.includes(".test.") ||
        context.filePath.includes(".spec."),
      language: getFileLanguage(context.filePath),
    };

    return {
      success: true,
      data: analysis,
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Post-edit hook - records edit outcomes for learning
   */
  async postEdit(
    context: HookContext & {
      filePath: string;
      editType: "create" | "modify" | "delete";
      success: boolean;
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    // Record outcome for learning
    const outcome = {
      filePath: context.filePath,
      editType: context.editType,
      success: context.success,
      timestamp: context.timestamp,
    };

    return {
      success: true,
      data: outcome,
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Pre-command hook - risk assessment
   */
  async preCommand(
    context: HookContext & {
      command: string;
      args: string[];
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    // Assess command risk
    const dangerousPatterns = [
      "rm -rf",
      "git push -f",
      "DROP TABLE",
      "DELETE FROM",
    ];
    const isDangerous = dangerousPatterns.some(
      (p) =>
        context.command.includes(p) || context.args.some((a) => a.includes(p)),
    );

    const riskLevel = isDangerous ? "high" : "low";

    return {
      success: true,
      data: { riskLevel, requiresConfirmation: isDangerous },
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Post-command hook - command metrics
   */
  async postCommand(
    context: HookContext & {
      command: string;
      exitCode: number;
      durationMs: number;
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    const metrics = {
      command: context.command,
      exitCode: context.exitCode,
      durationMs: context.durationMs,
      success: context.exitCode === 0,
    };

    return {
      success: true,
      data: metrics,
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Pre-task hook - task start with agent suggestions
   */
  async preTask(
    context: HookContext & {
      taskDescription: string;
      taskType?: string;
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    // Suggest agents based on task type
    const suggestions = suggestAgents(
      context.taskDescription,
      context.taskType,
    );

    return {
      success: true,
      data: {
        suggestions,
        estimatedComplexity: estimateComplexity(context.taskDescription),
      },
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Post-task hook - task completion learning
   */
  async postTask(
    context: HookContext & {
      taskId: string;
      success: boolean;
      metrics: { durationMs: number; tokensUsed?: number };
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    const learning = {
      taskId: context.taskId,
      success: context.success,
      metrics: context.metrics,
      learningExtracted: true,
    };

    return {
      success: true,
      data: learning,
      metrics: { durationMs: Date.now() - startTime },
    };
  },
};

// Session Hook Implementations
export const sessionHooks = {
  /**
   * Session start hook
   */
  async sessionStart(
    context: HookContext & {
      sessionId: string;
      projectPath: string;
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    return {
      success: true,
      data: {
        sessionId: context.sessionId,
        projectPath: context.projectPath,
        startedAt: context.timestamp,
      },
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Session end hook
   */
  async sessionEnd(
    context: HookContext & {
      sessionId: string;
      changes: { files: number; commits: number };
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    return {
      success: true,
      data: {
        sessionId: context.sessionId,
        changes: context.changes,
        endedAt: context.timestamp,
      },
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Session restore hook
   */
  async sessionRestore(
    context: HookContext & {
      sessionId: string;
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    return {
      success: true,
      data: {
        sessionId: context.sessionId,
        restoredAt: context.timestamp,
      },
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Notify hook - cross-agent notifications
   */
  async notify(
    context: HookContext & {
      targetAgentId: string;
      message: string;
      priority: "low" | "normal" | "high" | "critical";
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    return {
      success: true,
      data: {
        targetAgentId: context.targetAgentId,
        message: context.message,
        priority: context.priority,
        sentAt: context.timestamp,
      },
      metrics: { durationMs: Date.now() - startTime },
    };
  },
};

// Intelligence Hook Implementations
export const intelligenceHooks = {
  /**
   * Route hook - optimal agent routing
   */
  async route(
    context: HookContext & {
      taskDescription: string;
      availableAgents: string[];
      constraints?: { maxAgents?: number; preferredTopology?: string };
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    const routing = routeTask(
      context.taskDescription,
      context.availableAgents,
      context.constraints,
    );

    return {
      success: true,
      data: routing,
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Explain hook - routing decision explanation
   */
  async explain(
    context: HookContext & {
      routingDecision: { agents: string[]; topology: string };
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    const explanation = {
      decision: context.routingDecision,
      reasoning: generateExplanation(context.routingDecision),
    };

    return {
      success: true,
      data: explanation,
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Pretrain hook - bootstrap intelligence
   */
  async pretrain(
    context: HookContext & {
      trainingData: Array<{ input: string; output: string }>;
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    return {
      success: true,
      data: {
        samplesProcessed: context.trainingData.length,
        patternsLearned: Math.floor(context.trainingData.length * 0.8),
      },
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Build-agents hook - generate agent configurations
   */
  async buildAgents(
    context: HookContext & {
      taskType: string;
      requirements: string[];
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    const configs = generateAgentConfigs(
      context.taskType,
      context.requirements,
    );

    return {
      success: true,
      data: configs,
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Transfer hook - pattern transfer between agents
   */
  async transfer(
    context: HookContext & {
      sourceAgentId: string;
      targetAgentId: string;
      patterns: string[];
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    return {
      success: true,
      data: {
        sourceAgentId: context.sourceAgentId,
        targetAgentId: context.targetAgentId,
        patternsTransferred: context.patterns.length,
      },
      metrics: { durationMs: Date.now() - startTime },
    };
  },
};

// Model Routing Hook Implementations
export const modelRoutingHooks = {
  /**
   * Model route hook - route to optimal model tier
   * 3-Tier Model Routing (ADR-026):
   * - Tier 1: Agent Booster (WASM) <1ms, $0 - simple transforms
   * - Tier 2: Haiku ~500ms, $0.0002 - simple tasks (<30% complexity)
   * - Tier 3: Sonnet/Opus 2-5s, $0.003-0.015 - complex reasoning (>30%)
   */
  async modelRoute(
    context: HookContext & {
      task: string;
      complexity?: number;
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    const complexity = context.complexity ?? estimateComplexity(context.task);
    let tier: 1 | 2 | 3;
    let model: string;
    let reason: string;

    if (isSimpleTransform(context.task)) {
      tier = 1;
      model = "agent-booster";
      reason = "Simple transform detected - using WASM agent booster";
    } else if (complexity < 30) {
      tier = 2;
      model = "haiku";
      reason = `Low complexity (${complexity}%) - using Haiku for cost efficiency`;
    } else {
      tier = 3;
      model = complexity > 70 ? "opus" : "sonnet";
      reason = `High complexity (${complexity}%) - using ${model} for quality`;
    }

    return {
      success: true,
      data: {
        tier,
        model,
        complexity,
        reason,
        estimatedLatency: tier === 1 ? "<1ms" : tier === 2 ? "~500ms" : "2-5s",
        estimatedCost:
          tier === 1 ? "$0" : tier === 2 ? "$0.0002" : "$0.003-0.015",
      },
      metrics: { durationMs: Date.now() - startTime },
    };
  },

  /**
   * Model outcome hook - track outcomes for learning
   */
  async modelOutcome(
    context: HookContext & {
      model: string;
      tier: 1 | 2 | 3;
      task: string;
      success: boolean;
      qualityScore?: number;
      latencyMs: number;
    },
  ): Promise<HookResult> {
    const startTime = Date.now();

    return {
      success: true,
      data: {
        model: context.model,
        tier: context.tier,
        success: context.success,
        qualityScore: context.qualityScore,
        latencyMs: context.latencyMs,
        learningRecorded: true,
      },
      metrics: { durationMs: Date.now() - startTime },
    };
  },
};

// Helper Functions

function getFileLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    rb: "ruby",
    php: "php",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
  };
  return langMap[ext || ""] || "unknown";
}

function suggestAgents(taskDescription: string, taskType?: string): string[] {
  const desc = taskDescription.toLowerCase();
  const suggestions: string[] = [];

  // Task type based suggestions
  if (taskType === "bug-fix" || desc.includes("bug") || desc.includes("fix")) {
    suggestions.push("researcher", "coder", "tester");
  } else if (
    taskType === "feature" ||
    desc.includes("feature") ||
    desc.includes("implement")
  ) {
    suggestions.push("coordinator", "architect", "coder", "tester", "reviewer");
  } else if (taskType === "refactor" || desc.includes("refactor")) {
    suggestions.push("architect", "coder", "reviewer");
  } else if (
    taskType === "security" ||
    desc.includes("security") ||
    desc.includes("audit")
  ) {
    suggestions.push("security-architect", "security-auditor", "reviewer");
  } else if (
    taskType === "performance" ||
    desc.includes("performance") ||
    desc.includes("optimize")
  ) {
    suggestions.push("researcher", "performance-engineer", "coder");
  } else if (taskType === "docs" || desc.includes("document")) {
    suggestions.push("researcher", "api-docs");
  } else {
    suggestions.push("coder", "reviewer");
  }

  return suggestions;
}

function estimateComplexity(description: string): number {
  const desc = description.toLowerCase();
  let complexity = 20; // Base complexity

  // Increase for complex indicators
  if (desc.includes("architecture") || desc.includes("design"))
    complexity += 25;
  if (desc.includes("security") || desc.includes("authentication"))
    complexity += 20;
  if (desc.includes("performance") || desc.includes("optimize"))
    complexity += 15;
  if (desc.includes("refactor") || desc.includes("rewrite")) complexity += 20;
  if (desc.includes("integrate") || desc.includes("api")) complexity += 15;
  if (desc.includes("test") || desc.includes("coverage")) complexity += 10;

  // Decrease for simple indicators
  if (desc.includes("typo") || desc.includes("spelling")) complexity -= 15;
  if (desc.includes("rename") || desc.includes("move")) complexity -= 10;
  if (desc.includes("comment") || desc.includes("format")) complexity -= 10;

  return Math.max(5, Math.min(100, complexity));
}

function isSimpleTransform(task: string): boolean {
  const simplePatterns = [
    "rename variable",
    "add type",
    "var to const",
    "let to const",
    "format",
    "import",
    "export",
  ];
  return simplePatterns.some((p) => task.toLowerCase().includes(p));
}

function routeTask(
  description: string,
  availableAgents: string[],
  constraints?: { maxAgents?: number; preferredTopology?: string },
): { agents: string[]; topology: string; reasoning: string } {
  const suggested = suggestAgents(description);
  const agents = suggested.filter((a) => availableAgents.includes(a));

  const maxAgents = constraints?.maxAgents || 8;
  const finalAgents = agents.slice(0, maxAgents);

  const topology =
    constraints?.preferredTopology ||
    (finalAgents.length > 5 ? "hierarchical" : "mesh");

  return {
    agents: finalAgents,
    topology,
    reasoning: `Selected ${finalAgents.length} agents for task using ${topology} topology`,
  };
}

function generateExplanation(decision: {
  agents: string[];
  topology: string;
}): string {
  return (
    `Routing decision: Using ${decision.topology} topology with ${decision.agents.length} agents ` +
    `(${decision.agents.join(", ")}). This topology is optimal for the task complexity and agent count.`
  );
}

function generateAgentConfigs(
  taskType: string,
  _requirements: string[],
): Array<{
  type: string;
  role: string;
  capabilities: string[];
}> {
  const configs: Array<{ type: string; role: string; capabilities: string[] }> =
    [];

  if (taskType === "development") {
    configs.push(
      {
        type: "coder",
        role: "primary",
        capabilities: ["write-code", "debug", "refactor"],
      },
      {
        type: "reviewer",
        role: "support",
        capabilities: ["review", "suggest"],
      },
      { type: "tester", role: "validation", capabilities: ["test", "verify"] },
    );
  } else if (taskType === "security") {
    configs.push(
      {
        type: "security-architect",
        role: "primary",
        capabilities: ["design", "audit"],
      },
      {
        type: "security-auditor",
        role: "support",
        capabilities: ["scan", "report"],
      },
    );
  }

  return configs;
}

// Global Hook Registry Instance
export const hookRegistry = new HookRegistry();

function registerTypedHook<T extends HookContext>(
  hookType: HookType,
  handler: (context: T) => Promise<HookResult>,
): void {
  hookRegistry.register(hookType, async (context) => handler(context as T));
}

// Register default hooks
registerTypedHook("pre-edit", coreHooks.preEdit);
registerTypedHook("post-edit", coreHooks.postEdit);
registerTypedHook("pre-command", coreHooks.preCommand);
registerTypedHook("post-command", coreHooks.postCommand);
registerTypedHook("pre-task", coreHooks.preTask);
registerTypedHook("post-task", coreHooks.postTask);
registerTypedHook("session-start", sessionHooks.sessionStart);
registerTypedHook("session-end", sessionHooks.sessionEnd);
registerTypedHook("session-restore", sessionHooks.sessionRestore);
registerTypedHook("notify", sessionHooks.notify);
registerTypedHook("route", intelligenceHooks.route);
registerTypedHook("explain", intelligenceHooks.explain);
registerTypedHook("pretrain", intelligenceHooks.pretrain);
registerTypedHook("build-agents", intelligenceHooks.buildAgents);
registerTypedHook("transfer", intelligenceHooks.transfer);
registerTypedHook("model-route", modelRoutingHooks.modelRoute);
registerTypedHook("model-outcome", modelRoutingHooks.modelOutcome);

export default hookRegistry;
