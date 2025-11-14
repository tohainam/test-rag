# LTV Assistant Retrieval Service - Architecture Diagrams

> Updated November 2025: The retrieval stack now relies on Qdrant for vector search and MySQL for metadata enrichment.

## 1. Retrieval Workflow (LangGraph State Machine)

```mermaid
flowchart TD
    Start([START]) --> CheckCache[Check Cache\nPhase 1.5]

    CheckCache -->|Cache Hit| CacheEnd([Return Cached Result\nEND])
    CheckCache -->|Cache Miss| AnalyzeQuery[Analyze Query\nPhase 4\nQuery Transformation]

    AnalyzeQuery --> BuildFilter[Build Access Filter\nPhase 5]
    BuildFilter --> HybridRetrieval[Hybrid Retrieval\nPhase 5]
    HybridRetrieval --> Fusion[Result Fusion RRF\nPhase 5]
    Fusion --> Rerank[Cross-Encoder Rerank\nPhase 6]
    Rerank --> Enrich[Small-to-Big Enrich\nPhase 6]
    Enrich --> CheckSufficiency[Check Sufficiency\nPhase 6]

    CheckSufficiency -->|Retry: Insufficient &\nIterations < MAX| AnalyzeQuery
    CheckSufficiency -->|Decomposition: Insufficient &\nMAX Iterations &\nHas Decomposed Queries| ExecuteSubQueries[Execute Sub-Queries\nPhase 5B\nParallel Execution]
    CheckSufficiency -->|Continue: Sufficient| SelectMode[Select Mode\nPhase 6]

    ExecuteSubQueries --> Fusion

    SelectMode --> UpdateCache[Update Cache\nPhase 1.5]
    UpdateCache --> End([END])

    style ExecuteSubQueries fill:#e1f5ff
    style AnalyzeQuery fill:#fff4e6
```

## 2. Query Decomposition Execution (Detailed Flow)

```mermaid
sequenceDiagram
    participant Workflow as Retrieval Workflow
    participant Analyze as Analyze Query Node
    participant CheckSuff as Check Sufficiency Node
    participant ExecSub as Execute Sub-Queries Node
    participant Embed as Embedding Provider
    participant Qdrant as Qdrant Service
    participant Fusion as Fusion Node

    Note over Workflow: Initial Query Processing
    Workflow->>Analyze: Analyze query
    Analyze->>Analyze: Generate decomposed queries (4 methods)
    Note right of Analyze: • Query Reformulation<br/>• Query Rewrite<br/>• HyDE Generation<br/>• Query Decomposition
    Analyze-->>Workflow: State with decomposedQueries[]

    Note over Workflow: Main Retrieval Flow
    Workflow->>Workflow: buildAccessFilter → hybridRetrieval → fusion → rerank → enrich

    Note over Workflow: Sufficiency Check (Hybrid Fallback)
    Workflow->>CheckSuff: Check sufficiency
    CheckSuff->>CheckSuff: Calculate sufficiency score

    alt Insufficient & Has Retries Left
        CheckSuff-->>Workflow: shouldRetry = true
        Workflow->>Analyze: Retry from Analyze Query
    else Insufficient & MAX Retries & Has Decomposed Queries
        CheckSuff-->>Workflow: decompositionTriggered = true
        Workflow->>ExecSub: Execute decomposed queries

        Note over ExecSub: Parallel Sub-Query Execution
        loop For each decomposed query
            ExecSub->>Embed: Generate embedding
            Embed-->>ExecSub: Vector embedding
        end

        ExecSub->>ExecSub: Calculate limit per sub-query<br/>Math.max(3, topK / count)

        par Parallel Search
            ExecSub->>Qdrant: Search sub-query 1
            ExecSub->>Qdrant: Search sub-query 2
            ExecSub->>Qdrant: Search sub-query 3
            ExecSub->>Qdrant: Search sub-query N
        end

        Qdrant-->>ExecSub: Results from all sub-queries
        ExecSub->>ExecSub: Flatten & deduplicate by chunkId<br/>(keep highest score)
        ExecSub-->>Workflow: State with subQueryResults[]

        Note over Workflow: Merge with Main Results
        Workflow->>Fusion: Merge main + sub-query results
        Fusion->>Fusion: RRF algorithm on all sources:<br/>• Qdrant results<br/>• MySQL results<br/>• Sub-query results
        Fusion-->>Workflow: Fused results

        Workflow->>Workflow: rerank → enrich → checkSufficiency
    else Sufficient Results
        CheckSuff-->>Workflow: shouldRetry = false
        Workflow->>Workflow: Continue to SelectMode
    end
```

## 3. Component Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        HTTP[HTTP Client]
        TCP[TCP Client\nOther Services]
    end

    subgraph "Controller Layer"
        HTTPCtrl[HTTP Controller\nRetrievalController]
        TCPCtrl[TCP Controller\nRetrievalTcpController]
    end

    subgraph "Workflow Layer"
        WorkflowSvc[Workflow Service\nLangGraph Orchestration]

        subgraph "Workflow Nodes"
            Cache[Cache Nodes]
            Transform[Query Transform]
            Access[Access Filter]
            Retrieve[Hybrid Retrieval]
            SubQuery[Execute Sub-Queries]
            Fusion[RRF Fusion]
            RerankNode[Rerank Node]
            EnrichNode[Enrich Node]
            Quality[Quality Check]
        end
    end

    subgraph "Service Layer"
        QuerySvc[Query Transformation]
        QdrantSvc[Qdrant Service\nVector Search]
        MySQLSvc[MySQL Service\nMetadata]
        CacheSvc[Qdrant Cache Service]
        RerankerSvc[Reranker Service\nTEI Client]
        DatasourceSvc[Datasource Client\nWhitelist]
        EntitySvc[Entity Extraction]
    end

    subgraph "Data Layer"
        MySQLDB[(MySQL)]
        Qdrant[(Qdrant)]
        Redis[(Redis Cache)]
    end

    HTTP --> HTTPCtrl
    TCP --> TCPCtrl

    HTTPCtrl --> WorkflowSvc
    TCPCtrl --> WorkflowSvc

    WorkflowSvc --> Cache
    WorkflowSvc --> Transform
    WorkflowSvc --> Access
    WorkflowSvc --> Retrieve
    WorkflowSvc --> SubQuery
    WorkflowSvc --> Fusion
    WorkflowSvc --> RerankNode
    WorkflowSvc --> EnrichNode
    WorkflowSvc --> Quality

    Retrieve --> QdrantSvc
    Retrieve --> MySQLSvc
    SubQuery --> QdrantSvc
    SubQuery --> QuerySvc
    Fusion --> RerankerSvc
    Cache --> CacheSvc
    Access --> DatasourceSvc
    Transform --> QuerySvc
    Transform --> EntitySvc

    QdrantSvc --> Qdrant
    MySQLSvc --> MySQLDB
    CacheSvc --> Qdrant
    Redis -. optional .-> CacheSvc
```

## 4. Data Flow

```mermaid
sequenceDiagram
    participant Client
    participant Controller
    participant Workflow
    participant QuerySvc as Query Transform Service
    participant Qdrant
    participant Datasource
    participant MySQL

    Client->>Controller: POST /retrieval
    Controller->>Workflow: Execute workflow(query, context)

    Note over Workflow,QuerySvc: Phase 4: Query Analysis
    Workflow->>QuerySvc: Analyze & transform query
    QuerySvc->>QuerySvc: • Reformulation<br/>• Rewrite<br/>• HyDE<br/>• Decomposition
    QuerySvc-->>Workflow: Transformed queries

    Note over Workflow,Qdrant: Phase 5: Main Retrieval
    Workflow->>Qdrant: Vector search (main query)
    Qdrant-->>Workflow: QdrantResult[]
    Workflow->>Datasource: searchDocumentsByMetadata
    Datasource-->>Workflow: Document metadata
    Workflow->>MySQL: fetchParentChunksByFileIds
    MySQL-->>Workflow: Parent chunks

    Note over Workflow: Phase 6: Quality Check
    Workflow->>Workflow: RRF fusion + rerank + enrich
    Workflow->>Workflow: Check sufficiency

    alt Insufficient & Has Decomposed Queries
        Note over Workflow,Qdrant: Phase 5B: Sub-Query Execution
        Workflow->>Qdrant: Parallel vector search (sub-queries)
        Qdrant-->>Workflow: Sub-query results
        Workflow->>Workflow: Merge with main results via RRF
        Workflow->>Workflow: Rerank + enrich merged results
    end

    Workflow-->>Controller: RetrievalResult
    Controller-->>Client: 200 OK + contexts
```

## 5. Deployment Topology

```mermaid
graph LR
    subgraph Kubernetes Cluster
        RetrievalPod[(Retrieval Service)]
        DatasourcePod[(Datasource Service)]
        QdrantPod[(Qdrant)]
        MySQLPod[(MySQL)]
        RedisPod[(Redis Cache)]
        TEIPod[(TEI Reranker)]
    end

    Client -->|HTTP/TCP| RetrievalPod
    RetrievalPod --> QdrantPod
    RetrievalPod --> MySQLPod
    RetrievalPod --> RedisPod
    RetrievalPod --> TEIPod
    RetrievalPod --> DatasourcePod
```
