# Core Terraform functionality for variable definitions
terraform {
  required_version = "~> 1.0"
}

# GCP Project Configuration
variable "project_id" {
  description = "The GCP project ID where BigQuery resources will be created"
  type        = string

  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID must not be empty"
  }
}

# Dataset Configuration
variable "dataset_id" {
  description = "The ID of the BigQuery dataset to create"
  type        = string

  validation {
    condition     = can(regex("^[a-zA-Z0-9_]+$", var.dataset_id))
    error_message = "Dataset ID must contain only letters, numbers, and underscores"
  }
}

variable "location" {
  description = "The geographic location where the BigQuery dataset should reside"
  type        = string
  default     = "US"

  validation {
    condition     = contains(["US", "EU", "ASIA"], var.location)
    error_message = "Location must be one of: US, EU, ASIA"
  }
}

# Data Retention Configuration
variable "retention_days" {
  description = "Retention periods in days for different data types"
  type        = map(number)
  default = {
    raw_data        = 90  # 90 days retention for raw data
    processed_data  = 180 # 180 days retention for processed data
    structured_data = 365 # 365 days retention for structured data
  }

  validation {
    condition     = alltrue([for v in values(var.retention_days) : v > 0])
    error_message = "All retention periods must be positive numbers"
  }
}

# Access Control Configuration
variable "authorized_viewers" {
  description = "List of user email addresses authorized to view BigQuery data"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for email in var.authorized_viewers : can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", email))])
    error_message = "All viewer email addresses must be valid email format"
  }
}

variable "authorized_editors" {
  description = "List of user email addresses authorized to edit BigQuery data"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for email in var.authorized_editors : can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", email))])
    error_message = "All editor email addresses must be valid email format"
  }
}

# Security Configuration
variable "enable_cmek" {
  description = "Enable Customer Managed Encryption Keys for BigQuery datasets"
  type        = bool
  default     = false
}

# Resource Labels
variable "labels" {
  description = "Labels to apply to BigQuery resources"
  type        = map(string)
  default = {
    managed-by = "terraform"
    component  = "data-warehouse"
  }

  validation {
    condition     = alltrue([for k, v in var.labels : can(regex("^[a-z][a-z0-9-_]*[a-z0-9]$", k)) && can(regex("^[a-z0-9][a-z0-9-_]*[a-z0-9]$", v))])
    error_message = "Label keys and values must follow GCP naming conventions"
  }
}

# Lifecycle Configuration
variable "delete_contents_on_destroy" {
  description = "Whether to delete BigQuery dataset contents on resource destruction"
  type        = bool
  default     = false
}