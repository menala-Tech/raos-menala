package com.rifim.raos.reminder

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "RaosWorkReminderBridge")
class RaosWorkReminderBridgePlugin : Plugin() {

    @PluginMethod
    fun syncWorkReminders(call: PluginCall) {
        val userId = call.getString("userId")?.takeIf { it.isNotBlank() }
        if (userId == null) {
            call.reject("user_id_required")
            return
        }

        val role = call.getString("role")?.lowercase()
        if (role != "staff") {
            val cancelled = RaosWorkReminderScheduler.cancelAllForUser(context, userId)
            call.resolve(JSObject().apply {
                put("scheduled", 0)
                put("cancelled", cancelled)
                put("reason", "role_not_eligible")
            })
            return
        }

        val plansArray = call.getArray("plans") ?: JSArray()
        val plans = mutableListOf<WorkReminderPlan>()
        for (index in 0 until plansArray.length()) {
            val item = plansArray.opt(index)
            val json = when (item) {
                is JSObject -> item
                is JSONObject -> item
                else -> null
            } ?: continue
            WorkReminderPlan.fromJson(json)?.let { plans.add(it) }
        }

        val scheduled = RaosWorkReminderScheduler.sync(context, userId, plans)
        call.resolve(JSObject().apply {
            put("scheduled", scheduled)
            put("accepted", plans.size)
        })
    }

    @PluginMethod
    fun cancelWorkReminder(call: PluginCall) {
        val key = call.getString("key")?.takeIf { it.isNotBlank() }
        if (key == null) {
            call.reject("key_required")
            return
        }
        RaosWorkReminderScheduler.cancel(context, key)
        call.resolve(JSObject().apply { put("cancelled", true) })
    }

    @PluginMethod
    fun cancelAllWorkRemindersForCurrentUser(call: PluginCall) {
        val userId = call.getString("userId")?.takeIf { it.isNotBlank() }
        if (userId == null) {
            call.reject("user_id_required")
            return
        }
        val cancelled = RaosWorkReminderScheduler.cancelAllForUser(context, userId)
        call.resolve(JSObject().apply { put("cancelled", cancelled) })
    }

    @PluginMethod
    fun getWorkReminderStatus(call: PluginCall) {
        val (scheduled, currentUserId) = RaosWorkReminderScheduler.status(context, call.getString("userId"))
        call.resolve(JSObject().apply {
            put("scheduled", scheduled)
            put("currentUserId", currentUserId)
        })
    }
}
