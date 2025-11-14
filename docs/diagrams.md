# LTV Assistant – Architecture Diagrams (2025 Refresh)

This document contains updated diagrams reflecting the current platform architecture. All graph-database integrations have been retired; the system now relies on MySQL for metadata and Qdrant for vector search.

## 1. Platform Overview

```mermaid
graph TB
    subgraph "Client Interfaces"
        WebApp
        ApiGateway
    end

    subgraph "Core Services"
        Auth
        CMS
        Datasource
        Indexing
        Retrieval
        MCP
    end

    subgraph "Data Stores"
        MySQL[(MySQL)]
        Qdrant[(Qdrant)]
        Redis[(Redis)]
        MinIO[(MinIO)]
    end

    WebApp --> ApiGateway
    ApiGateway --> Auth
    ApiGateway --> Retrieval
    ApiGateway --> CMS

    Indexing --> MySQL
    Indexing --> Qdrant
    Retrieval --> MySQL
    Retrieval --> Qdrant
    Retrieval --> Redis
    Datasource --> MySQL
    CMS --> MySQL
    MCP --> MySQL
    MCP --> Qdrant
    MCP --> Redis

    MinIO -. uploads .-> Indexing
```

## 2. Indexing Pipeline

```mermaid
flowchart LR
    Load[Load Stage] --> Parse[Parse Stage]
    Parse --> Structure[Structure Stage]
    Structure --> Chunk[Chunk Stage]
    Chunk --> Enrich[Enrich Stage]
    Enrich --> Embed[Embed Stage]
    Embed --> Persist[Persist Stage]

    Persist -->|MySQL| MySQL[(MySQL)]
    Persist -->|Vectors| Qdrant[(Qdrant)]
```

## 3. Retrieval Workflow (LangGraph)

```mermaid
flowchart TD
    Start([START]) --> CheckCache[Check Cache]
    CheckCache -->|Cache Hit| Return([Return Cached Result])
    CheckCache -->|Cache Miss| Analyze[Analyze Query<br/>Generate HyDE]
    Analyze --> BuildFilter[Build Access Filter]
    BuildFilter --> Hybrid[Hybrid Retrieval<br/>Query + HyDE Dual Search]
    Hybrid --> Fusion[RRF Fusion<br/>4 Sources]
    Fusion --> Rerank[Cross-Encoder Rerank]
    Rerank --> Enrich[Small-to-Big Enrich]
    Enrich --> Sufficiency[Check Sufficiency]
    Sufficiency -->|Retry| Analyze
    Sufficiency -->|Continue| SelectMode[Select Mode]
    SelectMode --> UpdateCache[Update Cache]
    UpdateCache --> End([END])
```

## 4. Observability Stack

```mermaid
graph LR
    Prometheus --> Grafana
    Loki --> Grafana
    Tempo --> Grafana

    Services -->|Metrics| Prometheus
    Services -->|Logs| Loki
    Services -->|Traces| Tempo
```

## 5. Complete Retrieval Workflow (LangGraph StateGraph)

```mermaid
flowchart TD
    Start([START]) --> CheckCache[Check Cache Node]

    CheckCache -->|Cache HIT| CacheEnd([END - Return Cached])
    CheckCache -->|Cache MISS| AnalyzeQuery[Analyze Query Node]

    AnalyzeQuery --> BuildFilter[Build Access Filter Node]
    BuildFilter --> HybridRetrieval[Hybrid Retrieval Node]
    HybridRetrieval --> Fusion[Fusion Node - RRF]

    Fusion --> Rerank[Rerank Node]
    Rerank --> Enrich[Enrich Node - Small-to-Big]
    Enrich --> CheckSufficiency[Check Sufficiency Node]

    CheckSufficiency -->|Insufficient + Max Retries + Has Decomposed Queries| ExecuteSubQueries[Execute Sub-Queries Node]
    CheckSufficiency -->|Insufficient + Retries Left| AnalyzeQuery
    CheckSufficiency -->|Sufficient / Continue| SelectMode[Select Mode Node]

    ExecuteSubQueries --> Fusion

    SelectMode --> UpdateCache[Update Cache Node]
    UpdateCache --> End([END - Return Results])

    style CheckCache fill:#e1f5ff
    style UpdateCache fill:#e1f5ff
    style AnalyzeQuery fill:#fff4e1
    style BuildFilter fill:#e8f5e9
    style HybridRetrieval fill:#e8f5e9
    style ExecuteSubQueries fill:#e8f5e9
    style Fusion fill:#e8f5e9
    style Rerank fill:#f3e5f5
    style Enrich fill:#f3e5f5
    style CheckSufficiency fill:#f3e5f5
    style SelectMode fill:#f3e5f5
```

## 6. Query Transformation Stage (Parallel Execution)

```mermaid
flowchart LR
    subgraph "Analyze Query Node"
        Query[Original Query] --> Parallel{Execute in Parallel}

        Parallel --> Reformulation[Query Reformulation<br/>Temp: 0.7<br/>Output: 3-5 variations]
        Parallel --> Rewrite[Query Rewrite<br/>Temp: 0.3<br/>Output: Clarified query]
        Parallel --> HyDE[HyDE Generation<br/>Temp: 0.5<br/>Output: Hypothetical doc]
        Parallel --> Decomposition[Query Decomposition<br/>Temp: 0.4<br/>Output: 2-4 sub-queries]

        Reformulation --> Combine[Combine Results]
        Rewrite --> Combine
        HyDE --> Combine
        Decomposition --> Combine

        Combine --> Embeddings[Generate Embeddings]
        Embeddings --> QueryEmbed[Query Embedding<br/>1024-dim vector]
        Embeddings --> HyDEEmbed[HyDE Embedding<br/>1024-dim vector]

        QueryEmbed --> State[Update State]
        HyDEEmbed --> State
    end

    style Reformulation fill:#fff4e1
    style Rewrite fill:#fff4e1
    style HyDE fill:#fff4e1
    style Decomposition fill:#fff4e1
    style QueryEmbed fill:#e1f5ff
    style HyDEEmbed fill:#e1f5ff
```

## 7. Hybrid Retrieval Pipeline (Multi-Source + HyDE)

```mermaid
flowchart TB
    subgraph "Hybrid Retrieval Node"
        Start[Input: Query Embedding + HyDE Embedding + Access Filter]

        Start --> QdrantSearch[Qdrant Multi-Vector Search<br/>Query Embedding]
        Start --> HyDECheck{HyDE Embedding<br/>Available?}
        Start --> MySQLSearch[MySQL Metadata Search]

        subgraph "Qdrant - Hybrid Dense + Sparse - Query"
            QdrantSearch --> Children[Children Collection<br/>Dense + Sparse<br/>Limit: topK]
            QdrantSearch --> Summaries[Summaries Collection<br/>Dense + Sparse<br/>Limit: topK/2]
            QdrantSearch --> Questions[Questions Collection<br/>Dense + Sparse<br/>Limit: topK/2]

            Children --> QMerge[Deduplicate by parentChunkId<br/>Keep highest score]
            Summaries --> QMerge
            Questions --> QMerge
        end

        subgraph "HyDE Dual Search - NEW!"
            HyDECheck -->|Yes| HyDESearch[Qdrant Multi-Vector Search<br/>HyDE Embedding]
            HyDECheck -->|No| SkipHyDE[Skip HyDE Search]

            HyDESearch --> HChildren[Children Collection<br/>Dense + Sparse<br/>Limit: topK/2]
            HyDESearch --> HSummaries[Summaries Collection<br/>Dense + Sparse<br/>Limit: topK/4]
            HyDESearch --> HQuestions[Questions Collection<br/>Dense + Sparse<br/>Limit: topK/4]

            HChildren --> HMerge[Deduplicate by parentChunkId<br/>Keep highest score]
            HSummaries --> HMerge
            HQuestions --> HMerge
        end

        subgraph "MySQL - Metadata"
            MySQLSearch --> DocSearch[Search Documents<br/>by title/description]
            DocSearch --> FileIds[Extract File IDs]
            FileIds --> ChunkFetch[Fetch Parent Chunks<br/>by File IDs]
        end

        QMerge --> Output[Output: QdrantResult array]
        HMerge --> OutputHyDE[Output: HyDE QdrantResult array]
        ChunkFetch --> Output2[Output: DocumentMetadata array]
    end

    subgraph "Sub-Query Execution - Decomposition Fallback"
        Trigger[Triggered when:<br/>Insufficient + Max Retries]
        Trigger --> SubQueries[Decomposed Queries<br/>from Analyze stage]
        SubQueries --> ParallelSearch[Execute Each Sub-Query<br/>in Parallel]
        ParallelSearch --> SubEmbed[Generate Embeddings]
        SubEmbed --> SubSearch[Qdrant Hybrid Search<br/>Limit: topK / count]
        SubSearch --> Dedupe[Deduplicate Results<br/>Keep highest score]
        Dedupe --> SubOutput[Output: QdrantResult array]
    end

    Output --> Fusion
    OutputHyDE -.->|If HyDE available| Fusion
    Output2 --> Fusion
    SubOutput -.->|If triggered| Fusion

    Fusion[Fusion Node - RRF<br/>Merges 4 sources]

    style QdrantSearch fill:#e8f5e9
    style HyDESearch fill:#fff4e1
    style MySQLSearch fill:#e8f5e9
    style Children fill:#e1f5ff
    style Summaries fill:#e1f5ff
    style Questions fill:#e1f5ff
    style HChildren fill:#ffe1f5
    style HSummaries fill:#ffe1f5
    style HQuestions fill:#ffe1f5
    style SubSearch fill:#fff4e1
```

## 8. Reranking & Enrichment Pipeline

```mermaid
flowchart TD
    subgraph "Fusion Node - RRF"
        Input1[Qdrant Results<br/>Query Embedding] --> RRF[Reciprocal Rank Fusion<br/>Formula: 1 / k + rank<br/>k = 60]
        Input2[HyDE Results<br/>Hypothetical Doc Embedding] --> RRF
        Input3[MySQL Results] --> RRF
        Input4[Sub-Query Results] --> RRF

        RRF --> Dedupe[Deduplicate by chunkId<br/>Sum RRF scores from all sources]
        Dedupe --> Sort[Sort by Combined RRF Score<br/>Descending]
        Sort --> Buffer[Take Top 1.5 × topK<br/>Buffer for reranking]
    end

    subgraph "Rerank Node - Cross-Encoder"
        Buffer --> Reranker[BGE-Reranker-v2-m3<br/>via TEI HTTP API]
        Reranker --> RerankScores[Cross-Encoder Scores]
        RerankScores --> Threshold[Filter by Threshold<br/>Default: 0.0]
        Threshold --> TopK[Take Top K Results]
        TopK -.->|All filtered| Fallback[Fallback: Top 3 by score<br/>Ignore threshold]
    end

    subgraph "Enrich Node - Small-to-Big"
        TopK --> Group[Group Children<br/>by parentChunkId]
        Fallback --> Group

        Group --> FetchParents[Fetch Parent Chunks<br/>from MySQL<br/>~1800 tokens each]
        FetchParents --> BuildContexts[Build EnrichedContext<br/>Parent + Children]
        BuildContexts --> BestScore[Calculate bestScore<br/>Max child score]
        BestScore --> SortEnrich[Sort by bestScore<br/>Descending]
    end

    SortEnrich --> CheckSufficiency[Check Sufficiency Node]

    style RRF fill:#e8f5e9
    style Reranker fill:#f3e5f5
    style FetchParents fill:#fff4e1
    style BuildContexts fill:#fff4e1
```

## 9. Adaptive Loop & Sufficiency Decision

```mermaid
flowchart TD
    EnrichNode[Enrich Node<br/>EnrichedContext array] --> CheckSufficiency[Check Sufficiency Node]

    subgraph "Sufficiency Calculation"
        CheckSufficiency --> CountMetrics[Calculate Metrics]
        CountMetrics --> HighQuality[High Quality Count<br/>score ≥ 0.7]
        CountMetrics --> AvgScore[Average Score]
        CountMetrics --> MinCoverage[Min Coverage<br/>≥ 3 contexts]

        HighQuality --> Formula[Composite Score<br/>highQuality/topK × 0.5<br/>+ avgScore × 0.3<br/>+ minCoverage × 0.2]
        AvgScore --> Formula
        MinCoverage --> Formula
    end

    Formula --> Decision{Decision Logic}

    Decision -->|Score ≥ 0.6| Sufficient[Sufficient]
    Decision -->|Score < 0.6<br/>Iterations < 3| Retry[Retry]
    Decision -->|Score < 0.6<br/>Iterations = 3<br/>Has Decomposed Queries| Decomposition[Trigger Decomposition]
    Decision -->|Score < 0.6<br/>Iterations = 3<br/>No Decomposed Queries| Insufficient[Insufficient - Continue]

    Sufficient --> SelectMode[Select Mode Node]
    Insufficient --> SelectMode

    Retry --> AnalyzeQuery[Analyze Query Node<br/>Iteration + 1]
    AnalyzeQuery --> BuildFilter[...]

    Decomposition --> ExecuteSubQueries[Execute Sub-Queries Node]
    ExecuteSubQueries --> Fusion[Fusion Node<br/>Merge with main results]
    Fusion --> Rerank[Rerank Node<br/>Re-score combined results]
    Rerank --> Enrich[Enrich Node<br/>Re-enrich]
    Enrich --> CheckSufficiency2[Check Sufficiency<br/>Final check]
    CheckSufficiency2 --> SelectMode

    style Formula fill:#fff4e1
    style Retry fill:#ffebee
    style Decomposition fill:#e8f5e9
    style Sufficient fill:#e8f5e9
```

## 10. Semantic Cache Flow (Phase 1.5)

```mermaid
flowchart TD
    subgraph "Check Cache Node"
        Start[Query Request] --> CacheEnabled{useCache = true?}
        CacheEnabled -->|No| SkipCache[Skip Cache]
        CacheEnabled -->|Yes| EmbedQuery[Embed Query<br/>1024-dim vector]

        EmbedQuery --> SearchCache[Semantic Search<br/>in Qdrant Cache Collection]
        SearchCache --> Similarity{Similarity ≥ 0.95?}

        Similarity -->|Yes| CacheHit[Cache HIT<br/>Return cached contexts<br/>END workflow]
        Similarity -->|No| CacheMiss[Cache MISS<br/>Store embedding<br/>Continue workflow]

        SkipCache --> ContinueWorkflow[Continue to<br/>Analyze Query]
        CacheMiss --> ContinueWorkflow
    end

    subgraph "Update Cache Node - After Retrieval"
        Results[Final Contexts] --> UpdateEnabled{useCache = true?}
        UpdateEnabled -->|No| SkipUpdate[Skip Cache Update]
        UpdateEnabled -->|Yes| WasHit{Was Cache Hit?}

        WasHit -->|Yes| SkipUpdate2[Skip - Already Cached]
        WasHit -->|No| HasContexts{Has Contexts?}

        HasContexts -->|No| SkipUpdate3[Skip - No Results]
        HasContexts -->|Yes| ExtractDocs[Extract Unique<br/>Document IDs]

        ExtractDocs --> FetchDetails[Fetch Document Details<br/>from Datasource Service<br/>via TCP]
        FetchDetails --> CheckAccess{ALL Documents<br/>accessType = public?}

        CheckAccess -->|No| SkipUpdate4[Skip - Not All Public<br/>Security: Only cache public docs]
        CheckAccess -->|Yes| StoreCache[Store in Qdrant<br/>Cache Collection<br/>Query + Embedding + Contexts]
    end

    CacheHit --> End1([END])
    ContinueWorkflow --> FullPipeline[Full Retrieval Pipeline]
    FullPipeline --> Results
    StoreCache --> End2([END])
    SkipUpdate --> End2
    SkipUpdate2 --> End2
    SkipUpdate3 --> End2
    SkipUpdate4 --> End2

    style CacheHit fill:#e8f5e9
    style CacheMiss fill:#fff4e1
    style StoreCache fill:#e1f5ff
    style CheckAccess fill:#ffebee
```

## 11. Service Architecture & Dependencies

```mermaid
graph TB
    subgraph "Controllers & API"
        HTTP[HTTP Controller<br/>Port: 50053]
        TCP[TCP Controller<br/>Port: 4005]
    end

    subgraph "Core Workflow"
        Workflow[RetrievalWorkflowService<br/>LangGraph StateGraph]
    end

    subgraph "LLM & Embedding Providers"
        EmbedFactory[EmbeddingProviderFactory<br/>bge-m3:567m via Ollama]
        LLMFactory[LLMProviderFactory<br/>Supports: OpenAI, Google, Anthropic, Ollama]
    end

    subgraph "Retrieval Services"
        Qdrant[QdrantService<br/>Multi-vector search<br/>3 collections]
        QdrantCache[QdrantCacheService<br/>Semantic cache<br/>documents_cache collection]
        MySQL[MySQLService<br/>Parent chunk fetch<br/>Drizzle ORM]
        Sparse[SparseEmbeddingService<br/>BM25 tokenization]
        Reranker[RerankerService<br/>BGE-Reranker-v2-m3<br/>HTTP: localhost:8081]
        QueryTransform[QueryTransformationService<br/>4 techniques: Reformulation,<br/>Rewrite, HyDE, Decomposition]
        CacheInvalidation[CacheInvalidationService<br/>Event-driven cache updates]
    end

    subgraph "External Clients"
        DatasourceClient[DatasourceClient<br/>TCP to ltv-assistant-datasource<br/>Port: 4003]
    end

    subgraph "Data Stores"
        QdrantDB[(Qdrant<br/>Vector Database<br/>Port: 6333)]
        MySQLDB[(MySQL<br/>Relational Database<br/>Chunks & Metadata)]
        RedisDB[(Redis<br/>Cache Storage)]
    end

    subgraph "External Services"
        TEI[Text Embeddings Inference<br/>BGE-Reranker TEI<br/>Port: 8081]
        Ollama[Ollama<br/>Embedding Model<br/>Port: 11434]
    end

    HTTP --> Workflow
    TCP --> Workflow

    Workflow --> EmbedFactory
    Workflow --> LLMFactory
    Workflow --> Qdrant
    Workflow --> QdrantCache
    Workflow --> MySQL
    Workflow --> Reranker
    Workflow --> QueryTransform
    Workflow --> DatasourceClient

    Qdrant --> Sparse
    Qdrant --> QdrantDB
    QdrantCache --> QdrantDB
    QdrantCache --> RedisDB
    MySQL --> MySQLDB
    Reranker --> TEI
    EmbedFactory --> Ollama
    LLMFactory --> Ollama
    QueryTransform --> LLMFactory

    DatasourceClient -.->|TCP| DatasourceService[ltv-assistant-datasource<br/>Document metadata<br/>Access control]

    CacheInvalidation --> QdrantCache

    style Workflow fill:#e1f5ff
    style Qdrant fill:#e8f5e9
    style QdrantCache fill:#e8f5e9
    style Reranker fill:#f3e5f5
    style QueryTransform fill:#fff4e1
```

---
*Diagrams last updated: 2025-11-14*
*HyDE dual search added: 2025-11-14*
