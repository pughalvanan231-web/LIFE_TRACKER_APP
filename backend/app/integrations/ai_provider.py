import json
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Type
from flask import current_app
from pydantic import BaseModel, ValidationError

from app.exceptions import (
    BadGatewayError,
    BadRequestError,
    GatewayTimeoutError,
    RateLimitExceededError,
    ServiceUnavailableError,
)
from app.integrations.http_client import ExternalServiceTimeoutError, SafeHttpClient

logger = logging.getLogger("app.integrations.ai")


class BaseAIProvider(ABC):
    """Abstract base class for provider-independent AI orchestration."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g. 'gemini', 'mock')."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name of the active LLM model."""
        pass

    @abstractmethod
    def generate_structured(
        self,
        prompt: str,
        system_instruction: str,
        expected_schema: Type[BaseModel],
    ) -> Dict[str, Any]:
        """
        Generate structured output complying with the provided Pydantic schema.
        
        Returns:
            Dict[str, Any]: Validated structured data dictionary.
            
        Raises:
            ServiceUnavailableError: If credentials or upstream are unavailable.
            GatewayTimeoutError: If the upstream provider times out.
            BadGatewayError: If provider returns non-JSON or invalid schema.
            RateLimitExceededError: If upstream rate limit is hit.
        """
        pass


class GeminiProvider(BaseAIProvider):
    """
    Google Gemini AI Provider implementing structured JSON generation
    via direct REST API calls using SafeHttpClient.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "gemini-1.5-flash",
        timeout: float = 30.0,
    ):
        self._api_key = api_key
        self._model = model
        self._timeout = timeout
        self._client = SafeHttpClient(default_timeout=timeout)

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model

    def generate_structured(
        self,
        prompt: str,
        system_instruction: str,
        expected_schema: Type[BaseModel],
    ) -> Dict[str, Any]:
        if not self._api_key or not self._api_key.strip():
            logger.error("Gemini API key is not configured.")
            raise ServiceUnavailableError(
                "Gemini API key is not configured. Set the GEMINI_API_KEY environment variable."
            )

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self._model}:generateContent?key={self._api_key.strip()}"
        )

        payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "systemInstruction": {
                "parts": [{"text": system_instruction}],
            },
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }

        try:
            resp = self._client.post(url=url, json=payload, timeout=self._timeout)
        except ExternalServiceTimeoutError as e:
            logger.error("Gemini request timed out after %ss: %s", self._timeout, str(e))
            raise GatewayTimeoutError("Gemini AI service timed out while generating response.") from e
        except Exception as e:
            logger.error("Unexpected network error connecting to Gemini: %s", str(e))
            raise BadGatewayError(f"Network error communicating with Gemini: {str(e)}") from e

        if resp.status_code == 429:
            logger.warning("Gemini upstream rate limit reached (HTTP 429).")
            raise RateLimitExceededError("Gemini upstream quota or rate limit exceeded.")
        elif resp.status_code == 400:
            logger.error("Gemini rejected request payload with HTTP 400: %s", resp.text)
            raise BadRequestError(f"Gemini rejected input payload: {resp.text}")
        elif resp.status_code in (500, 502, 503, 504):
            logger.error("Gemini upstream service error HTTP %s: %s", resp.status_code, resp.text)
            raise ServiceUnavailableError("Gemini AI upstream service is temporarily unavailable.")
        elif resp.status_code != 200:
            logger.error("Gemini unexpected status %s: %s", resp.status_code, resp.text)
            raise BadGatewayError(f"Gemini returned unexpected status code {resp.status_code}.")

        try:
            body = resp.json()
        except Exception as e:
            logger.error("Failed to parse Gemini response body as JSON: %s", str(e))
            raise BadGatewayError("Gemini provider returned malformed JSON envelope.") from e

        candidates = body.get("candidates")
        if not candidates or not isinstance(candidates, list):
            logger.error("Gemini response missing 'candidates': %s", body)
            raise BadGatewayError("Gemini response missing candidates.")

        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts or not isinstance(parts, list):
            logger.error("Gemini response missing content parts: %s", candidates[0])
            raise BadGatewayError("Gemini response contained empty content.")

        raw_text = parts[0].get("text", "")
        if not raw_text or not raw_text.strip():
            logger.error("Gemini candidate part returned empty text.")
            raise BadGatewayError("Gemini generated empty text output.")

        try:
            parsed_data = json.loads(raw_text.strip())
        except json.JSONDecodeError as e:
            logger.error("Gemini text is not valid JSON: %s", raw_text)
            raise BadGatewayError("Gemini returned invalid or non-JSON output.") from e

        try:
            validated = expected_schema.model_validate(parsed_data)
            return validated.model_dump()
        except ValidationError as e:
            logger.error("Gemini output failed schema validation: %s", str(e))
            raise BadGatewayError(
                f"Gemini output failed schema validation: {e.error_count()} errors."
            ) from e


class MockAIProvider(BaseAIProvider):
    """
    Mock AI Provider for deterministic offline testing without requiring
    external paid APIs or network access. Supports failure simulation modes.
    """

    def __init__(
        self,
        simulated_mode: str = "valid",
        model: str = "mock-gemini-flash",
    ):
        self.simulated_mode = simulated_mode
        self._model = model
        self.call_history: list = []

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return self._model

    def generate_structured(
        self,
        prompt: str,
        system_instruction: str,
        expected_schema: Type[BaseModel],
    ) -> Dict[str, Any]:
        self.call_history.append({
            "prompt": prompt,
            "system_instruction": system_instruction,
            "schema": expected_schema.__name__,
        })

        if self.simulated_mode == "timeout":
            raise GatewayTimeoutError("Mock provider simulated timeout.")
        elif self.simulated_mode == "invalid_json":
            raise BadGatewayError("Mock provider simulated non-JSON output.")
        elif self.simulated_mode == "missing_key":
            raise ServiceUnavailableError("Mock provider simulated missing API key credentials.")
        elif self.simulated_mode == "upstream_error":
            raise BadGatewayError("Mock provider simulated upstream 502 Bad Gateway.")
        elif self.simulated_mode == "upstream_rate_limit":
            raise RateLimitExceededError("Mock provider upstream rate limit hit.")

        # Deterministic schema-specific valid outputs
        schema_name = expected_schema.__name__

        if "DailyTaskSuggestions" in schema_name:
            data = {
                "target_date": "2026-10-26",
                "available_time_minutes": 120,
                "total_suggested_duration": 90,
                "suggestions": [
                    {
                        "title": "Draft Chapter 1 outline",
                        "description": "Outline main plot points and character goals for the opening chapter.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "high",
                        "estimated_duration": 45,
                        "suggested_date": "2026-10-26",
                        "suggested_deadline": "2026-10-26",
                        "short_explanation": "Directly advances writing milestone for Q4.",
                    },
                    {
                        "title": "Review research references",
                        "description": "Read and organize background materials for the upcoming section.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "medium",
                        "estimated_duration": 45,
                        "suggested_date": "2026-10-26",
                        "suggested_deadline": "2026-10-26",
                        "short_explanation": "Provides required context before writing tomorrow.",
                    },
                ],
                "explanation": "Balanced schedule within your 120 available minutes.",
                "provider": "mock",
                "model": self._model,
            }
        elif "RevisedSchedule" in schema_name:
            data = {
                "target_date": "2026-10-26",
                "available_time_minutes": 60,
                "total_planned_duration": 45,
                "scheduled_tasks": [
                    {
                        "title": "Urgent bug fix review",
                        "description": "Review and verify the fix for the reported issue.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "urgent",
                        "estimated_duration": 45,
                        "suggested_date": "2026-10-26",
                        "suggested_deadline": "2026-10-26",
                        "short_explanation": "Critical priority task retained in revised schedule.",
                    }
                ],
                "postponed_proposals": [
                    {
                        "title": "Refactor styling system",
                        "description": "Postponed to tomorrow due to reduced daily capacity.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "low",
                        "estimated_duration": 60,
                        "suggested_date": "2026-10-27",
                        "suggested_deadline": "2026-10-27",
                        "short_explanation": "Can be deferred safely without blocking current milestones.",
                    }
                ],
                "explanation": "Downscaled schedule to fit 60-minute window, deferring non-urgent refactoring.",
                "requires_user_confirmation": True,
                "provider": "mock",
                "model": self._model,
            }
        elif "RecoveryPlan" in schema_name:
            data = {
                "overdue_tasks_count": 2,
                "overdue_task_ids": ["task-overdue-1", "task-overdue-2"],
                "proposed_priorities": [
                    {
                        "title": "Finish core documentation",
                        "description": "Reprioritize overdue documentation before building new features.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "high",
                        "estimated_duration": 40,
                        "suggested_date": "2026-10-26",
                        "suggested_deadline": "2026-10-26",
                        "short_explanation": "Clears outstanding overdue blocker.",
                    }
                ],
                "rescheduling_proposals": [
                    {
                        "title": "Overdue backlog item 2",
                        "description": "Reschedule to a realistic target date next week.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "medium",
                        "estimated_duration": 30,
                        "suggested_date": "2026-10-28",
                        "suggested_deadline": "2026-10-28",
                        "short_explanation": "Prevents cognitive overload and catch-up fatigue.",
                    }
                ],
                "complex_tasks_breakdowns": [
                    {
                        "title": "Setup database migration step 1",
                        "description": "Break down large monolithic migration task into small 20-min segment.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "medium",
                        "estimated_duration": 20,
                        "suggested_date": "2026-10-27",
                        "suggested_deadline": "2026-10-27",
                        "short_explanation": "Step 1 of complex task breakdown.",
                    }
                ],
                "action_plan_summary": "Identified 2 overdue tasks, reprioritizing the critical one and spreading the remainder across the week.",
                "preserves_history": True,
                "requires_user_confirmation": True,
                "provider": "mock",
                "model": self._model,
            }
        elif "ExplainGoalProgress" in schema_name:
            data = {
                "goal_id": None,
                "overall_status": "in_progress",
                "completion_percentage": 65.5,
                "insights": [
                    "Strong momentum on short-term milestones with 80% completion rate.",
                    "Long-term goal milestones require steady incremental task planning.",
                ],
                "strengths": [
                    "High daily consistency during mid-week reviews.",
                    "Low rate of unverified tasks at day closing.",
                ],
                "bottlenecks": [
                    "Weekend tasks tend to be postponed due to over-optimistic time estimation."
                ],
                "recommended_next_actions": [
                    {
                        "title": "Allocate buffer time for Friday review",
                        "description": "Add 30 minutes buffer before week-end closing.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "medium",
                        "estimated_duration": 30,
                        "suggested_date": "2026-10-30",
                        "suggested_deadline": "2026-10-30",
                        "short_explanation": "Addresses root bottleneck of weekend postponements.",
                    }
                ],
                "explanation": "You are on track to meet Q4 milestones with solid weekday execution.",
                "provider": "mock",
                "model": self._model,
            }
        elif "TaskBreakdown" in schema_name:
            data = {
                "original_task_title": "Launch new feature",
                "linked_goal_id": None,
                "linked_milestone_id": None,
                "subtasks": [
                    {
                        "title": "Draft feature specification",
                        "description": "Define scope, requirements, and edge cases.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "high",
                        "estimated_duration": 40,
                        "suggested_date": "2026-10-26",
                        "suggested_deadline": "2026-10-26",
                        "short_explanation": "Step 1: Planning and scope definition.",
                    },
                    {
                        "title": "Implement core backend endpoint",
                        "description": "Code the API handler and request validation schemas.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "high",
                        "estimated_duration": 60,
                        "suggested_date": "2026-10-27",
                        "suggested_deadline": "2026-10-27",
                        "short_explanation": "Step 2: Backend implementation.",
                    },
                    {
                        "title": "Add unit and integration tests",
                        "description": "Write pytest coverage for valid and failure conditions.",
                        "linked_goal_id": None,
                        "linked_milestone_id": None,
                        "priority": "medium",
                        "estimated_duration": 45,
                        "suggested_date": "2026-10-28",
                        "suggested_deadline": "2026-10-28",
                        "short_explanation": "Step 3: Verification and test suite.",
                    },
                ],
                "total_estimated_duration": 145,
                "explanation": "Decomposed large initiative into 3 manageable steps under 60 minutes each.",
                "provider": "mock",
                "model": self._model,
            }
        else:
            data = {
                "explanation": "Generic valid mock AI output.",
                "provider": "mock",
                "model": self._model,
            }

        try:
            validated = expected_schema.model_validate(data)
            return validated.model_dump()
        except ValidationError as e:
            logger.error("MockAIProvider data failed schema validation: %s", str(e))
            raise BadGatewayError(f"Mock output schema failure: {str(e)}") from e


def get_ai_provider(
    provider_type: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    timeout: Optional[float] = None,
) -> BaseAIProvider:
    """
    Factory function to resolve and instantiate the configured AI Provider.
    Defaults to app config values when not explicitly provided.
    """
    resolved_provider = (
        provider_type
        or (current_app.config.get("AI_PROVIDER") if current_app else "gemini")
        or "gemini"
    ).lower()

    resolved_timeout = (
        timeout
        if timeout is not None
        else (current_app.config.get("AI_TIMEOUT_SECONDS", 30.0) if current_app else 30.0)
    )

    if resolved_provider == "mock":
        resolved_model = (
            model
            or (current_app.config.get("GEMINI_MODEL") if current_app else "mock-gemini-flash")
            or "mock-gemini-flash"
        )
        return MockAIProvider(model=resolved_model)
    elif resolved_provider == "gemini":
        resolved_key = (
            api_key
            if api_key is not None
            else (current_app.config.get("GEMINI_API_KEY") if current_app else None)
        )
        resolved_model = (
            model
            or (current_app.config.get("GEMINI_MODEL") if current_app else "gemini-1.5-flash")
            or "gemini-1.5-flash"
        )
        return GeminiProvider(
            api_key=resolved_key,
            model=resolved_model,
            timeout=resolved_timeout,
        )
    else:
        raise ServiceUnavailableError(f"Unsupported AI provider '{resolved_provider}'.")
