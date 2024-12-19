# Production Environment Variables for Pharmaceutical Data Pipeline Platform
# Version: 1.0
# Terraform Version Required: ~> 1.0

# Core Project Variables with Production-Specific Validation
variable "project_id" {
  type        = string
  description = "The GCP project ID for production environment"
  
  validation {
    condition     = length(var.project_id) > 0 && can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Project ID must be between 6 and 30 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens"
  }
}

variable "region" {
  type        = string
  description = "Primary GCP region for production deployment"
  default     = "us-central1"

  validation {
    condition     = contains(["us-central1", "us-east1"], var.region)
    error_message = "Production region must be either us-central1 or us-east1 for high availability"
  }
}

variable "backup_region" {
  type        = string
  description = "Secondary GCP region for disaster recovery"
  default     = "us-east1"

  validation {
    condition     = var.backup_region != var.region && contains(["us-central1", "us-east1"], var.backup_region)
    error_message = "Backup region must be different from primary region and must be either us-central1 or us-east1"
  }
}

variable "environment" {
  type        = string
  description = "Production environment identifier"
  default     = "prod"

  validation {
    condition     = var.environment == "prod"
    error_message = "Environment must be prod for production configuration"
  }
}

# Enhanced Security Controls for Production
variable "security_controls" {
  type = object({
    enable_vpc_sc     = bool
    enable_cmek       = bool
    enable_audit_logs = bool
  })
  description = "Production security control settings"
  default = {
    enable_vpc_sc     = true
    enable_cmek       = true
    enable_audit_logs = true
  }

  validation {
    condition     = var.security_controls.enable_vpc_sc && var.security_controls.enable_cmek
    error_message = "VPC Service Controls and CMEK must be enabled in production"
  }
}

# Production Service Scaling Configuration
variable "service_scaling" {
  type = map(object({
    min_instances = number
    max_instances = number
    cpu_limit     = string
    memory_limit  = string
  }))
  description = "Production service scaling configuration"
  default = {
    scraping = {
      min_instances = 2
      max_instances = 30
      cpu_limit     = "2.0"
      memory_limit  = "4Gi"
    }
    processing = {
      min_instances = 3
      max_instances = 50
      cpu_limit     = "4.0"
      memory_limit  = "8Gi"
    }
    api = {
      min_instances = 5
      max_instances = 100
      cpu_limit     = "2.0"
      memory_limit  = "4Gi"
    }
  }

  validation {
    condition     = alltrue([for k, v in var.service_scaling : v.min_instances >= 2 && v.max_instances >= v.min_instances * 5])
    error_message = "Production services must have minimum 2 instances and support at least 5x scaling"
  }
}

# Production Data Retention Configuration
variable "data_retention" {
  type = map(object({
    active_days  = number
    archive_days = number
  }))
  description = "Production data retention configuration"
  default = {
    raw_data = {
      active_days  = 90
      archive_days = 365
    }
    processed_data = {
      active_days  = 180
      archive_days = 730
    }
    system_logs = {
      active_days  = 30
      archive_days = 365
    }
    audit_logs = {
      active_days  = 365
      archive_days = 2555
    }
  }

  validation {
    condition     = alltrue([for k, v in var.data_retention : v.active_days > 0 && v.archive_days >= v.active_days])
    error_message = "Archive retention must be greater than or equal to active retention"
  }
}

# Production Monitoring Configuration
variable "monitoring_config" {
  type = object({
    notification_channels = list(string)
    alert_thresholds = map(number)
  })
  description = "Production monitoring configuration"

  validation {
    condition     = length(var.monitoring_config.notification_channels) > 0
    error_message = "At least one notification channel must be configured for production"
  }
}

# Production Backup Configuration
variable "backup_config" {
  type = object({
    frequency_hours  = number
    retention_count = number
  })
  description = "Production backup configuration"
  default = {
    frequency_hours  = 6
    retention_count = 30
  }

  validation {
    condition     = var.backup_config.frequency_hours <= 24 && var.backup_config.retention_count >= 30
    error_message = "Production backups must occur at least daily and retain at least 30 copies"
  }
}

# Production Network Configuration
variable "network_config" {
  type = object({
    enable_private_google_access = bool
    enable_cloud_nat            = bool
    allowed_ip_ranges          = list(string)
  })
  description = "Production network security configuration"
  default = {
    enable_private_google_access = true
    enable_cloud_nat            = true
    allowed_ip_ranges          = []
  }

  validation {
    condition     = var.network_config.enable_private_google_access
    error_message = "Private Google Access must be enabled in production"
  }
}

# Production API Rate Limiting
variable "api_rate_limits" {
  type = object({
    requests_per_second = number
    burst_size         = number
    quota_period      = string
  })
  description = "Production API rate limiting configuration"
  default = {
    requests_per_second = 1000
    burst_size         = 2000
    quota_period      = "1m"
  }

  validation {
    condition     = var.api_rate_limits.requests_per_second >= 1000
    error_message = "Production API must support at least 1000 requests per second"
  }
}

# Production Compliance Settings
variable "compliance_config" {
  type = object({
    enable_audit_logging = bool
    enable_dlp          = bool
    retention_period    = string
  })
  description = "Production compliance and regulatory configuration"
  default = {
    enable_audit_logging = true
    enable_dlp          = true
    retention_period    = "7years"
  }

  validation {
    condition     = var.compliance_config.enable_audit_logging && var.compliance_config.enable_dlp
    error_message = "Audit logging and DLP must be enabled in production"
  }
}