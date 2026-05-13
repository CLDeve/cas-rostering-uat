package net.certis.door4.mobile.data

data class OfficerAssignment(
    val flightNo: String,
    val gate: String,
    val terminal: String,
    val eta: String,
    val sch: String,
    val status: String,
    val assignmentStatus: String,
)

data class MyGatesResponse(
    val officerName: String,
    val staffId: String,
    val generatedAt: String,
    val assignments: List<OfficerAssignment>,
)
