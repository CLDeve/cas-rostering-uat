from datetime import date, datetime
from zoneinfo import ZoneInfo

SG_TZ = ZoneInfo("Asia/Singapore")


def now_sg() -> datetime:
    return datetime.now(SG_TZ)


def today_sg() -> date:
    return datetime.now(SG_TZ).date()


def ensure_sg_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=SG_TZ)
    return value.astimezone(SG_TZ)
