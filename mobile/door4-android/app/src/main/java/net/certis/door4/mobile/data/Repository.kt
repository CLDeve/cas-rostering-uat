package net.certis.door4.mobile.data

class Door4Repository(
    private val api: Door4OfficerApi,
) {
    suspend fun loadMyGates(date: String, staffId: String): MyGatesResponse {
        return api.getMyGates(date = date, staffId = staffId)
    }
}
