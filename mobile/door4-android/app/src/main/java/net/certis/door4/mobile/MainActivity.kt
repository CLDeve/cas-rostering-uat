package net.certis.door4.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import net.certis.door4.mobile.data.Door4ApiFactory
import net.certis.door4.mobile.data.Door4Repository
import net.certis.door4.mobile.data.MyGatesResponse
import net.certis.door4.mobile.data.OfficerAssignment
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Door4OfficerApp()
            }
        }
    }
}

private data class MyGatesUiState(
    val loading: Boolean = false,
    val error: String = "",
    val data: MyGatesResponse? = null,
)

@Composable
private fun Door4OfficerApp() {
    val api = remember {
        Door4ApiFactory.create(
            baseUrl = BuildConfig.API_BASE_URL,
            bearerToken = BuildConfig.API_TOKEN,
        )
    }
    val repository = remember { Door4Repository(api) }
    val scope = rememberCoroutineScope()

    var state by remember { mutableStateOf(MyGatesUiState(loading = true)) }

    suspend fun refresh() {
        state = state.copy(loading = true, error = "")
        runCatching {
            repository.loadMyGates(
                date = LocalDate.now().toString(),
                staffId = BuildConfig.STAFF_ID,
            )
        }.onSuccess { data ->
            state = MyGatesUiState(loading = false, data = data)
        }.onFailure { err ->
            state = MyGatesUiState(loading = false, error = err.message ?: "Failed to load assignments")
        }
    }

    LaunchedEffect(Unit) {
        refresh()
        while (true) {
            delay(20_000)
            refresh()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Door 4 - My Gates") })
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color(0xFF0F172A))
                .padding(innerPadding)
                .padding(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Staff ID: ${BuildConfig.STAFF_ID}",
                    color = Color(0xFFD1D5DB),
                )
                Button(onClick = { scope.launch { refresh() } }) {
                    Text("Refresh")
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            if (state.loading) {
                Text("Loading assignments...", color = Color.White)
            }
            if (state.error.isNotBlank()) {
                Text("Error: ${state.error}", color = Color(0xFFFCA5A5))
            }

            val assignments = state.data?.assignments.orEmpty()
            Text(
                text = "Assigned Gates: ${assignments.size}",
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )

            Spacer(modifier = Modifier.height(8.dp))

            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(assignments, key = { it.flightNo + it.gate + it.eta }) { item ->
                    AssignmentCard(item)
                }
            }
        }
    }
}

@Composable
private fun AssignmentCard(item: OfficerAssignment) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = "Gate ${item.gate}",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text("Flight: ${item.flightNo}")
            Text("Terminal: ${item.terminal}")
            Text("ETA: ${item.eta}   SCH: ${item.sch}")
            Text("Status: ${item.status}")
            Text("Assignment: ${item.assignmentStatus}")
        }
    }
}
