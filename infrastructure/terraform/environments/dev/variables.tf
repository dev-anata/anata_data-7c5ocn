# Development Environment Variables for Pharmaceutical Data Pipeline Platform

# Import root variable definitions for inheritance
variable "project_id" {
  type        = string
  description = "The GCP project ID for development environment"
  default     = "pharma-pipeline-dev"

  validation {
    condition     = length(var.project_id) > 0 && can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Project ID must be between 6 and 30 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens"
  }
}

variable "region" {
  type        = string
  description = "Primary GCP region for development environment"
  default     = "us-central1"

  validation {
    condition     = contains(["us-central1", "us-east1"], var.region)
    error_message = "Region must be either us-central1 or us-east1 for development environment"
  }
}

variable "environment" {
  type        = string
  description = "Environment identifier for resource naming and tagging"
  default     = "dev"

  validation {
    condition     = var.environment == "dev"
    error_message = "Environment must be set to 'dev' for development configuration"
  }
}

# Development-specific service scaling parameters
variable "service_scaling" {
  type = map(object({
    min_instances = number
    max_instances = number
    cpu_limit     = string
    memory_limit  = string
  }))
  description = "Development environment service scaling parameters with conservative limits"
  default = {
    scraping = {
      min_instances = 0
      max_instances = 5
      cpu_limit    = "1"
      memory_limit = "2Gi"
    }
    processing = {
      min_instances = 1
      max_instances = 10
      cpu_limit    = "2"
      memory_limit = "4Gi"
    }
    api = {
      min_instances = 1
      max_instances = 15
      cpu_limit    = "1"
      memory_limit = "2Gi"
    }
  }
}

# Development-specific storage retention periods
variable "storage_retention" {
  type        = map(number)
  description = "Development environment data retention periods in days"
  default = {
    raw_data        = 30  # 30 days retention for raw data in dev
    processed_data  = 60  # 60 days retention for processed data in dev
    archive         = 90  # 90 days retention for archived data in dev
  }
}

# Development-specific monitoring configuration
variable "enable_monitoring" {
  type        = bool
  description = "Enable detailed monitoring for development environment"
  default     = true
}

# Development-specific security controls
variable "enable_vpc_sc" {
  type        = bool
  description = "Enable VPC Service Controls for development environment"
  default     = false
}

# Development-specific network configuration
variable "network_config" {
  type = object({
    subnet_ip_range = string
    enable_private_access = bool
  })
  description = "Network configuration for development environment"
  default = {
    subnet_ip_range       = "10.0.0.0/24"
    enable_private_access = true
  }
}

# Development-specific backup configuration
variable "backup_config" {
  type = object({
    enable_backup = bool
    retention_days = number
  })
  description = "Backup configuration for development environment"
  default = {
    enable_backup   = true
    retention_days  = 7
  }
}

# Development-specific logging configuration
variable "logging_config" {
  type = object({
    retention_days = number
    enable_audit   = bool
  })
  description = "Logging configuration for development environment"
  default = {
    retention_days = 30
    enable_audit   = true
  }
}