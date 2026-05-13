from datetime import date
import json
import os
import re
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from roster_system.api.dependencies import get_deployment_service, require_planner_user
from roster_system.config import settings
from roster_system.domains.deployment.services import (
    DeploymentAgentActionError,
    DeploymentConflictError,
    DeploymentService,
    DeploymentValidationError,
)
from roster_system.schemas import (
    DeploymentAgentAction,
    DeploymentAgentRequest,
    DeploymentAgentResponse,
    DeploymentAgentPlanRequest,
    DeploymentAgentPlanResponse,
    DeploymentAssignmentsRead,
    DeploymentAssignmentsUpsert,
    DeploymentSiteCreate,
    DeploymentSiteRead,
    Door4AgentAssignment,
    Door4AgentBlockedFlight,
    Door4AgentPlanRequest,
    Door4AgentPlanResponse,
)

router = APIRouter(prefix="/deployments", tags=["deployments"])


def _openai_api_key() -> str:
    return (settings.openai_api_key or os.getenv("OPENAI_API_KEY") or "").strip()


def _openai_model() -> str:
    return (os.getenv("OPENAI_MODEL") or settings.openai_model or "gpt-5-mini").strip()


def _openai_base_url() -> str:
    return (os.getenv("OPENAI_BASE_URL") or settings.openai_base_url or "https://api.openai.com/v1").strip()


def _extract_openai_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"]
    output = payload.get("output")
    if not isinstance(output, list):
        return ""
    parts: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) if isinstance(item.get("content"), list) else []:
            if isinstance(content, dict) and content.get("type") == "output_text":
                text = content.get("text")
                if isinstance(text, str):
                    parts.append(text)
    return "\n".join(parts).strip()


def _extract_first_json_object(text: str) -> str:
    value = (text or "").strip()
    if not value:
        return ""
    if value.startswith("{") and value.endswith("}"):
        return value
    match = re.search(r"\{[\s\S]*\}", value)
    return match.group(0) if match else value


def _plan_actions_with_openai(
    payload: DeploymentAgentPlanRequest,
    service: DeploymentService,
) -> tuple[str, list[DeploymentAgentAction]]:
    api_key = _openai_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key is not configured. Set ROSTER_OPENAI_API_KEY.",
        )

    current = service.list_assignments(payload.deployment_date)
    sites = service.list_sites()
    planning_context = {
        "deployment_date": payload.deployment_date.isoformat(),
        "objective": payload.objective,
        "max_actions": payload.max_actions,
        "current_assignments": [row.model_dump() for row in current.assignments],
        "sites": [
            {
                "id": site.id,
                "site_name": site.site_name,
                "mode": site.mode.value if hasattr(site.mode, "value") else str(site.mode),
            }
            for site in sites
        ],
    }

    instructions = (
        "You are a rostering planner. Return only JSON in this shape: "
        "{\"actions\":[{\"action_type\":\"RETIME|CANCEL|CHANGE_GATE\",\"employee_id\":int,"
        "\"from_slot_index\":int|null,\"to_slot_index\":int|null,\"target_site_id\":int|null,"
        "\"target_slot_index\":int|null,\"reason\":string|null}]}. "
        "Never include markdown. Keep actions <= max_actions."
    )

    with httpx.Client(timeout=settings.openai_timeout_seconds) as client:
        response = client.post(
            f"{_openai_base_url().rstrip('/')}/responses",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": _openai_model(),
                "input": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": json.dumps(planning_context)},
                ],
            },
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI call failed with status {response.status_code}",
        )

    body = response.json()
    text = _extract_openai_text(body)
    if not text:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OpenAI returned empty plan output")

    try:
        parsed = json.loads(_extract_first_json_object(text))
        raw_actions = parsed.get("actions", []) if isinstance(parsed, dict) else []
        if not isinstance(raw_actions, list):
            raw_actions = []
        actions: list[DeploymentAgentAction] = []
        for row in raw_actions[: payload.max_actions]:
            try:
                if isinstance(row, dict):
                    actions.append(DeploymentAgentAction(**row))
            except Exception:
                continue
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenAI returned invalid action JSON",
        ) from exc
    return _openai_model(), actions


def _normalize_terminal(value: str | None) -> str:
    raw = str(value or "").strip().upper()
    if not raw or raw in {"—", "T?"}:
        return ""
    match = re.match(r"^T?([1-4])$", raw)
    if match:
        return f"T{match.group(1)}"
    match = re.match(r"^TERMINAL\s*([1-4])$", raw)
    if match:
        return f"T{match.group(1)}"
    return raw


def _is_cancelled_status(value: str | None) -> bool:
    return "cancel" in str(value or "").lower()


def _validate_door4_agent_plan(
    payload: Door4AgentPlanRequest,
    assignments: list[Door4AgentAssignment],
    blocked: list[Door4AgentBlockedFlight],
    source: str,
    model: str,
) -> Door4AgentPlanResponse:
    flight_by_key = {row.flight_key: row for row in payload.flights}
    officer_by_id = {str(row.id): row for row in payload.officers}
    red_cross = {str(value) for value in payload.red_cross_officer_ids}
    already_assigned_flights = set(payload.assignments.keys())
    planned_officer_counts: dict[str, int] = {}
    accepted: list[Door4AgentAssignment] = []
    rejected: list[Door4AgentBlockedFlight] = []

    for row in assignments[: payload.max_assignments]:
        flight = flight_by_key.get(row.flight_key)
        officer = officer_by_id.get(str(row.officer_id))
        if flight is None:
            rejected.append(Door4AgentBlockedFlight(flight_key=row.flight_key, reason="Unknown flight key"))
            continue
        if officer is None:
            rejected.append(Door4AgentBlockedFlight(flight_key=row.flight_key, reason="Unknown officer ID"))
            continue
        if row.flight_key in already_assigned_flights:
            rejected.append(Door4AgentBlockedFlight(flight_key=row.flight_key, reason="Flight already assigned"))
            continue
        if str(row.officer_id) in red_cross:
            rejected.append(Door4AgentBlockedFlight(flight_key=row.flight_key, reason="Officer is in Red Cross list"))
            continue
        if _is_cancelled_status(flight.status):
            rejected.append(Door4AgentBlockedFlight(flight_key=row.flight_key, reason="Cancelled flight cannot be assigned"))
            continue

        flight_terminal = _normalize_terminal(flight.terminal)
        officer_terminal = _normalize_terminal(officer.terminal)
        if flight_terminal and officer_terminal and flight_terminal != officer_terminal:
            rejected.append(Door4AgentBlockedFlight(flight_key=row.flight_key, reason="Terminal crossing blocked"))
            continue

        officer_id = str(row.officer_id)
        planned_officer_counts[officer_id] = planned_officer_counts.get(officer_id, 0) + 1
        accepted.append(row)

    return Door4AgentPlanResponse(
        plan_source=source,
        model=model,
        assignments=accepted,
        blocked=blocked,
        rejected=rejected,
    )


def _plan_door4_with_openai(payload: Door4AgentPlanRequest) -> tuple[str, list[Door4AgentAssignment], list[Door4AgentBlockedFlight]]:
    api_key = _openai_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key is not configured. Set ROSTER_OPENAI_API_KEY.",
        )

    planning_context = {
        "deployment_date": payload.deployment_date.isoformat(),
        "planning_window_minutes": payload.planning_window_minutes,
        "flights": [row.model_dump() for row in payload.flights],
        "officers": [row.model_dump() for row in payload.officers],
        "current_assignments": payload.assignments,
        "red_cross_officer_ids": payload.red_cross_officer_ids,
        "rules": [
            "Assign only unassigned, non-cancelled Door 4 arrival flights.",
            "Never assign an officer in red_cross_officer_ids.",
            "Respect terminal match. If flight and officer terminals are both known and different, block it.",
            "Prefer officers with lower assigned_count to distribute workload.",
            "Return no more assignments than max_assignments.",
        ],
        "max_assignments": payload.max_assignments,
    }
    instructions = (
        "You are the Door 4 flight deployment planning agent. Return only JSON in this shape: "
        "{\"assignments\":[{\"flight_key\":string,\"officer_id\":string,\"reason\":string}],"
        "\"blocked\":[{\"flight_key\":string,\"reason\":string}]}. "
        "Do not include markdown or extra text. Use only flight_key and officer_id values from the input."
    )

    with httpx.Client(timeout=settings.openai_timeout_seconds) as client:
        response = client.post(
            f"{_openai_base_url().rstrip('/')}/responses",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": _openai_model(),
                "input": [
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": json.dumps(planning_context)},
                ],
            },
        )

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"OpenAI call failed with status {response.status_code}",
        )

    text = _extract_openai_text(response.json())
    if not text:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OpenAI returned empty Door 4 plan")

    try:
        parsed = json.loads(_extract_first_json_object(text))
    except (json.JSONDecodeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OpenAI returned invalid Door 4 plan JSON") from exc

    raw_assignments = parsed.get("assignments", []) if isinstance(parsed, dict) else []
    raw_blocked = parsed.get("blocked", []) if isinstance(parsed, dict) else []
    assignments: list[Door4AgentAssignment] = []
    blocked: list[Door4AgentBlockedFlight] = []
    for row in raw_assignments if isinstance(raw_assignments, list) else []:
        try:
            if isinstance(row, dict):
                assignments.append(Door4AgentAssignment(**row))
        except Exception:
            continue
    for row in raw_blocked if isinstance(raw_blocked, list) else []:
        try:
            if isinstance(row, dict):
                blocked.append(Door4AgentBlockedFlight(**row))
        except Exception:
            continue
    return _openai_model(), assignments, blocked


@router.post("", response_model=DeploymentSiteRead, status_code=status.HTTP_201_CREATED)
def create_deployment_site(
    payload: DeploymentSiteCreate,
    _: object = Depends(require_planner_user),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentSiteRead:
    try:
        return service.create_site(payload)
    except DeploymentConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("", response_model=list[DeploymentSiteRead])
def list_deployment_sites(
    service: DeploymentService = Depends(get_deployment_service),
) -> list[DeploymentSiteRead]:
    return service.list_sites()


def _list_door_4_arrival_flights_impl(
    tixdate: date = Query(...),
    flightno: str | None = Query(default=None),
) -> Any:
    params = {
        "date": tixdate.isoformat(),
        "type": "scheduled",
        "flightno": (flightno or "").strip(),
    }

    response = None
    raw_body = ""
    last_error: Exception | None = None
    retry_delays = [0.0, 0.7, 1.5]
    for delay_seconds in retry_delays:
        if delay_seconds > 0:
            time.sleep(delay_seconds)
        try:
            with httpx.Client(timeout=settings.cas_flights_timeout_seconds) as client:
                response = client.get(
                    settings.cas_flights_base_url,
                    params=params,
                    headers={"x-api-key": settings.cas_flights_api_key, "Accept": "application/json"},
                )
            raw_body = response.text
            last_error = None
            break
        except httpx.HTTPError as exc:
            last_error = exc

    if last_error is not None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unable to reach CAS flight API after retries: {last_error}",
        ) from last_error

    if response is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to reach CAS flight API after retries.",
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=raw_body or response.reason_phrase)

    try:
        payload: Any = json.loads(raw_body)
    except json.JSONDecodeError:
        return {"raw": raw_body}

    query_flight = (flightno or "").strip().upper()
    if not query_flight:
        return payload

    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        filtered_items = [
            row for row in payload["items"]
            if query_flight in str(row.get("flightno", "")).upper()
        ]
        next_payload = dict(payload)
        next_payload["items"] = filtered_items
        if "count" in next_payload:
            next_payload["count"] = len(filtered_items)
        return next_payload

    if isinstance(payload, list):
        return [
            row for row in payload
            if query_flight in str(getattr(row, "get", lambda *_: "")("flightno", "")).upper()
        ]

    return payload


@router.get("/door-4/arrivals")
def list_door_4_arrival_flights(
    tixdate: date = Query(...),
    flightno: str | None = Query(default=None),
) -> Any:
    return _list_door_4_arrival_flights_impl(tixdate=tixdate, flightno=flightno)


@router.get("/door-4/flights")
def list_door_4_flights_legacy(
    tixdate: date = Query(...),
    flightno: str | None = Query(default=None),
) -> Any:
    return _list_door_4_arrival_flights_impl(tixdate=tixdate, flightno=flightno)


@router.post("/door-4/agent/plan", response_model=Door4AgentPlanResponse)
def plan_door_4_agent(
    payload: Door4AgentPlanRequest,
    _: object = Depends(require_planner_user),
) -> Door4AgentPlanResponse:
    model, assignments, blocked = _plan_door4_with_openai(payload)
    return _validate_door4_agent_plan(
        payload=payload,
        assignments=assignments,
        blocked=blocked,
        source="openai",
        model=model,
    )


@router.get("/assignments", response_model=DeploymentAssignmentsRead)
def get_deployment_assignments(
    deployment_date: date = Query(...),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentAssignmentsRead:
    return service.list_assignments(deployment_date)


@router.put("/assignments", response_model=DeploymentAssignmentsRead)
def replace_deployment_assignments(
    payload: DeploymentAssignmentsUpsert,
    _: object = Depends(require_planner_user),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentAssignmentsRead:
    try:
        return service.replace_assignments(payload)
    except DeploymentValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


@router.post("/agent/actions", response_model=DeploymentAgentResponse)
def run_deployment_agent_actions(
    payload: DeploymentAgentRequest,
    _: object = Depends(require_planner_user),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentAgentResponse:
    try:
        return service.run_agent_actions(payload)
    except (DeploymentAgentActionError, DeploymentValidationError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


@router.post("/agent/plan", response_model=DeploymentAgentPlanResponse)
def plan_and_run_deployment_agent_actions(
    payload: DeploymentAgentPlanRequest,
    _: object = Depends(require_planner_user),
    service: DeploymentService = Depends(get_deployment_service),
) -> DeploymentAgentPlanResponse:
    try:
        model, actions = _plan_actions_with_openai(payload, service)
        if not actions:
            current = service.list_assignments(payload.deployment_date)
            execution = DeploymentAgentResponse(
                deployment_date=payload.deployment_date,
                dry_run=not payload.auto_apply,
                actions=[],
                assignments=current.assignments,
                updated_at=current.updated_at,
            )
            return DeploymentAgentPlanResponse(
                plan_source="openai",
                model=model,
                proposal_actions=[],
                execution=execution,
            )

        execution = service.run_agent_actions(
            DeploymentAgentRequest(
                deployment_date=payload.deployment_date,
                actions=actions,
                auto_apply=payload.auto_apply,
            )
        )
        return DeploymentAgentPlanResponse(
            plan_source="openai",
            model=model,
            proposal_actions=actions,
            execution=execution,
        )
    except (DeploymentAgentActionError, DeploymentValidationError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    
