# BGE Reranker Service Guide

## Overview

The BGE Reranker service provides self-hosted reranking capabilities using BAAI's BGE-reranker-v2-m3 model. This service runs completely within your Docker environment, ensuring data confidentiality.

## Service Details

- **Container**: `ltv-bge-reranker`
- **Port**: `6201` (maps to internal port 80)
- **Model**: BAAI/bge-reranker-v2-m3 (multilingual, ~600MB)
- **API**: REST HTTP endpoint
- **Memory**: 1-2GB RAM allocated

## Starting the Service

```bash
# Start the reranker service
docker-compose up -d bge-reranker

# Check service status
docker-compose ps bge-reranker

# View logs
docker-compose logs -f bge-reranker

# Check health
curl http://localhost:6201/health
```

## First Run

On the first run, the service will:
1. Download the BGE-reranker-v2-m3 model from Hugging Face (~600MB)
2. Cache it in the `bge_reranker_data` volume
3. Load the model into memory
4. Start accepting requests

**Note**: First startup may take 2-5 minutes depending on your internet speed.

## API Usage

### Endpoint

```
POST http://localhost:6201/rerank
```

### Request Format

```json
{
  "query": "What is the capital of France?",
  "texts": [
    "Paris is the capital and most populous city of France.",
    "London is the capital of England and the United Kingdom.",
    "Berlin is the capital and largest city of Germany.",
    "Rome is the capital city of Italy."
  ]
}
```

### Response Format

```json
[
  {
    "index": 0,
    "score": 0.98
  },
  {
    "index": 3,
    "score": 0.12
  },
  {
    "index": 2,
    "score": 0.05
  },
  {
    "index": 1,
    "score": 0.03
  }
]
```

## Integration Examples

### TypeScript/Node.js with Axios

```typescript
import axios from 'axios';

interface RerankRequest {
  query: string;
  texts: string[];
}

interface RerankResult {
  index: number;
  score: number;
}

async function rerank(query: string, texts: string[]): Promise<RerankResult[]> {
  const response = await axios.post<RerankResult[]>(
    'http://localhost:6201/rerank',
    {
      query,
      texts,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout
    }
  );

  return response.data;
}

// Usage example
const query = "How to implement authentication?";
const documents = [
  "Authentication is the process of verifying user identity...",
  "JWT tokens are commonly used for stateless authentication...",
  "OAuth 2.0 is an authorization framework...",
];

const results = await rerank(query, documents);
console.log('Reranked results:', results);
```

### Integration with LangChain Retrieval Pipeline

```typescript
import { Document } from '@langchain/core/documents';
import axios from 'axios';

interface RerankResult {
  index: number;
  score: number;
}

async function rerankDocuments(
  query: string,
  documents: Document[],
  topK: number = 10
): Promise<Document[]> {
  // Extract text content from documents
  const texts = documents.map(doc => doc.pageContent);

  // Call reranker service
  const results = await axios.post<RerankResult[]>(
    'http://localhost:6201/rerank',
    { query, texts }
  );

  // Sort by score and take top K
  const topResults = results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // Return reranked documents with scores in metadata
  return topResults.map(result => ({
    ...documents[result.index],
    metadata: {
      ...documents[result.index].metadata,
      rerankScore: result.score,
    },
  }));
}

// Usage in RAG pipeline
async function retrievalPipeline(query: string) {
  // Step 1: Initial retrieval from vector store (e.g., Qdrant)
  const initialDocs = await vectorStore.similaritySearch(query, 50);

  // Step 2: Rerank using BGE reranker
  const rerankedDocs = await rerankDocuments(query, initialDocs, 10);

  // Step 3: Send to LLM with top reranked documents
  const context = rerankedDocs.map(doc => doc.pageContent).join('\n\n');

  return { documents: rerankedDocs, context };
}
```

### Full RAG Pipeline with Hybrid Search + RRF + Reranking

```typescript
import { Document } from '@langchain/core/documents';

// Reciprocal Rank Fusion implementation
function reciprocalRankFusion(
  retrievalResults: Document[][],
  k: number = 60
): Document[] {
  const scores = new Map<string, { doc: Document; score: number }>();

  retrievalResults.forEach(results => {
    results.forEach((doc, rank) => {
      const key = doc.pageContent; // Use content as key
      const rrfScore = 1 / (k + rank + 1);

      if (scores.has(key)) {
        scores.get(key)!.score += rrfScore;
      } else {
        scores.set(key, { doc, score: rrfScore });
      }
    });
  });

  // Sort by RRF score
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(item => ({
      ...item.doc,
      metadata: {
        ...item.doc.metadata,
        rrfScore: item.score,
      },
    }));
}

// Complete pipeline
async function advancedRetrievalPipeline(query: string) {
  // Stage 1: Multiple retrieval strategies in parallel
  const [vectorResults, bm25Results, graphResults] = await Promise.all([
    vectorStore.similaritySearch(query, 50),
    bm25Retriever.search(query, 50),
    graphRetriever.search(query, 20),
  ]);

  // Stage 2: Reciprocal Rank Fusion
  const fusedResults = reciprocalRankFusion([
    vectorResults,
    bm25Results,
    graphResults,
  ]);

  // Take top 30 for reranking
  const candidateResults = fusedResults.slice(0, 30);

  // Stage 3: Cross-encoder reranking
  const rerankedResults = await rerankDocuments(query, candidateResults, 10);

  return rerankedResults;
}
```

## Performance Tuning

### For CPU-only environments (current setup)
- Expected latency: ~100-200ms for 20-30 documents
- Memory usage: ~1-2GB
- Recommended batch size: 20-30 documents

### For GPU environments
If you have an NVIDIA GPU, uncomment the GPU section in docker-compose.yml:

```yaml
bge-reranker:
  image: ghcr.io/huggingface/text-embeddings-inference:1.5
  # ... other config ...
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

Expected improvements with GPU:
- Latency: ~20-50ms for 20-30 documents
- Can handle larger batch sizes (50-100 documents)

## Monitoring

### Health Check

```bash
curl http://localhost:6201/health
```

### Metrics (if exposed)

```bash
curl http://localhost:6201/metrics
```

### Logs

```bash
# Real-time logs
docker-compose logs -f bge-reranker

# Last 100 lines
docker-compose logs --tail=100 bge-reranker
```

## Troubleshooting

### Service won't start
1. Check if port 6201 is available
2. Ensure Docker has internet access (for model download)
3. Check available memory: `docker stats ltv-bge-reranker`

### Slow first request
This is normal - the model needs to warm up. Subsequent requests will be faster.

### Out of memory errors
Increase memory limit in docker-compose.yml:
```yaml
deploy:
  resources:
    limits:
      memory: 3G  # Increase from 2G
```

### Model download fails
Check internet connectivity and Hugging Face availability:
```bash
curl https://huggingface.co
```

## Best Practices

1. **Always rerank after initial retrieval** - Don't send raw retrieval results to LLM
2. **Limit reranking candidates** - Rerank 20-50 documents, not hundreds
3. **Cache results** - Consider caching rerank scores for frequently repeated queries
4. **Monitor latency** - Track P50, P95, P99 latencies in production
5. **A/B test** - Compare RAG quality with and without reranking

## Security

- ✅ All processing happens within your Docker network
- ✅ No external API calls after model download
- ✅ No telemetry or data collection
- ✅ Model runs completely offline after initial setup

## Upgrading Models

To use a different BGE model, modify the `MODEL_ID` in docker-compose.yml:

```yaml
environment:
  - MODEL_ID=BAAI/bge-reranker-large  # or other variant
command: --model-id BAAI/bge-reranker-large --port 80 --max-concurrent-requests 512
```

Available models:
- `BAAI/bge-reranker-base` (smaller, faster)
- `BAAI/bge-reranker-v2-m3` (multilingual, balanced)
- `BAAI/bge-reranker-large` (best quality, slower)
- `BAAI/bge-reranker-v2-minicpm` (latest)
