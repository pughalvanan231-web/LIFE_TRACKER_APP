# Scheduled Backend Jobs & Midnight Closing Architecture

## 1. Architectural Overview & Design Principles

The Life Goals AI backend implements **server-side scheduled jobs** designed for zero client dependency, timezone-aware day boundary closing, idempotent retries, and bounded memory consumption.

```
[ Google Cloud Scheduler ] (Cron: 0 * * * * - Hourly trigger)
        │  OIDC Token (Service Account with roles/run.invoker)
        ▼
[ POST /api/v1/jobs/midnight-closing (Cloud Run) ]
        │  1. Verify Google OIDC Token or X-Job-Secret (@require_job_auth)
        │  2. Stream users in bounded pages (limit: 50)
        ▼
[ JobService Pipeline ]
        ├── A. Per-User Timezone Resolution (e.g. America/New_York, Asia/Kolkata)
        ├── B. Midnight Review Closing:
        │     - Identify past unclosed local dates (yesterday & missed runs)
        │     - Preserve 'completed' & 'not_completed' tasks
        │     - Mark unconfirmed ('pending', 'in_progress') as 'unverified'
        │     - Freeze dated snapshot in users/{uid}/dailyReviews/{date}
        │     - Skip if review already exists (Idempotent)
        ├── C. Overdue Goals & Milestones Detection:
        │     - Flag active goals/milestones past their target date
        ├── D. Scheduled Summaries:
        │     - Generate weekly performance report on Mondays
        └── E. Idempotent Notification Dispatch:
              - Check user preferences (notifications_enabled)
              - Check sentNotifications idempotency keys
              - Dispatch push alerts via FCM / Mock (ZERO private body/token logging)
```

---

## 2. Midnight Closing & Task Preservation Rules

| Initial Task Status | Action at Midnight Closing | Final Task Status | Snapshot Preservation |
| :--- | :--- | :--- | :--- |
| `completed` | Preserved unchanged | `completed` | Preserved as completed in review snapshot |
| `not_completed` | Preserved unchanged | `not_completed` | Preserved as not completed in review snapshot |
| `pending` | Transitioned to unverified | `unverified` | Preserved as unverified in review snapshot |
| `in_progress` | Transitioned to unverified | `unverified` | Preserved as unverified in review snapshot |
| `unverified` | Preserved unchanged | `unverified` | Preserved as unverified in review snapshot |
| `cancelled` | Preserved unchanged | `cancelled` | Preserved as cancelled in review snapshot |

### Core Guarantees:
1. **Never False Completion**: Unconfirmed tasks are **never** assumed or recorded as completed.
2. **Rescheduling History Preserved**: If a task was rescheduled earlier in the day, the original deadline and daily instance record remain untouched.
3. **Idempotent Retries**: If the scheduler runs twice or a job retries after network errors, existing daily reviews are preserved and duplicate processing is bypassed.
4. **Recovery from Missed Executions**: If the scheduler was down or paused, the job inspects up to 7 previous days and safely closes any unclosed past days.
5. **Bounded Memory Processing**: Users are streamed in bounded pages (`JOB_BATCH_SIZE=50`), ensuring the backend never attempts to load thousands of users or tasks into RAM at once.

---

## 3. Endpoints & Authentication

All job endpoints are located under `/api/v1/jobs` and strictly protected by `@require_job_auth()`:

- **`POST /api/v1/jobs/midnight-closing`**: Targeted midnight closing and unverified task transition.
- **`POST /api/v1/jobs/overdue-detection`**: Targeted scan for overdue goals and milestones.
- **`POST /api/v1/jobs/run-all`**: Full maintenance pipeline (closing, overdue detection, summaries, alerts).

### Request Payload (`JobExecutionRequest`)
```json
{
  "dry_run": false,
  "simulated_now": "2026-10-27T00:05:00Z",
  "batch_size": 50,
  "single_user_id": null
}
```

### Response Payload (`JobExecutionResponse`)
```json
{
  "status": "success",
  "data": {
    "status": "completed",
    "dry_run": false,
    "simulated_now": null,
    "reference_utc": "2026-10-27T00:00:00+00:00",
    "users_processed": 142,
    "reviews_closed": 38,
    "tasks_marked_unverified": 51,
    "overdue_goals_detected": 4,
    "overdue_milestones_detected": 7,
    "summaries_prepared": 12,
    "notifications_dispatched": 49,
    "execution_duration_ms": 340
  },
  "message": "Scheduled maintenance pipeline executed successfully."
}
```

---

## 4. Google Cloud Infrastructure & Deployment

### 4.1 Service Account & Least-Privilege IAM
Create a dedicated service account specifically for Cloud Scheduler:
```bash
# 1. Create service account
gcloud iam service-accounts create scheduler-invoker \
    --display-name="Cloud Scheduler Job Invoker"

# 2. Grant Cloud Run Invoker role on the backend service
gcloud run services add-iam-policy-binding life-goals-backend \
    --region=us-central1 \
    --member="serviceAccount:scheduler-invoker@PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/run.invoker"
```

### 4.2 Cloud Scheduler Job Configuration
Configure Cloud Scheduler to trigger the job hourly with an OIDC identity token:
```bash
gcloud scheduler jobs create http life-goals-midnight-closing \
    --location=us-central1 \
    --schedule="0 * * * *" \
    --time-zone="Etc/UTC" \
    --uri="https://api.lifegoals.ai/api/v1/jobs/midnight-closing" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body='{"batch_size": 50}' \
    --oidc-service-account-email="scheduler-invoker@PROJECT_ID.iam.gserviceaccount.com" \
    --oidc-token-audience="https://api.lifegoals.ai" \
    --max-retry-attempts=3 \
    --min-backoff=10s \
    --max-backoff=60s \
    --attempt-deadline=300s
```

### 4.3 Alternative: Dedicated Cloud Run Job
For long-running batch operations exceeding HTTP timeouts (e.g. tens of thousands of users), use a Cloud Run Job:
```bash
gcloud run jobs create life-goals-maintenance-job \
    --image="gcr.io/PROJECT_ID/life-goals-backend:latest" \
    --command="python" \
    --args="-m,app.jobs.runner" \
    --region=us-central1 \
    --service-account="scheduler-invoker@PROJECT_ID.iam.gserviceaccount.com"
```

---

## 5. Billing & Quota Considerations

1. **Google Cloud Scheduler**:
   - The first **3 jobs per billing account per month are free**.
   - Additional jobs cost ~$0.10/job/month.
2. **Cloud Run**:
   - Includes **2 million requests per month free**, with 180,000 vCPU-seconds and 360,000 GiB-seconds free.
   - An hourly cron execution generates only **720 requests/month**, comfortably within the free tier.
3. **Cloud Firestore**:
   - Daily free quota: **50,000 document reads, 20,000 document writes, 20,000 document deletes**.
   - Batching and pagination (`JOB_BATCH_SIZE=50`) keep query volumes bounded and cost-predictable.
