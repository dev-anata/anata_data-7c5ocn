# Core Project Variables
variable "project_id" {
  type        = string
  description = "The GCP project ID where resources will be deployed"

  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID must not be empty"
  }
}

variable "region" {
  type        = string
  description = "Primary GCP region for resource deployment"
  default     = "us-central1"

  validation {
    condition     = contains(["us-central1", "us-east1"], var.region)
    error_message = "Region must be either us-central1 or us-east1"
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod"
  }
}

# Storage Configuration Variables
variable "storage_location" {
  type        = string
  description = "GCP location for storage resources with data residency compliance"
  default     = "US"

  validation {
    condition     = contains(["US", "EU", "ASIA"], var.storage_location)
    error_message = "Storage location must be US, EU, or ASIA"
  }
}

variable "retention_period_days" {
  type        = map(number)
  description = "Retention periods for different data types in days, compliant with regulatory requirements"
  default = {
    raw_data        = 90   # 90 days retention for raw scraping data
    processed_data  = 180  # 180 days retention for processed documents
    system_logs     = 30   # 30 days retention for system logs
    audit_logs      = 365  # 1 year retention for audit logs
    archive         = 2555 # 7 years retention for archived data
  }
}

variable "bigquery_dataset_location" {
  type        = string
  description = "Location for BigQuery datasets with multi-region support"
  default     = "US"
}

# Network Configuration Variables
variable "network_name" {
  type        = string
  description = "Name of the VPC network for secure resource isolation"
  default     = "pharma-pipeline-vpc"
}

variable "subnet_ip_cidr" {
  type        = string
  description = "CIDR range for the VPC subnet with RFC 1918 compliance"
  default     = "10.0.0.0/24"

  validation {
    condition     = can(cidrhost(var.subnet_ip_cidr, 0))
    error_message = "Subnet CIDR must be a valid IPv4 CIDR block"
  }
}

# Security Configuration Variables
variable "enable_vpc_sc" {
  type        = bool
  description = "Enable VPC Service Controls for enhanced security perimeter"
  default     = false
}

variable "service_account_id" {
  type        = string
  description = "Service account ID for Cloud Run services with principle of least privilege"
  default     = "pharma-pipeline-sa"

  validation {
    condition     = can(regex("^[a-z][-a-z0-9]*[a-z0-9]$", var.service_account_id))
    error_message = "Service account ID must match GCP naming requirements"
  }
}

# Monitoring Configuration Variables
variable "monitoring_notification_channels" {
  type        = list(string)
  description = "List of notification channel IDs for monitoring alerts and incident management"
  default     = []
}