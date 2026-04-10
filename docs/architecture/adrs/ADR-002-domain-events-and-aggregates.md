# ADR-002: Domain Events and Aggregate Design Patterns

**Status**: Proposed
**Date**: 2026-02-04
**Author**: Core Architect (Agent #5)
**Swarm**: swarm-1770207164275

## Context

Building on ADR-001's bounded contexts, we need to define:
1. Base aggregate root patterns
2. Domain event infrastructure
3. Event sourcing approach
4. Cross-context communication via events

## Decision

### 1. Base Domain Event Structure

All domain events will follow this structure:

```typescript
// /src/shared/domain-event.ts

export interface IDomainEvent {
  readonly eventId: string;           // UUID
  readonly eventType: string;         // e.g., 'AgentSpawned'
  readonly aggregateId: string;       // ID of the aggregate that produced it
  readonly aggregateType: string;     // e.g., 'Agent'
  readonly timestamp: Date;           // When event occurred
  readonly version: number;           // Aggregate version
  readonly payload: Record<string, unknown>;
  readonly metadata?: EventMetadata;
}

export interface EventMetadata {
  correlationId?: string;             // Links related events
  causationId?: string;               // Event that caused this one
  userId?: string;                    // Who triggered the action
  sessionId?: string;                 // Current session
}

export abstract class DomainEvent implements IDomainEvent {
  public readonly eventId: string;
  public readonly timestamp: Date;
  public readonly version: number;
  public readonly metadata?: EventMetadata;

  constructor(
    public readonly eventType: string,
    public readonly aggregateId: string,
    public readonly aggregateType: string,
    public readonly payload: Record<string, unknown>,
    version: number = 1,
    metadata?: EventMetadata
  ) {
    this.eventId = crypto.randomUUID();
    this.timestamp = new Date();
    this.version = version;
    this.metadata = metadata;
  }
}
```

### 2. Base Aggregate Root Pattern

```typescript
// /src/shared/aggregate-root.ts

import { DomainEvent, IDomainEvent } from './domain-event';

export abstract class AggregateRoot<TId> {
  protected _id: TId;
  protected _version: number = 0;
  private _domainEvents: IDomainEvent[] = [];

  get id(): TId {
    return this._id;
  }

  get version(): number {
    return this._version;
  }

  get domainEvents(): ReadonlyArray<IDomainEvent> {
    return [...this._domainEvents];
  }

  protected addDomainEvent(event: IDomainEvent): void {
    this._domainEvents.push(event);
  }

  public clearDomainEvents(): IDomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }

  protected incrementVersion(): void {
    this._version++;
  }
}
```

### 3. Base Entity Pattern

```typescript
// /src/shared/entity.ts

export abstract class Entity<TId> {
  protected readonly _id: TId;

  constructor(id: TId) {
    this._id = id;
  }

  get id(): TId {
    return this._id;
  }

  public equals(other: Entity<TId>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (this === other) {
      return true;
    }
    return this._id === other._id;
  }
}
```

### 4. Base Value Object Pattern

```typescript
// /src/shared/value-object.ts

export abstract class ValueObject<T> {
  protected readonly props: T;

  constructor(props: T) {
    this.props = Object.freeze(props);
  }

  public equals(other: ValueObject<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
```

### 5. Event Bus Interface

```typescript
// /src/shared/event-bus.ts

import { IDomainEvent } from './domain-event';

export type EventHandler<T extends IDomainEvent = IDomainEvent> = (event: T) => Promise<void>;

export interface IEventBus {
  publish(event: IDomainEvent): Promise<void>;
  publishAll(events: IDomainEvent[]): Promise<void>;
  subscribe<T extends IDomainEvent>(eventType: string, handler: EventHandler<T>): void;
  unsubscribe(eventType: string, handler: EventHandler): void;
}
```

### 6. Complete Domain Events by Context

#### Agent Context Events

```typescript
// /src/agent/domain/events.ts

import { DomainEvent } from '../../shared/domain-event';

export class AgentSpawned extends DomainEvent {
  constructor(
    agentId: string,
    agentType: string,
    config: Record<string, unknown>
  ) {
    super('AgentSpawned', agentId, 'Agent', {
      agentType,
      config,
      spawnedAt: new Date().toISOString()
    });
  }
}

export class AgentTerminated extends DomainEvent {
  constructor(agentId: string, reason: string) {
    super('AgentTerminated', agentId, 'Agent', {
      reason,
      terminatedAt: new Date().toISOString()
    });
  }
}

export class AgentHealthChanged extends DomainEvent {
  constructor(agentId: string, previousHealth: number, newHealth: number) {
    super('AgentHealthChanged', agentId, 'Agent', {
      previousHealth,
      newHealth,
      changedAt: new Date().toISOString()
    });
  }
}

export class AgentStatusChanged extends DomainEvent {
  constructor(agentId: string, previousStatus: string, newStatus: string) {
    super('AgentStatusChanged', agentId, 'Agent', {
      previousStatus,
      newStatus,
      changedAt: new Date().toISOString()
    });
  }
}

export class AgentTaskAssigned extends DomainEvent {
  constructor(agentId: string, taskId: string) {
    super('AgentTaskAssigned', agentId, 'Agent', {
      taskId,
      assignedAt: new Date().toISOString()
    });
  }
}

export class AgentTaskCompleted extends DomainEvent {
  constructor(agentId: string, taskId: string, result: Record<string, unknown>) {
    super('AgentTaskCompleted', agentId, 'Agent', {
      taskId,
      result,
      completedAt: new Date().toISOString()
    });
  }
}
```

#### Swarm Context Events

```typescript
// /src/swarm/domain/events.ts

import { DomainEvent } from '../../shared/domain-event';

export class SwarmInitialized extends DomainEvent {
  constructor(
    swarmId: string,
    topology: string,
    maxAgents: number,
    strategy: string
  ) {
    super('SwarmInitialized', swarmId, 'Swarm', {
      topology,
      maxAgents,
      strategy,
      initializedAt: new Date().toISOString()
    });
  }
}

export class SwarmShutdown extends DomainEvent {
  constructor(swarmId: string, reason: string) {
    super('SwarmShutdown', swarmId, 'Swarm', {
      reason,
      shutdownAt: new Date().toISOString()
    });
  }
}

export class TopologyChanged extends DomainEvent {
  constructor(swarmId: string, previousTopology: string, newTopology: string) {
    super('TopologyChanged', swarmId, 'Swarm', {
      previousTopology,
      newTopology,
      changedAt: new Date().toISOString()
    });
  }
}

export class AgentJoinedSwarm extends DomainEvent {
  constructor(swarmId: string, agentId: string, position: number) {
    super('AgentJoinedSwarm', swarmId, 'Swarm', {
      agentId,
      position,
      joinedAt: new Date().toISOString()
    });
  }
}

export class AgentLeftSwarm extends DomainEvent {
  constructor(swarmId: string, agentId: string, reason: string) {
    super('AgentLeftSwarm', swarmId, 'Swarm', {
      agentId,
      reason,
      leftAt: new Date().toISOString()
    });
  }
}

export class LoadBalanced extends DomainEvent {
  constructor(
    swarmId: string,
    movedAgents: Array<{ agentId: string; fromNode: number; toNode: number }>
  ) {
    super('LoadBalanced', swarmId, 'Swarm', {
      movedAgents,
      balancedAt: new Date().toISOString()
    });
  }
}
```

#### Memory Context Events

```typescript
// /src/memory/domain/events.ts

import { DomainEvent } from '../../shared/domain-event';

export class MemoryStored extends DomainEvent {
  constructor(
    memoryId: string,
    key: string,
    namespace: string,
    hasEmbedding: boolean
  ) {
    super('MemoryStored', memoryId, 'MemoryEntry', {
      key,
      namespace,
      hasEmbedding,
      storedAt: new Date().toISOString()
    });
  }
}

export class MemoryRetrieved extends DomainEvent {
  constructor(memoryId: string, key: string, namespace: string) {
    super('MemoryRetrieved', memoryId, 'MemoryEntry', {
      key,
      namespace,
      retrievedAt: new Date().toISOString()
    });
  }
}

export class MemoryDeleted extends DomainEvent {
  constructor(memoryId: string, key: string, namespace: string) {
    super('MemoryDeleted', memoryId, 'MemoryEntry', {
      key,
      namespace,
      deletedAt: new Date().toISOString()
    });
  }
}

export class PatternLearned extends DomainEvent {
  constructor(
    patternId: string,
    name: string,
    patternType: string,
    initialConfidence: number
  ) {
    super('PatternLearned', patternId, 'Pattern', {
      name,
      patternType,
      initialConfidence,
      learnedAt: new Date().toISOString()
    });
  }
}

export class PatternMatched extends DomainEvent {
  constructor(patternId: string, context: string, success: boolean) {
    super('PatternMatched', patternId, 'Pattern', {
      context,
      success,
      matchedAt: new Date().toISOString()
    });
  }
}

export class PatternDecayed extends DomainEvent {
  constructor(patternId: string, previousConfidence: number, newConfidence: number) {
    super('PatternDecayed', patternId, 'Pattern', {
      previousConfidence,
      newConfidence,
      decayedAt: new Date().toISOString()
    });
  }
}

export class VectorIndexRebuilt extends DomainEvent {
  constructor(indexId: string, vectorCount: number, durationMs: number) {
    super('VectorIndexRebuilt', indexId, 'VectorIndex', {
      vectorCount,
      durationMs,
      rebuiltAt: new Date().toISOString()
    });
  }
}
```

#### Task Context Events

```typescript
// /src/task/domain/events.ts

import { DomainEvent } from '../../shared/domain-event';

export class TaskCreated extends DomainEvent {
  constructor(
    taskId: string,
    description: string,
    priority: string,
    dependencies: string[]
  ) {
    super('TaskCreated', taskId, 'Task', {
      description,
      priority,
      dependencies,
      createdAt: new Date().toISOString()
    });
  }
}

export class TaskAssigned extends DomainEvent {
  constructor(taskId: string, agentId: string) {
    super('TaskAssigned', taskId, 'Task', {
      agentId,
      assignedAt: new Date().toISOString()
    });
  }
}

export class TaskStarted extends DomainEvent {
  constructor(taskId: string, agentId: string) {
    super('TaskStarted', taskId, 'Task', {
      agentId,
      startedAt: new Date().toISOString()
    });
  }
}

export class TaskCompleted extends DomainEvent {
  constructor(taskId: string, result: Record<string, unknown>) {
    super('TaskCompleted', taskId, 'Task', {
      result,
      completedAt: new Date().toISOString()
    });
  }
}

export class TaskFailed extends DomainEvent {
  constructor(taskId: string, error: string, retryable: boolean) {
    super('TaskFailed', taskId, 'Task', {
      error,
      retryable,
      failedAt: new Date().toISOString()
    });
  }
}

export class TaskCancelled extends DomainEvent {
  constructor(taskId: string, reason: string) {
    super('TaskCancelled', taskId, 'Task', {
      reason,
      cancelledAt: new Date().toISOString()
    });
  }
}

export class TaskDependencyResolved extends DomainEvent {
  constructor(taskId: string, dependencyId: string) {
    super('TaskDependencyResolved', taskId, 'Task', {
      dependencyId,
      resolvedAt: new Date().toISOString()
    });
  }
}
```

#### Consensus Context Events

```typescript
// /src/consensus/domain/events.ts

import { DomainEvent } from '../../shared/domain-event';

export class QueenElected extends DomainEvent {
  constructor(queenId: string, term: number, votes: number) {
    super('QueenElected', queenId, 'Queen', {
      term,
      votes,
      electedAt: new Date().toISOString()
    });
  }
}

export class WorkerJoined extends DomainEvent {
  constructor(workerId: string, agentId: string, workerType: string) {
    super('WorkerJoined', workerId, 'Worker', {
      agentId,
      workerType,
      joinedAt: new Date().toISOString()
    });
  }
}

export class WorkerLeft extends DomainEvent {
  constructor(workerId: string, agentId: string, reason: string) {
    super('WorkerLeft', workerId, 'Worker', {
      agentId,
      reason,
      leftAt: new Date().toISOString()
    });
  }
}

export class ProposalSubmitted extends DomainEvent {
  constructor(roundId: string, proposerId: string, proposal: Record<string, unknown>) {
    super('ProposalSubmitted', roundId, 'ConsensusRound', {
      proposerId,
      proposal,
      submittedAt: new Date().toISOString()
    });
  }
}

export class VoteReceived extends DomainEvent {
  constructor(roundId: string, voterId: string, vote: boolean) {
    super('VoteReceived', roundId, 'ConsensusRound', {
      voterId,
      vote,
      receivedAt: new Date().toISOString()
    });
  }
}

export class ConsensusReached extends DomainEvent {
  constructor(roundId: string, result: Record<string, unknown>, votesFor: number, votesAgainst: number) {
    super('ConsensusReached', roundId, 'ConsensusRound', {
      result,
      votesFor,
      votesAgainst,
      reachedAt: new Date().toISOString()
    });
  }
}

export class ConsensusFailed extends DomainEvent {
  constructor(roundId: string, reason: string, votesFor: number, votesAgainst: number) {
    super('ConsensusFailed', roundId, 'ConsensusRound', {
      reason,
      votesFor,
      votesAgainst,
      failedAt: new Date().toISOString()
    });
  }
}

export class SharedMemoryUpdated extends DomainEvent {
  constructor(key: string, previousValue: unknown, newValue: unknown) {
    super('SharedMemoryUpdated', key, 'SharedMemory', {
      previousValue,
      newValue,
      updatedAt: new Date().toISOString()
    });
  }
}
```

#### Session Context Events

```typescript
// /src/session/domain/events.ts

import { DomainEvent } from '../../shared/domain-event';

export class SessionCreated extends DomainEvent {
  constructor(sessionId: string, projectPath: string) {
    super('SessionCreated', sessionId, 'Session', {
      projectPath,
      createdAt: new Date().toISOString()
    });
  }
}

export class SessionSaved extends DomainEvent {
  constructor(sessionId: string, snapshotId: string) {
    super('SessionSaved', sessionId, 'Session', {
      snapshotId,
      savedAt: new Date().toISOString()
    });
  }
}

export class SessionRestored extends DomainEvent {
  constructor(sessionId: string, fromSnapshotId: string) {
    super('SessionRestored', sessionId, 'Session', {
      fromSnapshotId,
      restoredAt: new Date().toISOString()
    });
  }
}

export class SessionExpired extends DomainEvent {
  constructor(sessionId: string, lastActiveAt: string) {
    super('SessionExpired', sessionId, 'Session', {
      lastActiveAt,
      expiredAt: new Date().toISOString()
    });
  }
}

export class SessionDeleted extends DomainEvent {
  constructor(sessionId: string, reason: string) {
    super('SessionDeleted', sessionId, 'Session', {
      reason,
      deletedAt: new Date().toISOString()
    });
  }
}
```

#### Learning Context Events

```typescript
// /src/learning/domain/events.ts

import { DomainEvent } from '../../shared/domain-event';

export class TrajectoryStarted extends DomainEvent {
  constructor(trajectoryId: string, sessionId: string, task: string) {
    super('TrajectoryStarted', trajectoryId, 'Trajectory', {
      sessionId,
      task,
      startedAt: new Date().toISOString()
    });
  }
}

export class TrajectoryStepRecorded extends DomainEvent {
  constructor(
    trajectoryId: string,
    stepNumber: number,
    action: string,
    reward: number
  ) {
    super('TrajectoryStepRecorded', trajectoryId, 'Trajectory', {
      stepNumber,
      action,
      reward,
      recordedAt: new Date().toISOString()
    });
  }
}

export class TrajectoryCompleted extends DomainEvent {
  constructor(
    trajectoryId: string,
    verdict: string,
    totalSteps: number,
    totalReward: number
  ) {
    super('TrajectoryCompleted', trajectoryId, 'Trajectory', {
      verdict,
      totalSteps,
      totalReward,
      completedAt: new Date().toISOString()
    });
  }
}

export class PatternExtracted extends DomainEvent {
  constructor(
    trajectoryId: string,
    patternId: string,
    patternType: string,
    confidence: number
  ) {
    super('PatternExtracted', trajectoryId, 'Trajectory', {
      patternId,
      patternType,
      confidence,
      extractedAt: new Date().toISOString()
    });
  }
}

export class ModelTrained extends DomainEvent {
  constructor(
    modelId: string,
    patternsUsed: number,
    trainingDurationMs: number
  ) {
    super('ModelTrained', modelId, 'NeuralModel', {
      patternsUsed,
      trainingDurationMs,
      trainedAt: new Date().toISOString()
    });
  }
}

export class PredictionMade extends DomainEvent {
  constructor(
    modelId: string,
    context: Record<string, unknown>,
    prediction: Record<string, unknown>,
    confidence: number
  ) {
    super('PredictionMade', modelId, 'NeuralModel', {
      context,
      prediction,
      confidence,
      predictedAt: new Date().toISOString()
    });
  }
}
```

### 7. Event Store Interface

```typescript
// /src/shared/event-store.ts

import { IDomainEvent } from './domain-event';

export interface IEventStore {
  append(aggregateId: string, events: IDomainEvent[]): Promise<void>;
  getEvents(aggregateId: string, fromVersion?: number): Promise<IDomainEvent[]>;
  getAllEvents(fromTimestamp?: Date): Promise<IDomainEvent[]>;
}
```

## Consequences

### Benefits
1. **Auditability**: Complete history of all domain changes
2. **Debugging**: Can replay events to understand state
3. **Integration**: Events enable loose coupling between contexts
4. **CQRS Ready**: Event sourcing enables CQRS pattern

### Trade-offs
1. **Storage Growth**: Events accumulate over time
2. **Complexity**: More infrastructure required
3. **Eventual Consistency**: Cross-context queries may lag

### Mitigations
1. Implement event compaction/archival
2. Use snapshots for aggregate reconstruction
3. Document SLAs for eventual consistency

## Next Steps

1. Agent #10 (Integration): Implement event bus
2. All domain agents: Follow these patterns when implementing aggregates
3. Infrastructure: Set up event store persistence

## References

- Event Sourcing by Martin Fowler
- Implementing Domain-Driven Design by Vaughn Vernon
- ADR-001: DDD Bounded Contexts
