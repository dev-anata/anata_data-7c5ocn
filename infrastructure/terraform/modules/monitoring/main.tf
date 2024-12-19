# Provider configuration for GCP
# hashicorp/google ~> 4.0
# hashicorp/google-beta ~> 4.0
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 4.0"
    }
  }
}

# Local variables for alert policy naming and configuration
locals {
  # Severity levels for alert policies
  severity_levels = {
    critical = "P1"
    warning  = "P2"
    info     = "P3"
  }

  # Function to generate standardized alert policy names
  alert_policy_name = function(name, severity) {
    lower("[${local.severity_levels[severity]}] ${var.environment}-${name}")
  }

  # Merge API and processing alert configurations
  alert_policies = merge(
    # API Performance Alerts
    {
      api_latency = {
        display_name = local.alert_policy_name("api-latency", "critical")
        conditions = [{
          display_name = "API Latency > ${var.alert_thresholds.api_latency_ms}ms (95th percentile)"
          condition_threshold = {
            filter          = "metric.type=\"custom.googleapis.com/api/latency\" resource.type=\"cloud_run_revision\""
            duration       = "300s"
            comparison     = "COMPARISON_GT"
            threshold_value = var.alert_thresholds.api_latency_ms
            aggregations = [{
              alignment_period   = "60s"
              per_series_aligner = "ALIGN_PERCENTILE_95"
            }]
          }
        }]
        strategy = {
          notification_rate_limit = {
            period = "300s"
          }
        }
      },

      # Error Rate Alerts
      error_rate = {
        display_name = local.alert_policy_name("error-rate", "critical")
        conditions = [{
          display_name = "Error Rate > ${var.alert_thresholds.error_rate_percent}%"
          condition_threshold = {
            filter          = "metric.type=\"custom.googleapis.com/api/error_rate\" resource.type=\"cloud_run_revision\""
            duration       = "300s"
            comparison     = "COMPARISON_GT"
            threshold_value = var.alert_thresholds.error_rate_percent
            aggregations = [{
              alignment_period   = "60s"
              per_series_aligner = "ALIGN_RATE"
            }]
          }
        }]
        strategy = {
          notification_rate_limit = {
            period = "300s"
          }
        }
      },

      # Scalability Monitoring
      concurrent_users = {
        display_name = local.alert_policy_name("concurrent-users", "warning")
        conditions = [{
          display_name = "Concurrent Users > 100"
          condition_threshold = {
            filter          = "metric.type=\"custom.googleapis.com/api/concurrent_users\" resource.type=\"cloud_run_revision\""
            duration       = "300s"
            comparison     = "COMPARISON_GT"
            threshold_value = 100
            aggregations = [{
              alignment_period   = "60s"
              per_series_aligner = "ALIGN_MAX"
            }]
          }
        }]
        strategy = {
          notification_rate_limit = {
            period = "300s"
          }
        }
      },

      # Document Processing Capacity
      processing_capacity = {
        display_name = local.alert_policy_name("processing-capacity", "warning")
        conditions = [{
          display_name = "Document Processing Rate < 100/hour"
          condition_threshold = {
            filter          = "metric.type=\"custom.googleapis.com/processing/documents_per_hour\" resource.type=\"cloud_run_revision\""
            duration       = "3600s"
            comparison     = "COMPARISON_LT"
            threshold_value = 100
            aggregations = [{
              alignment_period   = "3600s"
              per_series_aligner = "ALIGN_RATE"
            }]
          }
        }]
        strategy = {
          notification_rate_limit = {
            period = "3600s"
          }
        }
      }
    }
  )
}

# Dashboard creation
resource "google_monitoring_dashboard" "monitoring_dashboards" {
  for_each = var.dashboard_configs

  project          = var.project_id
  dashboard_json = templatefile(each.value, {
    project_id = var.project_id
    environment = var.environment
  })

  lifecycle {
    create_before_destroy = true
  }
}

# Alert policy creation
resource "google_monitoring_alert_policy" "alert_policies" {
  for_each = local.alert_policies

  project      = var.project_id
  display_name = each.value.display_name
  combiner     = "OR"
  conditions   = each.value.conditions
  
  notification_channels = [
    for channel in var.notification_channels : google_monitoring_notification_channel.channels[channel.name].name
  ]

  alert_strategy {
    dynamic "notification_rate_limit" {
      for_each = each.value.strategy.notification_rate_limit[*]
      content {
        period = notification_rate_limit.value.period
      }
    }
  }

  user_labels = {
    environment = var.environment
    severity    = split("]", split("[", each.value.display_name)[1])[0]
  }
}

# Notification channel creation
resource "google_monitoring_notification_channel" "channels" {
  for_each = var.notification_channels

  project      = var.project_id
  display_name = each.key
  type         = each.value.type
  labels       = each.value.labels

  user_labels = {
    environment = var.environment
  }

  sensitive_labels {
    auth_token = each.value.type == "slack" ? each.value.auth_token : null
  }
}

# Uptime check configuration
resource "google_monitoring_uptime_check_config" "uptime_checks" {
  for_each = var.uptime_check_configs

  project      = var.project_id
  display_name = "${var.environment}-${each.key}"
  
  http_check {
    path         = each.value.http_check.path
    port         = each.value.http_check.port
    use_ssl      = each.value.http_check.use_ssl
    validate_ssl = each.value.http_check.validate_ssl
  }

  period = each.value.period
  timeout = "10s"

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = each.value.http_check.host
    }
  }
}

# Outputs for reference
output "dashboard_ids" {
  description = "Map of created dashboard IDs"
  value = {
    for k, v in google_monitoring_dashboard.monitoring_dashboards : k => v.name
  }
}

output "alert_policy_ids" {
  description = "Map of created alert policy IDs"
  value = {
    for k, v in google_monitoring_alert_policy.alert_policies : k => v.name
  }
}

output "notification_channel_ids" {
  description = "Map of created notification channel IDs"
  value = {
    for k, v in google_monitoring_notification_channel.channels : k => v.name
  }
}