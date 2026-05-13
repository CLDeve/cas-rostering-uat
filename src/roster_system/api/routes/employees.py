from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response

from roster_system.importers import EmployeeImportError, build_employee_upload_template, parse_employee_rows_from_excel
from roster_system.api.dependencies import get_employee_service, require_planner_user
from roster_system.schemas import (
    EmployeeCreate,
    EmployeeImportResult,
    EmployeeRead,
    EmployeeUpdate,
    PaginatedEmployees,
    ShiftPlanResponse,
    UploadFileRead,
)
from roster_system.domains.rostering.services import EmployeeConflictError, EmployeeNotFoundError, EmployeeService

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("/upload-template")
def download_upload_template(
    sheet_name: str = Query(default="SAP FEB (AM)"),
) -> Response:
    safe_sheet_name = (sheet_name or "").strip()[:31] or "SAP FEB (AM)"
    content = build_employee_upload_template(sheet_name=safe_sheet_name)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="employee_upload_template.xlsx"',
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.post("", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    _: object = Depends(require_planner_user),
    service: EmployeeService = Depends(get_employee_service),
) -> EmployeeRead:
    try:
        return service.create_employee(payload)
    except EmployeeConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("", response_model=PaginatedEmployees)
def list_employees(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    team: str | None = Query(default=None),
    scheme: str | None = Query(default=None),
    service: EmployeeService = Depends(get_employee_service),
) -> PaginatedEmployees:
    return service.list_employees(page=page, page_size=page_size, team=team, scheme=scheme)


@router.get("/{employee_id}", response_model=EmployeeRead)
def get_employee(
    employee_id: int,
    service: EmployeeService = Depends(get_employee_service),
) -> EmployeeRead:
    try:
        return service.get_employee(employee_id)
    except EmployeeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{employee_id}/shift-plan", response_model=ShiftPlanResponse)
def get_employee_shift_plan(
    employee_id: int,
    days: int = Query(default=28, ge=1, le=60),
    start_offset: int = Query(default=0, ge=0, le=60),
    service: EmployeeService = Depends(get_employee_service),
) -> ShiftPlanResponse:
    try:
        return service.get_shift_plan(employee_id=employee_id, days=days, start_offset=start_offset)
    except EmployeeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/{employee_id}", response_model=EmployeeRead)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    _: object = Depends(require_planner_user),
    service: EmployeeService = Depends(get_employee_service),
) -> EmployeeRead:
    try:
        return service.update_employee(employee_id, payload)
    except EmployeeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except EmployeeConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(
    employee_id: int,
    _: object = Depends(require_planner_user),
    service: EmployeeService = Depends(get_employee_service),
) -> None:
    try:
        service.delete_employee(employee_id)
    except EmployeeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/upload", response_model=EmployeeImportResult)
async def upload_employees(
    file: UploadFile = File(...),
    _: object = Depends(require_planner_user),
    service: EmployeeService = Depends(get_employee_service),
) -> EmployeeImportResult:
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .xlsx files are supported")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")

    try:
        rows, detected_sheet_name = parse_employee_rows_from_excel(file_bytes=file_bytes)
        result = service.import_employees(rows=rows, sheet_name=detected_sheet_name)
        saved_file = service.save_uploaded_file(
            file_bytes=file_bytes,
            original_filename=file.filename,
            content_type=file.content_type,
            sheet_name=detected_sheet_name,
        )
        result.upload_file_id = saved_file.id
        result.upload_filename = saved_file.original_filename
        result.download_url = f"/api/v1/employees/upload-files/{saved_file.id}/download"
        return result
    except EmployeeImportError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except EmployeeConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/upload-files/latest", response_model=UploadFileRead)
def get_latest_upload_metadata(
    service: EmployeeService = Depends(get_employee_service),
) -> UploadFileRead:
    try:
        return service.latest_upload_metadata()
    except EmployeeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/upload-files/latest/download")
def download_latest_upload(
    service: EmployeeService = Depends(get_employee_service),
) -> FileResponse:
    try:
        record = service.get_latest_upload()
        file_path = service.get_upload_path(record)
        return FileResponse(
            path=str(file_path),
            filename=record.original_filename,
            media_type=record.content_type or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except EmployeeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/upload-files/{upload_file_id}/download")
def download_upload_by_id(
    upload_file_id: int,
    service: EmployeeService = Depends(get_employee_service),
) -> FileResponse:
    try:
        record = service.get_upload(upload_file_id)
        file_path = service.get_upload_path(record)
        return FileResponse(
            path=str(file_path),
            filename=record.original_filename,
            media_type=record.content_type or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except EmployeeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
