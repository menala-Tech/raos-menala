package com.rifim.raos.reminder

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.max

data class WorkReminderPlan(
    val reminderKey: String,
    val userId: String,
    val branchId: String,
    val shiftCode: String,
    val shiftLabel: String,
    val workDate: String,
    val shiftStartAt: String,
    val reminderAt: String,
    val reminderAtEpochMs: Long,
    val route: String,
    val title: String,
    val body: String,
) {
    fun notificationId(): Int = reminderKey.hashCode()

    fun toJson(): JSONObject = JSONObject().apply {
        put("reminderKey", reminderKey)
        put("userId", userId)
        put("branchId", branchId)
        put("shiftCode", shiftCode)
        put("shiftLabel", shiftLabel)
        put("workDate", workDate)
        put("shiftStartAt", shiftStartAt)
        put("reminderAt", reminderAt)
        put("reminderAtEpochMs", reminderAtEpochMs)
        put("route", route)
        put("title", title)
        put("body", body)
    }

    companion object {
        fun fromJson(json: JSONObject): WorkReminderPlan? {
            val key = json.optString("reminderKey").takeIf { it.isNotBlank() } ?: return null
            val userId = json.optString("userId").takeIf { it.isNotBlank() } ?: return null
            val branchId = json.optString("branchId").takeIf { it.isNotBlank() } ?: return null
            val epoch = json.optLong("reminderAtEpochMs", 0L).takeIf { it > 0L } ?: return null
            return WorkReminderPlan(
                reminderKey = key,
                userId = userId,
                branchId = branchId,
                shiftCode = json.optString("shiftCode"),
                shiftLabel = json.optString("shiftLabel", "Jadwal Kerja"),
                workDate = json.optString("workDate"),
                shiftStartAt = json.optString("shiftStartAt"),
                reminderAt = json.optString("reminderAt"),
                reminderAtEpochMs = epoch,
                route = json.optString("route", "/dashboard?tab=jadwal"),
                title = json.optString("title", "Pengingat Jadwal Kerja"),
                body = json.optString("body", "Jadwal kerja Anda akan dimulai."),
            )
        }
    }
}

object RaosWorkReminderScheduler {
    private const val PREFS = "raos_work_reminders"
    private const val PLANS = "plans"
    private const val CURRENT_USER = "current_user_id"
    private const val UNIQUE_PREFIX = "raos_work_reminder:"
    private const val STALE_GRACE_MS = 2 * 60 * 60 * 1000L

    fun sync(context: Context, userId: String, plans: List<WorkReminderPlan>): Int {
        val now = System.currentTimeMillis()
        val futurePlans = plans
            .filter { it.userId == userId && it.shiftCode != "-" && it.reminderAtEpochMs > now }
            .distinctBy { it.reminderKey }

        val existing = loadPlans(context).filter { it.userId == userId }
        val futureKeys = futurePlans.map { it.reminderKey }.toSet()
        existing
            .filter { it.reminderKey !in futureKeys }
            .forEach { cancel(context, it.reminderKey) }

        futurePlans.forEach { schedule(context, it) }

        val otherUsers = loadPlans(context).filter { it.userId != userId && it.reminderAtEpochMs > now }
        savePlans(context, otherUsers + futurePlans)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(CURRENT_USER, userId)
            .apply()
        return futurePlans.size
    }

    fun cancel(context: Context, reminderKey: String) {
        WorkManager.getInstance(context).cancelUniqueWork(uniqueName(reminderKey))
        val remaining = loadPlans(context).filter { it.reminderKey != reminderKey }
        savePlans(context, remaining)
    }

    fun cancelAllForUser(context: Context, userId: String): Int {
        val plans = loadPlans(context)
        val matching = plans.filter { it.userId == userId }
        matching.forEach { WorkManager.getInstance(context).cancelUniqueWork(uniqueName(it.reminderKey)) }
        savePlans(context, plans.filter { it.userId != userId })
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString(CURRENT_USER, null) == userId) prefs.edit().remove(CURRENT_USER).apply()
        return matching.size
    }

    fun status(context: Context, userId: String?): Pair<Int, String?> {
        val now = System.currentTimeMillis()
        val plans = loadPlans(context).filter { it.reminderAtEpochMs > now }
        val scoped = if (userId.isNullOrBlank()) plans else plans.filter { it.userId == userId }
        return Pair(scoped.size, context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CURRENT_USER, null))
    }

    fun isStale(plan: WorkReminderPlan, now: Long = System.currentTimeMillis()): Boolean {
        return now > plan.reminderAtEpochMs + STALE_GRACE_MS
    }

    private fun schedule(context: Context, plan: WorkReminderPlan) {
        val delayMs = max(0L, plan.reminderAtEpochMs - System.currentTimeMillis())
        val request = OneTimeWorkRequestBuilder<RaosWorkReminderWorker>()
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .setInputData(
                workDataOf(
                    "reminderKey" to plan.reminderKey,
                    "userId" to plan.userId,
                    "branchId" to plan.branchId,
                    "shiftCode" to plan.shiftCode,
                    "shiftLabel" to plan.shiftLabel,
                    "workDate" to plan.workDate,
                    "shiftStartAt" to plan.shiftStartAt,
                    "reminderAt" to plan.reminderAt,
                    "reminderAtEpochMs" to plan.reminderAtEpochMs,
                    "route" to plan.route,
                    "title" to plan.title,
                    "body" to plan.body,
                    "notificationId" to plan.notificationId(),
                ),
            )
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork(uniqueName(plan.reminderKey), ExistingWorkPolicy.REPLACE, request)
    }

    private fun loadPlans(context: Context): List<WorkReminderPlan> {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PLANS, "[]") ?: "[]"
        val array = runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
        return buildList {
            for (index in 0 until array.length()) {
                val plan = array.optJSONObject(index)?.let { WorkReminderPlan.fromJson(it) } ?: continue
                if (!isStale(plan)) add(plan)
            }
        }
    }

    private fun savePlans(context: Context, plans: List<WorkReminderPlan>) {
        val array = JSONArray()
        plans.distinctBy { it.reminderKey }.forEach { array.put(it.toJson()) }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(PLANS, array.toString())
            .apply()
    }

    private fun uniqueName(reminderKey: String) = UNIQUE_PREFIX + reminderKey.hashCode().toString()
}
