# Phase 4: Dashboard & Results - Complete Implementation Guide

## Status: Ready for Implementation

This guide provides complete implementation details for Phase 4, including all backend APIs and frontend pages.

---

## Backend Implementation (Estimated: 2-3 days)

### 1. Dashboard API Routes (`src/routes/dashboard.py`)

Create new file with 5 endpoints:

```python
"""Dashboard and Results API endpoints."""

from flask import Blueprint, request, jsonify, Response
from sqlalchemy import select, func
from redis import Redis
import csv
import io

from src.models.base import get_db_session
from src.models.run import EvaluationRun
from src.models.result import EvaluationResult
from src.models.dataset import EvaluationDataset
from src.schemas.dashboard import DashboardLatestResponse, RunOverviewResponse
from src.schemas.result import ResultListResponse, ResultListItem, ResultDetailResponse
from src.config.settings import get_settings
from src.utils.logger import logger

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/evaluation')
settings = get_settings()
```

#### Endpoint 1: GET /evaluation/dashboard/latest
```python
@dashboard_bp.route('/dashboard/latest', methods=['GET'])
def get_latest_run():
    """
    Get latest completed evaluation run for dashboard auto-load.

    Returns:
        Latest run with statistics, or 404 if no runs exist
    """
    try:
        db = get_db_session()
        try:
            # Query latest completed run
            run = db.execute(
                select(EvaluationRun)
                .join(EvaluationJob, EvaluationJob.job_id == EvaluationRun.job_id)
                .where(EvaluationJob.status == 'completed')
                .order_by(EvaluationRun.created_at.desc())
                .limit(1)
            ).scalar_one_or_none()

            if not run:
                return jsonify({'error': 'NotFound', 'message': 'No completed runs found'}), 404

            # Get dataset name
            dataset = db.execute(
                select(EvaluationDataset).where(EvaluationDataset.dataset_id == run.dataset_id)
            ).scalar_one()

            # Cache in Redis
            redis_conn = Redis.from_url(settings.redis_url, decode_responses=True)
            redis_conn.set('ragas:latest_run', run.run_id)

            # Prepare response
            response = DashboardLatestResponse(
                run_id=run.run_id,
                dataset_id=run.dataset_id,
                dataset_name=dataset.name,
                job_id=run.job_id,
                total_questions=run.total_questions,
                completed_questions=run.completed_questions,
                failed_questions=run.failed_questions,
                average_scores=run.average_scores,
                statistics=run.statistics,
                processing_time_ms=run.processing_time_ms,
                created_at=run.created_at,
                completed_at=run.completed_at
            )

            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to get latest run: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to get latest run'}), 500
```

#### Endpoint 2: GET /evaluation/runs/:runId/overview
```python
@dashboard_bp.route('/runs/<run_id>/overview', methods=['GET'])
def get_run_overview(run_id: str):
    """
    Get comprehensive overview with aggregated metrics.

    Query params:
        - use_cache: boolean (default true)

    Returns:
        Complete run overview with statistics
    """
    try:
        # Check Redis cache first
        use_cache = request.args.get('use_cache', 'true').lower() == 'true'
        cache_key = f"ragas:overview:{run_id}"

        if use_cache:
            redis_conn = Redis.from_url(settings.redis_url, decode_responses=True)
            cached = redis_conn.get(cache_key)
            if cached:
                return jsonify(json.loads(cached)), 200

        db = get_db_session()
        try:
            # Get run
            run = db.execute(
                select(EvaluationRun).where(EvaluationRun.run_id == run_id)
            ).scalar_one_or_none()

            if not run:
                return jsonify({'error': 'NotFound', 'message': 'Run not found'}), 404

            # Get dataset
            dataset = db.execute(
                select(EvaluationDataset).where(EvaluationDataset.dataset_id == run.dataset_id)
            ).scalar_one()

            # Calculate derived metrics
            success_rate = (run.completed_questions / run.total_questions * 100) if run.total_questions > 0 else 0
            avg_time_per_question = (run.processing_time_ms // run.total_questions) if run.total_questions > 0 else None

            avg_scores = run.average_scores or {}
            overall_score = (
                avg_scores.get('context_precision', 0) +
                avg_scores.get('context_recall', 0) +
                avg_scores.get('context_relevancy', 0)
            ) / 3

            # Parse statistics
            stats = run.statistics or {}
            precision_stats = stats.get('context_precision')
            recall_stats = stats.get('context_recall')
            relevancy_stats = stats.get('context_relevancy')

            # Prepare response
            response = RunOverviewResponse(
                run_id=run.run_id,
                dataset_id=run.dataset_id,
                dataset_name=dataset.name,
                job_id=run.job_id,
                total_questions=run.total_questions,
                completed_questions=run.completed_questions,
                failed_questions=run.failed_questions,
                success_rate=success_rate,
                avg_context_precision=avg_scores.get('context_precision', 0),
                avg_context_recall=avg_scores.get('context_recall', 0),
                avg_context_relevancy=avg_scores.get('context_relevancy', 0),
                overall_score=overall_score,
                precision_stats=precision_stats,
                recall_stats=recall_stats,
                relevancy_stats=relevancy_stats,
                processing_time_ms=run.processing_time_ms,
                avg_time_per_question_ms=avg_time_per_question,
                created_at=run.created_at,
                completed_at=run.completed_at
            )

            # Cache for 1 hour
            if use_cache:
                redis_conn.setex(cache_key, 3600, json.dumps(response.model_dump(mode='json')))

            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to get run overview: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to get run overview'}), 500
```

#### Endpoint 3: GET /evaluation/runs/:runId/results
```python
@dashboard_bp.route('/runs/<run_id>/results', methods=['GET'])
def get_run_results(run_id: str):
    """
    Get paginated results for a run.

    Query params:
        - page: int (default 1)
        - limit: int (default 20, max 100)
        - search: string (search in question text)
        - min_precision: float (filter)
        - min_recall: float (filter)
        - min_relevancy: float (filter)
        - sort_by: string (precision|recall|relevancy|order_index)
        - sort_order: string (asc|desc, default desc)

    Returns:
        Paginated results list
    """
    # Parse params
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    search = request.args.get('search', type=str)
    min_precision = request.args.get('min_precision', type=float)
    min_recall = request.args.get('min_recall', type=float)
    min_relevancy = request.args.get('min_relevancy', type=float)
    sort_by = request.args.get('sort_by', 'order_index', type=str)
    sort_order = request.args.get('sort_order', 'asc', type=str)

    # Validate
    if limit < 1 or limit > 100:
        limit = 20
    if page < 1:
        page = 1

    try:
        db = get_db_session()
        try:
            # Build query
            query = select(EvaluationResult).where(EvaluationResult.run_id == run_id)

            # Apply filters
            if search:
                query = query.where(EvaluationResult.question_text.contains(search))
            if min_precision:
                query = query.where(EvaluationResult.context_precision >= min_precision)
            if min_recall:
                query = query.where(EvaluationResult.context_recall >= min_recall)
            if min_relevancy:
                query = query.where(EvaluationResult.context_relevancy >= min_relevancy)

            # Apply sorting
            sort_column = getattr(EvaluationResult, sort_by, EvaluationResult.created_at)
            if sort_order == 'desc':
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column.asc())

            # Get total count
            count_query = select(func.count()).select_from(query.subquery())
            total = db.execute(count_query).scalar() or 0

            # Pagination
            pages = (total + limit - 1) // limit if total > 0 else 1
            offset = (page - 1) * limit

            # Get results
            query = query.offset(offset).limit(limit)
            results = db.execute(query).scalars().all()

            # Prepare response
            items = []
            for result in results:
                # Truncate question text for list view
                question_preview = result.question_text[:100] + '...' if len(result.question_text) > 100 else result.question_text

                items.append(ResultListItem(
                    result_id=result.result_id,
                    question_id=result.question_id,
                    question_text=question_preview,
                    context_precision=result.context_precision,
                    context_recall=result.context_recall,
                    context_relevancy=result.context_relevancy,
                    status=result.status,
                    created_at=result.created_at
                ))

            response = ResultListResponse(
                items=items,
                total=total,
                page=page,
                limit=limit,
                pages=pages
            )

            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to get run results: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to get run results'}), 500
```

#### Endpoint 4: GET /evaluation/results/:resultId
```python
@dashboard_bp.route('/results/<result_id>', methods=['GET'])
def get_result_detail(result_id: str):
    """
    Get complete detail for a single result.

    Returns:
        Full result with all contexts, scores, and metadata
    """
    try:
        db = get_db_session()
        try:
            result = db.execute(
                select(EvaluationResult).where(EvaluationResult.result_id == result_id)
            ).scalar_one_or_none()

            if not result:
                return jsonify({'error': 'NotFound', 'message': 'Result not found'}), 404

            response = ResultDetailResponse.model_validate(result)
            return jsonify(response.model_dump(mode='json')), 200

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to get result detail: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to get result detail'}), 500
```

#### Endpoint 5: GET /evaluation/runs/:runId/export
```python
@dashboard_bp.route('/runs/<run_id>/export', methods=['GET'])
def export_results(run_id: str):
    """
    Export results to CSV or JSON.

    Query params:
        - format: csv|json (required)
        - type: summary|detailed (default: detailed)

    Returns:
        File download
    """
    export_format = request.args.get('format', 'csv')
    export_type = request.args.get('type', 'detailed')

    if export_format not in ['csv', 'json']:
        return jsonify({'error': 'BadRequest', 'message': 'Invalid format. Use csv or json'}), 400

    try:
        db = get_db_session()
        try:
            # Get all results
            results = db.execute(
                select(EvaluationResult)
                .where(EvaluationResult.run_id == run_id)
                .order_by(EvaluationResult.created_at)
            ).scalars().all()

            if not results:
                return jsonify({'error': 'NotFound', 'message': 'No results found for this run'}), 404

            # Export as CSV
            if export_format == 'csv':
                output = io.StringIO()

                if export_type == 'summary':
                    writer = csv.writer(output)
                    writer.writerow(['Question ID', 'Question', 'Precision', 'Recall', 'Relevancy', 'Status'])
                    for result in results:
                        writer.writerow([
                            result.question_id,
                            result.question_text,
                            result.context_precision,
                            result.context_recall,
                            result.context_relevancy,
                            result.status
                        ])
                else:  # detailed
                    writer = csv.writer(output)
                    writer.writerow([
                        'Question ID', 'Question', 'Expected Context',
                        'Retrieved Contexts', 'Precision', 'Recall', 'Relevancy',
                        'Status', 'Error Message', 'Metadata'
                    ])
                    for result in results:
                        writer.writerow([
                            result.question_id,
                            result.question_text,
                            result.expected_context,
                            json.dumps(result.retrieved_contexts),
                            result.context_precision,
                            result.context_recall,
                            result.context_relevancy,
                            result.status,
                            result.error_message,
                            json.dumps(result.metadata)
                        ])

                response = Response(output.getvalue(), mimetype='text/csv')
                response.headers['Content-Disposition'] = f'attachment; filename=results_{run_id}.csv'
                return response

            # Export as JSON
            else:
                data = []
                for result in results:
                    if export_type == 'summary':
                        data.append({
                            'question_id': result.question_id,
                            'question': result.question_text,
                            'scores': {
                                'precision': result.context_precision,
                                'recall': result.context_recall,
                                'relevancy': result.context_relevancy
                            },
                            'status': result.status
                        })
                    else:  # detailed
                        data.append(ResultDetailResponse.model_validate(result).model_dump(mode='json'))

                response = Response(json.dumps(data, indent=2), mimetype='application/json')
                response.headers['Content-Disposition'] = f'attachment; filename=results_{run_id}.json'
                return response

        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to export results: {e}", exc_info=True)
        return jsonify({'error': 'InternalServerError', 'message': 'Failed to export results'}), 500
```

### 2. Register Dashboard Blueprint

Update `src/app.py`:
```python
from src.routes.dashboard import dashboard_bp

# In create_app():
app.register_blueprint(dashboard_bp)
```

---

## Frontend Implementation (Estimated: 5-6 days)

### Directory Structure

```
ltv-assistant-cms/src/
├── features/evaluation/
│   ├── api/
│   │   └── evaluation.api.ts          # API client
│   ├── hooks/
│   │   ├── useFiles.ts
│   │   ├── useDatasets.ts
│   │   ├── useEvaluation.ts
│   │   └── useDashboard.ts
│   ├── types/
│   │   └── evaluation.types.ts
│   ├── ui/
│   │   ├── FileUploader.tsx
│   │   ├── DatasetCard.tsx
│   │   ├── QuestionList.tsx
│   │   ├── MetricsCard.tsx
│   │   ├── ResultsTable.tsx
│   │   └── QuestionDetailModal.tsx
│   └── utils/
│       └── evaluation.utils.ts
└── pages/evaluation/
    ├── FilesManagementPage.tsx
    ├── DatasetsPage.tsx
    ├── DatasetQuestionsPage.tsx
    ├── RunEvaluationPage.tsx
    ├── EvaluationDashboardPage.tsx     # MAIN PAGE
    └── JobHistoryPage.tsx
```

### Implementation Files (Full code templates provided in repository)

Due to length constraints, I'm providing links to the implementation files that should be created:

1. **TypeScript Types** - See `PHASE4_TYPES_TEMPLATE.md`
2. **API Client** - See `PHASE4_API_CLIENT_TEMPLATE.md`
3. **React Hooks** - See `PHASE4_HOOKS_TEMPLATE.md`
4. **UI Components** - See `PHASE4_COMPONENTS_TEMPLATE.md`
5. **Pages** - See `PHASE4_PAGES_TEMPLATE.md`
6. **Routing** - See `PHASE4_ROUTING_TEMPLATE.md`

---

## Key Implementation Notes

### 1. Dashboard Auto-Load
```typescript
// In EvaluationDashboardPage.tsx
const { data: latestRun, isLoading } = useLatestRun();

useEffect(() => {
  if (latestRun) {
    setCurrentRun(latestRun);
  }
}, [latestRun]);
```

### 2. Progress Polling
```typescript
// In RunEvaluationPage.tsx
const { data: jobStatus } = useJobStatus(jobId, {
  refetchInterval: 5000, // Poll every 5 seconds
  enabled: !!jobId && jobStatus?.status !== 'completed'
});
```

### 3. Drag-and-Drop Reorder
```typescript
// Install: @dnd-kit/core @dnd-kit/sortable
import { DndContext } from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';

// Handle drag end
const handleDragEnd = (event) => {
  const { active, over } = event;
  if (active.id !== over.id) {
    const newOrder = arrayMove(questions, oldIndex, newIndex);
    // Save to backend
    reorderMutation.mutate({ dataset_id, question_orders: newOrder });
  }
};
```

### 4. Export Functionality
```typescript
const handleExport = async (format: 'csv' | 'json', type: 'summary' | 'detailed') => {
  const url = `/evaluation/runs/${runId}/export?format=${format}&type=${type}`;
  window.open(url, '_blank'); // Trigger download
};
```

### 5. Role-Based Access
```typescript
// In routing
const EvaluationRoutes = () => {
  const { user } = useAuth();

  if (user?.role !== 'super_admin') {
    return <Navigate to="/403" />;
  }

  return <Outlet />;
};
```

---

## Testing Checklist

### Backend
- [ ] Test latest run endpoint returns correct data
- [ ] Test overview endpoint with caching
- [ ] Test results pagination and filtering
- [ ] Test result detail endpoint
- [ ] Test CSV export downloads correctly
- [ ] Test JSON export format
- [ ] Test all error cases (404, 500)

### Frontend
- [ ] Test file upload with drag-and-drop
- [ ] Test dataset CRUD operations
- [ ] Test question bulk add
- [ ] Test question reordering (drag-and-drop)
- [ ] Test evaluation job creation
- [ ] Test progress polling during evaluation
- [ ] Test dashboard auto-load on mount
- [ ] Test metrics cards display correctly
- [ ] Test results table with filters
- [ ] Test question detail modal
- [ ] Test export CSV/JSON
- [ ] Test job history page
- [ ] Test role-based access (non-admin sees 403)

### E2E Flow
1. Upload 3 files
2. Create manual dataset
3. Add 10 questions
4. Reorder questions
5. Run evaluation
6. Watch progress updates
7. View dashboard (auto-load)
8. Click question to see detail
9. Export to CSV
10. View job history

---

## Dependencies to Add

### Backend
```txt
# Already installed - no new dependencies needed
```

### Frontend
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install recharts  # Optional for charts
```

---

## Timeline

- **Day 1-2**: Backend APIs (5 endpoints, schemas)
- **Day 3**: API client + React hooks
- **Day 4-5**: UI components + FilesPage + DatasetsPage
- **Day 6-7**: QuestionsPage + RunPage + DashboardPage
- **Day 8**: JobHistoryPage + Routing + Testing
- **Day 9**: Polish, bug fixes, E2E testing
- **Day 10-11**: Buffer for issues

**Total: 8-11 days**

---

## Success Criteria

Phase 4 is complete when:
- [ ] All 5 dashboard API endpoints work
- [ ] Dashboard auto-loads latest run
- [ ] Metrics overview displays correctly
- [ ] Results table with filters works
- [ ] Question detail modal works
- [ ] Export CSV/JSON downloads successfully
- [ ] All 6 CMS pages are functional
- [ ] Drag-and-drop reorder works
- [ ] Progress polling updates in real-time
- [ ] Role-based access enforced
- [ ] E2E flow works from upload to dashboard

---

## Next Steps After Phase 4

1. Phase 5: Testing & Polish (1-2 weeks)
2. Phase 6: Deployment (1 week)
3. Optional: LLM Question Generation (2-3 weeks)

---

**Status**: Phase 3 completed. Phase 4 backend schemas created. Remaining: 5 API endpoints + complete frontend.
