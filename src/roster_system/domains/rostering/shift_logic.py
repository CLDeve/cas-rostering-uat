from roster_system.schemas import ShiftPattern, ShiftPlanDay, ShiftPlanResponse

_PATTERN_DEFINITION: dict[ShiftPattern, tuple[int, int]] = {
    ShiftPattern.WORK_4_OFF_2: (4, 2),
    ShiftPattern.WORK_5_OFF_1: (5, 1),
}


def pattern_cycle_length(shift_pattern: ShiftPattern) -> int:
    work_span, off_span = _PATTERN_DEFINITION[shift_pattern]
    return work_span + off_span


def build_shift_plan(employee_id: int, shift_pattern: ShiftPattern, days: int, start_offset: int = 0) -> ShiftPlanResponse:
    work_span, off_span = _PATTERN_DEFINITION[shift_pattern]
    cycle_length = work_span + off_span

    normalized_offset = start_offset % cycle_length
    plan: list[ShiftPlanDay] = []
    work_days = 0
    off_days = 0

    for day_index in range(1, days + 1):
        cycle_position = (normalized_offset + day_index - 1) % cycle_length
        is_work = cycle_position < work_span
        status = "WORK" if is_work else "OFF"
        if is_work:
            work_days += 1
        else:
            off_days += 1
        plan.append(ShiftPlanDay(day_index=day_index, status=status))

    return ShiftPlanResponse(
        employee_id=employee_id,
        shift_pattern=shift_pattern,
        days=days,
        start_offset=start_offset,
        work_days=work_days,
        off_days=off_days,
        plan=plan,
    )

