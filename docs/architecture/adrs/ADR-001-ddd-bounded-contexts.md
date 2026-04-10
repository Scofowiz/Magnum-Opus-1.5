# ADR-001: DDD Bounded Contexts for Claude-Flow V3

**Status**: Proposed
**Date**: 2026-02-04
**Author**: Core Architect (Agent #5)
**Swarm**: swarm-1770207164275

## Context

Claude-Flow V3 requires a domain-driven design architecture that supports:
- 15-agent hierarchical-mesh swarm coordination
- HNSW vector search with 150x-12,500x faster pattern retrieval
- SONA neural learning with <0.05ms adaptation
- Byzantine fault tolerance with queen-led consensus
- MCP server integration

The current monolithic structure needs transformation into well-defined bounded contexts with clear domain boundaries, aggregate roots, and domain events.

## Decision

We will organize claude-flow v3 into **7 bounded contexts** with strict boundaries:

### 1. Agent Context (Agent Lifecycle Domain)

**Aggregate Root**: `Agent`

**Entities**:
- Agent (id, type, status, health, config)
- AgentPool (collection of agents)
- AgentCapability (skills, model preferences)

**Value Objects**:
- AgentId
- AgentType (coder, reviewer, tester, etc.)
- AgentStatus (idle, active, error, terminated)
- AgentHealth (0-1 score)
- AgentConfig

**Domain Events**:
- `AgentSpawned`
- `AgentTerminated`
- `AgentHealthChanged`
- `AgentStatusChanged`
- `AgentTaskAssigned`
- `AgentTaskCompleted`

**Commands**:
- SpawnAgent
- TerminateAgent
- UpdateAgentHealth
- AssignTask
- ReportTaskCompletion

**Interfaces** (TypeScript):
```typescript
interface IAgentRepository {
  findById(id: AgentId): Promise<Agent | null>;
  findByType(type: AgentType): Promise<Agent[]>;
  findActive(): Promise<Agent[]>;
  save(agent: Agent): Promise<void>;
  delete(id: AgentId): Promise<void>;
}

interface IAgentService {
  spawn(type: AgentType, config?: AgentConfig): Promise<Agent>;
  terminate(id: AgentId): Promise<void>;
  getStatus(id: AgentId): Promise<AgentStatus>;
  list(): Promise<Agent[]>;
  updateHealth(id: AgentId, health: number): Promise<void>;
}
```

---

### 2. Swarm Context (Coordination Domain)

**Aggregate Root**: `Swarm`

**Entities**:
- Swarm (id, topology, strategy, agents)
- SwarmNode (position in topology)
- CoordinationSession

**Value Objects**:
- SwarmId
- Topology (hierarchical, mesh, hierarchical-mesh, ring, star, adaptive)
- Strategy (balanced, specialized, adaptive)
- MaxAgents

**Domain Events**:
- `SwarmInitialized`
- `SwarmShutdown`
- `TopologyChanged`
- `AgentJoinedSwarm`
- `AgentLeftSwarm`
- `LoadBalanced`

**Commands**:
- InitializeSwarm
- ShutdownSwarm
- ChangeTopology
- JoinSwarm
- LeaveSwarm
- RebalanceLoad

**Interfaces**:
```typescript
interface ISwarmRepository {
  findById(id: SwarmId): Promise<Swarm | null>;
  findActive(): Promise<Swarm[]>;
  save(swarm: Swarm): Promise<void>;
}

interface ISwarmCoordinator {
  init(topology: Topology, maxAgents: number, strategy: Strategy): Promise<Swarm>;
  status(id: SwarmId): Promise<SwarmStatus>;
  shutdown(id: SwarmId): Promise<void>;
  addAgent(swarmId: SwarmId, agentId: AgentId): Promise<void>;
  removeAgent(swarmId: SwarmId, agentId: AgentId): Promise<void>;
  rebalance(swarmId: SwarmId): Promise<void>;
}
```

---

### 3. Memory Context (Persistence & Vector Domain)

**Aggregate Root**: `MemoryEntry`

**Entities**:
- MemoryEntry (id, key, namespace, content, embedding)
- Pattern (learned patterns with confidence)
- VectorIndex (HNSW index metadata)

**Value Objects**:
- MemoryId
- Namespace
- Embedding (vector array)
- Confidence (0-1)
- DecayRate

**Domain Events**:
- `MemoryStored`
- `MemoryRetrieved`
- `MemoryDeleted`
- `PatternLearned`
- `PatternMatched`
- `PatternDecayed`
- `VectorIndexRebuilt`

**Commands**:
- StoreMemory
- RetrieveMemory
- SearchMemory
- DeleteMemory
- LearnPattern
- ApplyPattern
- RebuildIndex

**Interfaces**:
```typescript
interface IMemoryRepository {
  store(entry: MemoryEntry): Promise<void>;
  retrieve(key: string, namespace?: string): Promise<MemoryEntry | null>;
  search(query: string, options?: SearchOptions): Promise<MemoryEntry[]>;
  delete(key: string, namespace?: string): Promise<void>;
  list(namespace?: string): Promise<MemoryEntry[]>;
}

interface IPatternRepository {
  store(pattern: Pattern): Promise<void>;
  findByType(type: PatternType): Promise<Pattern[]>;
  findHighConfidence(threshold: number): Promise<Pattern[]>;
  updateConfidence(id: PatternId, success: boolean): Promise<void>;
}

interface IVectorSearchService {
  index(entries: MemoryEntry[]): Promise<void>;
  search(embedding: Embedding, k: number): Promise<SearchResult[]>;
  rebuild(): Promise<void>;
}
```

---

### 4. Task Context (Work Assignment Domain)

**Aggregate Root**: `Task`

**Entities**:
- Task (id, description, status, assignee, dependencies)
- TaskDependency
- TaskResult

**Value Objects**:
- TaskId
- TaskStatus (pending, in_progress, completed, failed, cancelled)
- TaskPriority
- TaskResult

**Domain Events**:
- `TaskCreated`
- `TaskAssigned`
- `TaskStarted`
- `TaskCompleted`
- `TaskFailed`
- `TaskCancelled`
- `TaskDependencyResolved`

**Commands**:
- CreateTask
- AssignTask
- StartTask
- CompleteTask
- FailTask
- CancelTask

**Interfaces**:
```typescript
interface ITaskRepository {
  findById(id: TaskId): Promise<Task | null>;
  findByStatus(status: TaskStatus): Promise<Task[]>;
  findByAssignee(agentId: AgentId): Promise<Task[]>;
  save(task: Task): Promise<void>;
}

interface ITaskService {
  create(description: string, options?: TaskOptions): Promise<Task>;
  assign(taskId: TaskId, agentId: AgentId): Promise<void>;
  complete(taskId: TaskId, result: TaskResult): Promise<void>;
  cancel(taskId: TaskId): Promise<void>;
  list(): Promise<Task[]>;
}
```

---

### 5. Consensus Context (Hive-Mind Domain)

**Aggregate Root**: `ConsensusRound`

**Entities**:
- Queen (leader node)
- Worker (follower node)
- ConsensusRound (proposal + votes)
- SharedMemory

**Value Objects**:
- QueenId
- WorkerId
- Term (election term)
- Proposal
- Vote
- ConsensusResult

**Domain Events**:
- `QueenElected`
- `WorkerJoined`
- `WorkerLeft`
- `ProposalSubmitted`
- `VoteReceived`
- `ConsensusReached`
- `ConsensusFailed`
- `SharedMemoryUpdated`

**Commands**:
- ElectQueen
- JoinHiveMind
- LeaveHiveMind
- SubmitProposal
- CastVote
- UpdateSharedMemory
- Broadcast

**Interfaces**:
```typescript
interface IHiveMindRepository {
  getState(): Promise<HiveMindState>;
  saveState(state: HiveMindState): Promise<void>;
  getQueen(): Promise<Queen | null>;
  getWorkers(): Promise<Worker[]>;
}

interface IConsensusService {
  init(queenType: QueenType): Promise<void>;
  join(agentId: AgentId): Promise<void>;
  leave(agentId: AgentId): Promise<void>;
  propose(proposal: Proposal): Promise<ConsensusResult>;
  broadcast(message: BroadcastMessage): Promise<void>;
  getSharedMemory(): Promise<SharedMemory>;
}
```

---

### 6. Session Context (State Persistence Domain)

**Aggregate Root**: `Session`

**Entities**:
- Session (id, state, status)
- SessionSnapshot

**Value Objects**:
- SessionId
- SessionState
- SessionStatus (active, paused, completed, expired)

**Domain Events**:
- `SessionCreated`
- `SessionSaved`
- `SessionRestored`
- `SessionExpired`
- `SessionDeleted`

**Commands**:
- CreateSession
- SaveSession
- RestoreSession
- DeleteSession

**Interfaces**:
```typescript
interface ISessionRepository {
  findById(id: SessionId): Promise<Session | null>;
  findActive(): Promise<Session[]>;
  save(session: Session): Promise<void>;
  delete(id: SessionId): Promise<void>;
}

interface ISessionService {
  create(): Promise<Session>;
  save(id: SessionId): Promise<void>;
  restore(id: SessionId): Promise<Session>;
  list(): Promise<Session[]>;
  delete(id: SessionId): Promise<void>;
}
```

---

### 7. Learning Context (Intelligence Domain)

**Aggregate Root**: `Trajectory`

**Entities**:
- Trajectory (learning session with steps)
- TrajectoryStep
- NeuralModel (SONA integration)

**Value Objects**:
- TrajectoryId
- TrajectoryStatus
- Verdict (success, failure, partial)
- Reward

**Domain Events**:
- `TrajectoryStarted`
- `TrajectoryStepRecorded`
- `TrajectoryCompleted`
- `PatternExtracted`
- `ModelTrained`
- `PredictionMade`

**Commands**:
- StartTrajectory
- RecordStep
- EndTrajectory
- ExtractPattern
- TrainModel
- Predict

**Interfaces**:
```typescript
interface ITrajectoryRepository {
  findById(id: TrajectoryId): Promise<Trajectory | null>;
  findBySession(sessionId: SessionId): Promise<Trajectory[]>;
  save(trajectory: Trajectory): Promise<void>;
}

interface ILearningService {
  startTrajectory(task: string): Promise<Trajectory>;
  recordStep(id: TrajectoryId, step: TrajectoryStep): Promise<void>;
  endTrajectory(id: TrajectoryId, verdict: Verdict): Promise<Pattern | null>;
  train(patterns: Pattern[]): Promise<void>;
  predict(context: Context): Promise<Prediction>;
}
```

---

## Module Structure

```
src/
├── agent/                          # Agent Context (~400 lines)
│   ├── domain/
│   │   ├── agent.ts                # Aggregate root
│   │   ├── agent-pool.ts           # Entity
│   │   ├── agent-capability.ts     # Entity
│   │   └── value-objects.ts        # AgentId, AgentType, etc.
│   ├── application/
│   │   ├── agent-service.ts        # Application service
│   │   └── commands.ts             # Command handlers
│   ├── infrastructure/
│   │   └── agent-repository.ts     # Repository impl
│   └── index.ts                    # Public API
│
├── swarm/                          # Swarm Context (~450 lines)
│   ├── domain/
│   │   ├── swarm.ts                # Aggregate root
│   │   ├── swarm-node.ts           # Entity
│   │   └── value-objects.ts        # Topology, Strategy, etc.
│   ├── application/
│   │   ├── swarm-coordinator.ts    # Application service
│   │   └── commands.ts             # Command handlers
│   ├── infrastructure/
│   │   └── swarm-repository.ts     # Repository impl
│   └── index.ts                    # Public API
│
├── memory/                         # Memory Context (~500 lines)
│   ├── domain/
│   │   ├── memory-entry.ts         # Aggregate root
│   │   ├── pattern.ts              # Entity
│   │   ├── vector-index.ts         # Entity
│   │   └── value-objects.ts        # Embedding, Confidence, etc.
│   ├── application/
│   │   ├── memory-service.ts       # Application service
│   │   ├── pattern-service.ts      # Pattern management
│   │   └── vector-search.ts        # HNSW search
│   ├── infrastructure/
│   │   ├── memory-repository.ts    # SQLite + HNSW
│   │   └── hnsw-adapter.ts         # HNSW wrapper
│   └── index.ts                    # Public API
│
├── task/                           # Task Context (~350 lines)
│   ├── domain/
│   │   ├── task.ts                 # Aggregate root
│   │   ├── task-dependency.ts      # Entity
│   │   └── value-objects.ts        # TaskId, TaskStatus, etc.
│   ├── application/
│   │   ├── task-service.ts         # Application service
│   │   └── commands.ts             # Command handlers
│   ├── infrastructure/
│   │   └── task-repository.ts      # Repository impl
│   └── index.ts                    # Public API
│
├── consensus/                      # Consensus Context (~450 lines)
│   ├── domain/
│   │   ├── consensus-round.ts      # Aggregate root
│   │   ├── queen.ts                # Entity
│   │   ├── worker.ts               # Entity
│   │   └── value-objects.ts        # Term, Proposal, Vote, etc.
│   ├── application/
│   │   ├── consensus-service.ts    # Application service
│   │   └── election.ts             # Queen election
│   ├── infrastructure/
│   │   └── hive-mind-repository.ts # State persistence
│   └── index.ts                    # Public API
│
├── session/                        # Session Context (~300 lines)
│   ├── domain/
│   │   ├── session.ts              # Aggregate root
│   │   ├── session-snapshot.ts     # Entity
│   │   └── value-objects.ts        # SessionId, SessionState, etc.
│   ├── application/
│   │   ├── session-service.ts      # Application service
│   │   └── commands.ts             # Command handlers
│   ├── infrastructure/
│   │   └── session-repository.ts   # Repository impl
│   └── index.ts                    # Public API
│
├── learning/                       # Learning Context (~400 lines)
│   ├── domain/
│   │   ├── trajectory.ts           # Aggregate root
│   │   ├── trajectory-step.ts      # Entity
│   │   ├── neural-model.ts         # Entity
│   │   └── value-objects.ts        # Verdict, Reward, etc.
│   ├── application/
│   │   ├── learning-service.ts     # Application service
│   │   └── sona-adapter.ts         # SONA integration
│   ├── infrastructure/
│   │   └── trajectory-repository.ts # Repository impl
│   └── index.ts                    # Public API
│
├── shared/                         # Shared Kernel (~200 lines)
│   ├── domain-event.ts             # Base domain event
│   ├── aggregate-root.ts           # Base aggregate
│   ├── entity.ts                   # Base entity
│   ├── value-object.ts             # Base value object
│   ├── repository.ts               # Base repository interface
│   └── event-bus.ts                # Event bus interface
│
├── infrastructure/                 # Cross-cutting (~300 lines)
│   ├── event-bus-impl.ts           # Event bus implementation
│   ├── database.ts                 # SQLite connection
│   ├── config.ts                   # Configuration loader
│   └── logger.ts                   # Logging service
│
└── api/                            # API Layer (~400 lines)
    ├── mcp/                        # MCP handlers
    │   ├── agent-handlers.ts
    │   ├── swarm-handlers.ts
    │   ├── memory-handlers.ts
    │   ├── task-handlers.ts
    │   ├── consensus-handlers.ts
    │   ├── session-handlers.ts
    │   └── learning-handlers.ts
    └── cli/                        # CLI commands
        └── (existing CLI structure)
```

## Context Map (Integration Patterns)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLAUDE-FLOW V3 CONTEXT MAP                         │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │   Swarm     │
                    │   Context   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │ Conformist │ Conformist │
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌───────────┐
        │  Agent  │  │  Task   │  │ Consensus │
        │ Context │  │ Context │  │  Context  │
        └────┬────┘  └────┬────┘  └─────┬─────┘
             │            │             │
             │    ┌───────┴───────┐     │
             │    │               │     │
        ACL  ▼    ▼ ACL      ACL  ▼     ▼ ACL
        ┌─────────────┐    ┌───────────────┐
        │   Memory    │◄───│   Learning    │
        │   Context   │    │    Context    │
        └──────┬──────┘    └───────────────┘
               │
          Shared Kernel
               │
        ┌──────▼──────┐
        │   Session   │
        │   Context   │
        └─────────────┘

Integration Patterns:
- Swarm → Agent: Conformist (Agent follows Swarm contract)
- Swarm → Task: Conformist (Task follows Swarm assignment)
- Swarm → Consensus: Conformist (Consensus follows Swarm topology)
- Agent → Memory: Anti-Corruption Layer (Agent uses adapter)
- Task → Memory: Anti-Corruption Layer (Task uses adapter)
- Learning → Memory: Anti-Corruption Layer (Learning uses adapter)
- All → Session: Shared Kernel (Common session state)
```

## Consequences

### Benefits
1. **Clear Boundaries**: Each context has well-defined responsibilities
2. **Testability**: Isolated domains enable unit testing
3. **Scalability**: Contexts can scale independently
4. **Maintainability**: <500 lines per file ensures readability
5. **Evolvability**: Bounded contexts can evolve without affecting others

### Trade-offs
1. **Initial Complexity**: More files and structure upfront
2. **Cross-Context Queries**: May require additional coordination
3. **Event Sourcing Overhead**: Domain events add infrastructure needs

### Mitigations
1. Use shared kernel for common types
2. Implement efficient event bus for cross-context communication
3. Use CQRS for complex queries spanning contexts

## Next Steps

1. Agent #6 (Memory Domain): Implement Memory Context
2. Agent #7 (Task Domain): Implement Task Context
3. Agent #8 (Consensus Domain): Implement Consensus Context
4. Agent #9 (Session Domain): Implement Session Context
5. Agent #10 (Integration): Wire contexts together

## References

- Domain-Driven Design by Eric Evans
- Implementing Domain-Driven Design by Vaughn Vernon
- Claude-Flow V3 Capabilities: `/Users/scottfoster/Downloads/nova/.claude-flow/CAPABILITIES.md`
- Current Schema: `/Users/scottfoster/Downloads/nova/.swarm/schema.sql`
