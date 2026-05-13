package net.certis.door4.mobile.data

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query

interface Door4OfficerApi {
    @GET("/api/v1/deployments/door-4/officer/my-gates")
    suspend fun getMyGates(
        @Query("date") date: String,
        @Query("staff_id") staffId: String,
    ): MyGatesResponse
}

object Door4ApiFactory {
    fun create(baseUrl: String, bearerToken: String): Door4OfficerApi {
        val authInterceptor = Interceptor { chain ->
            val request = chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $bearerToken")
                .build()
            chain.proceed(request)
        }

        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(Door4OfficerApi::class.java)
    }
}
