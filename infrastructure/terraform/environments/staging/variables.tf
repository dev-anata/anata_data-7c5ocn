# Terraform variable definitions for staging environment
# Version: 1.0
# This file defines staging-specific configuration overrides and parameters

# Core Project Variables
variable "project_id" {
  type        = string
  description = "The GCP project ID for staging environment"
  default     = "pharma-pipeline-staging"

  validation {
    condition     = can(regex("^pharma-pipeline-staging$", var.project_id))
    error_message = "Project ID must match staging naming convention"
  }
}

variable "region" {
  type        = string
  description = "Primary GCP region for staging deployment"
  default     = "us-central1"

  validation {
    condition     = contains(["us-central1", "us-east1"], var.region)
    error_message = "Region must be either us-central1 or us-east1"
  }
}

variable "environment" {
  type        = string
  description = "Environment identifier"
  default     = "staging"

  validation {
    condition     = var.environment == "staging"
    error_message = "Environment must be staging"
  }
}

# Deployment Configuration
variable "enable_monitoring" {
  type        = bool
  description = "Enable full monitoring for staging environment"
  default     = true
}

variable "enable_auto_rollback" {
  type        = bool
  description = "Enable automatic rollback for failed deployments"
  default     = true
}

# Service Account Configuration
variable "service_account_roles" {
  type        = map(list(string))
  description = "IAM roles for service accounts in staging"
  default = {
    scraping = [
      "roles/cloudstorage.objectViewer",
      "roles/bigquery.dataViewer"
    ],
    processing = [
      "roles/cloudstorage.objectCreator",
      "roles/bigquery.dataEditor"
    ],
    api = [
      "roles/cloudstorage.objectViewer",
      "roles/bigquery.jobUser"
    ]
  }
}

# Service Scaling Configuration
variable "scaling_parameters" {
  type = map(object({
    min_instances = number
    max_instances = number
  }))
  description = "Service scaling parameters for staging"
  default = {
    scraping = {
      min_instances = 0
      max_instances = 10
    },
    processing = {
      min_instances = 1
      max_instances = 20
    },
    api = {
      min_instances = 2
      max_instances = 30
    }
  }
}

# Resource Limits
variable "resource_limits" {
  type = map(object({
    cpu    = string
    memory = string
  }))
  description = "Resource limits for Cloud Run services in staging"
  default = {
    scraping = {
      cpu    = "2"
      memory = "4Gi"
    },
    processing = {
      cpu    = "4"
      memory = "8Gi"
    },
    api = {
      cpu    = "2"
      memory = "4Gi"
    }
  }
}

# Monitoring and Alerting Configuration
variable "monitoring_config" {
  type = object({
    alert_notification_channels = list(string)
    metrics_retention_days     = number
    log_retention_days        = number
  })
  description = "Monitoring and alerting configuration for staging"
  default = {
    alert_notification_channels = []
    metrics_retention_days     = 30
    log_retention_days        = 30
  }
}

# Deployment Strategy Configuration
variable "deployment_strategy" {
  type = object({
    rollout_strategy = string
    timeout_seconds  = number
    success_rate_threshold = number
  })
  description = "Deployment strategy configuration for staging"
  default = {
    rollout_strategy      = "blue-green"
    timeout_seconds       = 600
    success_rate_threshold = 0.95
  }

  validation {
    condition     = contains(["rolling", "blue-green"], var.deployment_strategy.rollout_strategy)
    error_message = "Rollout strategy must be either rolling or blue-green"
  }
}

# Data Retention Configuration
variable "data_retention_config" {
  type = object({
    raw_data_days        = number
    processed_data_days  = number
    logs_retention_days  = number
  })
  description = "Data retention configuration for staging environment"
  default = {
    raw_data_days       = 90
    processed_data_days = 180
    logs_retention_days = 30
  }
}