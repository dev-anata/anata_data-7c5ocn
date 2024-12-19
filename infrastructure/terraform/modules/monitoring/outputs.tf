# Output definitions for the monitoring module
# Terraform ~> 1.0

# Dashboard resource identifiers
output "dashboard_ids" {
  description = "Map of created monitoring dashboard resource names to their IDs"
  value       = { for k, v in google_monitoring_dashboard.monitoring_dashboards : k => v.name }
}

# Alert policy identifiers
output "alert_policy_ids" {
  description = "Map of created alert policy resource names to their IDs"
  value       = { for k, v in google_monitoring_alert_policy.alert_policies : k => v.name }
}

# Notification channel identifiers
output "notification_channel_ids" {
  description = "Map of created notification channel resource names to their IDs"
  value       = { for k, v in google_monitoring_notification_channel.channels : k => v.name }
}

# Monitoring workspace identifier
output "monitoring_workspace_id" {
  description = "The ID of the monitoring workspace where all resources are created"
  value       = google_monitoring_dashboard.monitoring_dashboards["api"].project
}

# Alert notification channels list
output "alert_notification_channels" {
  description = "List of notification channel IDs used for alerting"
  value       = [for channel in google_monitoring_notification_channel.channels : channel.name]
}

# Dashboard configuration map
output "dashboard_configurations" {
  description = "Map of dashboard names to their full configurations"
  value = {
    for k, v in google_monitoring_dashboard.monitoring_dashboards : k => jsondecode(v.dashboard_json)
  }
  sensitive = false
}

# Alert policy details
output "alert_policy_details" {
  description = "Detailed configuration of alert policies including conditions and notification settings"
  value = {
    for k, v in google_monitoring_alert_policy.alert_policies : k => {
      name        = v.display_name
      conditions  = v.conditions
      channels    = v.notification_channels
      severity    = v.user_labels["severity"]
    }
  }
}

# Uptime check endpoints
output "uptime_check_endpoints" {
  description = "List of endpoints being monitored by uptime checks"
  value = {
    for k, v in google_monitoring_uptime_check_config.uptime_checks : k => {
      display_name = v.display_name
      host        = v.monitored_resource[0].labels["host"]
      path        = v.http_check[0].path
    }
  }
}

# Environment-specific monitoring configuration
output "monitoring_environment" {
  description = "Environment-specific monitoring configuration details"
  value = {
    environment = var.environment
    thresholds  = var.alert_thresholds
    retention   = var.metric_retention_days
    workload_monitoring_enabled = var.enable_workload_monitoring
  }
}