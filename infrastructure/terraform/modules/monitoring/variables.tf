# Core Terraform functionality for variable definitions
# terraform ~> 1.0

# Project configuration variables
variable "project_id" {
  description = "The GCP project ID where monitoring resources will be created"
  type        = string

  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID must not be empty"
  }
}

variable "environment" {
  description = "Environment name (dev/staging/prod) for monitoring resource naming"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# Dashboard configuration variables
variable "dashboard_configs" {
  description = "Map of dashboard names to their JSON configuration file paths"
  type        = map(string)
  default = {
    api        = "infrastructure/monitoring/dashboards/api-dashboard.json"
    processing = "infrastructure/monitoring/dashboards/processing-dashboard.json"
    scraping   = "infrastructure/monitoring/dashboards/scraping-dashboard.json"
  }
}

# Notification channel configuration
variable "notification_channels" {
  description = "Configuration for alert notification channels"
  type = map(object({
    type   = string
    labels = map(string)
  }))
  default = {}
}

# Alert threshold configuration
variable "alert_thresholds" {
  description = "Thresholds for different monitoring alerts"
  type = object({
    api_latency_ms     = number
    error_rate_percent = number
    uptime_percent     = number
  })
  default = {
    api_latency_ms     = 500     # 500ms API latency threshold
    error_rate_percent = 0.1     # 0.1% error rate threshold
    uptime_percent     = 99.9    # 99.9% uptime requirement
  }
}

# Uptime check configuration
variable "uptime_check_configs" {
  description = "Configuration for service uptime checks"
  type = map(object({
    http_check = map(string)
    period     = string
  }))
  default = {}
}

# Workload monitoring configuration
variable "enable_workload_monitoring" {
  description = "Enable detailed workload monitoring and metrics"
  type        = bool
  default     = true
}

# Metric retention configuration
variable "metric_retention_days" {
  description = "Number of days to retain monitoring metrics"
  type        = number
  default     = 30

  validation {
    condition     = var.metric_retention_days >= 1 && var.metric_retention_days <= 365
    error_message = "Metric retention must be between 1 and 365 days"
  }
}